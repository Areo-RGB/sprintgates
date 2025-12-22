'use client';

import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import Ably from 'ably';
import { useRaceAudio } from '../hooks/useRaceAudio';

interface RaceEvent {
  timestamp: number;
  source: 'manual' | 'motion';
}

interface RaceContextType {
  triggerGate: (source?: 'manual' | 'motion') => void;
  clearEvents: () => void;
  setGateConfig: (count: number) => void;
  setDistances: (distances: number[]) => void;
  syncTime: number | null;
  recentEvents: RaceEvent[];
  isConnected: boolean;
  gateConfig: number;
  distanceConfig: number[];
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

      // Sync Burst
      let totalOffset = 0;
      const burstCount = 5;

      for (let i = 0; i < burstCount; i++) {
        const start = performance.now();
        const serverTime = await ablyInstance.time();
        const end = performance.now();
        
        // Latency is half the round trip time
        const latency = (end - start) / 2;
        // Predicted server time when we received the response
        const predictedServerTime = serverTime + latency;
        // Offset = ServerTime - LocalTime
        const currentOffset = predictedServerTime - end;
        
        totalOffset += currentOffset;
        
        // Small delay between pings
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
        // Optional: Clear events on config change to avoid invalid states
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
  // We need to detect when a NEW event comes in to play sound.
  const prevEventsLength = useRef(0);
  useEffect(() => {
      if (recentEvents.length > prevEventsLength.current) {
          // New event(s) arrived.
          const newEvent = recentEvents[0]; // Most recent is at top because of unshift logic [new, ...old]
          
          // Determine position in sprint
          // Sprints are chunks of 'gateConfig' size.
          // Since we reverse the array in UI but store it [newest, ..... oldest],
          // The "index in current sprint" depends on total count.
          // Actually, let's just count backwards from total triggers.
          
          // Total triggers processed so far = recentEvents.length.
          // The index of the new trigger (1-based) is recentEvents.length.
          // Position = (recentEvents.length - 1) % gateConfig
          
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


  const triggerGate = async (source: 'manual' | 'motion' = 'manual') => {
    if (!ably || !isConnected) return;
    const now = performance.now();
    const unifiedTime = now + offset;
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
    <RaceContext.Provider value={{ triggerGate, clearEvents, setGateConfig, setDistances, syncTime, recentEvents, isConnected, gateConfig, distanceConfig }}>
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
