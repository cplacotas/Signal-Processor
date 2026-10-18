"""Tests for DSP signal analysis, FFT, and burst detection."""

import numpy as np
import pytest
from backend.dsp.analyzer import SignalAnalyzer
from backend.dsp.simulator import SignalSimulator, SimulatorConfig


def test_analyzer_cw_tone():
    fs = 10_000_000.0   # 10 MHz
    fc = 100_000_000.0  # 100 MHz
    offset = 1_500_000.0  # +1.5 MHz offset -> peak at 101.5 MHz

    analyzer = SignalAnalyzer(sample_rate=fs, rf_center_freq=fc, fft_size=1024)

    # Generate 1024 samples of a pure CW tone
    t = np.arange(1024) / fs
    samples = 0.8 * np.exp(1j * 2 * np.pi * offset * t)

    frame = analyzer.process_packet(samples=samples, timestamp=100.0, sequence_id=0)

    # Check peak frequency
    expected_peak = fc + offset
    assert abs(frame.metrics.peak_freq - expected_peak) < (fs / 1024.0 * 2)
    assert frame.metrics.snr_db > 20.0
    assert "Single Tone" in frame.metrics.modulation_hint or "CW" in frame.metrics.modulation_hint


def test_analyzer_chirp_bandwidth():
    fs = 10_000_000.0
    fc = 433_000_000.0
    bw = 2_000_000.0  # 2 MHz chirp

    sim = SignalSimulator(SimulatorConfig(
        signal_type="chirp",
        rf_center_freq=fc,
        bandwidth=bw,
        sample_rate=fs,
        amplitude_dbfs=-3.0,
        snr_db=30.0,
        samples_per_packet=1024,
    ))

    analyzer = SignalAnalyzer(sample_rate=fs, rf_center_freq=fc, fft_size=1024)

    # Process 3 consecutive packets to prime buffer
    for i in range(3):
        samples, _ = sim.generate_chunk(1024, t_start=i * 1024 / fs)
        frame = analyzer.process_packet(samples=samples, timestamp=200.0 + i * 0.01, sequence_id=i)

    # Occupied bandwidth should reflect wideband chirp (> 800 kHz due to windowing)
    assert frame.metrics.occupied_bandwidth_99 > 800_000.0
    assert "Chirp" in frame.metrics.modulation_hint or "Wideband" in frame.metrics.modulation_hint


def test_burst_detection_lifecycle():
    fs = 1_000_000.0
    fc = 50_000_000.0
    analyzer = SignalAnalyzer(sample_rate=fs, rf_center_freq=fc, fft_size=512, burst_threshold_db=10.0)

    # Step 1: Feed noise (idle)
    noise = (np.random.normal(0, 0.01, 512) + 1j * np.random.normal(0, 0.01, 512)).astype(np.complex64)
    frame_idle = analyzer.process_packet(samples=noise, timestamp=1.0, sequence_id=0)
    assert not frame_idle.metrics.is_burst_active

    # Step 2: Feed active burst at t=2.0
    tone = (0.9 * np.exp(1j * 2 * np.pi * 100_000.0 * np.arange(512) / fs)).astype(np.complex64)
    frame_burst = analyzer.process_packet(samples=tone, timestamp=2.0, sequence_id=1)
    assert frame_burst.metrics.is_burst_active
    assert frame_burst.metrics.start_time == 2.0

    # Step 3: Burst continues at t=2.1
    frame_burst2 = analyzer.process_packet(samples=tone, timestamp=2.1, sequence_id=2)
    assert frame_burst2.metrics.is_burst_active
    assert frame_burst2.metrics.duration_seconds > 0.09

    # Step 4: Burst ends at t=2.2 (back to noise)
    frame_end = analyzer.process_packet(samples=noise, timestamp=2.2, sequence_id=3)
    assert not frame_end.metrics.is_burst_active
    assert len(analyzer.detected_bursts_history) >= 1
    event = analyzer.detected_bursts_history[0]
    assert event["start_time"] == 2.0


def test_signal_object_lifecycle_and_export():
    fs = 1_000_000.0
    fc = 100_000_000.0
    analyzer = SignalAnalyzer(sample_rate=fs, rf_center_freq=fc, fft_size=512, burst_threshold_db=10.0)

    # 1. Start signal 1 (100.1 MHz)
    t = np.arange(512) / fs
    sig1 = (0.8 * np.exp(1j * 2 * np.pi * 100_000.0 * t)).astype(np.complex64)
    analyzer.process_packet(samples=sig1, timestamp=10.0, sequence_id=0)

    signals = analyzer.get_all_signals()
    assert len(signals) == 1
    assert signals[0]["id"] == "SIG-001"
    assert signals[0]["state"] == "ACTIVE"
    assert signals[0]["start_time"] == 10.0

    # 2. Continue signal 1 for 2 seconds
    analyzer.process_packet(samples=sig1, timestamp=12.0, sequence_id=1)
    signals = analyzer.get_all_signals()
    assert signals[0]["state"] == "ACTIVE"
    assert signals[0]["duration_seconds"] >= 2.0

    # 3. New signal frequency received (e.g. 100.4 MHz)
    sig2 = (0.8 * np.exp(1j * 2 * np.pi * 400_000.0 * t)).astype(np.complex64)
    analyzer.process_packet(samples=sig2, timestamp=15.0, sequence_id=2)

    signals = analyzer.get_all_signals()
    assert len(signals) == 2
    # First signal completed
    assert signals[0]["id"] == "SIG-001"
    assert signals[0]["state"] == "COMPLETED"
    # Second signal active
    assert signals[1]["id"] == "SIG-002"
    assert signals[1]["state"] == "ACTIVE"

    # 4. Test exports
    json_out = analyzer.export_signals(format="json")
    assert "SIG-001" in json_out and "SIG-002" in json_out

    csv_out = analyzer.export_signals(format="csv")
    assert "SIG-001,COMPLETED" in csv_out
    assert "center_freq_mhz" in csv_out

    report_out = analyzer.export_signals(format="report")
    assert "VITA 49 RF SIGNAL INTERCEPT" in report_out
    assert "SIG-001" in report_out
