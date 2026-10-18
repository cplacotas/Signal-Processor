"""Tests for VITA 49 serialization and deserialization."""

import time
import numpy as np
import pytest
from backend.vita49.codec import (
    Vita49PacketType,
    Vita49TSI,
    Vita49TSF,
    Vita49Trailer,
    encode_vita49_data_packet,
    encode_vita49_context_packet,
    decode_vita49_packet,
)


def test_vita49_data_packet_roundtrip():
    # Generate 512 synthetic complex samples
    t = np.linspace(0, 1e-4, 512, endpoint=False)
    freq = 250_000.0  # 250 kHz
    original_samples = (0.7 * np.exp(1j * 2 * np.pi * freq * t)).astype(np.complex64)

    timestamp = 1700000000.123456
    stream_id = 0xABCD1234
    packet_count = 7
    trailer = Vita49Trailer(
        calibrated_time=True,
        valid_data=True,
        reference_lock=True,
        detected_signal=True,
        over_range=False,
    )

    encoded = encode_vita49_data_packet(
        samples=original_samples,
        stream_id=stream_id,
        packet_count=packet_count,
        tsi=Vita49TSI.UTC,
        tsf=Vita49TSF.REAL_TIME_PICOSECONDS,
        timestamp=timestamp,
        trailer=trailer,
    )

    assert isinstance(encoded, bytes)
    assert len(encoded) > 0

    decoded = decode_vita49_packet(encoded)

    assert decoded.packet_type == Vita49PacketType.IF_DATA_WITH_STREAM_ID
    assert decoded.stream_id == stream_id
    assert decoded.packet_count == packet_count
    assert decoded.tsi == Vita49TSI.UTC
    assert decoded.tsf == Vita49TSF.REAL_TIME_PICOSECONDS
    assert decoded.integer_timestamp == int(timestamp)
    assert decoded.has_trailer is True
    assert decoded.trailer is not None
    assert decoded.trailer.valid_data is True
    assert decoded.trailer.detected_signal is True

    # Check sample fidelity (16-bit integer quantization has slight precision limit)
    assert decoded.samples is not None
    assert len(decoded.samples) == len(original_samples)
    diff = np.abs(decoded.samples - original_samples)
    max_err = np.max(diff)
    assert max_err < 0.01, f"Quantization error too high: {max_err}"


def test_vita49_context_packet_roundtrip():
    stream_id = 0x55AA1122
    timestamp = 1712345678.987654
    bw = 5_000_000.0         # 5 MHz
    rf_freq = 1_420_000_000.0 # 1.42 GHz
    if_freq = 70_000_000.0    # 70 MHz
    sample_rate = 20_000_000.0 # 20 Msps
    gain = 24.5
    ref_lvl = -10.0

    encoded = encode_vita49_context_packet(
        stream_id=stream_id,
        packet_count=3,
        timestamp=timestamp,
        bandwidth=bw,
        rf_reference_freq=rf_freq,
        if_reference_freq=if_freq,
        sample_rate=sample_rate,
        gain=gain,
        reference_level=ref_lvl,
    )

    decoded = decode_vita49_packet(encoded)
    assert decoded.packet_type == Vita49PacketType.CONTEXT
    assert decoded.stream_id == stream_id
    assert decoded.context is not None
    ctx = decoded.context
    assert ctx.bandwidth is not None
    assert abs(ctx.bandwidth - bw) < 1.0
    assert ctx.rf_reference_freq is not None
    assert abs(ctx.rf_reference_freq - rf_freq) < 1.0
    assert ctx.if_reference_freq is not None
    assert abs(ctx.if_reference_freq - if_freq) < 1.0
    assert ctx.sample_rate is not None
    assert abs(ctx.sample_rate - sample_rate) < 1.0
    assert ctx.gain is not None
    assert abs(ctx.gain - gain) < 0.1
    assert ctx.reference_level is not None
    assert abs(ctx.reference_level - ref_lvl) < 0.1
