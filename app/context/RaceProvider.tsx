'use client';

import React, { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import Ably from 'ably';
import { CalibrationStats, useSystemCalibration } from '../hooks/useSystemCalibration';
import { useRaceAudio } from '../hooks/useRaceAudio';

interface RaceEvent {
  timestamp: number;
  source: 'manual' | 'motion';
}

interface RaceContextType {
  triggerGate: (source?: 'manual' | 'motion', metadata?: { processingLatency?: number; cameraLatency?: number | null }) => void;
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
  lastSyncAge: number | null; // How long ago was the last sync (seconds)
}

const RaceContext = createContext<RaceContextType | undefined>(undefined);

// Drift correction configuration
const DRIFT_CORRECTION_CONFIG = {
  SYNC_INTERVAL_MS: 30000,        // Sync every 30 seconds
  SAMPLES_PER_SYNC: 5,            // Number of samples per sync burst
  SMOOTHING_FACTOR: 0.3,          // EMA alpha (0.3 = 30% new, 70% old)
  MAX_CORRECTION_MS: 50,          // Max single-step correction (prevents jumps)
  OUTLIER_THRESHOLD_MS: 200,      // Reject samples with RTT above this
};

export const RaceProvider = ({ children }: { children: ReactNode }) => {
  const [ably, setAbly] = useState<Ably.Realtime | null>(null);
  const [offset, setOffset] = useState<number>(0);
  const [recentEvents, setRecentEvents] = useState<RaceEvent[]>([]);
  const [gateConfig, setGateConfigState] = useState<number>(2);
  const [distanceConfig, setDistanceConfigState] = useState<number[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [syncTime, setSyncTime] = useState<number | null>(null);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number | null>(null);
  const [lastSyncAge, setLastSyncAge] = useState<number | null>(null);
  const { playStart, playSplit, playFinish } = useRaceAudio();
  
  const { stats: calibrationStats, isCalibrating, runCalibration: runCalibHook } = useSystemCalibration();
  
  // Refs for drift correction
  const isSyncingRef = useRef(false);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Wrapper for runCalibration to pass ably instance
  const runCalibration = async (videoElement?: HTMLVideoElement) => {
      if (ably) {
          await runCalibHook(ably, videoElement);
      }
  };

  // Drift correction sync function
  const performDriftSync = useCallback(async (ablyClient: Ably.Realtime, currentOffset: number): Promise<number> => {
    if (isSyncingRef.current) return currentOffset;
    isSyncingRef.current = true;

    try {
      const samples: { rtt: number; offset: number }[] = [];
      const { SAMPLES_PER_SYNC, OUTLIER_THRESHOLD_MS, SMOOTHING_FACTOR, MAX_CORRECTION_MS } = DRIFT_CORRECTION_CONFIG;

      // Collect samples
      for (let i = 0; i < SAMPLES_PER_SYNC; i++) {
        const start = performance.now();
        const serverTime = await ablyClient.time();
        const end = performance.now();
        
        const rtt = end - start;
        
        // Reject outliers (high RTT indicates network congestion)
        if (rtt < OUTLIER_THRESHOLD_MS) {
          const latency = rtt / 2;
          const predictedServerTime = serverTime + latency;
          const sampleOffset = predictedServerTime - end;
          samples.push({ rtt, offset: sampleOffset });
        }

        await new Promise(r => setTimeout(r, 50));
      }

      if (samples.length === 0) {
        console.warn('[DriftSync] All samples rejected as outliers');
        return currentOffset;
      }

      // Use best sample (lowest RTT = most accurate)
      samples.sort((a, b) => a.rtt - b.rtt);
      const bestSample = samples[0];
      const newOffset = bestSample.offset;

      // Calculate correction with EMA smoothing
      const rawCorrection = newOffset - currentOffset;
      
      // Clamp correction to prevent sudden jumps
      const clampedCorrection = Math.max(-MAX_CORRECTION_MS, Math.min(MAX_CORRECTION_MS, rawCorrection));
      
      // Apply EMA: smoothedOffset = α * newValue + (1-α) * oldValue
      const smoothedOffset = currentOffset + (clampedCorrection * SMOOTHING_FACTOR);

      console.log(`[DriftSync] Samples: ${samples.length}, Best RTT: ${bestSample.rtt.toFixed(1)}ms, ` +
                  `Raw drift: ${rawCorrection.toFixed(2)}ms, Applied: ${(clampedCorrection * SMOOTHING_FACTOR).toFixed(2)}ms`);

      setLastSyncTimestamp(Date.now());
      return smoothedOffset;

    } catch (error) {
      console.error('[DriftSync] Error:', error);
      return currentOffset;
    } finally {
      isSyncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // If we have a calibrated network offset, update the main offset
    if (calibrationStats.isCalibrated) {
        // We use the calibrated 'bestOffset' which is generally more accurate than the startup burst average
        // However, we might want to average it with the current offset or just replace it.
        // Let's replace it to respect the "Calibrate Now" user intent.
        setOffset(calibrationStats.networkOffset);
        setLastSyncTimestamp(Date.now());
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

      const initialOffset = totalOffset / burstCount;
      setOffset(initialOffset);
      setLastSyncTimestamp(Date.now());
      console.log(`[Startup Sync] Initial offset: ${initialOffset.toFixed(2)}ms`);
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

  // Periodic Drift Correction
  useEffect(() => {
    if (!ably || !isConnected) return;

    // Start periodic sync after initial connection
    const startPeriodicSync = () => {
      syncIntervalRef.current = setInterval(async () => {
        if (ably && isConnected) {
          // Use functional update to get current offset
          setOffset(currentOffset => {
            // Fire the async sync but return current value
            // The sync will update offset when complete
            performDriftSync(ably, currentOffset).then(newOffset => {
              if (newOffset !== currentOffset) {
                setOffset(newOffset);
              }
            });
            return currentOffset;
          });
        }
      }, DRIFT_CORRECTION_CONFIG.SYNC_INTERVAL_MS);
    };

    // Delay first periodic sync to avoid overlapping with startup
    const initialDelay = setTimeout(startPeriodicSync, DRIFT_CORRECTION_CONFIG.SYNC_INTERVAL_MS);

    return () => {
      clearTimeout(initialDelay);
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [ably, isConnected, performDriftSync]);

  // Track sync age for UI display
  useEffect(() => {
    if (!lastSyncTimestamp) return;

    const updateAge = () => {
      setLastSyncAge(Math.round((Date.now() - lastSyncTimestamp) / 1000));
    };

    updateAge();
    const ageInterval = setInterval(updateAge, 1000);

    return () => clearInterval(ageInterval);
  }, [lastSyncTimestamp]);

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


  const triggerGate = async (source: 'manual' | 'motion' = 'manual', metadata?: { processingLatency?: number; cameraLatency?: number | null }) => {
    if (!ably || !isConnected) return;
    const now = performance.now();
    let unifiedTime = now + offset;
    
    // Apply Calibration Compensation
    if (calibrationStats.isCalibrated) {
         // Subtract System Jitter (Lag)
         // If system is lagging, 'now' is later than actual event, so we subtract lag.
         unifiedTime -= calibrationStats.systemLag;

         if (source === 'motion') {
             // Camera Pipeline Latency Compensation
             // Priority: Use actual hardware timestamp if available (Android Chrome)
             // Fallback: Use statistical frame duration center estimation
             if (metadata?.cameraLatency !== undefined && metadata.cameraLatency !== null) {
                 // Use actual camera pipeline latency from hardware timestamp
                 unifiedTime -= metadata.cameraLatency;
                 console.log(`[TriggerGate] Using hardware cameraLatency: ${metadata.cameraLatency.toFixed(1)}ms`);
             } else if (calibrationStats.frameDuration > 0) {
                 // Fallback: Frame Duration Center (Statistical estimation)
                 unifiedTime -= (calibrationStats.frameDuration / 2);
                 console.log(`[TriggerGate] Fallback to frameDuration/2: ${(calibrationStats.frameDuration / 2).toFixed(1)}ms`);
             }

             // Processing Latency (our algorithm's execution time)
             if (metadata?.processingLatency) {
                 unifiedTime -= metadata.processingLatency;
             }
         }
    } else if (source === 'motion') {
        // Even without calibration, use camera latency if available
        if (metadata?.cameraLatency !== undefined && metadata.cameraLatency !== null) {
            unifiedTime -= metadata.cameraLatency;
            console.log(`[TriggerGate] Uncalibrated, using cameraLatency: ${metadata.cameraLatency.toFixed(1)}ms`);
        }
        if (metadata?.processingLatency) {
            unifiedTime -= metadata.processingLatency;
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
        isCalibrating,
        lastSyncAge
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
