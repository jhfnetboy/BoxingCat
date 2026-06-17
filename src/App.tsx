/// <reference types="vite/client" />

import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import CatViewer from "./components/CatViewer";
import CameraView from "./components/fitness/CameraView";
import Tutorial from "./components/fitness/Tutorial";
import { useCamera } from "./hooks/useCamera";
import { usePoseDetection } from "./hooks/usePoseDetection";
import {
  classifyBoxingMove,
  scorePose,
  velocity,
  angle3,
  type BoxingMove,
  type Landmark,
  MOVE_LABELS,
} from "./utils/pose-classifier";
import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import "./styles/cat.css";
import "./styles/fitness.css";

type CatState = "idle" | "walking" | "sleeping" | "excited" | "training";

function App() {
  // ── Window detection ─────────────────────────────────────────────────
  const [isTrainingWindow, setIsTrainingWindow] = useState(false);
  useEffect(() => {
    try {
      const w = getCurrentWindow();
      setIsTrainingWindow(w.label === "training");
    } catch {
      // Running in browser (pnpm dev without Tauri)
    }
  }, []);

  // ── Shared state ─────────────────────────────────────────────────────
  const [catState, setCatState] = useState<CatState>("idle");
  const [catFood, setCatFood] = useState(0);
  const [agility] = useState(10);
  const [message, setMessage] = useState("🐱 Meow! Welcome to BoxingCat!");

  // ── Training state ──────────────────────────────────────────────────
  const [isTraining, setIsTraining] = useState(false);
  const [currentMove, setCurrentMove] = useState<BoxingMove>("idle");
  const [totalScore, setTotalScore] = useState(0);
  const [combo, setCombo] = useState<BoxingMove[]>([]);
  const [poseResult, setPoseResult] = useState<PoseLandmarkerResult | null>(null);
  const [showTutorial, setShowTutorial] = useState(true);
  const prevLandmarksRef = useRef<Landmark[] | null>(null);
  const punchCountRef = useRef(0);
  const [debug, setDebug] = useState({
    move: "idle" as string,
    rightVel: 0, leftVel: 0,
    rightAngle: 0, leftAngle: 0,
    frameScore: 0, punchCount: 0,
  });

  // Camera + Pose (only used in training window)
  const { videoRef, isReady: camReady, error: camError, startCamera, stopCamera } = useCamera();

  const onLandmarks = useCallback(
    (result: PoseLandmarkerResult) => {
      setPoseResult(result);
      if (!isTraining) return;

      const landmarks = result.landmarks[0];
      if (!landmarks || landmarks.length < 17) return;

      const currentLandmarks = landmarks as unknown as Landmark[];
      const prev = prevLandmarksRef.current;
      const move = classifyBoxingMove(currentLandmarks, prev);
      setCurrentMove(move);

      const rWrist = currentLandmarks[16];
      const lWrist = currentLandmarks[15];
      const rightVel = prev ? velocity(prev[16], rWrist) : 0;
      const leftVel = prev ? velocity(prev[15], lWrist) : 0;
      const rightAngle = angle3(currentLandmarks[12], currentLandmarks[14], rWrist);
      const leftAngle = angle3(currentLandmarks[11], currentLandmarks[13], lWrist);

      const { poseScore, powerScore } = scorePose(currentLandmarks, move);
      const frameScore = move !== "idle" ? Math.round((poseScore + powerScore) / 2) : 0;
      setTotalScore((s) => s + frameScore);

      if (frameScore > 20) {
        punchCountRef.current++;
        const p = punchCountRef.current;
        if (p % 10 === 0) {
          setCatFood((f) => f + 1);
          setMessage(`🥊 10 punches! +1 🍖`);
        }
        setCombo((prev) => {
          const next = [...prev, move];
          return next.length > 12 ? next.slice(-12) : next;
        });
        setDebug({ move, rightVel, leftVel, rightAngle, leftAngle, frameScore, punchCount: p });
      } else {
        setDebug({ move, rightVel, leftVel, rightAngle, leftAngle, frameScore, punchCount: punchCountRef.current });
      }

      prevLandmarksRef.current = currentLandmarks;
    },
    [isTraining],
  );

  const { startDetection, stopDetection } = usePoseDetection(onLandmarks);

  // ── Training flow ───────────────────────────────────────────────────

  const handleStartTraining = useCallback(async () => {
    await startCamera();
    setIsTraining(true);
    setCurrentMove("idle");
    setTotalScore(0);
    setCombo([]);
    punchCountRef.current = 0;
    setMessage("🥊 Let's box! Follow the rhythm!");
    setTimeout(() => {
      if (videoRef.current) startDetection(videoRef.current);
    }, 1000);
  }, [startCamera, startDetection, videoRef]);

  const handleStopTraining = useCallback(() => {
    stopDetection();
    stopCamera();
    setIsTraining(false);
    setCatState("idle");
    setCurrentMove("idle");
    setMessage(`🏆 Done! Score: ${totalScore} | Punches: ${punchCountRef.current}`);
  }, [stopDetection, stopCamera, totalScore]);

  // ── Window actions ──────────────────────────────────────────────────

  const handleOpenTraining = useCallback(async () => {
    try {
      await invoke("open_training_window");
    } catch (e) {
      console.error("Failed to open training window:", e);
    }
  }, []);

  const handleCloseTraining = useCallback(async () => {
    handleStopTraining();
    try {
      await invoke("close_training_window");
    } catch { /* ignore */ }
  }, [handleStopTraining]);

  const handleQuit = useCallback(async () => {
    try { await invoke("hide_main_window"); } catch { /* */ }
  }, []);

  // ── Cat interaction ─────────────────────────────────────────────────

  const handleCatClick = useCallback(() => {
    setCatState("excited");
    setCatFood((f) => f + 1);
    setMessage("🐱 Meow! +1 Cat Food!");
    setTimeout(() => setCatState("idle"), 2000);
  }, []);

  const handleTestBackend = useCallback(async () => {
    try {
      const result = await invoke<string>("greet", { name: "BoxingCat" });
      setMessage(result);
    } catch { setMessage("Backend not ready"); }
  }, []);

  // Auto-idle animation
  useEffect(() => {
    const interval = setInterval(() => {
      setCatState((prev) => {
        if (prev === "sleeping") return prev;
        const rand = Math.random();
        if (rand < 0.3) return "walking";
        if (rand < 0.5) return "idle";
        if (rand < 0.6) return "excited";
        return prev;
      });
      setTimeout(() => setCatState((p) => (p !== "sleeping" ? "idle" : p)), 3000);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // ── RENDER ───────────────────────────────────────────────────────────

  // ─── TRAINING WINDOW ─────────────────────────────────────────────────
  if (isTrainingWindow) {
    return (
      <div className="training-window">
        <div className="tw-header">
          <h2>🥊 Boxing Training</h2>
          <button className="tw-close-btn" onClick={handleCloseTraining}>
            ✕ Close
          </button>
        </div>

        <div className="tw-body">
          {/* Left: Camera + Controls */}
          <div className="tw-left">
            <CameraView
              videoRef={videoRef}
              isReady={camReady}
              poseResult={poseResult}
              onStart={handleStartTraining}
              onStop={handleStopTraining}
              isTraining={isTraining}
            />
            {camError && <p className="cam-err">{camError}</p>}

            {/* Training HUD */}
            <div className="training-hud">
              <div className="training-stat">
                <span className="training-stat-value">{totalScore}</span>
                <span className="training-stat-label">Score</span>
              </div>
              <div className="move-indicator">{MOVE_LABELS[currentMove]}</div>
              <div className="training-stat">
                <span className="training-stat-value">{catFood}</span>
                <span className="training-stat-label">Cat Food</span>
              </div>
              <div className="training-stat">
                <span className="training-stat-value">{debug.punchCount}</span>
                <span className="training-stat-label">Punches</span>
              </div>
            </div>

            {/* Combo feed */}
            <div className="combo-feed">
              {combo.map((m, i) => (
                <span key={i} className="combo-item">{MOVE_LABELS[m]}</span>
              ))}
            </div>
          </div>

          {/* Right: Debug + Tutorial */}
          <div className="tw-right">
            <button className="tutorial-toggle" onClick={() => setShowTutorial((v) => !v)}>
              {showTutorial ? "✕ Hide Tutorial" : "📖 Tutorial / 教程"}
            </button>
            {showTutorial && <Tutorial />}

            {/* Debug Panel */}
            <div className="debug-panel">
              <div className="debug-title">🔍 Live Detection</div>
              <div className="debug-grid">
                <span>Move:</span><span className={debug.move !== "idle" ? "debug-hit" : ""}>{debug.move}</span>
                <span>Score/frame:</span><span>{debug.frameScore}</span>
                <span>R-Wrist vel:</span><span>{debug.rightVel.toFixed(4)}</span>
                <span>L-Wrist vel:</span><span>{debug.leftVel.toFixed(4)}</span>
                <span>R-Arm angle:</span><span>{Math.round(debug.rightAngle)}°</span>
                <span>L-Arm angle:</span><span>{Math.round(debug.leftAngle)}°</span>
                <span>Punch count:</span><span>{debug.punchCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── CAT WINDOW (main) ───────────────────────────────────────────────
  return (
    <div className="app-container">
      <button className="close-btn" onClick={handleQuit} title="Close / 关闭">
        ✕
      </button>
      <CatViewer state={catState} onClick={handleCatClick} message={message} />
      <div className="hud">
        <span className="hud-item">🍖 {catFood}</span>
        <span className="hud-item">⚡ {agility}</span>
      </div>
      <div className="dev-controls">
        <button onClick={handleOpenTraining}>🥊 Training</button>
        <button onClick={() => setCatState("idle")}>Idle</button>
        <button onClick={() => setCatState("walking")}>Walk</button>
        <button onClick={() => setCatState("excited")}>Excited</button>
        <button onClick={handleTestBackend}>Test</button>
      </div>
    </div>
  );
}

export default App;
