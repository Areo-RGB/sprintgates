'use client';

import { useRace } from './context/RaceProvider';
import { useEffect, useState } from 'react';
import MotionGate from './components/MotionGate';
import SprintList from './components/SprintList';

const formatTime = (timestamp: number | null) => {
  if (!timestamp) return '00:00:00.000';
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
};

export default function Home() {
  const { triggerGate, syncTime, isConnected, gateConfig, setGateConfig, distanceConfig, setDistances } = useRace();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<'manual' | 'motion'>('manual');
  const [showDistances, setShowDistances] = useState(false);
  const [localDistances, setLocalDistances] = useState<number[]>([]);

  useEffect(() => {
     if (distanceConfig) {
         setLocalDistances(distanceConfig);
     }
  }, [distanceConfig]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-screen w-full bg-black text-[#CEFF00] overflow-hidden">
      {/* Top: Clock & Controls */}
      <div className="flex-none p-4 flex flex-col gap-2 border-b border-[#CEFF00]/30 select-none bg-zinc-900/80">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-0">
            <div className="flex items-center gap-2 order-2 sm:order-1 w-full sm:w-auto justify-center sm:justify-start">
                <button 
                    onClick={() => setMode(mode === 'motion' ? 'manual' : 'motion')}
                    className={`flex items-center justify-center gap-2 text-xs px-3 py-1.5 rounded border uppercase tracking-wider whitespace-nowrap transition-colors ${
                        mode === 'motion' 
                        ? 'bg-[#FF00FF]/20 border-[#FF00FF]/50 text-[#FF00FF] hover:bg-[#FF00FF]/30' 
                        : 'bg-[#CEFF00]/20 border-[#CEFF00]/50 text-[#CEFF00] hover:bg-[#CEFF00]/30'
                    }`}
                >
                    {mode === 'motion' ? (
                        <>
                            <span className="inline-flex items-center relative top-[-3px] text-base leading-none">📷</span>
                            <span className="leading-none">Exit Camera</span>
                        </>
                    ) : (
                         <>
                            <span className="inline-flex items-center relative top-[-3px] text-base leading-none">📷</span>
                            <span className="leading-none">Motion Gate</span>
                        </>
                    )}
                </button>
                
                {/* Gate Config dropdown/toggle */}
                 <div className="flex items-center border border-[#CEFF00]/30 rounded overflow-hidden flex-shrink-0">
                    {[2, 3, 4].map((count) => (
                        <button
                            key={count}
                            onClick={() => setGateConfig(count)}
                            className={`px-3 py-1 text-xs font-bold ${gateConfig === count ? 'bg-[#CEFF00] text-black' : 'bg-transparent text-gray-500 hover:text-white'}`}
                        >
                            {count}G
                        </button>
                    ))}
                </div>
                 
                 {/* Distance Setup Toggle */}
                  <button
                    onClick={() => setShowDistances(!showDistances)}
                    className={`text-xs px-2 py-1 rounded border border-[#CEFF00]/30 uppercase tracking-wider whitespace-nowrap transition-colors ${showDistances ? 'bg-[#CEFF00] text-black' : 'text-gray-400'}`}
                >
                    📏 Dist
                </button>
            </div>
            <div className="text-4xl sm:text-4xl font-mono font-black tracking-widest text-shadow-neon order-1 sm:order-2">
            {formatTime(syncTime)}
            </div>
        </div>
        
        {/* Dynamic Distance Inputs */}
        {showDistances && (
            <div className="mt-2 bg-black/50 p-2 rounded border border-[#CEFF00]/20 flex gap-2 items-end justify-center sm:justify-start flex-wrap">
                 {Array.from({ length: gateConfig - 1 }).map((_, i) => {
                    const isFinish = i === gateConfig - 2;
                    const label = isFinish ? 'FINISH' : `SPLIT ${i + 1}`;
                    return (
                        <div key={i} className="flex flex-col gap-1">
                            <label className="text-[10px] text-gray-500 font-mono text-center">{label} (m)</label>
                            <input
                                type="number"
                                className="w-16 bg-zinc-800 text-white border border-gray-600 rounded px-2 py-1 text-center font-mono font-bold focus:border-[#CEFF00] outline-none"
                                placeholder="0"
                                value={localDistances[i] || ''}
                                onChange={(e) => {
                                    const newDistances = [...localDistances];
                                    newDistances[i] = Number(e.target.value);
                                    setLocalDistances(newDistances);
                                }}
                            />
                        </div>
                    );
                 })}
                 <button 
                    onClick={() => {
                        setDistances(localDistances);
                        setShowDistances(false);
                    }}
                    className="bg-[#CEFF00] text-black text-xs font-bold px-3 py-2 rounded uppercase hover:bg-[#b5e000] ml-2"
                >
                    Save
                </button>
            </div>
        )}

        {!isConnected && <div className="text-xs text-center text-red-500 animate-pulse">CONNECTING TO RACE SERVER...</div>}
      </div>

      {/* Action Slot */}
      <div className="flex-none h-[45vh] p-4 w-full flex items-center justify-center">
        {mode === 'motion' ? (
            <div className="relative w-full h-full max-w-md mx-auto">
                 <MotionGate />
                 <button 
                    onClick={() => setMode('manual')}
                    className="absolute top-2 right-2 z-50 bg-black/60 text-white hover:text-red-500 p-2 rounded-full border border-white/20 backdrop-blur-md transition-colors"
                    title="Exit Motion Mode"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        ) : (
            <button
                onClick={() => triggerGate('manual')}
                disabled={!isConnected}
                className="w-full h-full max-w-md mx-auto rounded-3xl bg-[#CEFF00] text-black text-5xl font-black uppercase tracking-tighter active:scale-95 transition-transform duration-75 shadow-[0_0_50px_rgba(206,255,0,0.5)] border-4 border-transparent hover:border-white disabled:opacity-50 disabled:grayscale flex items-center justify-center text-center"
            >
                {isConnected ? 'Trigger\nGate' : 'Connecting...'}
            </button>
        )}
      </div>

      {/* Bottom: Sprint List */}
      <div className="flex-1 bg-zinc-900/50 border-t-2 border-[#CEFF00]/20 overflow-hidden flex flex-col min-h-0">
        <SprintList />
      </div>
    </div>
  );
}
