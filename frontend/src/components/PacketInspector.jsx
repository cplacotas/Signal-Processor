import React from 'react';
import { Binary, ListFilter, CheckCircle2, AlertTriangle, X } from 'lucide-react';

export default function PacketInspector({ packetInspector, burstHistory, onClose }) {
  const p = packetInspector || {};
  const trailer = p.trailer || {};
  const bursts = burstHistory || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 h-full">
      {/* VITA 49 Protocol Frame Decoder */}
      <div className="bg-[#0d1527] border border-[#1e305b] rounded-lg overflow-hidden shadow-lg flex flex-col">
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#1e305b] bg-[#090f1d]">
          <div className="flex items-center space-x-2">
            <Binary className="w-4 h-4 text-rf-accent" />
            <span className="text-xs font-bold tracking-wider text-slate-100">
              VITA 49 PROTOCOL INSPECTOR
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] bg-rf-accent/20 text-rf-accent border border-rf-accent/40 px-2 py-0.5 rounded font-mono font-bold">
              {p.packet_type || 'Awaiting packets...'}
            </span>
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

        <div className="p-3 text-xs space-y-2.5 flex-1 font-mono">
          <div className="grid grid-cols-2 gap-2 text-slate-200">
            <div className="bg-[#070b14] p-2.5 rounded border border-[#14203d]">
              <span className="text-slate-400 block text-[10px] font-bold">PACKET TYPE & SIZE:</span>
              <span className="text-slate-100 font-bold text-sm">{p.packet_type || '--'}</span>
              <span className="text-slate-300 block text-[11px] mt-0.5">
                {p.packet_size_words ? `${p.packet_size_words} words (${p.packet_bytes} B)` : '--'}
              </span>
            </div>

            <div className="bg-[#070b14] p-2.5 rounded border border-[#14203d]">
              <span className="text-slate-400 block text-[10px] font-bold">STREAM ID & SEQ COUNT:</span>
              <span className="text-rf-neon font-bold text-sm">{p.stream_id || '--'}</span>
              <span className="text-slate-300 block text-[11px] mt-0.5">
                Seq #{p.packet_count != null ? p.packet_count : '--'} (mod-16)
              </span>
            </div>

            <div className="bg-[#070b14] p-2.5 rounded border border-[#14203d]">
              <span className="text-slate-400 block text-[10px] font-bold">TSI (INTEGER TIMESTAMP):</span>
              <span className="text-slate-100 font-bold">{p.tsi || 'NONE'}</span>
              <span className="text-slate-300 block text-[11px] mt-0.5">
                Sec: {p.integer_timestamp != null ? p.integer_timestamp : '--'}
              </span>
            </div>

            <div className="bg-[#070b14] p-2.5 rounded border border-[#14203d]">
              <span className="text-slate-400 block text-[10px] font-bold">TSF (FRACTIONAL TIMESTAMP):</span>
              <span className="text-slate-100 font-bold">{p.tsf || 'NONE'}</span>
              <span className="text-slate-300 block text-[11px] mt-0.5 truncate">
                Frac: {p.fractional_timestamp != null ? p.fractional_timestamp : '--'}
              </span>
            </div>
          </div>

          {/* Trailer Status Flags */}
          {p.has_trailer && (
            <div className="bg-[#070b14] p-2.5 rounded border border-[#14203d]">
              <span className="text-slate-400 block text-[10px] font-bold mb-1.5">TRAILER STATUS BITS:</span>
              <div className="grid grid-cols-3 gap-1.5 text-[11px] font-semibold">
                <div className={`flex items-center space-x-1 ${trailer.valid_data ? 'text-rf-neon' : 'text-slate-500'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Valid Data</span>
                </div>
                <div className={`flex items-center space-x-1 ${trailer.calibrated_time ? 'text-rf-neon' : 'text-slate-500'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Calibrated</span>
                </div>
                <div className={`flex items-center space-x-1 ${trailer.reference_lock ? 'text-rf-neon' : 'text-slate-500'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Ref Lock</span>
                </div>
                <div className={`flex items-center space-x-1 ${trailer.detected_signal ? 'text-rf-accent' : 'text-slate-500'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Signal Det</span>
                </div>
                <div className={`flex items-center space-x-1 ${trailer.over_range ? 'text-rf-crimson font-bold' : 'text-slate-500'}`}>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Over-range</span>
                </div>
                <div className={`flex items-center space-x-1 ${trailer.sample_loss ? 'text-rf-crimson font-bold' : 'text-slate-500'}`}>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Sample Loss</span>
                </div>
              </div>
            </div>
          )}

          {/* Raw Hex dump */}
          {p.hex_preview && (
            <div className="bg-[#05080f] p-2.5 rounded border border-[#14203d] overflow-x-auto">
              <span className="text-slate-400 block text-[10px] font-bold mb-1">RAW PACKET HEADER BYTES (HEX):</span>
              <div className="text-[12px] text-rf-accent font-bold break-all select-all tracking-wider">
                {p.hex_preview.match(/.{1,8}/g)?.join(' ') || p.hex_preview}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detected Signal Bursts Log */}
      <div className="bg-[#0d1527] border border-[#1e305b] rounded-lg overflow-hidden shadow-lg flex flex-col">
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#1e305b] bg-[#090f1d]">
          <div className="flex items-center space-x-2">
            <ListFilter className="w-4 h-4 text-rf-amber" />
            <span className="text-xs font-bold tracking-wider text-slate-100">
              DETECTED SIGNAL BURSTS & EVENTS HISTORY
            </span>
          </div>
          <span className="text-[11px] text-slate-300 font-mono font-bold bg-[#14203d] px-2 py-0.5 rounded border border-[#1e305b]">
            Events: {bursts.length}
          </span>
        </div>

        <div className="p-2 flex-1 overflow-y-auto max-h-[260px]">
          {bursts.length === 0 ? (
            <div className="text-center text-slate-400 text-xs py-10 font-mono">
              Listening for RF pulses and signal bursts...
            </div>
          ) : (
            <table className="w-full text-left text-[11px] font-mono text-slate-200">
              <thead className="text-[10px] text-slate-400 font-bold border-b border-[#1e305b]">
                <tr>
                  <th className="pb-1.5 px-2">#</th>
                  <th className="pb-1.5 px-2">Duration</th>
                  <th className="pb-1.5 px-2">Center Freq</th>
                  <th className="pb-1.5 px-2">OBW (99%)</th>
                  <th className="pb-1.5 px-2">Peak Power</th>
                  <th className="pb-1.5 px-2">SNR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e305b]/60">
                {bursts.slice().reverse().map((b, idx) => (
                  <tr key={idx} className="hover:bg-[#14203d]/60 transition-colors">
                    <td className="py-1 px-2 text-slate-400 font-semibold">#{b.id}</td>
                    <td className="py-1 px-2 text-rf-neon font-bold">{b.duration_ms.toFixed(1)} ms</td>
                    <td className="py-1 px-2 font-semibold">{b.center_freq_mhz.toFixed(3)} MHz</td>
                    <td className="py-1 px-2 text-slate-300">{b.bandwidth_khz.toFixed(1)} kHz</td>
                    <td className="py-1 px-2 text-sky-300 font-semibold">{b.peak_power_dbfs.toFixed(1)} dBFS</td>
                    <td className="py-1 px-2 text-rf-amber font-bold">{b.snr_db.toFixed(1)} dB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
