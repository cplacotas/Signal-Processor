import React, { useState, useEffect, useRef } from 'react';
import { 
  Radio, 
  Activity, 
  Binary, 
  Waves,
  Target,
  SlidersHorizontal,
  LayoutGrid,
  Plus,
  Check,
  RefreshCw,
  Eye,
  RotateCcw,
  FileSpreadsheet
} from 'lucide-react';

import SignalHUD from './components/SignalHUD.jsx';
import SpectrumPlot from './components/SpectrumPlot.jsx';
import WaterfallPlot from './components/WaterfallPlot.jsx';
import ConstellationPlot from './components/ConstellationPlot.jsx';
import PacketInspector from './components/PacketInspector.jsx';
import SimulatorControls from './components/SimulatorControls.jsx';
import SignalsTable from './components/SignalsTable.jsx';

const VIEW_DEFS = [
  { id: 'hud', label: 'Signal HUD Metrics', icon: Activity },
  { id: 'spectrum', label: 'RF Spectrum (FFT)', icon: Radio },
  { id: 'waterfall', label: 'Waterfall Spectrogram', icon: Waves },
  { id: 'constellation', label: 'Constellation & I/Q Oscilloscope', icon: Target },
  { id: 'signals', label: 'Received Signals Log & Export', icon: FileSpreadsheet },
  { id: 'inspector', label: 'VITA 49 Protocol & Bursts Log', icon: Binary },
  { id: 'simulator', label: 'Signal Simulator Controls', icon: SlidersHorizontal },
];

