'use client';

import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import Ably from 'ably';
import { CalibrationStats, useSystemCalibration } from '../hooks/useSystemCalibration';
import { useRaceAudio } from '../hooks/useRaceAudio';

interface RaceEvent {
  timestamp: number;
  source: 'manual' | 'motion';
}

interface RaceContextType {
  triggerGate: (source?: 'manual' | 'motion', metadata?: { processingLatency?: number }) => void;
  clearEvents: () => void;
  setGateConfig: (count: number) => void;
  setDistances: (distances: number[]) => void;
  syncTime: number | null;
  recentEvents: RaceEvent[];
  isConnected: boolean;
  gateConfig: number;
  distanceConfig: number[];
  runCalibration: (videoElement?: HTMLVideoElement) => Promise<void>;
  calibrationStats: CalibrationStats;
  isCalibrating: boolean;
}

const RaceContext = createContext<RaceContextType | undefined>(undefined);

export const RaceProvider = ({ children }: { children: ReactNode }) => {
  const [ably, setAbly] = useState<Ably.Realtime | null>(null);
  const [offset, setOffset] = useState<number>(0);
  const [recentEvents, setRecentEvents] = useState<RaceEvent[]>([]);
  const [gateConfig, setGateConfigState] = useState<number>(2);
  const [distanceConfig, setDistanceConfigState] = useState<number[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [syncTime, setSyncTime] = useState<number | null>(null);
  const { playStart, playSplit, playFinish } = useRaceAudio();
  
  const { stats: calibrationStats, isCalibrating, runCalibration: runCalibHook } = useSystemCalibration();

  // Wrapper for runCalibration to pass ably instance
  const runCalibration = async (videoElement?: HTMLVideoElement) => {
      if (ably) {
          await runCalibHook(ably, videoElement);
      }
  };

  useEffect(() => {
    // If we have a calibrated network offset, update the main offset
    if (calibrationStats.isCalibrated) {
        // We use the calibrated 'bestOffset' which is generally more accurate than the startup burst average
        // However, we might want to average it with the current offset or just replace it.
        // Let's replace it to respect the "Calibrate Now" user intent.
        setOffset(calibrationStats.networkOffset);
    }
  }, [calibrationStats.isCalibrated, calibrationStats.networkOffset]);


  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_ABLY_KEY) {
        console.error('Ably API Key is missing!');
        return;
    }

    const ablyInstance = new Ably.Realtime({
      key: process.env.NEXT_PUBLIC_ABLY_KEY,
      autoConnect: true,
    });

    ablyInstance.connection.once('connected', async () => {
      console.log('Connected to Ably!');
      setIsConnected(true);

      // Startup Sync Burst (Simple)
      // Only run if not calibrated yet to avoid overwriting a good calibration with a simple one?
      // Actually, startup always runs first.
      let totalOffset = 0;
      const burstCount = 5;

      for (let i = 0; i < burstCount; i++) {
        const start = performance.now();
        const serverTime = await ablyInstance.time();
        const end = performance.now();
        
        const latency = (end - start) / 2;
        const predictedServerTime = serverTime + latency;
        const currentOffset = predictedServerTime - end;
        
        totalOffset += currentOffset;
        await new Promise((r) => setTimeout(r, 100));
      }

      setOffset(totalOffset / burstCount);
    });

    const channel = ablyInstance.channels.get('my-private-sprint-track');

    channel.subscribe('gate-trigger', (message) => {
      setRecentEvents((prev) => [message.data, ...prev]);
    });

    channel.subscribe('clear-events', () => {
      setRecentEvents([]);
    });

    channel.subscribe('config-change', (message) => {
        setGateConfigState(message.data.count);
        setRecentEvents([]); 
    });

    channel.subscribe('distance-change', (message) => {
      setDistanceConfigState(message.data.distances);
    });

    setAbly(ablyInstance);

    return () => {
      channel.unsubscribe();
      ablyInstance.close();
    };
  }, []);

  // Clock ticker for UI
  useEffect(() => {
    if (!isConnected) return;

    let animationFrameId: number;

    const tick = () => {
      const now = performance.now();
      setSyncTime(now + offset);
      animationFrameId = requestAnimationFrame(tick);
    };

    tick();

    return () => cancelAnimationFrame(animationFrameId);
  }, [isConnected, offset]);

  // Audio effect based on recent events
  const prevEventsLength = useRef(0);
  useEffect(() => {
      if (recentEvents.length > prevEventsLength.current) {
          const position = (recentEvents.length - 1) % gateConfig;
          
          if (position === 0) {
              playStart();
          } else if (position === gateConfig - 1) {
              playFinish();
          } else {
              playSplit();
          }
      }
      prevEventsLength.current = recentEvents.length;
  }, [recentEvents, gateConfig, playStart, playSplit, playFinish]);


  const triggerGate = async (source: 'manual' | 'motion' = 'manual', metadata?: { processingLatency?: number }) => {
    if (!ably || !isConnected) return;
    const now = performance.now();
    let unifiedTime = now + offset;
    
    // Apply Calibration Compensation
    if (calibrationStats.isCalibrated) {
         // Subtract System Jitter (Lag)
         // If system is lagging, 'now' is later than actual event, so we subtract lag.
         unifiedTime -= calibrationStats.systemLag;

         if (source === 'motion') {
             // 1. Frame Duration Center (Statistical)
             unifiedTime -= (calibrationStats.frameDuration / 2);

             // 2. Processing Latency (Specific)
             if (metadata?.processingLatency) {
                 unifiedTime -= metadata.processingLatency;
             }
         }
    }

    const channel = ably.channels.get('my-private-sprint-track');
    await channel.publish('gate-trigger', { timestamp: unifiedTime, source });
  };

  const clearEvents = async () => {
    if (!ably || !isConnected) return;
    const channel = ably.channels.get('my-private-sprint-track');
    await channel.publish('clear-events', {});
  };

  const setGateConfig = async (count: number) => {
      if (!ably || !isConnected) return;
      const channel = ably.channels.get('my-private-sprint-track');
      await channel.publish('config-change', { count });
  };

  const setDistances = async (distances: number[]) => {
    if (!ably || !isConnected) return;
    const channel = ably.channels.get('my-private-sprint-track');
    await channel.publish('distance-change', { distances });
  };

  return (
    <RaceContext.Provider value={{ 
        triggerGate, 
        clearEvents, 
        setGateConfig, 
        setDistances, 
        syncTime, 
        recentEvents, 
        isConnected, 
        gateConfig, 
        distanceConfig,
        runCalibration,
        calibrationStats,
        isCalibrating
    }}>
      {children}
    </RaceContext.Provider>
  );
};

export const useRace = () => {
  const context = useContext(RaceContext);
  if (context === undefined) {
    throw new Error('useRace must be used within a RaceProvider');
  }
  return context;
};
