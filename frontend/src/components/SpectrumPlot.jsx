import React, { useRef, useEffect, useState } from 'react';
import { Eye, X, Maximize2 } from 'lucide-react';

function formatFreq(hz) {
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(3)} GHz`;
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(3)} MHz`;
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(1)} kHz`;
  return `${hz.toFixed(0)} Hz`;
}

export default function SpectrumPlot({ frequencies, psd, metrics, onClose }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const maxHoldRef = useRef(null);
  const [showMaxHold, setShowMaxHold] = useState(true);
  const [mousePos, setMousePos] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 320 });

  // Handle dynamic container resizing with high-DPI Retina support
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Maintain max-hold trace
  useEffect(() => {
    if (!psd || psd.length === 0) return;
    if (!maxHoldRef.current || maxHoldRef.current.length !== psd.length) {
      maxHoldRef.current = [...psd];
    } else {
      for (let i = 0; i < psd.length; i++) {
        if (psd[i] > maxHoldRef.current[i]) {
          maxHoldRef.current[i] = psd[i];
        } else {
          maxHoldRef.current[i] = Math.max(-130, maxHoldRef.current[i] - 0.05);
        }
      }
    }
  }, [psd]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const cssWidth = dimensions.width;
    const cssHeight = dimensions.height;

    // Set canvas internal resolution scaled by Device Pixel Ratio
    if (canvas.width !== Math.floor(cssWidth * dpr) || canvas.height !== Math.floor(cssHeight * dpr)) {
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    if (!frequencies || !psd || frequencies.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 13px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting VITA 49 Spectral Data...', cssWidth / 2, cssHeight / 2);
      ctx.restore();
      return;
    }

    const padLeft = 65;
    const padRight = 24;
    const padTop = 30;
    const padBottom = 32;
    const plotW = Math.max(10, cssWidth - padLeft - padRight);
    const plotH = Math.max(10, cssHeight - padTop - padBottom);

    const minDb = -120;
    const maxDb = 0;
    const dbRange = maxDb - minDb;

    const minFreq = frequencies[0];
    const maxFreq = frequencies[frequencies.length - 1];
    const freqRange = maxFreq - minFreq || 1;

    const toX = (f) => padLeft + ((f - minFreq) / freqRange) * plotW;
    const toY = (db) => padTop + plotH - ((Math.min(maxDb, Math.max(minDb, db)) - minDb) / dbRange) * plotH;

    // Draw Grid Lines (dB)
    ctx.lineWidth = 1;
    ctx.font = '600 11px JetBrains Mono, monospace';

    for (let db = minDb; db <= maxDb; db += 20) {
      const y = Math.floor(toY(db)) + 0.5;
      ctx.beginPath();
      ctx.strokeStyle = db === 0 ? '#334155' : '#14203d';
      ctx.moveTo(padLeft, y);
      ctx.lineTo(cssWidth - padRight, y);
      ctx.stroke();

      // High contrast text
      ctx.fillStyle = db === 0 ? '#f8fafc' : '#cbd5e1';
      ctx.textAlign = 'right';
      ctx.fillText(`${db} dB`, padLeft - 8, y + 4);
    }

    // Draw Grid Lines (Frequency)
    const numFreqTicks = Math.max(3, Math.min(8, Math.floor(cssWidth / 130)));
    for (let i = 0; i <= numFreqTicks; i++) {
      const f = minFreq + (i / numFreqTicks) * freqRange;
      const x = Math.floor(toX(f)) + 0.5;
      ctx.beginPath();
      ctx.strokeStyle = '#14203d';
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, cssHeight - padBottom);
      ctx.stroke();

      ctx.fillStyle = '#cbd5e1';
      ctx.textAlign = 'center';
      ctx.fillText(formatFreq(f), x, cssHeight - padBottom + 18);
    }

    // Draw Occupied Bandwidth (99%) Shading
    if (metrics && metrics.occupied_bandwidth_99 > 0) {
      const bw = metrics.occupied_bandwidth_99;
      const center = metrics.center_freq_est || metrics.rf_center_freq;
      const xLeft = Math.max(padLeft, toX(center - bw / 2));
      const xRight = Math.min(cssWidth - padRight, toX(center + bw / 2));
      const bwW = Math.max(1, xRight - xLeft);

      ctx.fillStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.fillRect(xLeft, padTop, bwW, plotH);

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(xLeft, padTop);
      ctx.lineTo(xLeft, cssHeight - padBottom);
      ctx.moveTo(xRight, padTop);
      ctx.lineTo(xRight, cssHeight - padBottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // OBW label with background
      ctx.fillStyle = 'rgba(7, 11, 20, 0.85)';
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
      const midX = (xLeft + xRight) / 2;
      const obwLabel = `OBW 99%: ${formatFreq(bw)}`;
      ctx.fillRect(midX - 70, padTop + 5, 140, 20);
      ctx.strokeRect(midX - 70, padTop + 5, 140, 20);
      ctx.fillStyle = '#00f0ff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.fillText(obwLabel, midX, padTop + 19);
    }

    // Draw Max-Hold Trace (Amber)
    if (showMaxHold && maxHoldRef.current) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 183, 3, 0.65)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < maxHoldRef.current.length; i++) {
        const x = toX(frequencies[i]);
        const y = toY(maxHoldRef.current[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Gradient fill under spectrum curve
    const areaGrad = ctx.createLinearGradient(0, padTop, 0, cssHeight - padBottom);
    areaGrad.addColorStop(0, 'rgba(0, 240, 255, 0.30)');
    areaGrad.addColorStop(0.5, 'rgba(0, 255, 136, 0.10)');
    areaGrad.addColorStop(1, 'rgba(0, 119, 182, 0.0)');

    ctx.beginPath();
    ctx.moveTo(toX(frequencies[0]), cssHeight - padBottom);
    for (let i = 0; i < psd.length; i++) {
      const x = toX(frequencies[i]);
      const y = toY(psd[i]);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(toX(frequencies[frequencies.length - 1]), cssHeight - padBottom);
    ctx.closePath();
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // Trace Outline (Sharp Cyan)
    ctx.beginPath();
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.8;
    for (let i = 0; i < psd.length; i++) {
      const x = toX(frequencies[i]);
      const y = toY(psd[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Peak Marker with High Contrast Callout
    if (metrics && metrics.peak_freq) {
      const px = toX(metrics.peak_freq);
      const py = toY(metrics.peak_power_dbfs);

      // Marker circle
      ctx.strokeStyle = '#ff0055';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, 2 * Math.PI);
      ctx.stroke();

      // Peak vertical dashed line
      ctx.strokeStyle = 'rgba(255, 0, 85, 0.7)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(px, padTop);
      ctx.lineTo(px, cssHeight - padBottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // High-contrast callout box
      const tagText = `${formatFreq(metrics.peak_freq)} (${metrics.peak_power_dbfs.toFixed(1)} dBFS)`;
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      const textW = ctx.measureText(tagText).width;
      const boxW = textW + 16;
      const boxX = px + (px > cssWidth - boxW - 20 ? -boxW - 6 : 6);
      const boxY = Math.max(padTop + 2, py - 26);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.strokeStyle = '#ff0055';
      ctx.lineWidth = 1.2;
      ctx.fillRect(boxX, boxY, boxW, 20);
      ctx.strokeRect(boxX, boxY, boxW, 20);

      ctx.fillStyle = '#ff3366';
      ctx.textAlign = 'left';
      ctx.fillText(tagText, boxX + 8, boxY + 14);
    }

    // Interactive Mouse Hover Inspector
    if (mousePos && mousePos.x >= padLeft && mousePos.x <= cssWidth - padRight) {
      const hoverFreq = minFreq + ((mousePos.x - padLeft) / plotW) * freqRange;
      const hoverDb = minDb + ((cssHeight - padBottom - mousePos.y) / plotH) * dbRange;

      ctx.strokeStyle = '#e2e8f0';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(mousePos.x, padTop);
      ctx.lineTo(mousePos.x, cssHeight - padBottom);
      ctx.moveTo(padLeft, mousePos.y);
      ctx.lineTo(cssWidth - padRight, mousePos.y);
      ctx.stroke();
      ctx.setLineDash([]);

      const tipText = `${formatFreq(hoverFreq)} | ${hoverDb.toFixed(1)} dBFS`;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      const tW = ctx.measureText(tipText).width + 16;
      ctx.fillRect(mousePos.x + 8, mousePos.y - 25, tW, 22);
      ctx.strokeRect(mousePos.x + 8, mousePos.y - 25, tW, 22);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(tipText, mousePos.x + 16, mousePos.y - 10);
    }

    ctx.restore();
  }, [frequencies, psd, metrics, showMaxHold, mousePos, dimensions]);

  return (
    <div className="bg-[#0d1527] border border-[#1e305b] rounded-lg overflow-hidden flex flex-col h-full shadow-lg">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#1e305b] bg-[#090f1d]">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-rf-accent shadow-[0_0_8px_#00f0ff]" />
          <span className="text-xs font-bold tracking-wider text-slate-100">
            RF SPECTRUM ANALYZER (FFT)
          </span>
          {metrics && (
            <span className="text-[10px] bg-rf-600/40 text-rf-accent px-2 py-0.5 rounded font-mono font-bold border border-rf-accent/30">
              {metrics.modulation_hint || 'Auto'}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowMaxHold(!showMaxHold)}
            className={`text-[11px] px-2.5 py-1 rounded border font-mono transition-colors flex items-center space-x-1 ${
              showMaxHold
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Max Hold</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              title="Close View"
              className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1e305b] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative min-h-[260px] w-full p-1 bg-[#070b14]">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%' }}
          className="block cursor-crosshair"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setMousePos({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
            });
          }}
          onMouseLeave={() => setMousePos(null)}
        />
      </div>
    </div>
  );
}