export default function App() {
  const [openViews, setOpenViews] = useState({
    hud: true,
    spectrum: true,
    waterfall: true,
    constellation: true,
    signals: true,
    inspector: true,
    simulator: true,
  });

  const [showViewsMenu, setShowViewsMenu] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [streamData, setStreamData] = useState(null);
  const wsRef = useRef(null);
  const menuRef = useRef(null);

  // Close views menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowViewsMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Connect to backend WebSocket
  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname || 'localhost';
      const wsUrl = `${protocol}//${host}:8000/ws/stream`;

      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setStreamData(data);
          } catch (e) {
            console.error('Failed to parse frame JSON:', e);
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          reconnectTimeout = setTimeout(connect, 1500);
        };

        ws.onerror = () => {
          setIsConnected(false);
          ws.close();
        };
      } catch (err) {
        setIsConnected(false);
        reconnectTimeout = setTimeout(connect, 1500);
      }
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, []);

  // View toggle helper
  const toggleView = (viewId) => {
    setOpenViews((prev) => ({
      ...prev,
      [viewId]: !prev[viewId],
    }));
  };

  const closeView = (viewId) => {
    setOpenViews((prev) => ({
      ...prev,
      [viewId]: false,
    }));
  };

  const setAllViews = (state) => {
    const updated = {};
    VIEW_DEFS.forEach((v) => {
      updated[v.id] = state;
    });
    setOpenViews(updated);
  };

  const applyLayoutPreset = (presetName) => {
    if (presetName === 'all') {
      setAllViews(true);
    } else if (presetName === 'spectrum_waterfall') {
      setOpenViews({
        hud: true,
        spectrum: true,
        waterfall: true,
        constellation: false,
        signals: true,
        inspector: false,
        simulator: true,
      });
    } else if (presetName === 'analyzer_only') {
      setOpenViews({
        hud: true,
        spectrum: true,
        waterfall: true,
        constellation: true,
        signals: true,
        inspector: true,
        simulator: false,
      });
    } else if (presetName === 'minimal') {
      setOpenViews({
        hud: true,
        spectrum: true,
        waterfall: false,
        constellation: false,
        signals: false,
        inspector: false,
        simulator: true,
      });
    }
    setShowViewsMenu(false);
  };

  // Simulator API handlers
  const handleUpdateConfig = async (config) => {
    try {
      await fetch('http://localhost:8000/api/simulator/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
    } catch (e) {
      console.error('Failed to update config:', e);
    }
  };

  const handleStartSim = async () => {
    try {
      await fetch('http://localhost:8000/api/simulator/start', { method: 'POST' });
    } catch (e) {
      console.error('Failed to start simulator:', e);
    }
  };

  const handleStopSim = async () => {
    try {
      await fetch('http://localhost:8000/api/simulator/stop', { method: 'POST' });
    } catch (e) {
      console.error('Failed to stop simulator:', e);
    }
  };

  const handleSingleBurst = async () => {
    try {
      await fetch('http://localhost:8000/api/simulator/burst', { method: 'POST' });
    } catch (e) {
      console.error('Failed to trigger burst:', e);
    }
  };

  const handleClearSignals = async () => {
    try {
      await fetch('http://localhost:8000/api/signals/clear', { method: 'POST' });
    } catch (e) {
      console.error('Failed to clear signals:', e);
    }
  };

  const metrics = streamData?.metrics;
  const psd = streamData?.psd_dbfs;
  const frequencies = streamData?.frequencies;
  const timeI = streamData?.time_i;
  const timeQ = streamData?.time_q;
  const constellationI = streamData?.constellation_i;
  const constellationQ = streamData?.constellation_q;
  const packetInspector = streamData?.packet_inspector;
  const burstHistory = streamData?.burst_history;
  const signals = streamData?.signals || [];
  const udpStats = streamData?.udp_stats;
  const simulatorStats = streamData?.simulator_stats;

  const activeViewsCount = Object.values(openViews).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans">
      {/* Top Main Navigation Bar */}
      <header className="border-b border-[#1e305b] bg-[#090f1d] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rf-accent to-rf-neon flex items-center justify-center shadow-[0_0_12px_rgba(0,240,255,0.4)]">
            <Radio className="w-5 h-5 text-slate-950 font-bold" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wider text-slate-100 flex items-center space-x-2">
              <span>VITA 49 SIGNAL PROCESSOR & ANALYZER</span>
              <span className="text-[10px] bg-rf-accent/20 text-rf-accent border border-rf-accent/40 px-1.5 py-0.2 rounded font-mono font-bold">
                ANSI/VITA 49.2
              </span>
            </h1>
            <p className="text-[10px] text-slate-400 font-mono">
              High-Fidelity Real-Time SDR Ingest, Spectral Analysis & Test Simulator
            </p>
          </div>
        </div>

        {/* View Selection Dropdown & Controls */}
        <div className="flex items-center space-x-2" ref={menuRef}>
          <div className="relative">
            <button
              onClick={() => setShowViewsMenu(!showViewsMenu)}
              className="bg-[#14203d] hover:bg-[#1e305b] text-slate-100 text-xs px-3 py-1.5 rounded-lg border border-[#1e305b] font-medium flex items-center space-x-2 transition-all shadow-sm"
            >
              <LayoutGrid className="w-4 h-4 text-rf-accent" />
              <span>Select Views</span>
              <span className="text-[10px] bg-rf-accent/20 text-rf-accent px-1.5 py-0.2 rounded font-mono font-bold">
                {activeViewsCount}/{VIEW_DEFS.length}
              </span>
            </button>

            {/* Dropdown Menu Modal */}
            {showViewsMenu && (
              <div className="absolute right-0 mt-2 w-72 bg-[#0d1527] border border-[#1e305b] rounded-xl shadow-2xl p-3 z-50 font-sans">
                <div className="flex items-center justify-between pb-2 border-b border-[#1e305b] mb-2">
                  <span className="text-xs font-bold text-slate-200">OPEN / CLOSE VIEWS</span>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setAllViews(true)}
                      className="text-[10px] text-rf-accent hover:underline font-mono"
                    >
                      Show All
                    </button>
                    <span className="text-slate-600">&bull;</span>
                    <button
                      onClick={() => setAllViews(false)}
                      className="text-[10px] text-slate-400 hover:text-slate-200 font-mono"
                    >
                      Hide All
                    </button>
                  </div>
                </div>

                {/* View Checkboxes */}
                <div className="space-y-1">
                  {VIEW_DEFS.map((view) => {
                    const Icon = view.icon;
                    const isOpen = Boolean(openViews[view.id]);
                    return (
                      <button
                        key={view.id}
                        onClick={() => toggleView(view.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
                          isOpen
                            ? 'bg-[#14203d] text-slate-100 font-semibold'
                            : 'text-slate-400 hover:bg-[#14203d]/40 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <Icon className={`w-3.5 h-3.5 ${isOpen ? 'text-rf-accent' : 'text-slate-500'}`} />
                          <span>{view.label}</span>
                        </div>
                        <div className={`w-4 h-4 rounded flex items-center justify-center border ${
                          isOpen ? 'bg-rf-accent border-rf-accent text-slate-950 font-bold' : 'border-slate-600'
                        }`}>
                          {isOpen && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Layout Presets */}
                <div className="mt-3 pt-2.5 border-t border-[#1e305b]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Layout Presets
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
                    <button
                      onClick={() => applyLayoutPreset('spectrum_waterfall')}
                      className="bg-[#14203d] hover:bg-[#1e305b] text-slate-300 py-1 px-2 rounded border border-[#1e305b] text-left"
                    >
                      Spectrum & Waterfall
                    </button>
                    <button
                      onClick={() => applyLayoutPreset('analyzer_only')}
                      className="bg-[#14203d] hover:bg-[#1e305b] text-slate-300 py-1 px-2 rounded border border-[#1e305b] text-left"
                    >
                      Analyzer Only
                    </button>
                    <button
                      onClick={() => applyLayoutPreset('minimal')}
                      className="bg-[#14203d] hover:bg-[#1e305b] text-slate-300 py-1 px-2 rounded border border-[#1e305b] text-left"
                    >
                      Minimal
                    </button>
                    <button
                      onClick={() => applyLayoutPreset('all')}
                      className="bg-[#14203d] hover:bg-[#1e305b] text-slate-300 py-1 px-2 rounded border border-[#1e305b] text-left"
                    >
                      Full Laboratory
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Server & UDP connection status */}
        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="flex items-center space-x-1.5 bg-[#0d1527] px-2.5 py-1 rounded border border-[#1e305b]">
            <span className="text-slate-400 text-[10px]">UDP RX:</span>
            <span className="text-rf-neon font-bold">4991</span>
          </div>

          <div className="flex items-center space-x-1.5 bg-[#0d1527] px-2.5 py-1 rounded border border-[#1e305b]">
            {isConnected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-rf-neon shadow-[0_0_8px_#00ff88]" />
                <span className="text-rf-neon font-semibold text-[11px]">LIVE (30 FPS)</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-rf-crimson animate-pulse" />
                <span className="text-rf-crimson font-semibold text-[11px]">CONNECTING...</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Quick View Bar / Ribbon */}
      <div className="bg-[#070b14] border-b border-[#14203d] px-4 py-1.5 flex items-center space-x-2 overflow-x-auto text-xs">
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mr-1">
          Views:
        </span>
        {VIEW_DEFS.map((view) => {
          const isOpen = Boolean(openViews[view.id]);
          const Icon = view.icon;
          return (
            <button
              key={view.id}
              onClick={() => toggleView(view.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium flex items-center space-x-1.5 transition-all whitespace-nowrap border ${
                isOpen
                  ? 'bg-rf-accent/15 text-rf-accent border-rf-accent/40 shadow-[0_0_8px_rgba(0,240,255,0.15)] font-semibold'
                  : 'bg-[#0d1527] text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Icon className="w-3 h-3" />
              <span>{view.label}</span>
              <span className={`text-[9px] font-bold ml-0.5 ${isOpen ? 'text-rf-accent' : 'text-slate-500'}`}>
                {isOpen ? '✕' : '+'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Content Area: Responsive Grid of Open Views */}
      <main className="flex-1 p-3 md:p-4 space-y-4 max-w-[1920px] mx-auto w-full">
        {/* 1. HUD Metrics View */}
        {openViews.hud && (
          <div className="relative">
            <SignalHUD metrics={metrics} udpStats={udpStats} isConnected={isConnected} />
          </div>
        )}

        {/* 2. Top Graphs Row: Spectrum & Waterfall */}
        {(openViews.spectrum || openViews.waterfall) && (
          <div className={`grid grid-cols-1 ${openViews.spectrum && openViews.waterfall ? 'xl:grid-cols-2' : ''} gap-3`}>
            {openViews.spectrum && (
              <div className="h-[360px]">
                <SpectrumPlot
                  frequencies={frequencies}
                  psd={psd}
                  metrics={metrics}
                  onClose={() => closeView('spectrum')}
                />
              </div>
            )}
            {openViews.waterfall && (
              <div className="h-[360px]">
                <WaterfallPlot
                  frequencies={frequencies}
                  psd={psd}
                  onClose={() => closeView('waterfall')}
                />
              </div>
            )}
          </div>
        )}

        {/* 3. Middle Row: Constellation & Inspector */}
        {(openViews.constellation || openViews.inspector) && (
          <div className={`grid grid-cols-1 ${openViews.constellation && openViews.inspector ? 'xl:grid-cols-2' : ''} gap-3`}>
            {openViews.constellation && (
              <div className="min-h-[300px]">
                <ConstellationPlot
                  constellationI={constellationI}
                  constellationQ={constellationQ}
                  timeI={timeI}
                  timeQ={timeQ}
                  onClose={() => closeView('constellation')}
                />
              </div>
            )}
            {openViews.inspector && (
              <div className="min-h-[300px]">
                <PacketInspector
                  packetInspector={packetInspector}
                  burstHistory={burstHistory}
                  onClose={() => closeView('inspector')}
                />
              </div>
            )}
          </div>
        )}

        {/* 4. Received Signals Object Table & Metadata Log */}
        {openViews.signals && (
          <div>
            <SignalsTable
              signals={signals}
              onClear={handleClearSignals}
              onClose={() => closeView('signals')}
            />
          </div>
        )}

        {/* 5. Bottom Row: Simulator Controls */}
        {openViews.simulator && (
          <div>
            <SimulatorControls
              simulatorStats={simulatorStats}
              onUpdateConfig={handleUpdateConfig}
              onStart={handleStartSim}
              onStop={handleStopSim}
              onSingleBurst={handleSingleBurst}
              onClose={() => closeView('simulator')}
            />
          </div>
        )}

        {/* Empty State Banner if all views are closed */}
        {activeViewsCount === 0 && (
          <div className="text-center py-20 px-4 bg-[#0d1527] border border-[#1e305b] rounded-2xl max-w-lg mx-auto shadow-xl">
            <LayoutGrid className="w-12 h-12 text-slate-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-200 mb-1">All Views are Closed</h3>
            <p className="text-xs text-slate-400 mb-4 font-mono">
              Select which graphs or panels you want to place on the screen.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => setAllViews(true)}
                className="bg-rf-accent hover:bg-rf-accent/90 text-slate-950 font-bold text-xs px-4 py-2 rounded-lg transition-all"
              >
                Restore All Views
              </button>
              <button
                onClick={() => applyLayoutPreset('spectrum_waterfall')}
                className="bg-[#14203d] hover:bg-[#1e305b] text-slate-200 text-xs px-3 py-2 rounded-lg border border-[#1e305b] transition-all"
              >
                Spectrum & Waterfall
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1e305b] bg-[#090f1d] px-4 py-2 text-[11px] font-mono text-slate-400 flex flex-wrap justify-between items-center">
        <div>
          VITA 49 Radio Transport Processor &bull; Windowed FFT &bull; High-DPI Canvas Rendering
        </div>
        <div className="flex items-center space-x-3 text-slate-400">
          <span>Target UDP Socket: <code className="text-rf-accent font-bold">127.0.0.1:4991</code></span>
          <span>WebSocket Stream: <code className="text-rf-neon font-bold">:8000/ws/stream</code></span>
        </div>
      </footer>
    </div>
  );
}
