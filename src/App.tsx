import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import CatViewer from "./components/CatViewer";
import CameraView from "./components/fitness/CameraView";
import { useCamera } from "./hooks/useCamera";
import { usePoseDetection } from "./hooks/usePoseDetection";
import {
  classifyBoxingMove,
  scorePose,
  type BoxingMove,
  type Landmark,
  MOVE_LABELS,
} from "./utils/pose-classifier";
import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import "./styles/cat.css";
import "./styles/fitness.css";

type CatState = "idle" | "walking" | "sleeping" | "excited" | "training";
type AppView = "cat" | "training";

function App() {
  const [catState, setCatState] = useState<CatState>("idle");
  const [catFood, setCatFood] = useState(0);
  const [agility] = useState(10);
  const [message, setMessage] = useState("🐱 Meow! Welcome to BoxingCat!");
  const [view, setView] = useState<AppView>("cat");

  // ── Training state ──────────────────────────────────────────────────
  const [isTraining, setIsTraining] = useState(false);
  const [currentMove, setCurrentMove] = useState<BoxingMove>("idle");
  const [totalScore, setTotalScore] = useState(0);
  const [combo, setCombo] = useState<BoxingMove[]>([]);
  const [poseResult, setPoseResult] = useState<PoseLandmarkerResult | null>(null);
  const prevLandmarksRef = useRef<Landmark[] | null>(null);

  // Camera
  const { videoRef, isReady: camReady, error: camError, startCamera, stopCamera } = useCamera();

  // Pose detection callback
  const onLandmarks = useCallback(
    (result: PoseLandmarkerResult) => {
      setPoseResult(result);

      if (!isTraining) return;

      const landmarks = result.landmarks[0];
      if (!landmarks || landmarks.length < 17) return;

      // Cast to our Landmark type
      const currentLandmarks = landmarks as unknown as Landmark[];
      const prev = prevLandmarksRef.current;

      const move = classifyBoxingMove(currentLandmarks, prev);
      setCurrentMove(move);

      if (move !== "idle") {
        const { poseScore, powerScore } = scorePose(currentLandmarks, move);
        const frameScore = Math.round((poseScore + powerScore) / 2);
        setTotalScore((s) => s + frameScore);

        // Accumulate cat food every ~30 score points
        if ((totalScore + frameScore) % 30 < frameScore) {
          setCatFood((f) => f + 1);
          setMessage(`🥊 ${MOVE_LABELS[move]}! +1 Cat Food!`);
        }

        // Track combo
        setCombo((prev) => {
          const next = [...prev, move];
          return next.length > 12 ? next.slice(-12) : next;
        });
      }

      prevLandmarksRef.current = currentLandmarks;
    },
    [isTraining, totalScore]
  );

  const { startDetection, stopDetection } = usePoseDetection(onLandmarks);

  // ── Training flow ───────────────────────────────────────────────────

  const handleStartTraining = useCallback(async () => {
    await startCamera();
    setView("training");
    setCatState("training");
    setCurrentMove("idle");
    setTotalScore(0);
    setCombo([]);
    setIsTraining(true);
    setMessage("🥊 Let's box! Follow the rhythm!");

    // Wait for video to be ready then start detection
    setTimeout(() => {
      if (videoRef.current) {
        startDetection(videoRef.current);
      }
    }, 1000);
  }, [startCamera, startDetection, videoRef]);

  const handleStopTraining = useCallback(() => {
    stopDetection();
    stopCamera();
    setIsTraining(false);
    setView("cat");
    setCatState("idle");
    setCurrentMove("idle");
    setMessage(`🏆 Session done! Score: ${totalScore}`);
  }, [stopDetection, stopCamera, totalScore]);

  // ── Cat interaction ─────────────────────────────────────────────────

  const handleCatClick = useCallback(() => {
    if (view !== "cat") return;
    setCatState("excited");
    setCatFood((f) => f + 1);
    setMessage("🐱 Meow! +1 Cat Food!");
    setTimeout(() => setCatState("idle"), 2000);
  }, [view]);

  const handleTestBackend = useCallback(async () => {
    try {
      const result = await invoke<string>("greet", { name: "BoxingCat" });
      setMessage(result);
    } catch {
      setMessage("Backend not ready");
    }
  }, []);

  // Auto-idle animation
  useEffect(() => {
    if (isTraining) return;
    const interval = setInterval(() => {
      setCatState((prev) => {
        if (prev === "sleeping") return prev;
        const rand = Math.random();
        if (rand < 0.3) return "walking";
        if (rand < 0.5) return "idle";
        if (rand < 0.6) return "excited";
        return prev;
      });
      setTimeout(() => setCatState((prev) => (prev !== "sleeping" ? "idle" : prev)), 3000);
    }, 10000);
    return () => clearInterval(interval);
  }, [isTraining]);

  return (
    <div className="app-container">
      {view === "cat" && (
        <>
          <CatViewer state={catState} onClick={handleCatClick} message={message} />
          <div className="hud">
            <span className="hud-item">🍖 {catFood}</span>
            <span className="hud-item">⚡ {agility}</span>
          </div>
        </>
      )}

      {view === "training" && (
        <div className="training-view">
          <CameraView
            videoRef={videoRef}
            isReady={camReady}
            poseResult={poseResult}
            onStart={handleStartTraining}
            onStop={handleStopTraining}
            isTraining={isTraining}
          />

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
          </div>

          {/* Combo feed */}
          <div className="combo-feed">
            {combo.map((m, i) => (
              <span key={i} className="combo-item">{MOVE_LABELS[m]}</span>
            ))}
          </div>

          {camError && <p style={{ color: "#ff6666", fontSize: 12 }}>{camError}</p>}
        </div>
      )}

      {/* View toggle */}
      <div className="dev-controls">
        <button onClick={() => setView(view === "cat" ? "training" : "cat")}>
          {view === "cat" ? "🥊 Training" : "🐱 Cat"}
        </button>
        {view === "training" && (
          <button onClick={isTraining ? handleStopTraining : handleStartTraining}>
            {isTraining ? "⏹️ Stop" : "▶️ Start"}
          </button>
        )}
        <button onClick={() => setCatState("idle")}>Idle</button>
        <button onClick={() => setCatState("walking")}>Walk</button>
        <button onClick={handleTestBackend}>Test</button>
      </div>
    </div>
  );
}

export default App;
