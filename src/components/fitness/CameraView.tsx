import { useRef, useEffect } from "react";
import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { drawSkeleton } from "./PoseOverlay";

interface CameraViewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isReady: boolean;
  poseResult: PoseLandmarkerResult | null;
  onStart: () => void;
  onStop: () => void;
  isTraining: boolean;
}

export default function CameraView({
  videoRef,
  isReady,
  poseResult,
  onStart,
  onStop,
  isTraining,
}: CameraViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !poseResult) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (poseResult.landmarks.length > 0) {
      drawSkeleton(ctx, poseResult.landmarks[0], canvas.width, canvas.height);
    }
  }, [poseResult, videoRef]);

  return (
    <div className="camera-container">
      <video
        ref={videoRef}
        playsInline
        muted
        className="camera-video-hidden"
      />
      <canvas ref={canvasRef} className="pose-canvas" />
      <button
        className="camera-btn"
        onClick={isTraining ? onStop : onStart}
      >
        {isTraining ? "⏹️ Stop" : "📷 Start Training"}
      </button>
      {!isReady && !isTraining && (
        <p className="camera-hint">Click to start boxing training</p>
      )}
    </div>
  );
}
