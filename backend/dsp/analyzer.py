"""
Digital Signal Processing (DSP) Signal Analysis Engine.
Extracts spectral metrics, bandwidth, SNR, frequency, timestamps, and burst attributes from I/Q data.
"""

from __future__ import annotations
import math
import time
from dataclasses import dataclass, field
from typing import List, Optional, Tuple, Dict, Any
import numpy as np
from scipy import signal


@dataclass
class SignalRecord:
    id: str                          # e.g. "SIG-001"
    state: str                       # "ACTIVE" or "COMPLETED"
    start_time: float                # UNIX timestamp (seconds)
    stop_time: float                 # UNIX timestamp (seconds)
    duration_seconds: float          # seconds
    center_freq: float               # Hz
    peak_freq: float                 # Hz
    bandwidth_99: float              # Hz (99% OBW)
    bandwidth_3db: float             # Hz (-3 dB)
    peak_power_dbfs: float           # dBFS
    avg_power_dbfs: float            # dBFS
    snr_db: float                    # dB
    modulation: str                  # e.g. "Single Tone (CW)", "Linear FMCW Chirp"
    stream_id: int                   # VITA 49 Stream ID
    packet_count: int = 1
    sample_rate: float = 10_000_000.0

    def to_dict(self) -> Dict[str, Any]:
        time_format = "%H:%M:%S"
        start_dt = time.gmtime(self.start_time)
        start_str = time.strftime(time_format, start_dt) + f".{int((self.start_time % 1) * 1000):03d}"
        
        if self.state == "COMPLETED":
            stop_dt = time.gmtime(self.stop_time)
            stop_str = time.strftime(time_format, stop_dt) + f".{int((self.stop_time % 1) * 1000):03d}"
        else:
            stop_str = "Receiving..."

        return {
            "id": self.id,
            "state": self.state,
            "start_time": self.start_time,
            "stop_time": self.stop_time,
            "duration_seconds": round(self.duration_seconds, 3),
            "duration_ms": round(self.duration_seconds * 1000.0, 1),
            "start_time_str": start_str,
            "stop_time_str": stop_str,
            "center_freq_mhz": round(self.center_freq / 1e6, 4),
            "peak_freq_mhz": round(self.peak_freq / 1e6, 4),
            "bandwidth_khz": round(self.bandwidth_99 / 1e3, 2),
            "bandwidth_3db_khz": round(self.bandwidth_3db / 1e3, 2),
            "peak_power_dbfs": round(self.peak_power_dbfs, 1),
            "avg_power_dbfs": round(self.avg_power_dbfs, 1),
            "snr_db": round(self.snr_db, 1),
            "modulation": self.modulation,
            "stream_id": f"0x{self.stream_id:08X}" if self.stream_id else "None",
            "sample_rate_msps": round(self.sample_rate / 1e6, 2),
            "packet_count": self.packet_count,
        }


@dataclass
class SignalMetrics:
    rf_center_freq: float            # Configured RF Center Frequency (Hz)
    peak_freq: float                 # Exact peak detected frequency (Hz)
    peak_power_dbfs: float           # Peak power in dBFS
    center_freq_est: float           # Estimated center frequency of detected signal (Hz)
    occupied_bandwidth_99: float     # 99% Occupied Bandwidth (Hz)
    bandwidth_3db: float             # -3 dB bandwidth (Hz)
    bandwidth_10db: float            # -10 dB bandwidth (Hz)
    noise_floor_dbfs: float          # Estimated noise floor (dBFS)
    snr_db: float                    # Signal to Noise Ratio (dB)
    sample_rate: float               # Sample rate (Hz)
    start_time: float                # Signal/burst start timestamp (seconds)
    stop_time: float                 # Signal/burst stop timestamp (seconds)
    duration_seconds: float          # Active burst duration (seconds)
    is_burst_active: bool            # True if burst currently detected
    papr_db: float                   # Peak-to-Average Power Ratio (dB)
    rms_power: float                 # Time domain RMS magnitude
    modulation_hint: str             # Estimated signal type (CW, Chirp, BPSK, QPSK, Noise)
    stream_id: int = 0
    packet_count: int = 0
    packet_loss_count: int = 0


