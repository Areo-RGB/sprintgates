import { useState, useCallback } from 'react';
import * as Ably from 'ably';

export interface CalibrationStats {
    networkOffset: number; // ms (The correction to apply)
    networkRTT: number; // ms (Round Trip Time)
    networkJitter: number; // ms (Standard Deviation of RTT)
    uploadLatency: number; // ms (Asymmetric: client → server)
    downloadLatency: number; // ms (Asymmetric: server → client)
    fps: number;
    frameDuration: number; // ms
    systemLag: number; // ms (Event loop delay)
    isCalibrated: boolean;
}

interface TimeSyncResponse {
    serverReceiveTime: number;
    serverResponseTime: number;
    clientSendTime: number;
    serverProcessing: number;
}

export const useSystemCalibration = () => {
    const [stats, setStats] = useState<CalibrationStats>({
        networkOffset: 0,
        networkRTT: 0,
        networkJitter: 0,
        uploadLatency: 0,
        downloadLatency: 0,
        fps: 0,
        frameDuration: 0,
        systemLag: 0,
        isCalibrated: false,
    });

    const [isCalibrating, setIsCalibrating] = useState(false);

    // 1. Measure Asymmetric Network Latency using our own server endpoint
    const measureAsymmetricLatency = useCallback(async () => {
        const samples: { 
            rtt: number; 
            uploadEst: number; 
            downloadEst: number;
            clockOffset: number;
        }[] = [];
        const SAMPLE_COUNT = 10;

        for (let i = 0; i < SAMPLE_COUNT; i++) {
            try {
                const clientSendTime = Date.now();
                const perfStart = performance.now();
                
                const response = await fetch('/api/time-sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientSendTime }),
                });
                
                const clientReceiveTime = Date.now();
                const perfEnd = performance.now();
                const data: TimeSyncResponse = await response.json();
                
                // Calculate RTT
                const rtt = perfEnd - perfStart;
                
                // Calculate asymmetric latencies
                // Upload = time for request to reach server
                // We need clock offset first, but we can estimate:
                // If clocks were synchronized:
                //   uploadLatency = serverReceiveTime - clientSendTime
                //   downloadLatency = clientReceiveTime - serverResponseTime
                // 
                // With unknown clock offset (Δ = server - client):
                //   serverReceiveTime = clientSendTime + uploadLatency + Δ
                //   clientReceiveTime = serverResponseTime + downloadLatency - Δ
                //
                // Sum: RTT = uploadLatency + downloadLatency + serverProcessing
                // We can also calculate:
                //   θ = ((serverReceiveTime - clientSendTime) - (clientReceiveTime - serverResponseTime)) / 2
                //   This is the NTP clock offset formula
                
                const t1 = clientSendTime;
                const t2 = data.serverReceiveTime;
                const t3 = data.serverResponseTime;
                const t4 = clientReceiveTime;
                
                // NTP-style offset calculation
                const clockOffset = ((t2 - t1) + (t3 - t4)) / 2;
                
                // Calculate one-way latencies (corrected for clock offset)
                const uploadEst = (t2 - t1) - clockOffset;
                const downloadEst = (t4 - t3) + clockOffset;
                
                // Only keep valid samples (positive latencies, reasonable RTT)
                if (uploadEst > 0 && downloadEst > 0 && rtt < 500) {
                    samples.push({ rtt, uploadEst, downloadEst, clockOffset });
                }

                await new Promise(r => setTimeout(r, 100));
            } catch (error) {
                console.warn('[AsymmetricLatency] Sample failed:', error);
            }
        }

        if (samples.length === 0) {
            console.warn('[AsymmetricLatency] No valid samples, falling back to symmetric');
            return null;
        }

        // Use median for robustness
        samples.sort((a, b) => a.rtt - b.rtt);
        const medianIdx = Math.floor(samples.length / 2);
        const medianSample = samples[medianIdx];
        
        // Calculate statistics
        const avgRTT = samples.reduce((a, b) => a + b.rtt, 0) / samples.length;
        const variance = samples.reduce((a, b) => a + Math.pow(b.rtt - avgRTT, 2), 0) / samples.length;
        const jitter = Math.sqrt(variance);
        
        // Average asymmetric latencies
        const avgUpload = samples.reduce((a, b) => a + b.uploadEst, 0) / samples.length;
        const avgDownload = samples.reduce((a, b) => a + b.downloadEst, 0) / samples.length;

        console.log(`[AsymmetricLatency] Samples: ${samples.length}, ` +
                    `Upload: ${avgUpload.toFixed(1)}ms, Download: ${avgDownload.toFixed(1)}ms, ` +
                    `Asymmetry: ${((avgUpload / avgDownload) * 100 - 100).toFixed(0)}%`);

        return {
            rtt: avgRTT,
            jitter,
            uploadLatency: avgUpload,
            downloadLatency: avgDownload,
            clockOffset: medianSample.clockOffset,
        };
    }, []);

    // 2. Fallback: Measure Network using Ably (symmetric assumption)
    const measureNetworkAbly = useCallback(async (ablyClient: Ably.Realtime) => {
        const pings: number[] = [];
        const offsets: number[] = [];
        const PING_COUNT = 10;

        for (let i = 0; i < PING_COUNT; i++) {
            const start = performance.now();
            const serverTime = await ablyClient.time();
            const end = performance.now();
            const rtt = end - start;
            const localTime = Date.now();
            
            pings.push(rtt);
            
            // Symmetric assumption: one-way = RTT/2
            const estimatedServerTimeAtRequest = serverTime - (rtt / 2);
            const offset = estimatedServerTimeAtRequest - localTime;
            offsets.push(offset);

            await new Promise(r => setTimeout(r, 50));
        }

        const avgRTT = pings.reduce((a, b) => a + b, 0) / pings.length;
        const minRTT = Math.min(...pings);
        const bestPingIndex = pings.indexOf(minRTT);
        const bestOffset = offsets[bestPingIndex];
        
        const variance = pings.reduce((a, b) => a + Math.pow(b - avgRTT, 2), 0) / pings.length;
        const jitter = Math.sqrt(variance);

        return { 
            rtt: avgRTT, 
            jitter, 
            bestOffset,
            uploadLatency: avgRTT / 2,  // Symmetric fallback
            downloadLatency: avgRTT / 2,
        };
    }, []);

    // 3. Measure System Jitter (Event Loop Lag)
    const measureJitter = useCallback(async () => {
        const SAMPLES = 50;
        let totalLag = 0;

        for (let i = 0; i < SAMPLES; i++) {
            const start = performance.now();
            await new Promise(r => setTimeout(r, 10));
            const end = performance.now();
            const actual = end - start;
            totalLag += (actual - 10);
        }
        
        return totalLag / SAMPLES;
    }, []);

    // 4. Measure FPS
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

    const runCalibration = useCallback(async (ablyClient: Ably.Realtime, videoElement?: HTMLVideoElement) => {
        setIsCalibrating(true);
        try {
            // Try asymmetric measurement first, fall back to Ably
            const [asymmetricStats, systemLag] = await Promise.all([
                measureAsymmetricLatency(),
                measureJitter()
            ]);

            let netStats;
            if (asymmetricStats) {
                netStats = asymmetricStats;
                console.log('[Calibration] Using asymmetric latency measurement');
            } else {
                netStats = await measureNetworkAbly(ablyClient);
                console.log('[Calibration] Falling back to symmetric (Ably) measurement');
            }

            let fpsStats = { fps: 0, frameDuration: 0 };
            if (videoElement) {
                fpsStats = await measureFPS(videoElement);
            }

            setStats({
                networkOffset: asymmetricStats?.clockOffset ?? 0,
                networkRTT: netStats.rtt,
                networkJitter: netStats.jitter,
                uploadLatency: netStats.uploadLatency,
                downloadLatency: netStats.downloadLatency,
                systemLag,
                fps: fpsStats.fps,
                frameDuration: fpsStats.frameDuration,
                isCalibrated: true
            });

            console.log(`[Calibration] Complete - RTT: ${netStats.rtt.toFixed(1)}ms, ` +
                        `Upload: ${netStats.uploadLatency.toFixed(1)}ms, ` +
                        `Download: ${netStats.downloadLatency.toFixed(1)}ms`);

        } catch (error) {
            console.error("Calibration failed", error);
        } finally {
            setIsCalibrating(false);
        }
    }, [measureAsymmetricLatency, measureNetworkAbly, measureJitter, measureFPS]);

    return {
        stats,
        isCalibrating,
        runCalibration
    };
};
