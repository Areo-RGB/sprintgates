import { useState, useCallback } from 'react';
import { Transport } from '../services/Transport';
import * as Ably from 'ably'; // Still used for type reference in old code if any? No, let's keep it if needed or remove.
// Actually runCalibration signature also needs Update.

export interface CalibrationStats {
    networkOffset: number; // ms (The correction to apply)
    networkRTT: number; // ms (Round Trip Time)
    networkJitter: number; // ms (Standard Deviation of RTT)
    fps: number;
    frameDuration: number; // ms
    systemLag: number; // ms (Event loop delay)
    isCalibrated: boolean;
}

export const useSystemCalibration = () => {
    const [stats, setStats] = useState<CalibrationStats>({
        networkOffset: 0,
        networkRTT: 0,
        networkJitter: 0,
        fps: 0,
        frameDuration: 0,
        systemLag: 0,
        isCalibrated: false,
    });

    const [isCalibrating, setIsCalibrating] = useState(false);

    // 1. Measure Network Latency (Burst Sync)
    const measureNetwork = useCallback(async (transport: Transport) => {
        const pings: number[] = [];
        const offsets: number[] = [];
        const PING_COUNT = 20;

        for (let i = 0; i < PING_COUNT; i++) {
            const start = performance.now();
            // await transport.getServerTime(); // Fetch server time (optional pre-fetch?)
            const serverTime = await transport.getServerTime(); // Actual sync call

            // Allow a small gap
            const end = performance.now();
            const rtt = end - start;
            const localTime = Date.now();

            pings.push(rtt);

            const estimatedServerTimeAtRequest = serverTime - (rtt / 2);
            /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
            const offset = estimatedServerTimeAtRequest - localTime;

            offsets.push(offset);

            // Sleep 50ms
            await new Promise(r => setTimeout(r, 50));
        }

        // Calculate Stats
        const avgRTT = pings.reduce((a, b) => a + b, 0) / pings.length;
        const minRTT = Math.min(...pings);
        const bestPingIndex = pings.indexOf(minRTT);
        const bestOffset = offsets[bestPingIndex];

        // Variance / StdDev
        const variance = pings.reduce((a, b) => a + Math.pow(b - avgRTT, 2), 0) / pings.length;
        const jitter = Math.sqrt(variance);

        return { rtt: avgRTT, minRTT, jitter, bestOffset };
    }, []);

    // 2. Measure System Jitter (Event Loop Lag)
    const measureJitter = useCallback(async () => {
        const SAMPLES = 50;
        let totalLag = 0;

        for (let i = 0; i < SAMPLES; i++) {
            const start = performance.now();
            await new Promise(r => setTimeout(r, 10)); // Request 10ms wait
            const end = performance.now();
            const actual = end - start;
            totalLag += (actual - 10); // Lag is the excess time
        }

        return totalLag / SAMPLES;
    }, []);

    // 3. Measure FPS (Need Video Element)
    const measureFPS = useCallback(async (videoElement: HTMLVideoElement) => {
        return new Promise<{ fps: number; frameDuration: number }>((resolve) => {
            let frames = 0;
            const startTime = performance.now();

            const frameCallback = () => {
                frames++;
                const now = performance.now();
                if (now - startTime >= 1000) {
                    const fps = Math.round(frames * 1000 / (now - startTime));
                    const frameDuration = 1000 / fps;
                    resolve({ fps, frameDuration });
                } else {
                    if (videoElement.requestVideoFrameCallback) {
                        videoElement.requestVideoFrameCallback(frameCallback);
                    } else {
                        // Fallback
                        requestAnimationFrame(frameCallback);
                    }
                }
            };

            if (videoElement.requestVideoFrameCallback) {
                videoElement.requestVideoFrameCallback(frameCallback);
            } else {
                requestAnimationFrame(frameCallback);
            }
        });
    }, []);

    const runCalibration = useCallback(async (transport: Transport, videoElement?: HTMLVideoElement) => {
        setIsCalibrating(true);
        try {
            // Run tests
            const [netStats, systemLag] = await Promise.all([
                measureNetwork(transport),
                measureJitter()
            ]);

            let fpsStats = { fps: 0, frameDuration: 0 };
            if (videoElement) {
                fpsStats = await measureFPS(videoElement);
            }

            setStats({
                networkOffset: netStats.bestOffset,
                networkRTT: netStats.rtt,
                networkJitter: netStats.jitter,
                systemLag,
                fps: fpsStats.fps,
                frameDuration: fpsStats.frameDuration,
                isCalibrated: true
            });

        } catch (error) {
            console.error("Calibration failed", error);
        } finally {
            setIsCalibrating(false);
        }
    }, [measureNetwork, measureJitter, measureFPS]);

    return {
        stats,
        isCalibrating,
        runCalibration
    };
};
