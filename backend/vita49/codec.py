"""
VITA 49 Radio Transport (VRT) Protocol Codec.
Compliant with ANSI/VITA 49.0 and ANSI/VITA 49.2 standards.
"""

from __future__ import annotations
import enum
import struct
import time
from dataclasses import dataclass, field
from typing import Optional, Tuple, Dict, Any, Union
import numpy as np


class Vita49PacketType(enum.IntEnum):
    IF_DATA_NO_STREAM_ID = 0x0
    IF_DATA_WITH_STREAM_ID = 0x1
    EXT_DATA_NO_STREAM_ID = 0x2
    EXT_DATA_WITH_STREAM_ID = 0x3
    CONTEXT = 0x4
    EXT_CONTEXT = 0x5


class Vita49TSI(enum.IntEnum):
    NONE = 0
    UTC = 1
    GPS = 2
    OTHER = 3


class Vita49TSF(enum.IntEnum):
    NONE = 0
    SAMPLE_COUNT = 1
    REAL_TIME_PICOSECONDS = 2
    FREE_RUNNING_COUNT = 3


@dataclass
class Vita49Trailer:
    calibrated_time: bool = True
    valid_data: bool = True
    reference_lock: bool = True
    agc_active: bool = False
    detected_signal: bool = False
    spectral_inversion: bool = False
    over_range: bool = False
    sample_loss: bool = False
    user_bits: int = 0
    raw_trailer: int = 0

    def encode(self) -> bytes:
        word = 0
        if self.calibrated_time:
            word |= 1 << 31
        if self.valid_data:
            word |= 1 << 30
        if self.reference_lock:
            word |= 1 << 29
        if self.agc_active:
            word |= 1 << 28
        if self.detected_signal:
            word |= 1 << 27
        if self.spectral_inversion:
            word |= 1 << 26
        if self.over_range:
            word |= 1 << 25
        if self.sample_loss:
            word |= 1 << 24
        word |= (self.user_bits & 0x0F) << 20
        return struct.pack(">I", word)

    @classmethod
    def decode(cls, raw_word: int) -> Vita49Trailer:
        return cls(
            calibrated_time=bool(raw_word & (1 << 31)),
            valid_data=bool(raw_word & (1 << 30)),
            reference_lock=bool(raw_word & (1 << 29)),
            agc_active=bool(raw_word & (1 << 28)),
            detected_signal=bool(raw_word & (1 << 27)),
            spectral_inversion=bool(raw_word & (1 << 26)),
            over_range=bool(raw_word & (1 << 25)),
            sample_loss=bool(raw_word & (1 << 24)),
            user_bits=(raw_word >> 20) & 0x0F,
            raw_trailer=raw_word,
        )


@dataclass
class Vita49ContextPacket:
    stream_id: int = 0x1001
    packet_count: int = 0
    tsi: Vita49TSI = Vita49TSI.UTC
    tsf: Vita49TSF = Vita49TSF.REAL_TIME_PICOSECONDS
    integer_timestamp: int = 0
    fractional_timestamp: int = 0
    bandwidth: Optional[float] = None          # in Hz
    if_reference_freq: Optional[float] = None  # in Hz
    rf_reference_freq: Optional[float] = None  # in Hz
    sample_rate: Optional[float] = None        # in Hz
    gain: Optional[float] = None               # in dB
    reference_level: Optional[float] = None    # in dBm
    has_trailer: bool = False
    trailer: Optional[Vita49Trailer] = None


@dataclass
class Vita49Packet:
    packet_type: Vita49PacketType
    has_class_id: bool = False
    has_trailer: bool = False
    tsi: Vita49TSI = Vita49TSI.UTC
    tsf: Vita49TSF = Vita49TSF.REAL_TIME_PICOSECONDS
    packet_count: int = 0
    packet_size_words: int = 0
    stream_id: Optional[int] = None
    class_id: Optional[Tuple[int, int, int]] = None  # (oui, info_class, pkt_class)
    integer_timestamp: Optional[int] = None
    fractional_timestamp: Optional[int] = None
    samples: Optional[np.ndarray] = None  # Complex I/Q array (dtype=complex64)
    context: Optional[Vita49ContextPacket] = None
    trailer: Optional[Vita49Trailer] = None
    raw_payload: Optional[bytes] = None

    def timestamp_seconds(self) -> float:
        """Returns the high-resolution timestamp in float seconds if available."""
        sec = float(self.integer_timestamp or 0)
        if self.tsf == Vita49TSF.REAL_TIME_PICOSECONDS and self.fractional_timestamp:
            sec += float(self.fractional_timestamp) * 1e-12
        return sec


