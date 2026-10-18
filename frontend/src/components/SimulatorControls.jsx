import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Square, 
  Send, 
  Settings2, 
  Sparkles, 
  Radio, 
  Activity, 
  SlidersHorizontal,
  CheckCircle,
  TrendingUp,
  X
} from 'lucide-react';

const PRESETS = [
  {
    name: 'Radar FMCW Chirp',
    signal_type: 'chirp',
    rf_center_freq: 100_000_000,
    freq_offset: 0,
    bandwidth: 2_000_000,
    sample_rate: 10_000_000,
    amplitude_dbfs: -6,
    snr_db: 30,
    is_pulsed: false,
  },
  {
    name: 'CW Carrier Tone',
    signal_type: 'cw',
    rf_center_freq: 100_000_000,
    freq_offset: 1_250_000,
    bandwidth: 50_000,
    sample_rate: 10_000_000,
    amplitude_dbfs: -4,
    snr_db: 35,
    is_pulsed: false,
  },
  {
    name: 'Pulsed Radar Burst',
    signal_type: 'chirp',
    rf_center_freq: 433_000_000,
    freq_offset: 500_000,
    bandwidth: 3_000_000,
    sample_rate: 10_000_000,
    amplitude_dbfs: -3,
    snr_db: 25,
    is_pulsed: true,
    pulse_width_ms: 1200,
    pulse_pri_ms: 4000,
  },
  {
    name: 'QPSK Modulation',
    signal_type: 'qpsk',
    rf_center_freq: 915_000_000,
    freq_offset: 0,
    bandwidth: 1_500_000,
    sample_rate: 10_000_000,
    amplitude_dbfs: -6,
    snr_db: 28,
    is_pulsed: false,
  },
  {
    name: 'BPSK Modulation',
    signal_type: 'bpsk',
    rf_center_freq: 100_000_000,
    freq_offset: -500_000,
    bandwidth: 1_000_000,
    sample_rate: 10_000_000,
    amplitude_dbfs: -6,
    snr_db: 24,
    is_pulsed: false,
  },
  {
    name: 'Dual-Tone RF',
    signal_type: 'dual_tone',
    rf_center_freq: 100_000_000,
    freq_offset: 0,
    bandwidth: 2_000_000,
    sample_rate: 10_000_000,
    amplitude_dbfs: -6,
    snr_db: 30,
    is_pulsed: false,
  },
];

