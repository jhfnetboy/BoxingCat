import { useState, useRef, useCallback } from "react";

interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  isReady: boolean;
  error: string | null;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
}

export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);

      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError(
          "📷 Camera not available. On macOS, grant camera permission in System Settings > Privacy > Camera. Then restart the app."
        );
        return;
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });

      streamRef.current = mediaStream;

      // Wait for video element to be ready
      if (!videoRef.current) {
        // No video element yet — MediaPipe will use hidden video
        setIsReady(true);
        return;
      }
      videoRef.current.srcObject = mediaStream;
      await videoRef.current.play();

      setIsReady(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("NotAllowed") || msg.includes("Permission")) {
        setError(
          "📷 Camera permission denied. Please allow camera access in:\n" +
          "macOS: System Settings > Privacy & Security > Camera > BoxingCat\n" +
          "Then restart the app."
        );
      } else if (msg.includes("NotFound") || msg.includes("no devices")) {
        setError("📷 No camera found. Please connect a webcam.");
      } else {
        setError(`📷 Camera error: ${msg}`);
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setIsReady(false);
    }
  }, []);

  return { videoRef, stream: streamRef.current, isReady, error, startCamera, stopCamera };
}