def encode_vita49_data_packet(
    samples: np.ndarray,
    stream_id: Optional[int] = 0x1001,
    packet_count: int = 0,
    tsi: Vita49TSI = Vita49TSI.UTC,
    tsf: Vita49TSF = Vita49TSF.REAL_TIME_PICOSECONDS,
    timestamp: Optional[float] = None,
    sample_format: str = "i16",
    trailer: Optional[Vita49Trailer] = None,
) -> bytes:
    """
    Encodes complex I/Q samples into a VITA 49 Data Packet.
    
    samples: 1D array of complex numbers, normalized in range [-1.0, 1.0].
    sample_format: 'i16' (16-bit signed int I followed by 16-bit signed int Q per sample).
    """
    has_stream_id = stream_id is not None
    pkt_type = (
        Vita49PacketType.IF_DATA_WITH_STREAM_ID
        if has_stream_id
        else Vita49PacketType.IF_DATA_NO_STREAM_ID
    )
    has_class_id = False
    has_trailer = trailer is not None

    if timestamp is None:
        timestamp = time.time()

    int_sec = int(timestamp)
    if tsf == Vita49TSF.REAL_TIME_PICOSECONDS:
        frac_ts = int((timestamp - int_sec) * 1e12)
    elif tsf == Vita49TSF.SAMPLE_COUNT:
        frac_ts = int(packet_count * len(samples))
    else:
        frac_ts = 0

    # Header size in words (32-bit = 4 bytes)
    header_words = 1
    if has_stream_id:
        header_words += 1
    if tsi != Vita49TSI.NONE:
        header_words += 1
    if tsf != Vita49TSF.NONE:
        header_words += 2  # 64-bit frac timestamp = 2 words

    # Pack samples into bytes
    if sample_format == "i16":
        # Scale complex samples to 16-bit signed integer range (-32768 to 32767)
        i_parts = np.clip(np.real(samples) * 32767.0, -32768, 32767).astype(np.int16)
        q_parts = np.clip(np.imag(samples) * 32767.0, -32768, 32767).astype(np.int16)
        # Interleave I and Q
        iq_interleaved = np.empty((len(samples) * 2,), dtype=">i2")  # Big-endian 16-bit
        iq_interleaved[0::2] = i_parts
        iq_interleaved[1::2] = q_parts
        payload_bytes = iq_interleaved.tobytes()
        payload_words = len(payload_bytes) // 4
    else:
        # 32-bit float format (IEEE 754)
        i_parts = np.real(samples).astype(">f4")
        q_parts = np.imag(samples).astype(">f4")
        iq_interleaved = np.empty((len(samples) * 2,), dtype=">f4")
        iq_interleaved[0::2] = i_parts
        iq_interleaved[1::2] = q_parts
        payload_bytes = iq_interleaved.tobytes()
        payload_words = len(payload_bytes) // 4

    trailer_words = 1 if has_trailer else 0
    total_words = header_words + payload_words + trailer_words

    # Build 32-bit header
    header_word = (
        ((int(pkt_type) & 0x0F) << 28)
        | ((1 if has_class_id else 0) << 27)
        | ((1 if has_trailer else 0) << 26)
        | ((int(tsi) & 0x03) << 24)
        | ((int(tsf) & 0x03) << 22)
        | ((packet_count & 0x0F) << 16)
        | (total_words & 0xFFFF)
    )

    buf = bytearray(struct.pack(">I", header_word))

    if has_stream_id:
        buf.extend(struct.pack(">I", stream_id))

    if tsi != Vita49TSI.NONE:
        buf.extend(struct.pack(">I", int_sec & 0xFFFFFFFF))

    if tsf != Vita49TSF.NONE:
        buf.extend(struct.pack(">Q", frac_ts & 0xFFFFFFFFFFFFFFFF))

    buf.extend(payload_bytes)

    if has_trailer and trailer is not None:
        buf.extend(trailer.encode())

    return bytes(buf)