@dataclass
class SpectralFrame:
    frequencies: List[float]         # Frequency axis array (Hz)
    psd_dbfs: List[float]            # Power spectral density values (dBFS)
    time_i: List[float]              # Subsampled I time domain waveform
    time_q: List[float]              # Subsampled Q time domain waveform
    constellation_i: List[float]     # Subsampled I constellation points
    constellation_q: List[float]     # Subsampled Q constellation points
    metrics: SignalMetrics


class SignalAnalyzer:
    """
    Stateful real-time signal analyzer.
    Buffers incoming VITA 49 I/Q sample packets, tracks signal sessions, and computes high-resolution spectral metrics.
    """

    def __init__(
        self,
        sample_rate: float = 10_000_000.0,
        rf_center_freq: float = 100_000_000.0,
        fft_size: int = 1024,
        burst_threshold_db: float = 6.0,
    ):
        self.sample_rate = sample_rate
        self.rf_center_freq = rf_center_freq
        self.fft_size = fft_size
        self.burst_threshold_db = burst_threshold_db

        self.last_sequence_id: Optional[int] = None
        self.packet_loss_count: int = 0
        self.total_packets_processed: int = 0
        self.last_stream_id: int = 0x1001

        # Signal lifecycle tracking (Object-based signal entity tracker)
        self.active_signal: Optional[SignalRecord] = None
        self.signals_history: List[SignalRecord] = []
        self.signal_counter: int = 0
        self.last_signal_seen_time: float = 0.0
        self.hang_time_seconds: float = 1.0  # Hysteresis to prevent flutter

        # Burst tracking state (for backward compatibility)
        self.is_burst_active: bool = False
        self.burst_start_time: float = 0.0
        self.burst_stop_time: float = 0.0
        self.detected_bursts_history: List[Dict[str, Any]] = []

        # Circular sample accumulator for stable FFT analysis
        self.sample_buffer = np.zeros(fft_size, dtype=np.complex64)
        self.buffer_pos = 0

    def update_context(
        self,
        sample_rate: Optional[float] = None,
        rf_center_freq: Optional[float] = None,
        stream_id: Optional[int] = None,
    ) -> None:
        """Updates RF parameters received from VITA 49 context packets."""
        if sample_rate and sample_rate > 0:
            self.sample_rate = sample_rate
        if rf_center_freq is not None and rf_center_freq > 0:
            self.rf_center_freq = rf_center_freq
        if stream_id is not None:
            self.last_stream_id = stream_id

    def process_packet(
        self,
        samples: np.ndarray,
        timestamp: float,
        sequence_id: int = 0,
        stream_id: Optional[int] = None,
    ) -> SpectralFrame:
        """
        Ingests a block of complex I/Q samples, updates burst state and computes metrics.
        """
        self.total_packets_processed += 1
        if stream_id is not None:
            self.last_stream_id = stream_id

        # Track packet sequence loss
        if self.last_sequence_id is not None:
            expected_seq = (self.last_sequence_id + 1) & 0x0F
            if sequence_id != expected_seq:
                lost = (sequence_id - expected_seq) & 0x0F
                self.packet_loss_count += lost
        self.last_sequence_id = sequence_id

        # Update circular sample buffer
        n = len(samples)
        if n >= self.fft_size:
            analysis_samples = samples[-self.fft_size :]
            self.sample_buffer = analysis_samples.astype(np.complex64)
        else:
            # Shift buffer and append
            self.sample_buffer = np.roll(self.sample_buffer, -n)
            self.sample_buffer[-n:] = samples.astype(np.complex64)
            analysis_samples = self.sample_buffer

        # Compute Windowed FFT & Power Spectral Density
        fft_len = len(analysis_samples)
        window = signal.windows.blackmanharris(fft_len)
        windowed_samples = analysis_samples * window
        fft_vals = np.fft.fftshift(np.fft.fft(windowed_samples, n=fft_len))

        # Normalized Power Spectral Density in dBFS
        # Normalization factor for window coherent gain
        coherent_gain = np.sum(window)
        magnitude = np.abs(fft_vals) / (coherent_gain + 1e-12)
        psd_linear = magnitude**2
        psd_dbfs = 10.0 * np.log10(np.maximum(psd_linear, 1e-12))

        # Frequency axis in Hz
        freq_offsets = np.fft.fftshift(np.fft.fftfreq(fft_len, d=1.0 / self.sample_rate))
        rf_freqs = self.rf_center_freq + freq_offsets

        # Peak Analysis
        peak_idx = int(np.argmax(psd_dbfs))
        peak_freq = float(rf_freqs[peak_idx])
        peak_power = float(psd_dbfs[peak_idx])

        # Noise floor calculation using median of power spectrum
        noise_floor = float(np.median(psd_dbfs))
        # Peak-to-median ratio (SNR estimate)
        snr = max(0.0, peak_power - noise_floor)

        # Bandwidth Estimation
        # 1. Occupied Bandwidth (99% power)
        total_p = np.sum(psd_linear)
        if total_p > 1e-12:
            cum_power = np.cumsum(psd_linear) / total_p
            low_idx = int(np.searchsorted(cum_power, 0.005))
            high_idx = int(np.searchsorted(cum_power, 0.995))
            high_idx = min(high_idx, fft_len - 1)
            obw_99 = float(abs(rf_freqs[high_idx] - rf_freqs[low_idx]))
            center_est = float((rf_freqs[high_idx] + rf_freqs[low_idx]) / 2.0)
        else:
            obw_99 = 0.0
            center_est = self.rf_center_freq

        # 2. -3 dB and -10 dB Bandwidth from peak
        thresh_3db = peak_power - 3.0
        thresh_10db = peak_power - 10.0

        # Search left and right from peak
        left_3 = peak_idx
        while left_3 > 0 and psd_dbfs[left_3] >= thresh_3db:
            left_3 -= 1
        right_3 = peak_idx
        while right_3 < fft_len - 1 and psd_dbfs[right_3] >= thresh_3db:
            right_3 += 1
        bw_3db = float(abs(rf_freqs[right_3] - rf_freqs[left_3]))

        left_10 = peak_idx
        while left_10 > 0 and psd_dbfs[left_10] >= thresh_10db:
            left_10 -= 1
        right_10 = peak_idx
        while right_10 < fft_len - 1 and psd_dbfs[right_10] >= thresh_10db:
            right_10 += 1
        bw_10db = float(abs(rf_freqs[right_10] - rf_freqs[left_10]))

        # Time-Domain metrics & Burst Detection
        inst_power = np.abs(analysis_samples) ** 2
        mean_p = float(np.mean(inst_power))
        max_p = float(np.max(inst_power)) if len(inst_power) > 0 else 1e-12
        papr_db = float(10.0 * np.log10(max_p / (mean_p + 1e-12))) if mean_p > 1e-12 else 0.0
        rms_val = float(np.sqrt(mean_p))

        # Modulation classification heuristic
        modulation_hint = self._classify_modulation(
            analysis_samples, obw_99, snr, papr_db, psd_dbfs, peak_idx
        )

        # Object-Oriented Signal Session Tracking
        # Signal is present if SNR exceeds threshold AND power is above noise threshold (-45 dBFS or RMS > 0.02)
        is_signal_present = (snr >= self.burst_threshold_db) and (peak_power > -45.0 or rms_val > 0.02)

        if is_signal_present:
            if self.active_signal is None:
                # Start new signal object
                self.signal_counter += 1
                sig_id = f"SIG-{self.signal_counter:03d}"
                self.active_signal = SignalRecord(
                    id=sig_id,
                    state="ACTIVE",
                    start_time=timestamp,
                    stop_time=timestamp,
                    duration_seconds=0.0,
                    center_freq=center_est,
                    peak_freq=peak_freq,
                    bandwidth_99=obw_99,
                    bandwidth_3db=bw_3db,
                    peak_power_dbfs=peak_power,
                    avg_power_dbfs=peak_power,
                    snr_db=snr,
                    modulation=modulation_hint,
                    stream_id=self.last_stream_id,
                    packet_count=1,
                    sample_rate=self.sample_rate,
                )
                self.last_signal_seen_time = timestamp
            else:
                # Check if signal frequency or stream changed significantly (user retuned frequency)
                freq_diff = abs(center_est - self.active_signal.center_freq)
                freq_shift_thresh = max(300_000.0, 0.6 * obw_99)
                if freq_diff > freq_shift_thresh or self.active_signal.stream_id != self.last_stream_id:
                    # Finalize previous signal
                    self.active_signal.state = "COMPLETED"
                    self.active_signal.stop_time = timestamp
                    self.active_signal.duration_seconds = max(0.001, timestamp - self.active_signal.start_time)
                    self.signals_history.append(self.active_signal)
                    if len(self.signals_history) > 100:
                        self.signals_history.pop(0)

                    # Create new signal object
                    self.signal_counter += 1
                    sig_id = f"SIG-{self.signal_counter:03d}"
                    self.active_signal = SignalRecord(
                        id=sig_id,
                        state="ACTIVE",
                        start_time=timestamp,
                        stop_time=timestamp,
                        duration_seconds=0.0,
                        center_freq=center_est,
                        peak_freq=peak_freq,
                        bandwidth_99=obw_99,
                        bandwidth_3db=bw_3db,
                        peak_power_dbfs=peak_power,
                        avg_power_dbfs=peak_power,
                        snr_db=snr,
                        modulation=modulation_hint,
                        stream_id=self.last_stream_id,
                        packet_count=1,
                        sample_rate=self.sample_rate,
                    )
                else:
                    # Update active signal
                    self.active_signal.stop_time = timestamp
                    self.active_signal.duration_seconds = max(0.001, timestamp - self.active_signal.start_time)
                    self.active_signal.packet_count += 1
                    self.active_signal.peak_power_dbfs = max(self.active_signal.peak_power_dbfs, peak_power)
                    self.active_signal.avg_power_dbfs = round(0.95 * self.active_signal.avg_power_dbfs + 0.05 * peak_power, 1)
                    self.active_signal.snr_db = round(0.9 * self.active_signal.snr_db + 0.1 * snr, 1)
                    self.active_signal.bandwidth_99 = obw_99
                    self.active_signal.bandwidth_3db = bw_3db
                    self.active_signal.peak_freq = peak_freq
                    self.active_signal.center_freq = center_est
                    self.active_signal.modulation = modulation_hint
                self.last_signal_seen_time = timestamp
        else:
            # Signal absent
            if self.active_signal is not None:
                if (timestamp - self.last_signal_seen_time) > self.hang_time_seconds:
                    # Finalize signal
                    self.active_signal.state = "COMPLETED"
                    self.active_signal.stop_time = self.last_signal_seen_time
                    self.active_signal.duration_seconds = max(0.001, self.active_signal.stop_time - self.active_signal.start_time)
                    self.signals_history.append(self.active_signal)
                    if len(self.signals_history) > 100:
                        self.signals_history.pop(0)
                    self.active_signal = None

        # Backward-compatible burst tracking
        if is_signal_present:
            if not self.is_burst_active:
                self.is_burst_active = True
                self.burst_start_time = timestamp
            self.burst_stop_time = timestamp
            burst_duration = max(0.0, self.burst_stop_time - self.burst_start_time)
        else:
            if self.is_burst_active:
                self.is_burst_active = False
                burst_duration = max(0.0, self.burst_stop_time - self.burst_start_time)
                self.detected_bursts_history.append({
                    "id": len(self.detected_bursts_history) + 1,
                    "start_time": self.burst_start_time,
                    "stop_time": self.burst_stop_time,
                    "duration_ms": burst_duration * 1000.0,
                    "center_freq_mhz": center_est / 1e6,
                    "bandwidth_khz": obw_99 / 1e3,
                    "peak_power_dbfs": peak_power,
                    "snr_db": snr,
                })
                if len(self.detected_bursts_history) > 50:
                    self.detected_bursts_history.pop(0)
            else:
                burst_duration = 0.0

        metrics = SignalMetrics(
            rf_center_freq=self.rf_center_freq,
            peak_freq=round(peak_freq, 3),
            peak_power_dbfs=round(peak_power, 2),
            center_freq_est=round(center_est, 3),
            occupied_bandwidth_99=round(obw_99, 1),
            bandwidth_3db=round(bw_3db, 1),
            bandwidth_10db=round(bw_10db, 1),
            noise_floor_dbfs=round(noise_floor, 2),
            snr_db=round(snr, 2),
            sample_rate=self.sample_rate,
            start_time=self.burst_start_time if self.is_burst_active else self.burst_stop_time,
            stop_time=self.burst_stop_time,
            duration_seconds=round(burst_duration, 4),
            is_burst_active=self.is_burst_active,
            papr_db=round(papr_db, 2),
            rms_power=round(rms_val, 4),
            modulation_hint=modulation_hint,
            stream_id=self.last_stream_id,
            packet_count=self.total_packets_processed,
            packet_loss_count=self.packet_loss_count,
        )

        # Decimate time & constellation arrays for lightweight web rendering
        subsample_step = max(1, len(analysis_samples) // 256)
        sub_samples = analysis_samples[::subsample_step]

        return SpectralFrame(
            frequencies=[round(f, 1) for f in rf_freqs.tolist()],
            psd_dbfs=[round(p, 2) for p in psd_dbfs.tolist()],
            time_i=[round(float(v), 4) for v in np.real(sub_samples).tolist()],
            time_q=[round(float(v), 4) for v in np.imag(sub_samples).tolist()],
            constellation_i=[round(float(v), 4) for v in np.real(sub_samples).tolist()],
            constellation_q=[round(float(v), 4) for v in np.imag(sub_samples).tolist()],
            metrics=metrics,
        )

    def _classify_modulation(
        self,
        samples: np.ndarray,
        obw: float,
        snr: float,
        papr_db: float,
        psd: np.ndarray,
        peak_idx: int,
    ) -> str:
        """Heuristic modulation feature classifier."""
        if snr < self.burst_threshold_db:
            return "Noise / Idle"

        bin_width = self.sample_rate / len(samples)
        bins_occupied = obw / (bin_width + 1e-12)

        if bins_occupied <= 4.0:
            return "Single Tone (CW)"

        # Check for phase clustering (BPSK vs QPSK)
        phases = np.angle(samples)
        # 2nd harmonic check for BPSK
        p_2 = np.abs(np.mean(np.exp(1j * 2 * phases)))
        # 4th harmonic check for QPSK
        p_4 = np.abs(np.mean(np.exp(1j * 4 * phases)))

        if p_2 > 0.45:
            return "BPSK"
        if p_4 > 0.35:
            return "QPSK"

        # Check chirp (instantaneous frequency linearity)
        diff_phase = np.diff(np.unwrap(phases))
        if len(diff_phase) > 10:
            diff_freq = np.diff(diff_phase)
            std_accel = np.std(diff_freq)
            mean_accel = abs(np.mean(diff_freq))
            if mean_accel > 1e-4 and std_accel < 0.5:
                return "Chirp (Linear FMCW)"

        if bins_occupied > 10:
            return "Wideband / Chirp"

        return "Modulated Signal"

    def get_all_signals(self) -> List[Dict[str, Any]]:
        """Returns all completed signals and the currently active signal if present."""
        signals = [s.to_dict() for s in self.signals_history]
        if self.active_signal is not None:
            signals.append(self.active_signal.to_dict())
        return signals

    def clear_signals(self) -> None:
        """Clears captured signal objects."""
        self.signals_history.clear()
        self.active_signal = None
        self.signal_counter = 0

    def export_signals(self, format: str = "json") -> str:
        """Exports recorded signal objects to JSON, CSV, or formatted text report."""
        signals = self.get_all_signals()
        fmt = format.lower()

        if fmt == "csv":
            import io, csv
            output = io.StringIO()
            fieldnames = [
                "id", "state", "start_time_str", "stop_time_str", "duration_seconds",
                "center_freq_mhz", "peak_freq_mhz", "bandwidth_khz", "bandwidth_3db_khz",
                "peak_power_dbfs", "avg_power_dbfs", "snr_db", "modulation", "stream_id", "packet_count"
            ]
            writer = csv.DictWriter(output, fieldnames=fieldnames)
            writer.writeheader()
            for s in signals:
                writer.writerow({
                    "id": s["id"],
                    "state": s["state"],
                    "start_time_str": s["start_time_str"],
                    "stop_time_str": s["stop_time_str"],
                    "duration_seconds": s["duration_seconds"],
                    "center_freq_mhz": s["center_freq_mhz"],
                    "peak_freq_mhz": s["peak_freq_mhz"],
                    "bandwidth_khz": s["bandwidth_khz"],
                    "bandwidth_3db_khz": s["bandwidth_3db_khz"],
                    "peak_power_dbfs": s["peak_power_dbfs"],
                    "avg_power_dbfs": s["avg_power_dbfs"],
                    "snr_db": s["snr_db"],
                    "modulation": s["modulation"],
                    "stream_id": s["stream_id"],
                    "packet_count": s["packet_count"],
                })
            return output.getvalue()

        elif fmt in ("report", "txt", "markdown", "md"):
            completed = sum(1 for s in signals if s["state"] == "COMPLETED")
            active = sum(1 for s in signals if s["state"] == "ACTIVE")
            total_dur = sum(s["duration_seconds"] for s in signals)
            avg_snr = (sum(s["snr_db"] for s in signals) / len(signals)) if signals else 0.0

            lines = [
                "=" * 92,
                "                    VITA 49 RF SIGNAL INTERCEPT & ANALYSIS REPORT",
                f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}",
                "=" * 92,
                "",
                "[SUMMARY METRICS]",
                f"  Total Signals Detected:  {len(signals)}",
                f"  Completed Signals:       {completed}",
                f"  Currently Active:        {active}",
                f"  Total Transmit Duration: {total_dur:.3f} seconds",
                f"  Average SNR:             {avg_snr:.1f} dB",
                "",
                "[ITEMIZED SIGNAL OBJECTS]",
                f"{'ID':<8} | {'Status':<9} | {'Start (UTC)':<12} | {'Stop (UTC)':<12} | {'Duration':<9} | {'Center Freq':<13} | {'BW (99%)':<10} | {'SNR':<7} | {'Modulation'}",
                "-" * 115,
            ]
            for s in signals:
                lines.append(
                    f"{s['id']:<8} | {s['state']:<9} | {s['start_time_str']:<12} | {s['stop_time_str']:<12} | {s['duration_seconds']:>7.3f} s | {s['center_freq_mhz']:>9.4f} MHz | {s['bandwidth_khz']:>8.1f} kHz | {s['snr_db']:>5.1f} dB | {s['modulation']}"
                )
            lines.append("=" * 115)
            return "\n".join(lines)

        else:
            import json
            return json.dumps(signals, indent=2)
