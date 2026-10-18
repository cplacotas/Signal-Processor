"""
FastAPI Server for VITA 49 Signal Processor and Web-based Simulator.
Handles UDP packet ingest, DSP pipeline, WebSocket broadcasting, and REST controls.
"""

from __future__ import annotations
import asyncio
import binascii
import json
import logging
import socket
import time
from typing import Set, Dict, Any, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import Response, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .vita49.codec import decode_vita49_packet, Vita49PacketType
from .dsp.analyzer import SignalAnalyzer, SpectralFrame
from .dsp.simulator import SignalSimulator, SimulatorConfig

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("signal_processor")

# Global instances
analyzer = SignalAnalyzer(sample_rate=10_000_000.0, rf_center_freq=100_000_000.0, fft_size=1024)
simulator = SignalSimulator(SimulatorConfig(target_port=4991))

active_websockets: Set[WebSocket] = set()
latest_frame: Optional[SpectralFrame] = None
latest_raw_packet_info: Optional[Dict[str, Any]] = None
udp_packets_received = 0
udp_bytes_received = 0
udp_transport = None


class SimulatorConfigModel(BaseModel):
    signal_type: Optional[str] = None
    rf_center_freq: Optional[float] = None
    freq_offset: Optional[float] = None
    bandwidth: Optional[float] = None
    sample_rate: Optional[float] = None
    amplitude_dbfs: Optional[float] = None
    snr_db: Optional[float] = None
    stream_id: Optional[int] = None
    is_pulsed: Optional[bool] = None
    pulse_width_ms: Optional[float] = None
    pulse_pri_ms: Optional[float] = None
    packets_per_second: Optional[int] = None


class Vita49UdpProtocol(asyncio.DatagramProtocol):
    """Async UDP Protocol handler for incoming VITA 49 datagrams."""

    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        global udp_packets_received, udp_bytes_received, latest_frame, latest_raw_packet_info
        udp_packets_received += 1
        udp_bytes_received += len(data)

        try:
            pkt = decode_vita49_packet(data)

            # Store inspector telemetry for UI
            latest_raw_packet_info = {
                "packet_type": pkt.packet_type.name,
                "packet_type_code": int(pkt.packet_type),
                "stream_id": f"0x{pkt.stream_id:08X}" if pkt.stream_id is not None else "None",
                "packet_count": pkt.packet_count,
                "packet_size_words": pkt.packet_size_words,
                "packet_bytes": len(data),
                "tsi": pkt.tsi.name,
                "tsf": pkt.tsf.name,
                "integer_timestamp": pkt.integer_timestamp,
                "fractional_timestamp": pkt.fractional_timestamp,
                "timestamp_seconds": round(pkt.timestamp_seconds(), 6),
                "has_trailer": pkt.has_trailer,
                "trailer": {
                    "calibrated_time": pkt.trailer.calibrated_time,
                    "valid_data": pkt.trailer.valid_data,
                    "reference_lock": pkt.trailer.reference_lock,
                    "detected_signal": pkt.trailer.detected_signal,
                    "over_range": pkt.trailer.over_range,
                    "sample_loss": pkt.trailer.sample_loss,
                }
                if pkt.trailer
                else None,
                "hex_preview": binascii.hexlify(data[:64]).decode("ascii"),
            }

            if pkt.packet_type == Vita49PacketType.CONTEXT and pkt.context:
                analyzer.update_context(
                    sample_rate=pkt.context.sample_rate,
                    rf_center_freq=pkt.context.rf_reference_freq,
                    stream_id=pkt.context.stream_id,
                )
            elif pkt.samples is not None and len(pkt.samples) > 0:
                ts = pkt.timestamp_seconds()
                if ts <= 0:
                    ts = time.time()
                latest_frame = analyzer.process_packet(
                    samples=pkt.samples,
                    timestamp=ts,
                    sequence_id=pkt.packet_count,
                    stream_id=pkt.stream_id,
                )
        except Exception as e:
            logger.debug(f"Error parsing VITA 49 datagram: {e}")


