import { useCallback, useRef } from 'react';

export const useRaceAudio = () => {
    const audioContextRef = useRef<AudioContext | null>(null);

    const getContext = () => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume();
        }
        return audioContextRef.current;
    };

    const playTone = useCallback((frequency: number, duration: number, type: OscillatorType = 'sine', vol = 0.1) => {
        const ctx = getContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, ctx.currentTime);
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.01); // Attack
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration); // Decay
        osc.stop(ctx.currentTime + duration);
    }, []);

    const playStart = useCallback(() => {
        const ctx = getContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1); // Chirp up
        
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
        osc.stop(ctx.currentTime + 0.1);
    }, []);

    const playSplit = useCallback(() => {
        playTone(660, 0.08, 'triangle', 0.1);
    }, [playTone]);

    const playFinish = useCallback(() => {
        // C Major Chord (C5, E5, G5)
        playTone(523.25, 0.4, 'sine', 0.1); // C5
        setTimeout(() => playTone(659.25, 0.4, 'sine', 0.1), 50); // E5
        setTimeout(() => playTone(783.99, 0.4, 'sine', 0.1), 100); // G5
        // High sparkle
        setTimeout(() => playTone(1046.50, 0.6, 'triangle', 0.05), 150); // C6
    }, [playTone]);

    return { playStart, playSplit, playFinish };
};
