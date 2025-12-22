'use client';

import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { Transport } from '../services/Transport';
import { AblyTransport } from '../services/AblyTransport';
import { PeerTransport } from '../services/PeerTransport';
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
  const [transport, setTransport] = useState<Transport | null>(null);
  const [recentEvents, setRecentEvents] = useState<RaceEvent[]>([]);
  const [gateConfig, setGateConfigState] = useState<number>(2);
  const [distanceConfig, setDistanceConfigState] = useState<number[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [syncTime, setSyncTime] = useState<number | null>(null);
  const { playStart, playSplit, playFinish } = useRaceAudio();

  const { stats: calibrationStats, isCalibrating, runCalibration: runCalibHook } = useSystemCalibration();

  // Wrapper for runCalibration to pass transport instance
  const runCalibration = async (videoElement?: HTMLVideoElement) => {
    if (transport) {
      await runCalibHook(transport, videoElement);
    }
  };

  useEffect(() => {
    // If we have a calibrated network offset, update the transport offset
    if (calibrationStats.isCalibrated && transport) {
      transport.setOffset(calibrationStats.networkOffset);
    }
  }, [calibrationStats.isCalibrated, calibrationStats.networkOffset, transport]);


  useEffect(() => {
    const mode = process.env.NEXT_PUBLIC_TRANSPORT_MODE; // 'ably' or 'peer'
    console.log('Initializing RaceProvider with transport mode:', mode || 'ably (default)');

    let transportInstance: Transport;

    if (mode === 'peer') {
      transportInstance = new PeerTransport();
    } else {
      transportInstance = new AblyTransport();
    }

    transportInstance.connect({
      onEvent: (topic, data) => {
        if (topic === 'gate-trigger') {
          setRecentEvents((prev) => [data, ...prev]);
        } else if (topic === 'clear-events') {
          setRecentEvents([]);
        } else if (topic === 'config-change') {
          setGateConfigState(data.count);
          setRecentEvents([]);
        } else if (topic === 'distance-change') {
          setDistanceConfigState(data.distances);
        }
      },
      onStatusChange: (status) => {
        setIsConnected(status);
      }
    });

    setTransport(transportInstance);

    return () => {
      transportInstance.disconnect();
    };
  }, []);

  // Clock ticker for UI
  useEffect(() => {
    if (!isConnected || !transport) return;

    let animationFrameId: number;

    const tick = () => {
      setSyncTime(transport.now());
      animationFrameId = requestAnimationFrame(tick);
    };

    tick();

    return () => cancelAnimationFrame(animationFrameId);
  }, [isConnected, transport]);

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
    if (!transport || !isConnected) return;
    const now = performance.now();
    // Transport.now() is synced time, but here we calculate event timestamp based on 'now' minus lag
    // Wait, transport.now() = perf.now() + offset.
    // If we want unified time of the EVENT which happened at 'now' (local perf time).
    // UnifiedTime = LocalEventTime + Offset.
    // LocalEventTime = now - lag. (Lag is passed from calibration but we assume 'now' is raw capture time?)
    // Actually in original code:
    // unifiedTime = now + offset;
    // unifiedTime -= calibrationStats.systemLag;
    // ...
    // So logic remains same, just need transport's offset?
    // But Transport encapsulates offset.
    // So transport.now() is basically (perf.now() + offset).
    // So unifiedTime = transport.now().
    // Then apply substractions.
    // However, strictly speaking, if 'now' was captured a few ms ago (passed in metadata? No, 'now' is strictly 'performance.now()' at function call start).
    // So yes, verify logic:

    let unifiedTime = transport.now();

    // Apply Calibration Compensation
    if (calibrationStats.isCalibrated) {
      // Subtract System Jitter (Lag)
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

    await transport.publish('gate-trigger', { timestamp: unifiedTime, source });
  };

  const clearEvents = async () => {
    if (!transport || !isConnected) return;
    await transport.publish('clear-events', {});
  };

  const setGateConfig = async (count: number) => {
    if (!transport || !isConnected) return;
    await transport.publish('config-change', { count });
  };

  const setDistances = async (distances: number[]) => {
    if (!transport || !isConnected) return;
    await transport.publish('distance-change', { distances });
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
