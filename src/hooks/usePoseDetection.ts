import { useRef, useCallback, useEffect } from "react";
import {
  PoseLandmarker,
  FilesetResolver,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

type LandmarkCallback = (result: PoseLandmarkerResult) => void;

export function usePoseDetection(onLandmarks: LandmarkCallback) {
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const animFrameRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Load MediaPipe model once
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      if (cancelled) return;

      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      if (!cancelled) {
        landmarkerRef.current = landmarker;
      }
    }

    init();

    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
    };
  }, []);

  // Detection loop
  const startDetection = useCallback(
    (video: HTMLVideoElement) => {
      videoRef.current = video;

      const detect = () => {
        const lm = landmarkerRef.current;
        const v = videoRef.current;
        if (!lm || !v || v.readyState < 2) {
          animFrameRef.current = requestAnimationFrame(detect);
          return;
        }

        const result = lm.detectForVideo(v, performance.now());
        if (result.landmarks.length > 0) {
          onLandmarks(result);
        }

        animFrameRef.current = requestAnimationFrame(detect);
      };

      detect();
    },
    [onLandmarks]
  );

  const stopDetection = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
  }, []);

  return { startDetection, stopDetection, isModelReady: !!landmarkerRef.current };
}
