import React from 'react';
import { 
  Radio, 
  Activity, 
  Clock, 
  Wifi, 
  ShieldAlert, 
  Gauge, 
  Layers, 
  Zap,
  Cpu
} from 'lucide-react';

function formatFreq(hz) {
  if (!hz || isNaN(hz)) return '0.000 MHz';
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(4)} GHz`;
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(4)} MHz`;
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(2)} kHz`;
  return `${hz.toFixed(1)} Hz`;
}

function formatDuration(sec) {
  if (sec == null || isNaN(sec) || sec <= 0) return '0.00 ms';
  if (sec >= 1.0) return `${sec.toFixed(3)} s`;
  if (sec >= 1e-3) return `${(sec * 1e3).toFixed(2)} ms`;
  return `${(sec * 1e6).toFixed(1)} µs`;
}

function formatTimestamp(unixSec) {
  if (!unixSec || unixSec <= 0) return '--:--:--.---';
  const d = new Date(unixSec * 1000);
  return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export default function SignalHUD({ metrics, udpStats, isConnected }) {
  const m = metrics || {};
  const isBurst = Boolean(m.is_burst_active);
  const snr = m.snr_db || 0;
  const snrPercent = Math.min(100, Math.max(0, (snr / 40) * 100));

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
      {/* 1. Peak Frequency */}
      <div className="bg-[#0d1527] border border-[#1e305b] rounded-lg p-3 hover:border-rf-accent/40 transition-colors shadow-sm">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium tracking-wide">PEAK FREQ</span>
          <Radio className="w-3.5 h-3.5 text-rf-accent" />
        </div>
        <div className="text-lg font-mono font-bold text-rf-accent tracking-tight truncate">
          {formatFreq(m.peak_freq)}
        </div>
        <div className="text-[10px] text-slate-400 font-mono mt-1">
          RF Center: {formatFreq(m.rf_center_freq)}
        </div>
      </div>

      {/* 2. Bandwidth (OBW & 3dB) */}
      <div className="bg-[#0d1527] border border-[#1e305b] rounded-lg p-3 hover:border-rf-neon/40 transition-colors shadow-sm">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium tracking-wide">BANDWIDTH (99%)</span>
          <Activity className="w-3.5 h-3.5 text-rf-neon" />
        </div>
        <div className="text-lg font-mono font-bold text-rf-neon tracking-tight truncate">
          {formatFreq(m.occupied_bandwidth_99)}
        </div>
        <div className="text-[10px] text-slate-400 font-mono mt-1">
          -3dB: {formatFreq(m.bandwidth_3db)}
        </div>
      </div>

      {/* 3. Signal to Noise Ratio */}
      <div className="bg-[#0d1527] border border-[#1e305b] rounded-lg p-3 hover:border-rf-amber/40 transition-colors shadow-sm">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium tracking-wide">SNR / NOISE</span>
          <Gauge className="w-3.5 h-3.5 text-rf-amber" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-lg font-mono font-bold text-rf-amber">
            {snr.toFixed(1)}
          </span>
          <span className="text-xs text-slate-400 font-mono">dB</span>
        </div>
        {/* SNR mini bar */}
        <div className="w-full bg-[#14203d] h-1.5 rounded-full mt-1.5 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-rf-amber to-rf-neon rounded-full transition-all duration-300"
            style={{ width: `${snrPercent}%` }}
          />
        </div>
      </div>

      {/* 4. Peak & RMS Power */}
      <div className="bg-[#0d1527] border border-[#1e305b] rounded-lg p-3 hover:border-rf-accent/40 transition-colors shadow-sm">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium tracking-wide">PEAK POWER</span>
          <Zap className="w-3.5 h-3.5 text-sky-400" />
        </div>
        <div className="text-lg font-mono font-bold text-sky-300 tracking-tight">
          {m.peak_power_dbfs != null ? `${m.peak_power_dbfs.toFixed(1)} dBFS` : '-- dBFS'}
        </div>
        <div className="text-[10px] text-slate-400 font-mono mt-1">
          Floor: {m.noise_floor_dbfs != null ? `${m.noise_floor_dbfs.toFixed(1)} dBFS` : '--'}
        </div>
      </div>

      {/* 5. Burst Timing (Start / Stop / Duration) */}
      <div className="bg-[#0d1527] border border-[#1e305b] rounded-lg p-3 hover:border-emerald-400/40 transition-colors shadow-sm">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium tracking-wide">BURST TIMING</span>
          <Clock className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="flex items-center space-x-2">
          <span className={`inline-block w-2 h-2 rounded-full ${isBurst ? 'bg-rf-neon animate-pulse shadow-[0_0_8px_#00ff88]' : 'bg-slate-600'}`} />
          <span className="text-sm font-mono font-bold text-slate-100">
            {formatDuration(m.duration_seconds)}
          </span>
        </div>
        <div className="text-[10px] text-slate-400 font-mono mt-1 truncate">
          Start: {formatTimestamp(m.start_time)}
        </div>
      </div>

      {/* 6. Modulation Type */}
      <div className="bg-[#0d1527] border border-[#1e305b] rounded-lg p-3 hover:border-purple-400/40 transition-colors shadow-sm">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium tracking-wide">MODULATION</span>
          <Layers className="w-3.5 h-3.5 text-purple-400" />
        </div>
        <div className="text-sm font-mono font-bold text-purple-300 truncate pt-0.5">
          {m.modulation_hint || 'Detecting...'}
        </div>
        <div className="text-[10px] text-slate-400 font-mono mt-1.5">
          PAPR: {m.papr_db != null ? `${m.papr_db.toFixed(1)} dB` : '--'}
        </div>
      </div>

      {/* 7. VITA-49 Stream Info */}
      <div className="bg-[#0d1527] border border-[#1e305b] rounded-lg p-3 hover:border-blue-400/40 transition-colors shadow-sm">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium tracking-wide">STREAM / RATE</span>
          <Cpu className="w-3.5 h-3.5 text-blue-400" />
        </div>
        <div className="text-sm font-mono font-bold text-blue-300">
          ID: 0x{(m.stream_id || 0x1001).toString(16).toUpperCase()}
        </div>
        <div className="text-[10px] text-slate-400 font-mono mt-1">
          Fs: {formatFreq(m.sample_rate)}
        </div>
      </div>

      {/* 8. Network UDP Ingest & Connection */}
      <div className="bg-[#0d1527] border border-[#1e305b] rounded-lg p-3 hover:border-rf-accent/40 transition-colors shadow-sm">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium tracking-wide">UDP INGEST</span>
          <Wifi className={`w-3.5 h-3.5 ${isConnected ? 'text-rf-neon' : 'text-rf-crimson'}`} />
        </div>
        <div className="text-sm font-mono font-bold text-slate-200">
          Port: 4991
        </div>
        <div className="text-[10px] text-slate-400 font-mono mt-1 truncate">
          Pkts: {udpStats?.packets_received || m.packet_count || 0}
        </div>
      </div>
    </div>
  );
}
