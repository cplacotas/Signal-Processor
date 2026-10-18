import React, { useState } from 'react';
import { 
  Radio, 
  Download, 
  FileText, 
  FileSpreadsheet, 
  FileCode, 
  Trash2, 
  X, 
  Search, 
  Info, 
  Clock, 
  Zap, 
  Layers, 
  CheckCircle,
  Activity
} from 'lucide-react';

export default function SignalsTable({ signals, onClear, onClose }) {
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, ACTIVE, COMPLETED

  const list = signals || [];

  // Filter signals
  const filtered = list.filter((s) => {
    if (statusFilter !== 'ALL' && s.state !== statusFilter) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      s.id.toLowerCase().includes(term) ||
      (s.modulation && s.modulation.toLowerCase().includes(term)) ||
      String(s.center_freq_mhz).includes(term) ||
      String(s.stream_id).toLowerCase().includes(term)
    );
  });

  const activeCount = list.filter((s) => s.state === 'ACTIVE').length;

  const downloadFile = (format) => {
    window.open(`http://localhost:8000/api/signals/export?format=${format}`, '_blank');
  };

  return (
    <div className="bg-[#0d1527] border border-[#1e305b] rounded-lg overflow-hidden shadow-xl flex flex-col h-full font-sans">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 border-b border-[#1e305b] bg-[#090f1d] gap-2">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-rf-accent shadow-[0_0_8px_#00f0ff]" />
          <span className="text-xs font-bold tracking-wider text-slate-100">
            RECEIVED SIGNALS LOG (METADATA & ATTRIBUTES)
          </span>
          <span className="text-[11px] font-mono font-bold bg-[#14203d] text-rf-accent px-2 py-0.5 rounded border border-[#1e305b]">
            Total: {list.length} {activeCount > 0 && `(${activeCount} Active)`}
          </span>
        </div>

        {/* Action Controls & Export Buttons */}
        <div className="flex items-center space-x-2">
          {/* Export Buttons */}
          <div className="flex items-center bg-[#14203d] rounded-lg border border-[#1e305b] p-0.5 text-xs">
            <button
              onClick={() => downloadFile('json')}
              title="Export as JSON"
              className="hover:bg-[#1e305b] text-slate-200 hover:text-rf-accent px-2.5 py-1 rounded flex items-center space-x-1 font-mono text-[11px] transition-colors"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>JSON</span>
            </button>
            <span className="text-slate-600">|</span>
            <button
              onClick={() => downloadFile('csv')}
              title="Export as CSV"
              className="hover:bg-[#1e305b] text-slate-200 hover:text-rf-neon px-2.5 py-1 rounded flex items-center space-x-1 font-mono text-[11px] transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <span className="text-slate-600">|</span>
            <button
              onClick={() => downloadFile('report')}
              title="Export as Text / Markdown Intercept Report"
              className="hover:bg-[#1e305b] text-slate-200 hover:text-rf-amber px-2.5 py-1 rounded flex items-center space-x-1 font-mono text-[11px] transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Report</span>
            </button>
          </div>

          {/* Clear button */}
          <button
            onClick={onClear}
            title="Clear All Recorded Signals"
            className="p-1.5 rounded hover:bg-[#1e305b] text-slate-400 hover:text-rf-crimson transition-colors border border-transparent hover:border-[#1e305b]"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Close button */}
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

      {/* Filter and Search Bar */}
      <div className="px-4 py-2 border-b border-[#14203d] bg-[#070b14] flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-2 flex-1 max-w-sm bg-[#0d1527] px-2.5 py-1 rounded border border-[#1e305b]">
          <Search className="w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search by ID, freq, modulation..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-slate-200 placeholder-slate-500 text-xs outline-none w-full font-mono"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="text-slate-500 hover:text-slate-300">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-1 font-mono text-[11px]">
          {['ALL', 'ACTIVE', 'COMPLETED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-0.5 rounded border transition-colors ${
                statusFilter === st
                  ? 'bg-rf-accent/20 text-rf-accent border-rf-accent/40 font-bold'
                  : 'bg-[#0d1527] text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Signals Table */}
      <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[360px] p-2 bg-[#070b14]">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500 font-mono text-xs">
            {list.length === 0 ? (
              <>
                <Radio className="w-8 h-8 text-slate-600 mx-auto mb-2 animate-pulse" />
                <p>Waiting for signals to be received via VITA 49 UDP port 4991...</p>
                <p className="text-[10px] text-slate-600 mt-1">Signals will be logged here with their start/stop times and attributes.</p>
              </>
            ) : (
              <p>No signals matched your search query.</p>
            )}
          </div>
        ) : (
          <table className="w-full text-left text-xs font-mono text-slate-200 border-collapse">
            <thead className="text-[10px] text-slate-400 font-bold border-b border-[#1e305b] uppercase tracking-wider bg-[#090f1d] sticky top-0">
              <tr>
                <th className="py-2 px-3">Signal ID</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Center Freq</th>
                <th className="py-2 px-3">Bandwidth (99%)</th>
                <th className="py-2 px-3">Start Time (UTC)</th>
                <th className="py-2 px-3">Stop Time (UTC)</th>
                <th className="py-2 px-3">Duration</th>
                <th className="py-2 px-3">Peak Power</th>
                <th className="py-2 px-3">SNR</th>
                <th className="py-2 px-3">Modulation Type</th>
                <th className="py-2 px-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#14203d]">
              {filtered.slice().reverse().map((sig) => {
                const isActive = sig.state === 'ACTIVE';
                return (
                  <tr
                    key={sig.id}
                    onClick={() => setSelectedSignal(sig)}
                    className="hover:bg-[#14203d]/70 transition-colors cursor-pointer group"
                  >
                    {/* ID */}
                    <td className="py-2 px-3 font-bold text-rf-accent flex items-center space-x-1.5">
                      <span>{sig.id}</span>
                    </td>

                    {/* Status */}
                    <td className="py-2 px-3">
                      {isActive ? (
                        <span className="inline-flex items-center space-x-1.5 bg-rf-neon/15 text-rf-neon border border-rf-neon/40 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-[0_0_8px_rgba(0,255,136,0.25)]">
                          <span className="w-1.5 h-1.5 rounded-full bg-rf-neon animate-ping" />
                          <span>ACTIVE</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full text-[10px] border border-slate-700">
                          <CheckCircle className="w-2.5 h-2.5" />
                          <span>COMPLETED</span>
                        </span>
                      )}
                    </td>

                    {/* Center Freq */}
                    <td className="py-2 px-3 font-semibold text-slate-100">
                      {sig.center_freq_mhz.toFixed(4)} MHz
                    </td>

                    {/* Bandwidth */}
                    <td className="py-2 px-3 text-rf-neon font-semibold">
                      {sig.bandwidth_khz >= 1000
                        ? `${(sig.bandwidth_khz / 1000).toFixed(3)} MHz`
                        : `${sig.bandwidth_khz.toFixed(1)} kHz`}
                    </td>

                    {/* Start Time */}
                    <td className="py-2 px-3 text-slate-300">
                      {sig.start_time_str}
                    </td>

                    {/* Stop Time */}
                    <td className="py-2 px-3">
                      {isActive ? (
                        <span className="text-rf-neon font-bold animate-pulse">Receiving...</span>
                      ) : (
                        <span className="text-slate-300">{sig.stop_time_str}</span>
                      )}
                    </td>

                    {/* Duration */}
                    <td className="py-2 px-3 font-bold text-slate-100">
                      {sig.duration_seconds >= 1.0
                        ? `${sig.duration_seconds.toFixed(2)} s`
                        : `${sig.duration_ms.toFixed(0)} ms`}
                    </td>

                    {/* Peak Power */}
                    <td className="py-2 px-3 text-sky-300">
                      {sig.peak_power_dbfs.toFixed(1)} dBFS
                    </td>

                    {/* SNR */}
                    <td className="py-2 px-3 text-rf-amber font-bold">
                      {sig.snr_db.toFixed(1)} dB
                    </td>

                    {/* Modulation */}
                    <td className="py-2 px-3 text-purple-300">
                      <span className="bg-purple-950/40 border border-purple-500/30 px-2 py-0.5 rounded text-[10px]">
                        {sig.modulation}
                      </span>
                    </td>

                    {/* Details Action */}
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSignal(sig);
                        }}
                        className="text-slate-400 group-hover:text-rf-accent p-1 rounded hover:bg-[#1e305b]"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal / Detail Drawer for selected signal object */}
      {selectedSignal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0d1527] border border-[#1e305b] rounded-xl max-w-lg w-full p-4 shadow-2xl font-mono text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-[#1e305b] pb-2">
              <div className="flex items-center space-x-2">
                <Radio className="w-4 h-4 text-rf-accent" />
                <span className="font-bold text-sm text-slate-100">
                  Signal Attributes: {selectedSignal.id}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  selectedSignal.state === 'ACTIVE' 
                    ? 'bg-rf-neon/20 text-rf-neon border border-rf-neon/40' 
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {selectedSignal.state}
                </span>
              </div>
              <button
                onClick={() => setSelectedSignal(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#1e305b]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Attribute Key-Values */}
            <div className="grid grid-cols-2 gap-2 text-slate-300">
              <div className="bg-[#070b14] p-2 rounded border border-[#14203d]">
                <span className="text-slate-500 block text-[10px]">CENTER FREQUENCY:</span>
                <span className="text-slate-100 font-bold">{selectedSignal.center_freq_mhz} MHz</span>
              </div>
              <div className="bg-[#070b14] p-2 rounded border border-[#14203d]">
                <span className="text-slate-500 block text-[10px]">PEAK FREQUENCY:</span>
                <span className="text-rf-accent font-bold">{selectedSignal.peak_freq_mhz} MHz</span>
              </div>
              <div className="bg-[#070b14] p-2 rounded border border-[#14203d]">
                <span className="text-slate-500 block text-[10px]">OCCUPIED BW (99%):</span>
                <span className="text-rf-neon font-bold">{selectedSignal.bandwidth_khz} kHz</span>
              </div>
              <div className="bg-[#070b14] p-2 rounded border border-[#14203d]">
                <span className="text-slate-500 block text-[10px]">-3 dB BANDWIDTH:</span>
                <span className="text-slate-200 font-bold">{selectedSignal.bandwidth_3db_khz} kHz</span>
              </div>
              <div className="bg-[#070b14] p-2 rounded border border-[#14203d]">
                <span className="text-slate-500 block text-[10px]">START TIME:</span>
                <span className="text-slate-200">{selectedSignal.start_time_str} UTC</span>
              </div>
              <div className="bg-[#070b14] p-2 rounded border border-[#14203d]">
                <span className="text-slate-500 block text-[10px]">STOP TIME:</span>
                <span className="text-slate-200">{selectedSignal.stop_time_str}</span>
              </div>
              <div className="bg-[#070b14] p-2 rounded border border-[#14203d]">
                <span className="text-slate-500 block text-[10px]">TOTAL DURATION:</span>
                <span className="text-rf-amber font-bold">{selectedSignal.duration_seconds} s</span>
              </div>
              <div className="bg-[#070b14] p-2 rounded border border-[#14203d]">
                <span className="text-slate-500 block text-[10px]">SNR / PEAK POWER:</span>
                <span className="text-slate-100 font-bold">{selectedSignal.snr_db} dB / {selectedSignal.peak_power_dbfs} dBFS</span>
              </div>
              <div className="bg-[#070b14] p-2 rounded border border-[#14203d]">
                <span className="text-slate-500 block text-[10px]">MODULATION:</span>
                <span className="text-purple-300 font-bold">{selectedSignal.modulation}</span>
              </div>
              <div className="bg-[#070b14] p-2 rounded border border-[#14203d]">
                <span className="text-slate-500 block text-[10px]">VITA 49 STREAM ID:</span>
                <span className="text-blue-300 font-bold">{selectedSignal.stream_id}</span>
              </div>
            </div>

            {/* Raw JSON */}
            <div className="bg-[#05080f] p-2.5 rounded border border-[#14203d] max-h-40 overflow-y-auto">
              <span className="text-slate-500 block text-[10px] mb-1">RAW JSON OBJECT:</span>
              <pre className="text-[11px] text-slate-300 select-all whitespace-pre-wrap">
                {JSON.stringify(selectedSignal, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => setSelectedSignal(null)}
                className="bg-[#14203d] hover:bg-[#1e305b] text-slate-200 px-4 py-1.5 rounded font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