def encode_vita49_context_packet(
    stream_id: int = 0x1001,
    packet_count: int = 0,
    timestamp: Optional[float] = None,
    bandwidth: Optional[float] = None,
    rf_reference_freq: Optional[float] = None,
    if_reference_freq: Optional[float] = None,
    sample_rate: Optional[float] = None,
    gain: Optional[float] = None,
    reference_level: Optional[float] = None,
    trailer: Optional[Vita49Trailer] = None,
) -> bytes:
    """Encodes a VITA 49 Context Packet containing RF/IF metadata."""
    pkt_type = Vita49PacketType.CONTEXT
    has_class_id = False
    has_trailer = trailer is not None
    tsi = Vita49TSI.UTC
    tsf = Vita49TSF.REAL_TIME_PICOSECONDS

    if timestamp is None:
        timestamp = time.time()

    int_sec = int(timestamp)
    frac_ts = int((timestamp - int_sec) * 1e12)

    # CIF0 bitmap construction
    cif0 = 0
    context_fields = bytearray()

    # Bandwidth (64-bit fixed point, 20 fractional bits)
    if bandwidth is not None:
        cif0 |= 1 << 29
        bw_fixed = int(bandwidth * (1 << 20))
        context_fields.extend(struct.pack(">q", bw_fixed))

    # IF Reference Frequency (64-bit fixed point, 20 fractional bits)
    if if_reference_freq is not None:
        cif0 |= 1 << 28
        if_fixed = int(if_reference_freq * (1 << 20))
        context_fields.extend(struct.pack(">q", if_fixed))

    # RF Reference Frequency (64-bit fixed point, 20 fractional bits)
    if rf_reference_freq is not None:
        cif0 |= 1 << 27
        rf_fixed = int(rf_reference_freq * (1 << 20))
        context_fields.extend(struct.pack(">q", rf_fixed))

    # Reference Level (16-bit signed, 7 fractional bits, padded to 32 bits)
    if reference_level is not None:
        cif0 |= 1 << 24
        ref_fixed = int(reference_level * (1 << 7))
        context_fields.extend(struct.pack(">h2x", ref_fixed))

    # Gain (16-bit stage 1 + 16-bit stage 2 dB, 7 fractional bits)
    if gain is not None:
        cif0 |= 1 << 23
        gain_fixed = int(gain * (1 << 7))
        context_fields.extend(struct.pack(">hh", gain_fixed, 0))

    # Sample Rate (64-bit fixed point, 20 fractional bits)
    if sample_rate is not None:
        cif0 |= 1 << 21
        sr_fixed = int(sample_rate * (1 << 20))
        context_fields.extend(struct.pack(">q", sr_fixed))

    header_words = 1 + 1 + 1 + 2  # Header + Stream ID + TSI + TSF
    cif_words = 1 + (len(context_fields) // 4)
    trailer_words = 1 if has_trailer else 0
    total_words = header_words + cif_words + trailer_words

    header_word = (
        ((int(pkt_type) & 0x0F) << 28)
        | ((1 if has_class_id else 0) << 27)
        | ((1 if has_trailer else 0) << 26)
        | ((int(tsi) & 0x03) << 24)
        | ((int(tsf) & 0x03) << 22)
        | ((packet_count & 0x0F) << 16)
        | (total_words & 0xFFFF)
    )

    buf = bytearray(struct.pack(">I", header_word))
    buf.extend(struct.pack(">I", stream_id))
    buf.extend(struct.pack(">I", int_sec & 0xFFFFFFFF))
    buf.extend(struct.pack(">Q", frac_ts & 0xFFFFFFFFFFFFFFFF))
    buf.extend(struct.pack(">I", cif0))
    buf.extend(context_fields)

    if has_trailer and trailer is not None:
        buf.extend(trailer.encode())

    return bytes(buf)


def decode_vita49_packet(data: bytes) -> Vita49Packet:
    """
    Decodes a binary byte buffer containing a VITA 49 packet into a structured Vita49Packet.
    Raises ValueError if data is malformed or shorter than expected.
    """
    if len(data) < 4:
        raise ValueError(f"Data too short for VITA 49 header: {len(data)} bytes")

    (header_word,) = struct.unpack(">I", data[:4])
    pkt_type_raw = (header_word >> 28) & 0x0F
    has_class_id = bool(header_word & (1 << 27))
    has_trailer = bool(header_word & (1 << 26))
    tsi_raw = (header_word >> 24) & 0x03
    tsf_raw = (header_word >> 22) & 0x03
    packet_count = (header_word >> 16) & 0x0F
    packet_size_words = header_word & 0xFFFF

    expected_len = packet_size_words * 4
    if len(data) < expected_len:
        # Allow partial decoding if packet_size_words is padded or network chunked
        expected_len = len(data)

    pkt_type = Vita49PacketType(pkt_type_raw)
    tsi = Vita49TSI(tsi_raw)
    tsf = Vita49TSF(tsf_raw)

    offset = 4
    stream_id = None
    if pkt_type in (
        Vita49PacketType.IF_DATA_WITH_STREAM_ID,
        Vita49PacketType.EXT_DATA_WITH_STREAM_ID,
        Vita49PacketType.CONTEXT,
        Vita49PacketType.EXT_CONTEXT,
    ):
        if offset + 4 <= len(data):
            (stream_id,) = struct.unpack(">I", data[offset : offset + 4])
            offset += 4

    class_id = None
    if has_class_id:
        if offset + 8 <= len(data):
            pad_oui, info_class, pkt_class = struct.unpack(">IHH", data[offset : offset + 8])
            class_id = (pad_oui, info_class, pkt_class)
            offset += 8

    integer_timestamp = None
    if tsi != Vita49TSI.NONE:
        if offset + 4 <= len(data):
            (integer_timestamp,) = struct.unpack(">I", data[offset : offset + 4])
            offset += 4

    fractional_timestamp = None
    if tsf != Vita49TSF.NONE:
        if offset + 8 <= len(data):
            (fractional_timestamp,) = struct.unpack(">Q", data[offset : offset + 8])
            offset += 8

    # Extract trailer if present at the end of packet
    trailer = None
    payload_end = expected_len
    if has_trailer and payload_end >= 4:
        trailer_raw_bytes = data[payload_end - 4 : payload_end]
        if len(trailer_raw_bytes) == 4:
            (raw_trailer,) = struct.unpack(">I", trailer_raw_bytes)
            trailer = Vita49Trailer.decode(raw_trailer)
            payload_end -= 4

    payload_bytes = data[offset:payload_end]

    # Process payload based on packet type
    samples = None
    context = None

    if pkt_type in (
        Vita49PacketType.IF_DATA_NO_STREAM_ID,
        Vita49PacketType.IF_DATA_WITH_STREAM_ID,
        Vita49PacketType.EXT_DATA_NO_STREAM_ID,
        Vita49PacketType.EXT_DATA_WITH_STREAM_ID,
    ):
        if len(payload_bytes) >= 4:
            # 16-bit complex I/Q samples
            num_samples = len(payload_bytes) // 4
            iq_arr = np.frombuffer(payload_bytes[: num_samples * 4], dtype=">i2")
            i_samples = iq_arr[0::2].astype(np.float32) / 32768.0
            q_samples = iq_arr[1::2].astype(np.float32) / 32768.0
            samples = i_samples + 1j * q_samples

    elif pkt_type in (Vita49PacketType.CONTEXT, Vita49PacketType.EXT_CONTEXT):
        context = Vita49ContextPacket(
            stream_id=stream_id or 0,
            packet_count=packet_count,
            tsi=tsi,
            tsf=tsf,
            integer_timestamp=integer_timestamp or 0,
            fractional_timestamp=fractional_timestamp or 0,
            has_trailer=has_trailer,
            trailer=trailer,
        )
        if len(payload_bytes) >= 4:
            (cif0,) = struct.unpack(">I", payload_bytes[:4])
            ctx_offset = 4
            if bool(cif0 & (1 << 29)) and ctx_offset + 8 <= len(payload_bytes):
                (bw_fixed,) = struct.unpack(">q", payload_bytes[ctx_offset : ctx_offset + 8])
                context.bandwidth = float(bw_fixed) / (1 << 20)
                ctx_offset += 8
            if bool(cif0 & (1 << 28)) and ctx_offset + 8 <= len(payload_bytes):
                (if_fixed,) = struct.unpack(">q", payload_bytes[ctx_offset : ctx_offset + 8])
                context.if_reference_freq = float(if_fixed) / (1 << 20)
                ctx_offset += 8
            if bool(cif0 & (1 << 27)) and ctx_offset + 8 <= len(payload_bytes):
                (rf_fixed,) = struct.unpack(">q", payload_bytes[ctx_offset : ctx_offset + 8])
                context.rf_reference_freq = float(rf_fixed) / (1 << 20)
                ctx_offset += 8
            if bool(cif0 & (1 << 24)) and ctx_offset + 4 <= len(payload_bytes):
                ref_fixed = struct.unpack(">h2x", payload_bytes[ctx_offset : ctx_offset + 4])[0]
                context.reference_level = float(ref_fixed) / (1 << 7)
                ctx_offset += 4
            if bool(cif0 & (1 << 23)) and ctx_offset + 4 <= len(payload_bytes):
                gain_fixed = struct.unpack(">hh", payload_bytes[ctx_offset : ctx_offset + 4])[0]
                context.gain = float(gain_fixed) / (1 << 7)
                ctx_offset += 4
            if bool(cif0 & (1 << 21)) and ctx_offset + 8 <= len(payload_bytes):
                (sr_fixed,) = struct.unpack(">q", payload_bytes[ctx_offset : ctx_offset + 8])
                context.sample_rate = float(sr_fixed) / (1 << 20)
                ctx_offset += 8

    return Vita49Packet(
        packet_type=pkt_type,
        has_class_id=has_class_id,
        has_trailer=has_trailer,
        tsi=tsi,
        tsf=tsf,
        packet_count=packet_count,
        packet_size_words=packet_size_words,
        stream_id=stream_id,
        class_id=class_id,
        integer_timestamp=integer_timestamp,
        fractional_timestamp=fractional_timestamp,
        samples=samples,
        context=context,
        trailer=trailer,
        raw_payload=payload_bytes,
    )
