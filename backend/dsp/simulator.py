"""
Signal Simulator and VITA 49 Packet Generator.
Generates synthetic RF/IF test signals (CW, Chirp, BPSK, QPSK, Bursts, Noise)
and packages them into compliant VITA 49 UDP streams.
"""

from __future__ import annotations
import asyncio
import math
import socket
import time
from dataclasses import dataclass
from typing import Optional, Dict, Any, Generator, Tuple
import numpy as np

from ..vita49.codec import (
    Vita49PacketType,
    Vita49TSI,
    Vita49TSF,
    Vita49Trailer,
    encode_vita49_data_packet,
    encode_vita49_context_packet,
)


@dataclass
class SimulatorConfig:
    signal_type: str = "chirp"              # "cw", "dual_tone", "chirp", "bpsk", "qpsk", "pulse", "noise"
    rf_center_freq: float = 100_000_000.0   # 100 MHz
    freq_offset: float = 500_000.0          # Baseband offset (500 kHz)
    bandwidth: float = 2_000_000.0          # 2 MHz chirp or modulation bandwidth
    sample_rate: float = 10_000_000.0       # 10 Msps
    amplitude_dbfs: float = -6.0            # Signal amplitude (-6 dBFS)
    snr_db: float = 25.0                    # Signal to Noise Ratio (dB)
    stream_id: int = 0x1001
    samples_per_packet: int = 1024
    packets_per_second: int = 50
    is_pulsed: bool = False
    pulse_width_ms: float = 1200.0          # 1.2 s pulse width
    pulse_pri_ms: float = 4000.0            # 4.0 s pulse repetition interval (calm pace)
    target_host: str = "127.0.0.1"
    target_port: int = 4991


