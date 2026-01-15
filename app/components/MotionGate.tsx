'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRace } from '../context/RaceProvider';
import { useCanvasMotion } from '../hooks/useCanvasMotion';

const MotionGate = () => {
  const { triggerGate } = useRace();
  const [sensitivity, setSensitivity] = useState(25); // 0-100 scale? Logic delta might be 0-255.
  const [isArmed, setIsArmed] = useState(false);
  const [motionLevel, setMotionLevel] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [lastTrigger, setLastTrigger] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Audio Context for Beep
  const audioContextRef = useRef<AudioContext | null>(null);

  const playBeep = () => {
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // High pitch A5
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.1);
    osc.stop(ctx.currentTime + 0.1);
  };

  const handleMotion = useCallback((delta: number, metadata?: { processingLatency: number; cameraLatency: number | null }) => {
    // Delta is average pixel difference (0-255).
    // Normalize to 0-100 for display?
    // Let's assume substantial motion is > 5-10.
    
    setMotionLevel(delta);

    if (isArmed) {
        if (delta > sensitivity) {
            const now = performance.now();
            if (now - lastTrigger > 2000) { // 2 second cooldown
                setLastTrigger(now);
                triggerGate('motion', metadata); // Pass metadata to RaceProvider
                
                // Feedback
                if (navigator.vibrate) navigator.vibrate([200]);
            }
        }
    }
  }, [isArmed, sensitivity, lastTrigger, triggerGate]);

  const { videoRef } = useCanvasMotion({ onMotion: handleMotion, sensitivity, isArmed });

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment', // Rear camera
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Apply torch state if track allows
        const track = stream.getVideoTracks()[0];
        if (track) {
            applyTorch(track, torchOn);
        }

      } catch (err) {
        console.error("Camera access error:", err);
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const applyTorch = async (track: MediaStreamTrack, on: boolean) => {
      try {
        const capabilities = track.getCapabilities() as any;
        if (capabilities.torch) {
             await track.applyConstraints({
                 advanced: [{ torch: on } as any]
             });
        }
      } catch (err) {
          console.error("Torch error", err);
      }
  };

  const toggleTorch = () => {
      const newState = !torchOn;
      setTorchOn(newState);
      if (streamRef.current) {
          const track = streamRef.current.getVideoTracks()[0];
          if (track) applyTorch(track, newState);
      }
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden rounded-3xl flex flex-col border-4 border-[#CEFF00] shadow-[0_0_50px_rgba(206,255,0,0.3)]">
      {/* Camera Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover z-0"
      />

      {/* Overlay: Tripwire Line */}
      <div className="absolute top-0 bottom-0 left-1/2 w-1 -translate-x-1/2 bg-[#FF00FF] shadow-[0_0_20px_#FF00FF] z-10 pointer-events-none opacity-80" />

      {/* Motion Meter */}
      <div className="absolute top-1/2 left-1/2 ml-4 -translate-y-1/2 h-40 w-3 bg-black/50 border border-white/20 rounded-full overflow-hidden z-20">
          {/* Threshold Marker */}
          <div 
            className="absolute left-0 right-0 h-0.5 bg-red-500 z-30 transition-all duration-100"
            style={{ bottom: `${(sensitivity / 50) * 100}%` }} 
          />
           {/* Level Bar */}
          <div 
             className="absolute bottom-0 left-0 right-0 bg-[#CEFF00] transition-all duration-75 ease-out"
             style={{ height: `${Math.min((motionLevel / 50) * 100, 100)}%` }} 
          />
      </div>

      {/* Controls Overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-black/80 backdrop-blur-sm z-40 flex flex-col gap-3 border-t border-white/10">
        
        <div className="flex items-center gap-3">
             <span className="text-white font-mono text-[10px] uppercase w-16">Sense</span>
             <input 
                type="range" 
                min="1" 
                max="100" 
                value={sensitivity} 
                onChange={(e) => setSensitivity(Number(e.target.value))}
                className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#FF00FF]"
             />
             <span className="text-[#FF00FF] font-mono font-bold w-6 text-right text-xs">{sensitivity}</span>
        </div>

        <div className="flex gap-3">
            <button
                onClick={() => setIsArmed(!isArmed)}
                className={`flex-[2] py-3 rounded-lg font-black text-lg tracking-widest uppercase transition-all ${
                    isArmed 
                    ? 'bg-red-600 text-white animate-pulse shadow-[0_0_30px_rgba(220,38,38,0.5)]' 
                    : 'bg-[#CEFF00] text-black shadow-[0_0_15px_rgba(206,255,0,0.3)]'
                }`}
            >
                {isArmed ? 'ARMED' : 'DISARMED'}
            </button>
            <button
                onClick={toggleTorch}
                className={`aspect-square rounded-lg flex items-center justify-center border transition-colors ${
                    torchOn ? 'bg-white text-black border-white' : 'bg-transparent text-white border-white/30'
                }`}
            >
                🔦
            </button>
        </div>
      </div>
    </div>
  );
};

export default MotionGate;
