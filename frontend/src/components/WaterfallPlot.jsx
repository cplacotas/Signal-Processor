import React, { useRef, useEffect, useState } from 'react';
import { Waves, X } from 'lucide-react';

function getColormapColor(val, palette = 'turbo') {
  const t = Math.max(0, Math.min(1, val));

  if (palette === 'viridis') {
    const r = Math.round(255 * (0.28 + 0.72 * Math.sin(t * Math.PI - 0.5)));
    const g = Math.round(255 * (0.01 + 0.99 * t));
    const b = Math.round(255 * (0.33 + 0.67 * Math.cos(t * Math.PI * 0.5)));
    return [r, g, b];
  } else if (palette === 'inferno') {
    const r = Math.round(255 * Math.min(1, t * 1.5));
    const g = Math.round(255 * Math.pow(t, 2));
    const b = Math.round(255 * (1 - Math.cos(t * Math.PI * 0.5)));
    return [r, g, b];
  } else {
    // Turbo SDR spectrum palette
    if (t < 0.25) {
      const f = t / 0.25;
      return [Math.round(15 + 20 * f), Math.round(25 + 180 * f), Math.round(80 + 175 * f)];
    } else if (t < 0.5) {
      const f = (t - 0.25) / 0.25;
      return [35, Math.round(205 + 50 * f), Math.round(255 * (1 - f))];
    } else if (t < 0.75) {
      const f = (t - 0.5) / 0.25;
      return [Math.round(35 + 220 * f), 255, 0];
    } else {
      const f = (t - 0.75) / 0.25;
      return [255, Math.round(255 * (1 - f)), Math.round(50 * f)];
    }
  }
}

export default function WaterfallPlot({ psd, frequencies, onClose }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const bufferCanvasRef = useRef(null);
  const [palette, setPalette] = useState('turbo');
  const [minDb, setMinDb] = useState(-100);
  const [maxDb, setMaxDb] = useState(-20);
  const [dimensions, setDimensions] = useState({ width: 800, height: 260 });

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

  // Update internal buffer canvas on dimension change
  useEffect(() => {
    const w = Math.max(100, dimensions.width);
    const h = Math.max(100, dimensions.height);

    if (!bufferCanvasRef.current) {
      bufferCanvasRef.current = document.createElement('canvas');
    }
    const bCanvas = bufferCanvasRef.current;
    if (bCanvas.width !== w || bCanvas.height !== h) {
      // Create new buffer preserving old content if possible
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = bCanvas.width;
      tempCanvas.height = bCanvas.height;
      const tCtx = tempCanvas.getContext('2d');
      if (bCanvas.width > 0) tCtx.drawImage(bCanvas, 0, 0);

      bCanvas.width = w;
      bCanvas.height = h;
      const bCtx = bCanvas.getContext('2d');
      bCtx.fillStyle = '#070b14';
      bCtx.fillRect(0, 0, w, h);
      if (tempCanvas.width > 0) {
        bCtx.drawImage(tempCanvas, 0, 0, w, h);
      }
    }
  }, [dimensions]);

  // Update waterfall on each new PSD frame
  useEffect(() => {
    if (!psd || psd.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const bCanvas = bufferCanvasRef.current;
    if (!bCanvas) return;
    const bCtx = bCanvas.getContext('2d');

    const dpr = window.devicePixelRatio || 1;
    const w = dimensions.width;
    const h = dimensions.height;

    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }

    // Shift existing buffer down by 2 pixels
    const shiftY = 2;
    bCtx.drawImage(bCanvas, 0, 0, w, h - shiftY, 0, shiftY, w, h - shiftY);

    // Draw the new line at y = 0
    const imgData = bCtx.createImageData(w, shiftY);
    const numBins = psd.length;

    for (let x = 0; x < w; x++) {
      const binIdx = Math.min(numBins - 1, Math.floor((x / w) * numBins));
      const valDb = psd[binIdx];
      const norm = Math.max(0, Math.min(1, (valDb - minDb) / (maxDb - minDb || 1)));
      const [r, g, b] = getColormapColor(norm, palette);

      for (let y = 0; y < shiftY; y++) {
        const pixelIdx = (y * w + x) * 4;
        imgData.data[pixelIdx + 0] = r;
        imgData.data[pixelIdx + 1] = g;
        imgData.data[pixelIdx + 2] = b;
        imgData.data[pixelIdx + 3] = 255;
      }
    }

    bCtx.putImageData(imgData, 0, 0);

    // Render scaled to high-DPI display canvas
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.drawImage(bCanvas, 0, 0);

    // Overlay crisp time grid & frequency span ticks
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    for (let y = 50; y < h; y += 50) {
      const gridY = Math.floor(y) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, gridY);
      ctx.lineTo(w, gridY);
      ctx.stroke();
    }

    ctx.restore();
  }, [psd, minDb, maxDb, palette, dimensions]);

  return (
    <div className="bg-[#0d1527] border border-[#1e305b] rounded-lg overflow-hidden flex flex-col h-full shadow-lg">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#1e305b] bg-[#090f1d]">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-rf-neon shadow-[0_0_8px_#00ff88]" />
          <span className="text-xs font-bold tracking-wider text-slate-100">
            WATERFALL / SPECTROGRAM (TIME vs FREQ)
          </span>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-1.5 text-slate-300">
            <span className="text-[11px] font-mono">Palette:</span>
            <select
              value={palette}
              onChange={(e) => setPalette(e.target.value)}
              className="bg-[#14203d] text-slate-100 text-[11px] font-mono font-medium rounded px-2 py-0.5 border border-[#1e305b] outline-none"
            >
              <option value="turbo">Turbo SDR</option>
              <option value="viridis">Viridis</option>
              <option value="inferno">Inferno</option>
            </select>
          </div>

          <div className="flex items-center space-x-2 text-slate-300 text-[11px] font-mono">
            <span>Min: {minDb}dB</span>
            <input
              type="range"
              min="-130"
              max="-50"
              value={minDb}
              onChange={(e) => setMinDb(Number(e.target.value))}
              className="w-14 accent-rf-neon cursor-pointer h-1.5"
            />
            <span>Max: {maxDb}dB</span>
            <input
              type="range"
              min="-60"
              max="0"
              value={maxDb}
              onChange={(e) => setMaxDb(Number(e.target.value))}
              className="w-14 accent-rf-accent cursor-pointer h-1.5"
            />
          </div>

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

      <div ref={containerRef} className="flex-1 relative min-h-[220px] w-full p-1 bg-[#070b14]">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%' }}
          className="block"
        />
        <div className="absolute bottom-2 left-3 text-[11px] text-slate-300 font-mono font-semibold bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800 pointer-events-none">
          ▼ Scrolling Time History (Latest on Top)
        </div>
      </div>
    </div>
  );
}
