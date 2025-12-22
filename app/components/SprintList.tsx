'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRace } from '../context/RaceProvider';

const formatTime = (timestamp: number) => {
  if (!timestamp) return '...';
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const ProgressIndicator = ({ currentGate, totalGates }: { currentGate: number, totalGates: number }) => {
    return (
        <div className="flex justify-center gap-2">
            {Array.from({ length: totalGates }).map((_, i) => (
                <div 
                    key={i}
                    className={`w-5 h-5 rounded-full border-2 transition-all duration-300 ${
                        i < currentGate 
                        ? 'bg-[#CEFF00] border-[#CEFF00] shadow-[0_0_10px_#CEFF00]' 
                        : 'bg-transparent border-gray-600'
                    }`}
                />
            ))}
        </div>
    );
};

const SprintCard = ({ sprint, index, gateConfig, distanceConfig }: { sprint: any, index: number, gateConfig: number, distanceConfig?: number[] }) => {
    const isRunning = sprint.events.length < gateConfig;
    const [elapsed, setElapsed] = useState(0);
    const { syncTime } = useRace();

    const startTime = sprint.events[0]?.timestamp;

    useEffect(() => {
        if (!isRunning || !syncTime || !startTime) return;
        setElapsed(syncTime - startTime);
    }, [syncTime, isRunning, startTime]);

    // Calculate duration based on last event if finished, or elapsed if running
    const totalDuration = isRunning ? elapsed : (sprint.events[sprint.events.length - 1].timestamp - startTime);

    return (
        <div className={`p-4 rounded-xl border-l-8 mb-4 ${isRunning ? 'bg-zinc-900 border-yellow-500' : 'bg-zinc-800 border-[#CEFF00]'}`}>
            <div className="flex justify-between items-start mb-2">
                <span className="text-gray-400 font-bold uppercase text-xs tracking-widest">
                    Sprint {index + 1}
                </span>
                {isRunning && <span className="text-yellow-500 font-bold animate-pulse text-xs">RUNNING...</span>}
            </div>
            
            <div className={`font-black font-mono tracking-tighter text-shadow-neon mb-4 ${isRunning ? 'text-5xl text-white' : 'text-6xl text-[#CEFF00]'}`}>
                {(totalDuration / 1000).toFixed(3)}s
            </div>

            {/* Splits Table */}
            <div className="bg-black/30 rounded p-2 text-xs font-mono">
                {/* Header if distances are set */}
                {distanceConfig && distanceConfig.length > 0 && (
                    <div className="grid grid-cols-4 text-[10px] text-gray-500 uppercase tracking-wider border-b border-white/10 pb-2 mb-2 font-bold px-1">
                        <div>Gate</div>
                        <div className="text-right">Time</div>
                        <div className="text-right">Vel</div>
                        <div className="text-right">Accel</div>
                    </div>
                )}

                {sprint.events.map((event: any, i: number) => {
                    const isStart = i === 0;
                    const startTime = sprint.events[0].timestamp;
                    const splitTime = isStart ? 0 : event.timestamp - startTime;
                    
                    // Distance Logic
                    // distanceConfig: index 0 -> Split 1 (Gate 1).
                    // event 0 = Start (0m). event 1 = Split 1.
                    const getDistance = (idx: number) => {
                        if (idx === 0) return 0;
                        return distanceConfig && distanceConfig[idx - 1] ? distanceConfig[idx - 1] : null;
                    };

                    const currentDist = getDistance(i);
                    const prevDist = getDistance(i - 1);
                    const label = isStart ? 'START' : (currentDist !== null ? `${currentDist}m` : (i === gateConfig - 1 ? 'FINISH' : `SPLIT ${i}`));

                    // Math Calculation
                    let velocity = 0;
                    let acceleration = 0;
                    let velocityDisplay = null;
                    let accelDisplay = null;
                    let accelColor = "text-gray-500";
                    let accelArrow = "";

                    if (!isStart && currentDist !== null && prevDist !== null) {
                         const timeDelta = (event.timestamp - sprint.events[i-1].timestamp) / 1000; // seconds
                         const distDelta = currentDist - prevDist;
                         
                         if (timeDelta > 0) {
                             velocity = distDelta / timeDelta;
                             velocityDisplay = `${velocity.toFixed(2)}`;

                             // Calculate previous segment velocity for acceleration
                             // If i=1 (first segment), prev velocity is 0 (Start).
                             let prevVelocity = 0;
                             if (i > 1) {
                                  const prevTimeDelta = (sprint.events[i-1].timestamp - sprint.events[i-2].timestamp) / 1000;
                                  const prevDistDelta = getDistance(i-1)! - getDistance(i-2)!;
                                  if (prevTimeDelta > 0) {
                                      prevVelocity = prevDistDelta / prevTimeDelta;
                                  }
                             }
                             
                             acceleration = (velocity - prevVelocity) / timeDelta;
                             accelDisplay = `${Math.abs(acceleration).toFixed(2)}`;
                             
                             if (acceleration > 0.1) {
                                 accelColor = "text-green-400";
                                 accelArrow = "↑";
                             } else if (acceleration < -0.1) {
                                 accelColor = "text-red-500";
                                 accelArrow = "↓";
                             }
                         }
                    }

                    // Conditional Visibility: Hide Start row if sprint is complete
                    if (isStart && !isRunning) return null;

                    // Render Standard vs Distance Grid
                    if (distanceConfig && distanceConfig.length > 0) {
                         // Grid Layout
                         return (
                            <div key={i} className={`grid grid-cols-4 items-center py-1 border-b border-white/5 last:border-0 ${isStart ? 'opacity-50' : ''}`}>
                                <div className="flex flex-col">
                                    <span className={`font-bold ${isStart ? 'text-gray-500' : 'text-white'}`}>{label}</span>
                                    <span className={`text-[8px] uppercase px-1 rounded w-min ${event.source === 'motion' ? 'bg-pink-900 text-pink-300' : 'bg-blue-900 text-blue-300'}`}>
                                        {event.source}
                                    </span>
                                </div>
                                
                                <div className="text-right text-white">
                                    {isStart ? '0.00' : (splitTime / 1000).toFixed(3)}s
                                </div>
                                
                                <div className="text-right text-cyan-300 font-bold">
                                    {velocityDisplay ? `${velocityDisplay}` : '-'}
                                    {velocityDisplay && <span className="text-[8px] text-gray-500 ml-0.5">m/s</span>}
                                </div>
                                
                                <div className={`text-right font-bold flex items-center justify-end gap-1 ${accelColor}`}>
                                    {accelArrow}
                                    {accelDisplay ? accelDisplay : '-'}
                                    {accelDisplay && <span className="text-[8px] opacity-70">m/s²</span>}
                                </div>
                            </div>
                         );
                    } else {
                        // Legacy / No Distance Layout
                        return (
                            <div key={i} className="flex justify-between items-center py-1 border-b border-white/5 last:border-0">
                                <div className="flex items-center gap-2">
                                    <span className={`w-12 font-bold ${isStart ? 'text-gray-500' : 'text-white'}`}>{label}</span>
                                    <span className={`px-1 rounded uppercase text-[10px] ${event.source === 'motion' ? 'bg-pink-900 text-pink-300' : 'bg-blue-900 text-blue-300'}`}>
                                        {event.source}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className="text-gray-500 mr-2">{formatTime(event.timestamp)}</span>
                                    {!isStart && <span className="text-[#CEFF00] font-bold">+{ (splitTime / 1000).toFixed(3) }s</span>}
                                </div>
                            </div>
                        );
                    }
                })}
            </div>
        </div>
    );
}

const SprintList = () => {
    const { recentEvents, clearEvents, gateConfig, distanceConfig } = useRace();

    const { sprints, currentProgress } = useMemo(() => {
        // Sort events oldest to newest
        const sortedEvents = [...recentEvents].sort((a, b) => a.timestamp - b.timestamp);
        
        const chunks = [];
        let currentChunk: any[] = [];

        for (const event of sortedEvents) {
            currentChunk.push(event);
            if (currentChunk.length === gateConfig) {
                chunks.push({ events: currentChunk, complete: true });
                currentChunk = [];
            }
        }

        // Handle incomplete (running) sprint
        if (currentChunk.length > 0) {
            chunks.push({ events: currentChunk, complete: false });
        }

        return { 
            sprints: chunks.reverse(), // Show newest first
            currentProgress: currentChunk.length 
        }; 
    }, [recentEvents, gateConfig]);

    // Live progress is based on the *latest* sprint if it is incomplete.
    // If the latest sprint is complete (or no events), progress is 0.
    const isLatestRunning = sprints.length > 0 && !sprints[0].complete;
    const progress = isLatestRunning ? sprints[0].events.length : 0;

    return (
        <div className="flex flex-col h-full bg-zinc-900/50">
             <div className="flex justify-between items-center sticky top-0 bg-zinc-900/90 py-4 z-10 border-b border-white/10 mb-2 relative min-h-[60px]">
                <h2 className="text-sm text-gray-400 uppercase tracking-widest pl-4 font-bold">
                Results ({gateConfig} Gates)
                </h2>
                 <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <ProgressIndicator currentGate={progress} totalGates={gateConfig} />
                </div>
                <button 
                    onClick={clearEvents}
                    className="text-xs border border-red-500 text-red-500 px-3 py-1 rounded hover:bg-red-500/10 active:bg-red-500/20 uppercase tracking-wide mr-4"
                >
                    Clear
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-2 pb-20">
                 {sprints.length === 0 && (
                    <div className="text-center text-gray-600 italic mt-10">
                        Waiting for triggers...
                    </div>
                )}
                {sprints.map((sprint, i) => (
                    <SprintCard 
                        key={sprint.events[0].timestamp} 
                        sprint={sprint} 
                        index={sprints.length - 1 - i} 
                        gateConfig={gateConfig}
                        distanceConfig={distanceConfig}
                    />
                ))}
            </div>
        </div>
    );
};

export default SprintList;