export default function SimulatorControls({ simulatorStats, onUpdateConfig, onStart, onStop, onSingleBurst, onClose }) {
  const currentConfig = simulatorStats?.config || {};
  const isRunning = Boolean(simulatorStats?.is_running);

  const [form, setForm] = useState({
    signal_type: 'chirp',
    rf_center_freq_mhz: 100.0,
    freq_offset_khz: 500.0,
    bandwidth_mhz: 2.0,
    sample_rate_mhz: 10.0,
    amplitude_dbfs: -6.0,
    snr_db: 25.0,
    is_pulsed: false,
    pulse_width_ms: 20.0,
    pulse_pri_ms: 80.0,
  });

  const [lastSavedNotice, setLastSavedNotice] = useState(false);

  // Sync state when simulatorStats updates from backend
  useEffect(() => {
    if (currentConfig.signal_type) {
      setForm((prev) => ({
        ...prev,
        signal_type: currentConfig.signal_type || prev.signal_type,
        rf_center_freq_mhz: (currentConfig.rf_center_freq || 100_000_000) / 1e6,
        freq_offset_khz: (currentConfig.freq_offset || 0) / 1e3,
        bandwidth_mhz: (currentConfig.bandwidth || 2_000_000) / 1e6,
        sample_rate_mhz: (currentConfig.sample_rate || 10_000_000) / 1e6,
        amplitude_dbfs: currentConfig.amplitude_dbfs ?? -6.0,
        snr_db: currentConfig.snr_db ?? 25.0,
        is_pulsed: Boolean(currentConfig.is_pulsed),
        pulse_width_ms: currentConfig.pulse_width_ms ?? 20.0,
        pulse_pri_ms: currentConfig.pulse_pri_ms ?? 80.0,
      }));
    }
  }, [currentConfig.signal_type, currentConfig.rf_center_freq]);

  const handleChange = (key, value) => {
    const updated = { ...form, [key]: value };
    setForm(updated);

    // Send update immediately
    const apiPayload = {
      signal_type: updated.signal_type,
      rf_center_freq: updated.rf_center_freq_mhz * 1e6,
      freq_offset: updated.freq_offset_khz * 1e3,
      bandwidth: updated.bandwidth_mhz * 1e6,
      sample_rate: updated.sample_rate_mhz * 1e6,
      amplitude_dbfs: updated.amplitude_dbfs,
      snr_db: updated.snr_db,
      is_pulsed: updated.is_pulsed,
      pulse_width_ms: updated.pulse_width_ms,
      pulse_pri_ms: updated.pulse_pri_ms,
    };

    onUpdateConfig(apiPayload);
    setLastSavedNotice(true);
    setTimeout(() => setLastSavedNotice(false), 800);
  };

  const applyPreset = (preset) => {
    const newForm = {
      signal_type: preset.signal_type,
      rf_center_freq_mhz: preset.rf_center_freq / 1e6,
      freq_offset_khz: preset.freq_offset / 1e3,
      bandwidth_mhz: preset.bandwidth / 1e6,
      sample_rate_mhz: preset.sample_rate / 1e6,
      amplitude_dbfs: preset.amplitude_dbfs,
      snr_db: preset.snr_db,
      is_pulsed: preset.is_pulsed,
      pulse_width_ms: preset.pulse_width_ms || 20,
      pulse_pri_ms: preset.pulse_pri_ms || 80,
    };
    setForm(newForm);
    onUpdateConfig({
      ...preset,
    });
    setLastSavedNotice(true);
    setTimeout(() => setLastSavedNotice(false), 1200);
  };

  return (
    <div className="bg-[#0d1527] border border-[#1e305b] rounded-lg overflow-hidden shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 border-b border-[#1e305b] bg-[#090f1d] gap-2">
        <div className="flex items-center space-x-2">
          <Settings2 className="w-4 h-4 text-rf-neon" />
          <span className="text-xs font-bold tracking-wider text-slate-100">
            VITA 49 SIGNAL SIMULATOR & GENERATOR
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold flex items-center space-x-1 ${
            isRunning 
              ? 'bg-rf-neon/20 text-rf-neon border border-rf-neon/40 shadow-[0_0_8px_rgba(0,255,136,0.3)]' 
              : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1 ${isRunning ? 'bg-rf-neon animate-ping' : 'bg-slate-500'}`} />
            {isRunning ? 'TRANSMITTING UDP:4991' : 'STOPPED'}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          {isRunning ? (
            <button
              onClick={onStop}
              className="bg-rf-crimson/20 hover:bg-rf-crimson/30 text-rf-crimson border border-rf-crimson/50 text-xs px-3 py-1 rounded font-medium flex items-center space-x-1.5 transition-all"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop Stream</span>
            </button>
          ) : (
            <button
              onClick={onStart}
              className="bg-rf-neon/20 hover:bg-rf-neon/30 text-rf-neon border border-rf-neon/50 text-xs px-3 py-1 rounded font-medium flex items-center space-x-1.5 transition-all shadow-[0_0_10px_rgba(0,255,136,0.2)]"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Generator</span>
            </button>
          )}

          <button
            onClick={onSingleBurst}
            className="bg-rf-accent/20 hover:bg-rf-accent/30 text-rf-accent border border-rf-accent/50 text-xs px-3 py-1 rounded font-medium flex items-center space-x-1.5 transition-all"
          >
            <Send className="w-3 h-3" />
            <span>Send 1 Burst</span>
          </button>

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

      <div className="p-4 space-y-4">
        {/* Presets Bar */}
        <div>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="flex items-center space-x-1 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-rf-amber" />
              <span>Signal Presets (One-click Testing):</span>
            </span>
            {lastSavedNotice && (
              <span className="text-rf-neon text-[11px] font-mono flex items-center space-x-1 animate-pulse">
                <CheckCircle className="w-3 h-3" />
                <span>Transmitted to App</span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p, idx) => (
              <button
                key={idx}
                onClick={() => applyPreset(p)}
                className="bg-[#14203d] hover:bg-[#1e305b] text-slate-200 hover:text-rf-accent text-[11px] px-2.5 py-1 rounded border border-[#1e305b] transition-all font-mono"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders & Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#070b14] p-3 rounded-lg border border-[#14203d]">
          {/* Signal Type */}
          <div>
            <label className="text-[11px] text-slate-400 block font-medium mb-1">
              Modulation / Signal Type
            </label>
            <select
              value={form.signal_type}
              onChange={(e) => handleChange('signal_type', e.target.value)}
              className="w-full bg-[#0d1527] border border-[#1e305b] rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:border-rf-accent outline-none"
            >
              <option value="chirp">Linear FMCW Chirp</option>
              <option value="cw">Single Carrier (CW Tone)</option>
              <option value="dual_tone">Dual-Tone Carrier</option>
              <option value="bpsk">BPSK Digital</option>
              <option value="qpsk">QPSK Digital</option>
              <option value="noise">Gaussian Noise (AWGN)</option>
            </select>
          </div>

          {/* RF Center Frequency */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>Carrier Freq (fc)</span>
              <span className="font-mono text-rf-accent">{form.rf_center_freq_mhz} MHz</span>
            </div>
            <input
              type="range"
              min="10"
              max="2400"
              step="5"
              value={form.rf_center_freq_mhz}
              onChange={(e) => handleChange('rf_center_freq_mhz', Number(e.target.value))}
              className="w-full accent-rf-accent cursor-pointer h-1.5"
            />
          </div>

          {/* Baseband Offset */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>Freq Offset (Baseband)</span>
              <span className="font-mono text-rf-accent">{form.freq_offset_khz} kHz</span>
            </div>
            <input
              type="range"
              min="-4000"
              max="4000"
              step="50"
              value={form.freq_offset_khz}
              onChange={(e) => handleChange('freq_offset_khz', Number(e.target.value))}
              className="w-full accent-rf-accent cursor-pointer h-1.5"
            />
          </div>

          {/* Bandwidth */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>Modulation Bandwidth</span>
              <span className="font-mono text-rf-neon">{form.bandwidth_mhz} MHz</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="8.0"
              step="0.1"
              value={form.bandwidth_mhz}
              onChange={(e) => handleChange('bandwidth_mhz', Number(e.target.value))}
              className="w-full accent-rf-neon cursor-pointer h-1.5"
            />
          </div>

          {/* Amplitude dBFS */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>Signal Amplitude</span>
              <span className="font-mono text-sky-400">{form.amplitude_dbfs} dBFS</span>
            </div>
            <input
              type="range"
              min="-40"
              max="0"
              step="1"
              value={form.amplitude_dbfs}
              onChange={(e) => handleChange('amplitude_dbfs', Number(e.target.value))}
              className="w-full accent-sky-400 cursor-pointer h-1.5"
            />
          </div>

          {/* SNR dB */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>Signal to Noise (SNR)</span>
              <span className="font-mono text-rf-amber">{form.snr_db} dB</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={form.snr_db}
              onChange={(e) => handleChange('snr_db', Number(e.target.value))}
              className="w-full accent-rf-amber cursor-pointer h-1.5"
            />
          </div>

          {/* Sample Rate */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>Sample Rate (Fs)</span>
              <span className="font-mono text-blue-400">{form.sample_rate_mhz} Msps</span>
            </div>
            <input
              type="range"
              min="2"
              max="20"
              step="1"
              value={form.sample_rate_mhz}
              onChange={(e) => handleChange('sample_rate_mhz', Number(e.target.value))}
              className="w-full accent-blue-400 cursor-pointer h-1.5"
            />
          </div>

          {/* Pulsed / Burst Gating */}
          <div className="flex flex-col justify-center">
            <label className="flex items-center space-x-2 cursor-pointer text-xs text-slate-200">
              <input
                type="checkbox"
                checked={form.is_pulsed}
                onChange={(e) => handleChange('is_pulsed', e.target.checked)}
                className="w-4 h-4 accent-rf-neon rounded"
              />
              <span className="font-medium">Enable Pulsed / Burst Mode</span>
            </label>
            {form.is_pulsed && (
              <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-mono mt-1.5">
                <span>PW: {form.pulse_width_ms}ms</span>
                <span>/</span>
                <span>PRI: {form.pulse_pri_ms}ms</span>
              </div>
            )}
          </div>
        </div>

        {/* Live Simulator Telemetry Strip */}
        <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400 bg-[#090f1d] px-3 py-1.5 rounded border border-[#14203d]">
          <div className="flex items-center space-x-4">
            <span>Packets Sent: <strong className="text-slate-200">{simulatorStats?.packets_sent || 0}</strong></span>
            <span>Bytes Transmitted: <strong className="text-slate-200">{((simulatorStats?.bytes_sent || 0) / 1024 / 1024).toFixed(2)} MB</strong></span>
            <span>Target: <strong className="text-rf-accent">127.0.0.1:4991 (UDP)</strong></span>
          </div>
          <div className="text-rf-neon flex items-center space-x-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>VITA 49 Standard Compliant (IF Data + CIF0 Context)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
