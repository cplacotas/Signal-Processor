import React, { useRef, useEffect, useState } from 'react';
import { Target, X } from 'lucide-react';

export default function ConstellationPlot({ constellationI, constellationQ, timeI, timeQ, onClose }) {
  const constContainerRef = useRef(null);
  const timeContainerRef = useRef(null);
  const constCanvasRef = useRef(null);
  const timeCanvasRef = useRef(null);

  const [constDim, setConstDim] = useState({ width: 280, height: 220 });
  const [timeDim, setTimeDim] = useState({ width: 360, height: 220 });

  // Handle dynamic container resizing
  useEffect(() => {
    if (!constContainerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setConstDim({
            width: Math.floor(entry.contentRect.width),
            height: Math.floor(entry.contentRect.height),
          });
        }
      }
    });
    obs.observe(constContainerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!timeContainerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setTimeDim({
            width: Math.floor(entry.contentRect.width),
            height: Math.floor(entry.contentRect.height),
          });
        }
      }
    });
    obs.observe(timeContainerRef.current);
    return () => obs.disconnect();
  }, []);

  // Render Constellation (I vs Q) with high-DPI
  useEffect(() => {
    const canvas = constCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const width = constDim.width;
    const height = constDim.height;

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(width, height) * 0.42;

    // Draw crisp grid axes
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.floor(cy) + 0.5);
    ctx.lineTo(width, Math.floor(cy) + 0.5);
    ctx.moveTo(Math.floor(cx) + 0.5, 0);
    ctx.lineTo(Math.floor(cx) + 0.5, height);
    ctx.stroke();

    // Unit circle (crisp)
    ctx.beginPath();
    ctx.arc(cx, cy, scale, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
    ctx.stroke();

    // Axes tick markings
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('+1.0 I', width - 8, cy - 6);
    ctx.textAlign = 'left';
    ctx.fillText('+1.0 Q', cx + 6, 16);

    if (!constellationI || !constellationQ || constellationI.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 12px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No I/Q Data', cx, cy);
      ctx.restore();
      return;
    }

    // Draw constellation points with crisp glow
    for (let i = 0; i < constellationI.length; i++) {
      const px = cx + constellationI[i] * scale;
      const py = cy - constellationQ[i] * scale;

      ctx.fillStyle = 'rgba(0, 240, 255, 0.75)';
      ctx.beginPath();
      ctx.arc(px, py, 2.2, 0, 2 * Math.PI);
      ctx.fill();
    }

    ctx.restore();
  }, [constellationI, constellationQ, constDim]);

  // Render Time Domain Oscilloscope (I(t) and Q(t)) with high-DPI
  useEffect(() => {
    const canvas = timeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const width = timeDim.width;
    const height = timeDim.height;

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, width, height);

    const cy = height / 2;

    // Centerline and grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.floor(cy) + 0.5);
    ctx.lineTo(width, Math.floor(cy) + 0.5);
    ctx.stroke();

    // Scale markings
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('+1.0', 6, 16);
    ctx.fillText('-1.0', 6, height - 8);

    if (!timeI || !timeQ || timeI.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 12px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting Time-Domain Waveform...', width / 2, cy);
      ctx.restore();
      return;
    }

    const n = timeI.length;
    const stepX = width / (n - 1 || 1);
    const ampScale = (height / 2) * 0.85;

    // Draw I(t) in bright Cyan
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = i * stepX;
      const y = cy - timeI[i] * ampScale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw Q(t) in bright Amber
    ctx.strokeStyle = '#ffb703';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = i * stepX;
      const y = cy - timeQ[i] * ampScale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.restore();
  }, [timeI, timeQ, timeDim]);

  return (
    <div className="bg-[#0d1527] border border-[#1e305b] rounded-lg overflow-hidden flex flex-col h-full shadow-lg">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#1e305b] bg-[#090f1d]">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-rf-amber shadow-[0_0_8px_#ffb703]" />
          <span className="text-xs font-bold tracking-wider text-slate-100">
            CONSTELLATION & TIME DOMAIN (I/Q)
          </span>
        </div>
        <div className="flex items-center space-x-3 text-xs font-mono">
          <span className="flex items-center space-x-1 font-bold text-slate-200">
            <span className="w-2 h-2 rounded-full bg-rf-accent inline-block"></span>
            <span>I(t)</span>
          </span>
          <span className="flex items-center space-x-1 font-bold text-slate-200">
            <span className="w-2 h-2 rounded-full bg-rf-amber inline-block"></span>
            <span>Q(t)</span>
          </span>
          {onClose && (
            <button
              onClick={onClose}
              title="Close View"
              className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1e305b] transition-colors ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="p-2 grid grid-cols-1 md:grid-cols-2 gap-2 flex-1">
        {/* Constellation I vs Q */}
        <div ref={constContainerRef} className="relative bg-[#070b14] rounded border border-[#14203d] p-1 flex flex-col items-center justify-center min-h-[180px]">
          <div className="text-[11px] text-slate-300 font-mono font-bold bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800 absolute top-2 left-2 z-10">
            IQ Constellation
          </div>
          <canvas
            ref={constCanvasRef}
            style={{ width: '100%', height: '100%' }}
            className="block"
          />
        </div>

        {/* Time-domain oscilloscope */}
        <div ref={timeContainerRef} className="relative bg-[#070b14] rounded border border-[#14203d] p-1 flex flex-col items-center justify-center min-h-[180px]">
          <div className="text-[11px] text-slate-300 font-mono font-bold bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800 absolute top-2 left-2 z-10">
            Time Oscilloscope
          </div>
          <canvas
            ref={timeCanvasRef}
            style={{ width: '100%', height: '100%' }}
            className="block"
          />
        </div>
      </div>
    </div>
  );
}
