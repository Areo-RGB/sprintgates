import { useState, useCallback, useRef, useEffect } from 'react';

export interface GPSTimeState {
    isAvailable: boolean;       // GPS time source is available
    isActive: boolean;          // Currently using GPS time
    gpsOffset: number;          // Offset between GPS time and local time (ms)
    accuracy: number;           // GPS position accuracy (meters)
    lastUpdate: number | null;  // When GPS time was last updated
    error: string | null;       // Error message if GPS unavailable
}

interface GPSTimeSample {
    gpsTimestamp: number;       // GPS-synchronized timestamp from Geolocation API
    localTimestamp: number;     // Local Date.now() at same moment
    accuracy: number;           // Position accuracy (meters)
}

/**
 * GPS Time Sync Hook
 * 
 * Uses the Geolocation API with high accuracy mode to obtain GPS-synchronized
 * timestamps. On Android devices with GPS hardware, this provides sub-millisecond
 * accurate time by leveraging the GPS satellite atomic clocks.
 * 
 * Usage:
 * - Call startGPSSync() to begin GPS time acquisition
 * - gpsOffset = gpsTimestamp - localTimestamp
 * - True time = Date.now() + gpsOffset
 */
export const useGPSTime = () => {
    const [state, setState] = useState<GPSTimeState>({
        isAvailable: false,
        isActive: false,
        gpsOffset: 0,
        accuracy: 0,
        lastUpdate: null,
        error: null,
    });

    const watchIdRef = useRef<number | null>(null);
    const samplesRef = useRef<GPSTimeSample[]>([]);
    const isWatchingRef = useRef(false);

    // Process a GPS position update
    const handlePosition = useCallback((position: GeolocationPosition) => {
        const localTimestamp = Date.now();
        const gpsTimestamp = position.timestamp;
        const accuracy = position.coords.accuracy;

        const sample: GPSTimeSample = {
            gpsTimestamp,
            localTimestamp,
            accuracy,
        };

        // Keep last 10 samples
        samplesRef.current.push(sample);
        if (samplesRef.current.length > 10) {
            samplesRef.current.shift();
        }

        // Calculate offset from best sample (lowest accuracy = best GPS fix)
        const bestSample = samplesRef.current.reduce((best, current) => 
            current.accuracy < best.accuracy ? current : best
        );

        const gpsOffset = bestSample.gpsTimestamp - bestSample.localTimestamp;

        // Calculate average offset for stability
        const avgOffset = samplesRef.current.reduce((sum, s) => 
            sum + (s.gpsTimestamp - s.localTimestamp), 0
        ) / samplesRef.current.length;

        setState({
            isAvailable: true,
            isActive: true,
            gpsOffset: avgOffset,  // Use average for stability
            accuracy: bestSample.accuracy,
            lastUpdate: Date.now(),
            error: null,
        });

        console.log(`[GPSTime] Offset: ${avgOffset.toFixed(1)}ms, Accuracy: ${accuracy.toFixed(1)}m, Samples: ${samplesRef.current.length}`);
    }, []);

    // Handle GPS errors
    const handleError = useCallback((error: GeolocationPositionError) => {
        let errorMessage: string;
        switch (error.code) {
            case error.PERMISSION_DENIED:
                errorMessage = 'Location permission denied';
                break;
            case error.POSITION_UNAVAILABLE:
                errorMessage = 'GPS position unavailable';
                break;
            case error.TIMEOUT:
                errorMessage = 'GPS timeout - no satellite fix';
                break;
            default:
                errorMessage = `GPS error: ${error.message}`;
        }

        console.warn(`[GPSTime] ${errorMessage}`);
        setState(prev => ({
            ...prev,
            isActive: false,
            error: errorMessage,
        }));
    }, []);

    // Start GPS time synchronization
    const startGPSSync = useCallback(() => {
        if (!navigator.geolocation) {
            setState(prev => ({
                ...prev,
                isAvailable: false,
                error: 'Geolocation API not available',
            }));
            return;
        }

        if (isWatchingRef.current) {
            console.log('[GPSTime] Already watching');
            return;
        }

        console.log('[GPSTime] Starting GPS time sync...');
        isWatchingRef.current = true;
        samplesRef.current = [];

        // Use watchPosition for continuous updates
        watchIdRef.current = navigator.geolocation.watchPosition(
            handlePosition,
            handleError,
            {
                enableHighAccuracy: true,  // Required for GPS (not WiFi/cell)
                timeout: 30000,            // 30 second timeout for GPS fix
                maximumAge: 0,             // Always get fresh reading
            }
        );

        setState(prev => ({
            ...prev,
            isAvailable: true,
            error: null,
        }));
    }, [handlePosition, handleError]);

    // Stop GPS time synchronization
    const stopGPSSync = useCallback(() => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        isWatchingRef.current = false;
        
        setState(prev => ({
            ...prev,
            isActive: false,
        }));
        
        console.log('[GPSTime] Stopped GPS time sync');
    }, []);

    // Get a single GPS time sample (for calibration)
    const getGPSTimeSample = useCallback((): Promise<GPSTimeSample | null> => {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve(null);
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        gpsTimestamp: position.timestamp,
                        localTimestamp: Date.now(),
                        accuracy: position.coords.accuracy,
                    });
                },
                () => {
                    resolve(null);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0,
                }
            );
        });
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
    }, []);

    return {
        ...state,
        startGPSSync,
        stopGPSSync,
        getGPSTimeSample,
    };
};