class SignalSimulator:
    """
    Real-time signal generator and VITA 49 UDP packet streamer.
    """

    def __init__(self, config: Optional[SimulatorConfig] = None):
        self.config = config or SimulatorConfig()
        self.is_running = False
        self._task: Optional[asyncio.Task] = None
        self._phase = 0.0
        self._sample_index = 0
        self._packet_count = 0
        self._total_bytes_sent = 0
        self._total_packets_sent = 0
        self._udp_socket: Optional[socket.socket] = None
        self._last_context_sent_time = 0.0

    @property
    def stats(self) -> Dict[str, Any]:
        return {
            "is_running": self.is_running,
            "packets_sent": self._total_packets_sent,
            "bytes_sent": self._total_bytes_sent,
            "config": {
                "signal_type": self.config.signal_type,
                "rf_center_freq": self.config.rf_center_freq,
                "freq_offset": self.config.freq_offset,
                "bandwidth": self.config.bandwidth,
                "sample_rate": self.config.sample_rate,
                "amplitude_dbfs": self.config.amplitude_dbfs,
                "snr_db": self.config.snr_db,
                "stream_id": self.config.stream_id,
                "is_pulsed": self.config.is_pulsed,
                "pulse_width_ms": self.config.pulse_width_ms,
                "pulse_pri_ms": self.config.pulse_pri_ms,
                "target_host": self.config.target_host,
                "target_port": self.config.target_port,
            },
        }

    def update_config(self, **kwargs) -> None:
        """Dynamically update simulator parameters."""
        for k, v in kwargs.items():
            if hasattr(self.config, k):
                # Type cast appropriately
                orig_val = getattr(self.config, k)
                if isinstance(orig_val, float):
                    setattr(self.config, k, float(v))
                elif isinstance(orig_val, int):
                    setattr(self.config, k, int(v))
                elif isinstance(orig_val, bool):
                    setattr(self.config, k, bool(v))
                else:
                    setattr(self.config, k, str(v))

    def generate_chunk(self, num_samples: int, t_start: float) -> Tuple[np.ndarray, bool]:
        """
        Generates complex I/Q samples for the current configuration.
        Returns: (samples, is_active_burst)
        """
        fs = self.config.sample_rate
        # Continuous sample time to prevent phase glitches
        t = (self._sample_index + np.arange(num_samples)) / fs
        self._sample_index += num_samples
        amp = 10.0 ** (self.config.amplitude_dbfs / 20.0)

        # Pulse gating
        is_active = True
        if self.config.is_pulsed:
            pri_sec = max(0.001, self.config.pulse_pri_ms / 1000.0)
            pw_sec = max(0.0001, self.config.pulse_width_ms / 1000.0)
            pulse_phase = np.mod(t, pri_sec)
            mask = pulse_phase < pw_sec
            is_active = bool(np.any(mask))
        else:
            mask = np.ones(num_samples, dtype=bool)

        sig_type = self.config.signal_type.lower()

        if sig_type == "cw":
            # Single carrier tone at freq_offset
            f_offset = self.config.freq_offset
            signal = amp * np.exp(1j * (2.0 * np.pi * f_offset * t + self._phase))

        elif sig_type == "dual_tone":
            # Two tones separated by half the bandwidth
            f1 = self.config.freq_offset - (self.config.bandwidth / 4.0)
            f2 = self.config.freq_offset + (self.config.bandwidth / 4.0)
            signal = (amp / 2.0) * (
                np.exp(1j * (2.0 * np.pi * f1 * t)) + np.exp(1j * (2.0 * np.pi * f2 * t))
            )

        elif sig_type == "chirp":
            # Linear Frequency Modulated Chirp (FMCW)
            f0 = self.config.freq_offset - (self.config.bandwidth / 2.0)
            bw = self.config.bandwidth
            t_chirp = max(1e-4, num_samples / fs)
            k = bw / t_chirp
            t_mod = np.mod(t, t_chirp)
            signal = amp * np.exp(1j * 2.0 * np.pi * (f0 * t_mod + 0.5 * k * (t_mod**2)))

        elif sig_type == "bpsk":
            # Binary Phase Shift Keying
            symbol_rate = max(1e3, self.config.bandwidth / 2.0)
            samples_per_sym = max(1, int(fs / symbol_rate))
            num_syms = int(np.ceil(num_samples / samples_per_sym)) + 2
            bits = np.random.choice([-1.0, 1.0], size=num_syms)
            symbol_stream = np.repeat(bits, samples_per_sym)[:num_samples]
            carrier = np.exp(1j * (2.0 * np.pi * self.config.freq_offset * t))
            signal = amp * symbol_stream * carrier

        elif sig_type == "qpsk":
            # Quadrature Phase Shift Keying
            symbol_rate = max(1e3, self.config.bandwidth / 2.0)
            samples_per_sym = max(1, int(fs / symbol_rate))
            num_syms = int(np.ceil(num_samples / samples_per_sym)) + 2
            constellation = np.array([1 + 1j, -1 + 1j, -1 - 1j, 1 - 1j]) / np.sqrt(2)
            syms = np.random.choice(constellation, size=num_syms)
            symbol_stream = np.repeat(syms, samples_per_sym)[:num_samples]
            carrier = np.exp(1j * (2.0 * np.pi * self.config.freq_offset * t))
            signal = amp * symbol_stream * carrier

        elif sig_type == "noise":
            signal = np.zeros(num_samples, dtype=np.complex64)

        else:
            signal = amp * np.exp(1j * (2.0 * np.pi * self.config.freq_offset * t))

        # Apply pulse mask
        if self.config.is_pulsed:
            signal = signal * mask

        # Add Gaussian White Noise (AWGN) according to SNR
        if self.config.snr_db < 60.0:
            # Noise power relative to signal peak amplitude
            snr_linear = 10.0 ** (self.config.snr_db / 10.0)
            noise_power = (amp**2) / (snr_linear + 1e-12)
            noise_std = np.sqrt(noise_power / 2.0)
            noise_i = np.random.normal(0, noise_std, num_samples)
            noise_q = np.random.normal(0, noise_std, num_samples)
            signal = signal + (noise_i + 1j * noise_q)

        # Update persistent phase for continuous signals
        self._phase = (self._phase + 2.0 * np.pi * self.config.freq_offset * (num_samples / fs)) % (2.0 * np.pi)

        return signal.astype(np.complex64), is_active

    def create_vita49_packets(
        self,
        samples: np.ndarray,
        timestamp: float,
        is_active: bool,
    ) -> Tuple[bytes, Optional[bytes]]:
        """
        Creates VITA 49 data packet and conditionally an accompanying Context Packet.
        """
        seq_id = self._packet_count & 0x0F
        self._packet_count += 1

        trailer = Vita49Trailer(
            calibrated_time=True,
            valid_data=True,
            reference_lock=True,
            detected_signal=is_active,
            over_range=bool(np.max(np.abs(samples)) > 0.99),
        )

        data_bytes = encode_vita49_data_packet(
            samples=samples,
            stream_id=self.config.stream_id,
            packet_count=seq_id,
            tsi=Vita49TSI.UTC,
            tsf=Vita49TSF.REAL_TIME_PICOSECONDS,
            timestamp=timestamp,
            trailer=trailer,
        )

        context_bytes = None
        # Send context packet periodically (every 1.0 second or every 20 packets)
        if (timestamp - self._last_context_sent_time) > 1.0 or (self._packet_count % 20 == 0):
            self._last_context_sent_time = timestamp
            context_bytes = encode_vita49_context_packet(
                stream_id=self.config.stream_id,
                packet_count=seq_id,
                timestamp=timestamp,
                bandwidth=self.config.bandwidth,
                rf_reference_freq=self.config.rf_center_freq,
                if_reference_freq=self.config.freq_offset,
                sample_rate=self.config.sample_rate,
                gain=12.0,
                reference_level=self.config.amplitude_dbfs,
                trailer=trailer,
            )

        return data_bytes, context_bytes

    async def start(self) -> None:
        """Starts the simulator streaming task."""
        if self.is_running:
            return
        self.is_running = True
        self._udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        """Stops the simulator streaming task."""
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        if self._udp_socket:
            self._udp_socket.close()
            self._udp_socket = None

    async def _run_loop(self) -> None:
        """Continuously transmits VITA 49 packets over UDP."""
        dest = (self.config.target_host, self.config.target_port)
        rate = max(1, self.config.packets_per_second)
        interval = 1.0 / rate

        while self.is_running:
            now = time.time()
            samples, is_active = self.generate_chunk(self.config.samples_per_packet, now)
            data_pkt, ctx_pkt = self.create_vita49_packets(samples, now, is_active)

            try:
                if self._udp_socket:
                    if ctx_pkt:
                        self._udp_socket.sendto(ctx_pkt, dest)
                        self._total_bytes_sent += len(ctx_pkt)
                        self._total_packets_sent += 1

                    self._udp_socket.sendto(data_pkt, dest)
                    self._total_bytes_sent += len(data_pkt)
                    self._total_packets_sent += 1
            except Exception:
                pass

            await asyncio.sleep(interval)
