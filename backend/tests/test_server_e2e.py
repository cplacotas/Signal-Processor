"""End-to-end integration tests for FastAPI server and WebSocket hub."""

import asyncio
import json
import socket
import time
import pytest
from httpx import AsyncClient, ASGITransport
from backend.server import app, simulator, analyzer
from backend.dsp.simulator import SimulatorConfig
from backend.vita49.codec import encode_vita49_data_packet, encode_vita49_context_packet
import numpy as np


@pytest.mark.asyncio
async def test_server_status_and_simulator_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Test /api/status
        res = await client.get("/api/status")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "online"
        assert data["udp_port"] == 4991

        # Test updating simulator config
        cfg_res = await client.post(
            "/api/simulator/config",
            json={
                "signal_type": "cw",
                "rf_center_freq": 1420000000.0,
                "freq_offset": 250000.0,
                "bandwidth": 100000.0,
                "amplitude_dbfs": -5.0,
                "snr_db": 32.0,
            },
        )
        assert cfg_res.status_code == 200
        cfg_data = cfg_res.json()
        assert cfg_data["status"] == "updated"
        assert cfg_data["config"]["signal_type"] == "cw"
        assert cfg_data["config"]["rf_center_freq"] == 1420000000.0

        # Test single burst trigger
        burst_res = await client.post("/api/simulator/burst")
        assert burst_res.status_code == 200
        assert burst_res.json()["status"] == "burst_sent"

        # Test bursts history
        history_res = await client.get("/api/bursts")
        assert history_res.status_code == 200
        assert "bursts" in history_res.json()

        # Test signals endpoint
        sig_res = await client.get("/api/signals")
        assert sig_res.status_code == 200
        assert "signals" in sig_res.json()

        # Test signals export (json, csv, report)
        export_json = await client.get("/api/signals/export?format=json")
        assert export_json.status_code == 200

        export_csv = await client.get("/api/signals/export?format=csv")
        assert export_csv.status_code == 200
        assert "text/csv" in export_csv.headers.get("content-type", "")

        export_report = await client.get("/api/signals/export?format=report")
        assert export_report.status_code == 200
        assert "text/plain" in export_report.headers.get("content-type", "")

        # Test clear signals
        clear_res = await client.post("/api/signals/clear")
        assert clear_res.status_code == 200
        assert clear_res.json()["status"] == "cleared"


@pytest.mark.asyncio
async def test_udp_vita49_ingest_and_dsp_update():
    from backend.server import Vita49UdpProtocol
    proto = Vita49UdpProtocol()
    dest = ("127.0.0.1", 4991)

    t_now = time.time()
    ctx_pkt = encode_vita49_context_packet(
        stream_id=0x9999,
        packet_count=0,
        timestamp=t_now,
        bandwidth=4_000_000.0,
        rf_reference_freq=433_000_000.0,
        sample_rate=10_000_000.0,
    )

    t = np.arange(1024) / 10_000_000.0
    samples = (0.75 * np.exp(1j * 2 * np.pi * 500_000.0 * t)).astype(np.complex64)
    data_pkt = encode_vita49_data_packet(
        samples=samples,
        stream_id=0x9999,
        packet_count=1,
        timestamp=t_now,
    )

    # Ingest context and data datagrams
    proto.datagram_received(ctx_pkt, dest)
    proto.datagram_received(data_pkt, dest)

    assert analyzer.sample_rate == 10_000_000.0
    assert analyzer.rf_center_freq == 433_000_000.0
    assert analyzer.last_stream_id == 0x9999
