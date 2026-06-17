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
  const animRef = useRef<number>(0);

  // Mirror video + draw skeleton every frame
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);

      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;

      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;

      const scale = Math.min(canvas.width / vw, canvas.height / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (canvas.width - dw) / 2;
      const dy = (canvas.height - dh) / 2;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw mirrored video feed
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, (canvas.width - dw) / 2, dy, dw, dh);
      ctx.restore();

      // Draw skeleton overlay (mirrored coordinates)
      const landmarks = poseResult?.landmarks;
      if (landmarks && landmarks.length > 0) {
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        drawSkeleton(ctx, landmarks[0], dw, dh, dx, dy);
        ctx.restore();
      }
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [poseResult, videoRef]);

  return (
    <div className="camera-container">
      {/* Hidden video element — MediaPipe input source */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="camera-video-hidden"
      />

      {/* Canvas: mirrored video + skeleton overlay */}
      <canvas ref={canvasRef} className="pose-canvas" />

      <button
        className="camera-btn"
        onClick={isTraining ? onStop : onStart}
      >
        {isTraining ? "⏹️ Stop Training" : "📷 Start Training"}
      </button>

      {!isReady && !isTraining && (
        <p className="camera-hint">
          📷 Click to allow camera access for boxing detection
        </p>
      )}
    </div>
  );
}