async def broadcast_loop():
    """Streams latest spectral frames and metrics to connected UI WebSockets."""
    global latest_frame, latest_raw_packet_info
    while True:
        if active_websockets and latest_frame is not None:
            # Serialize payload
            payload = {
                "frequencies": latest_frame.frequencies,
                "psd_dbfs": latest_frame.psd_dbfs,
                "time_i": latest_frame.time_i,
                "time_q": latest_frame.time_q,
                "constellation_i": latest_frame.constellation_i,
                "constellation_q": latest_frame.constellation_q,
                "metrics": {
                    "rf_center_freq": latest_frame.metrics.rf_center_freq,
                    "peak_freq": latest_frame.metrics.peak_freq,
                    "peak_power_dbfs": latest_frame.metrics.peak_power_dbfs,
                    "center_freq_est": latest_frame.metrics.center_freq_est,
                    "occupied_bandwidth_99": latest_frame.metrics.occupied_bandwidth_99,
                    "bandwidth_3db": latest_frame.metrics.bandwidth_3db,
                    "bandwidth_10db": latest_frame.metrics.bandwidth_10db,
                    "noise_floor_dbfs": latest_frame.metrics.noise_floor_dbfs,
                    "snr_db": latest_frame.metrics.snr_db,
                    "sample_rate": latest_frame.metrics.sample_rate,
                    "start_time": latest_frame.metrics.start_time,
                    "stop_time": latest_frame.metrics.stop_time,
                    "duration_seconds": latest_frame.metrics.duration_seconds,
                    "is_burst_active": latest_frame.metrics.is_burst_active,
                    "papr_db": latest_frame.metrics.papr_db,
                    "rms_power": latest_frame.metrics.rms_power,
                    "modulation_hint": latest_frame.metrics.modulation_hint,
                    "stream_id": latest_frame.metrics.stream_id,
                    "packet_count": latest_frame.metrics.packet_count,
                    "packet_loss_count": latest_frame.metrics.packet_loss_count,
                },
                "packet_inspector": latest_raw_packet_info,
                "signals": analyzer.get_all_signals(),
                "burst_history": analyzer.detected_bursts_history[-10:],
                "udp_stats": {
                    "packets_received": udp_packets_received,
                    "bytes_received": udp_bytes_received,
                },
                "simulator_stats": simulator.stats,
            }
            msg = json.dumps(payload)
            dead_sockets = set()
            for ws in list(active_websockets):
                try:
                    await ws.send_text(msg)
                except Exception:
                    dead_sockets.add(ws)
            active_websockets.difference_update(dead_sockets)

        await asyncio.sleep(0.033)  # ~30 frames/sec


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start UDP server and broadcast loop
    loop = asyncio.get_running_loop()
    logger.info("Starting VITA 49 UDP listener on 0.0.0.0:4991...")
    transport, protocol = await loop.create_datagram_endpoint(
        lambda: Vita49UdpProtocol(),
        local_addr=("0.0.0.0", 4991),
    )
    broadcast_task = asyncio.create_task(broadcast_loop())

    # Auto-start simulator on startup so data is immediately available
    await simulator.start()

    yield

    # Shutdown
    await simulator.stop()
    broadcast_task.cancel()
    transport.close()


app = FastAPI(title="VITA 49 Signal Processor API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/status")
async def get_status():
    return {
        "status": "online",
        "udp_port": 4991,
        "packets_received": udp_packets_received,
        "bytes_received": udp_bytes_received,
        "simulator": simulator.stats,
    }


@app.get("/api/bursts")
async def get_bursts():
    return {"bursts": analyzer.detected_bursts_history}


@app.get("/api/signals")
async def get_signals():
    return {"signals": analyzer.get_all_signals()}


@app.post("/api/signals/clear")
async def clear_signals():
    analyzer.clear_signals()
    return {"status": "cleared"}


@app.get("/api/signals/export")
async def export_signals(format: str = "json"):
    content = analyzer.export_signals(format=format)
    fmt = format.lower()
    if fmt == "csv":
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=signals_intercept.csv"}
        )
    elif fmt in ("report", "txt", "markdown", "md"):
        return PlainTextResponse(
            content=content,
            headers={"Content-Disposition": "attachment; filename=signals_report.txt"}
        )
    else:
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=signals_metadata.json"}
        )


@app.post("/api/simulator/start")
async def start_sim():
    await simulator.start()
    return {"status": "started", "simulator": simulator.stats}


@app.post("/api/simulator/stop")
async def stop_sim():
    await simulator.stop()
    return {"status": "stopped", "simulator": simulator.stats}


@app.post("/api/simulator/config")
async def update_sim_config(cfg: SimulatorConfigModel):
    update_data = {k: v for k, v in cfg.model_dump().items() if v is not None}
    simulator.update_config(**update_data)
    # Also update analyzer context if sample rate or center freq changed
    if "sample_rate" in update_data or "rf_center_freq" in update_data:
        analyzer.update_context(
            sample_rate=update_data.get("sample_rate"),
            rf_center_freq=update_data.get("rf_center_freq"),
        )
    return {"status": "updated", "config": simulator.stats["config"]}


@app.post("/api/simulator/burst")
async def trigger_single_burst():
    """Generates and transmits a single burst immediately."""
    now = time.time()
    samples, _ = simulator.generate_chunk(simulator.config.samples_per_packet, now)
    data_pkt, ctx_pkt = simulator.create_vita49_packets(samples, now, is_active=True)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    if ctx_pkt:
        sock.sendto(ctx_pkt, (simulator.config.target_host, simulator.config.target_port))
    sock.sendto(data_pkt, (simulator.config.target_host, simulator.config.target_port))
    sock.close()
    return {"status": "burst_sent", "samples": len(samples)}


@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    await websocket.accept()
    active_websockets.add(websocket)
    try:
        while True:
            # Keep connection open and accept any incoming control commands from frontend
            msg_text = await websocket.receive_text()
            try:
                cmd = json.loads(msg_text)
                if cmd.get("action") == "update_config":
                    simulator.update_config(**cmd.get("params", {}))
                elif cmd.get("action") == "start":
                    await simulator.start()
                elif cmd.get("action") == "stop":
                    await simulator.stop()
            except Exception:
                pass
    except WebSocketDisconnect:
        active_websockets.discard(websocket)
    except Exception:
        active_websockets.discard(websocket)
