'use client';

import React, { useState } from 'react';
import { useRace } from '../context/RaceProvider';
import { useCanvasMotion } from '../hooks/useCanvasMotion'; // Type only maybe? 

const CalibrationDashboard = () => {
    const { calibrationStats, runCalibration, isCalibrating, isConnected, lastSyncAge } = useRace();
    const [isOpen, setIsOpen] = useState(false);

    const getHealthColor = (error: number) => {
        if (error < 30) return 'text-[#CEFF00]'; // Green
        if (error < 100) return 'text-orange-500';
        return 'text-red-500';
    };

    const totalError = 
        Math.abs(calibrationStats.networkOffset) + 
        calibrationStats.networkJitter + 
        calibrationStats.systemLag + 
        (calibrationStats.fps > 0 ? calibrationStats.frameDuration / 2 : 0);
        // Note: networkOffset is correction, not error. 
        // But for "Stability", we mostly care about Jitter + Frame Duration ambiguity.
    
    const stabilityScore = calibrationStats.networkJitter + calibrationStats.systemLag + (calibrationStats.fps > 0 ? calibrationStats.frameDuration / 2 : 0);

    return (
        <>
            {/* Trigger / Status Pill */}
            <button 
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-1.5 px-2 py-1 bg-black/40 border border-white/10 rounded-full backdrop-blur-sm whitespace-nowrap flex-shrink-0"
            >
                <div className={`w-1.5 h-1.5 rounded-full ${getHealthColor(stabilityScore).replace('text-', 'bg-')}`} />
                <span className="text-white/60 text-[9px] font-mono tracking-wider font-bold">
                    {calibrationStats.isCalibrated ? 'CALIBRATED' : 'UNCALIBRATED'}
                </span>
            </button>

            {/* Modal */}
            {isOpen && (
                <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                        
                        {/* Header */}
                        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
                            <h3 className="text-white font-bold text-lg">System Calibration</h3>
                            <button onClick={() => setIsOpen(false)} className="text-white/50 hover:text-white text-2xl leading-none">&times;</button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-6">
                            
                            {/* Network */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <span className="text-white/60 text-xs uppercase tracking-wider">Network Link</span>
                                    <span className={`font-mono text-sm ${calibrationStats.networkJitter > 50 ? 'text-red-500' : 'text-[#CEFF00]'}`}>
                                        {calibrationStats.networkRTT.toFixed(0)}ms RTT
                                    </span>
                                </div>
                                <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                                     <div className="h-full bg-[#CEFF00]" style={{ width: `${Math.min(100, Math.max(0, 100 - calibrationStats.networkRTT))}%` }} />
                                </div>
                                <div className="flex justify-between text-[10px] text-white/40 font-mono">
                                    <span>Jitter: ±{calibrationStats.networkJitter.toFixed(1)}ms</span>
                                    <span>Offset: {calibrationStats.networkOffset.toFixed(1)}ms</span>
                                </div>
                            </div>

                            {/* System */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <span className="text-white/60 text-xs uppercase tracking-wider">Device Perf</span>
                                    <span className="font-mono text-sm text-[#00FFFF]">
                                        {calibrationStats.fps > 0 ? `${calibrationStats.fps} FPS` : 'N/A'}
                                    </span>
                                </div>
                                <div className="flex justify-between text-[10px] text-white/40 font-mono">
                                    <span>Frame: {calibrationStats.frameDuration.toFixed(1)}ms</span>
                                    <span>Evt Loop Lag: {calibrationStats.systemLag.toFixed(2)}ms</span>
                                </div>
                                <div className="text-[9px] text-green-400/70 font-mono flex items-center gap-1">
                                    <span>✓</span>
                                    <span>Camera latency: Hardware timestamps (Android Chrome)</span>
                                </div>
                            </div>

                            {/* Total Accuracy Estimation */}
                            <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-1">
                                <div className="text-center text-white/60 text-[10px] uppercase">Est. Timing Accuracy</div>
                                <div className={`text-center font-black font-mono text-2xl ${getHealthColor(stabilityScore)}`}>
                                    ±{stabilityScore.toFixed(1)}ms
                                </div>
                            </div>

                            {/* Sync Status */}
                            <div className="flex justify-between items-center text-[10px] text-white/40 font-mono px-1">
                                <span>🔄 Auto-sync every 30s</span>
                                <span>
                                    Last sync: {lastSyncAge !== null ? (
                                        lastSyncAge < 60 ? `${lastSyncAge}s ago` : `${Math.floor(lastSyncAge / 60)}m ago`
                                    ) : 'never'}
                                </span>
                            </div>

                            {/* Warning if uncalibrated */}
                            {!calibrationStats.isCalibrated && (
                                <p className="text-center text-orange-400 text-xs">
                                    System running on defaults. Calibrate for true accuracy.
                                </p>
                            )}

                        </div>

                        {/* Footer / Actions */}
                        <div className="p-4 border-t border-white/10 bg-black/20">
                            <button 
                                disabled={isCalibrating || !isConnected}
                                onClick={() => {
                                    // Try to find the video element from DOM if needed, or pass undefined if we can't easily get it here.
                                    // Ideally RaceProvider or Context would have access if we registered it?
                                    // For now, let's just run Network/Jitter if video not found, or try to querySelector it?
                                    // Hacky but works for this specific setup:
                                    const videoEl = document.querySelector('video') as HTMLVideoElement;
                                    runCalibration(videoEl);
                                }}
                                className="w-full py-4 bg-[#CEFF00] hover:bg-[#b5e000] disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold uppercase tracking-widest rounded-xl transition-colors flex items-center justify-center gap-2"
                            >
                                {isCalibrating ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                        Calibrating...
                                    </>
                                ) : (
                                    'Run Calibration Sequence'
                                )}
                            </button>
                        </div>

                    </div>
                </div>
            )}
        </>
    );
};

export default CalibrationDashboard;
