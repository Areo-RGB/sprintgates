import { useCallback } from 'react';

const BEEP_URL = 'https://video-idea.fra1.cdn.digitaloceanspaces.com/beeps/beep-short.mp3';
const START_SOUND_URL = 'https://video-idea.fra1.cdn.digitaloceanspaces.com/beeps/start-sound-beep-102201.mp3';

export const useRaceAudio = () => {
    const playBeep = useCallback((url: string) => {
        const audio = new Audio(url);
        audio.volume = 0.2;
        audio.play().catch(err => {
            console.error('Failed to play beep sound:', err);
        });
    }, []);

    const playStart = useCallback(() => {
        playBeep(START_SOUND_URL);
    }, [playBeep]);

    const playSplit = useCallback(() => {
        playBeep(BEEP_URL);
    }, [playBeep]);

    const playFinish = useCallback(() => {
        playBeep(BEEP_URL);
    }, [playBeep]);

    return { playStart, playSplit, playFinish };
};
