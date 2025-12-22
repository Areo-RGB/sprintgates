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

    const playTone = useCallback((frequency: number, duration: number, type: OscillatorType = 'sine') => {
        const ctx = getContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, ctx.currentTime);
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + duration);
        osc.stop(ctx.currentTime + duration);
    }, []);

    const playStart = useCallback(() => playTone(880, 0.1), [playTone]); // High Pip
    const playSplit = useCallback(() => playTone(440, 0.1, 'square'), [playTone]); // Mid Boop
    const playFinish = useCallback(() => {
        playTone(600, 0.1);
        setTimeout(() => playTone(800, 0.2), 150);
    }, [playTone]);

    return { playStart, playSplit, playFinish };
};
