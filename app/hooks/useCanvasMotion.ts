import { useEffect, useRef } from 'react';

// VideoFrameCallbackMetadata interface (Chrome/Android specific fields)
interface VideoFrameCallbackMetadata {
  presentationTime: number;      // When frame was presented (DOMHighResTimeStamp)
  expectedDisplayTime: number;   // Expected display time
  width: number;                 // Frame width
  height: number;                // Frame height
  mediaTime: number;             // Media timeline position
  presentedFrames: number;       // Frame counter
  processingDuration?: number;   // Processing time (optional)
  captureTime?: number;          // Hardware capture timestamp (Android Chrome)
  receiveTime?: number;          // When browser received frame (optional)
}

interface MotionMetadata {
  processingLatency: number;     // Time spent in our detection algorithm
  cameraLatency: number | null;  // Camera pipeline latency (null if unavailable)
}

interface UseCanvasMotionProps {
  onMotion: (delta: number, metadata?: MotionMetadata) => void;
  sensitivity: number;
  isArmed: boolean;
}

export const useCanvasMotion = ({ onMotion, sensitivity, isArmed }: UseCanvasMotionProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousFrameRef = useRef<Uint8ClampedArray | null>(null);
  const requestRef = useRef<number | undefined>(undefined);
  
  // Track camera latency for logging/debugging
  const cameraLatencyRef = useRef<number[]>([]);
  const lastLogTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!videoRef.current) return;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas'); // Off-screen canvas
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
      // Reset latency tracking when disarmed
      cameraLatencyRef.current = [];
      return;
    }

    const processFrame = (now: number, metadata: VideoFrameCallbackMetadata) => {
      // Start processing timer
      const processingStart = performance.now();

      if (!video || !canvasRef.current) return;

      const width = video.videoWidth;
      const height = video.videoHeight;

      if (width === 0 || height === 0) {
        requestRef.current = (video as any).requestVideoFrameCallback(processFrame);
        return;
      }

      // Configure canvas for tripwire region only (with padding)
      const stripWidth = 20;
      const stripPadding = 40; // Extra pixels on each side for safety
      const totalWidth = stripWidth + (stripPadding * 2);
      const stripX = Math.floor((width - stripWidth) / 2);
      const sourceX = Math.max(0, stripX - stripPadding);
      
      // Only resize canvas when needed
      if (canvasRef.current.width !== totalWidth || canvasRef.current.height !== height) {
        canvasRef.current.width = totalWidth;
        canvasRef.current.height = height;
        previousFrameRef.current = null; // Reset previous frame on resize
      }

      const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      // Draw ONLY the tripwire region (+ padding) from video - much faster!
      ctx.drawImage(
        video,
        sourceX, 0, totalWidth, height,  // Source: crop from video
        0, 0, totalWidth, height          // Dest: full canvas
      );

      // Extract the actual tripwire strip (center of our cropped region)
      try {
          const imageData = ctx.getImageData(stripPadding, 0, stripWidth, height);
          const data = imageData.data;
          
          let totalDelta = 0;
          let pixelCount = 0;

          if (previousFrameRef.current) {
              const prevData = previousFrameRef.current;
              
              // Compare with previous frame using green channel only
              // Sample every 4th row for speed (4x fewer iterations, negligible accuracy loss)
              const bytesPerRow = stripWidth * 4; // 20px * 4 bytes (RGBA)
              const rowSkip = 4; // Sample every 4th row
              
              for (let i = 0; i < data.length; i += bytesPerRow * rowSkip) {
                  // Sample a few pixels per row
                  for (let j = 0; j < bytesPerRow; j += 16) { // Every 4th pixel in row
                      const idx = i + j + 1; // +1 for green channel
                      if (idx < data.length) {
                          totalDelta += Math.abs(data[idx] - prevData[idx]);
                          pixelCount++;
                      }
                  }
              }
              
              const averageDelta = totalDelta / pixelCount;
              
              // End processing timer
              const processingEnd = performance.now();
              const processingLatency = processingEnd - processingStart;
              
              // Calculate camera pipeline latency from metadata
              let cameraLatency: number | null = null;
              
              if (metadata.captureTime !== undefined) {
                  // captureTime is a DOMHighResTimeStamp (same timebase as performance.now())
                  // Camera latency = when we received the frame - when it was captured
                  cameraLatency = now - metadata.captureTime;
                  
                  // Track for averaging/logging
                  cameraLatencyRef.current.push(cameraLatency);
                  if (cameraLatencyRef.current.length > 30) {
                      cameraLatencyRef.current.shift(); // Keep last 30 samples
                  }
                  
                  // Log average every 5 seconds
                  if (processingEnd - lastLogTimeRef.current > 5000 && cameraLatencyRef.current.length > 0) {
                      const avgLatency = cameraLatencyRef.current.reduce((a, b) => a + b, 0) / cameraLatencyRef.current.length;
                      console.log(`[CameraLatency] Avg: ${avgLatency.toFixed(1)}ms (${cameraLatencyRef.current.length} samples)`);
                      lastLogTimeRef.current = processingEnd;
                  }
              }
              
              onMotion(averageDelta, { processingLatency, cameraLatency });
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
