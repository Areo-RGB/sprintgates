'use client';
import { useEffect } from 'react';

const WakeLock = () => {
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      // Only request wake lock if page is visible
      if (document.visibilityState !== 'visible') {
        return;
      }
      
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          console.log('Wake Lock is active!');
        }
      } catch (err: any) {
        // NotAllowedError is expected when page isn't visible - ignore silently
        if (err.name !== 'NotAllowedError') {
          console.error(`WakeLock error: ${err.name}, ${err.message}`);
        }
      }
    };

    requestWakeLock();

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // Re-acquire wake lock when page becomes visible
        await requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (wakeLock) wakeLock.release();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null;
};

export default WakeLock;
