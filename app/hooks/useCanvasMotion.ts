import { useEffect, useRef, useState } from 'react';

interface UseCanvasMotionProps {
  onMotion: (delta: number) => void;
  sensitivity: number;
  isArmed: boolean;
}

export const useCanvasMotion = ({ onMotion, sensitivity, isArmed }: UseCanvasMotionProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousFrameRef = useRef<Uint8ClampedArray | null>(null);
  const requestRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!videoRef.current) return;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isArmed) {
      if (requestRef.current) {
        if (video && 'cancelVideoFrameCallback' in video) {
            (video as any).cancelVideoFrameCallback(requestRef.current);
        }
      }
      return;
    }

    const processFrame = () => {
      if (!video || !canvasRef.current) return;

      const width = video.videoWidth;
      const height = video.videoHeight;

      if (width === 0 || height === 0) {
        requestRef.current = (video as any).requestVideoFrameCallback(processFrame);
        return;
      }

      // Configure canvas if needed
      if (canvasRef.current.width !== width || canvasRef.current.height !== height) {
        canvasRef.current.width = width;
        canvasRef.current.height = height;
        previousFrameRef.current = null; // Reset previous frame on resize
      }

      const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      // Draw current frame to canvas
      ctx.drawImage(video, 0, 0, width, height);

      // Analyze vertical strip in center (20px wide)
      const stripWidth = 20;
      const stripX = Math.floor((width - stripWidth) / 2);
      
      try {
          const imageData = ctx.getImageData(stripX, 0, stripWidth, height);
          const data = imageData.data;
          
          let totalDelta = 0;
          let pixelCount = 0;

          if (previousFrameRef.current) {
              const prevData = previousFrameRef.current;
              
              // Compare with previous frame
              for (let i = 0; i < data.length; i += 4) {
                  // Grayscale conversion: 0.299*R + 0.587*G + 0.114*B
                  const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                  const prevGray = 0.299 * prevData[i] + 0.587 * prevData[i + 1] + 0.114 * prevData[i + 2];
                  
                  totalDelta += Math.abs(gray - prevGray);
                  pixelCount++;
              }
              
              const averageDelta = totalDelta / pixelCount;
              onMotion(averageDelta);
          }

          // Store current frame for next comparison
          // We need to copy the data, otherwise we just store a reference to the changing canvas buffer
          previousFrameRef.current = new Uint8ClampedArray(data);

      } catch (e) {
          console.error("Error processing frame", e);
      }

      requestRef.current = (video as any).requestVideoFrameCallback(processFrame);
    };

    requestRef.current = (video as any).requestVideoFrameCallback(processFrame);

    return () => {
      if (requestRef.current && video) {
          (video as any).cancelVideoFrameCallback(requestRef.current);
      }
    };
  }, [isArmed, onMotion]); // Sensitivity is handled by the consumer of onMotion usually, or we can gate it here

  return { videoRef };
};
