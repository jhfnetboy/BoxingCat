import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
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
type AppView = "cat" | "training";

function App() {
  const [catState, setCatState] = useState<CatState>("idle");
  const [catFood, setCatFood] = useState(0);
  const [agility] = useState(10);
  const [message, setMessage] = useState("🐱 Meow! Welcome to BoxingCat!");
  const [view, setView] = useState<AppView>("cat");
  const [showTutorial, setShowTutorial] = useState(false);

  // ── Training state ──────────────────────────────────────────────────
  const [isTraining, setIsTraining] = useState(false);
  const [currentMove, setCurrentMove] = useState<BoxingMove>("idle");
  const [totalScore, setTotalScore] = useState(0);
  const [combo, setCombo] = useState<BoxingMove[]>([]);
  const [poseResult, setPoseResult] = useState<PoseLandmarkerResult | null>(null);
  const prevLandmarksRef = useRef<Landmark[] | null>(null);
  const punchCountRef = useRef(0);
  // Debug state — raw detection values
  const [debug, setDebug] = useState({
    move: "idle" as string,
    rightVel: 0,
    leftVel: 0,
    rightAngle: 0,
    leftAngle: 0,
    frameScore: 0,
    punchCount: 0,
  });

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

      // Calculate raw metrics for debug
      const rWrist = currentLandmarks[16];
      const lWrist = currentLandmarks[15];
      const rElbow = currentLandmarks[14];
      const rShoulder = currentLandmarks[12];
      const lElbow = currentLandmarks[13];
      const lShoulder = currentLandmarks[11];
      const rightVel = prev ? velocity(prev[16], rWrist) : 0;
      const leftVel = prev ? velocity(prev[15], lWrist) : 0;
      const rightAngle = angle3(rShoulder, rElbow, rWrist);
      const leftAngle = angle3(lShoulder, lElbow, lWrist);

      const { poseScore, powerScore } = scorePose(currentLandmarks, move);
      const frameScore = move !== "idle" ? Math.round((poseScore + powerScore) / 2) : 0;

      // Real-time scoring: every qualifying punch frame → +1 to punch count
      // Every 10 punches → +1 cat food
      setTotalScore((s) => s + frameScore);

      if (frameScore > 20) {
        punchCountRef.current++;
        const p = punchCountRef.current;
        if (p % 10 === 0) {
          setCatFood((f) => f + 1);
          setMessage(`🥊 10 punches! +1 🍖`);
        }
        // Track combo
        setCombo((prev) => {
          const next = [...prev, move];
          return next.length > 12 ? next.slice(-12) : next;
        });
        setDebug({
          move, rightVel, leftVel, rightAngle, leftAngle,
          frameScore, punchCount: p,
        });
      } else {
        setDebug({
          move, rightVel, leftVel, rightAngle, leftAngle,
          frameScore, punchCount: punchCountRef.current,
        });
      }

      prevLandmarksRef.current = currentLandmarks;
    },
    [isTraining]
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

  // ── Quit ──────────────────────────────────────────────────────────────

  const handleQuit = useCallback(async () => {
    stopDetection();
    stopCamera();
    // macOS: hide to dock; other platforms: exit process
    try {
      await invoke("hide_main_window");
    } catch {
      // fallback
    }
  }, [stopDetection, stopCamera]);

  return (
    <div className="app-container">
      {view === "cat" && (
        <>
          {/* Close button */}
          <button className="close-btn" onClick={handleQuit} title="Close / 关闭">
            ✕
          </button>
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

          {/* Tutorial toggle */}
          <button
            className="tutorial-toggle"
            onClick={() => setShowTutorial((v) => !v)}
          >
            {showTutorial ? "✕ Hide Tutorial / 隐藏教程" : "📖 How to Box / 拳击教程"}
          </button>

          {showTutorial && <Tutorial />}

          {/* Debug panel — raw detection values */}
          <div className="debug-panel">
            <div className="debug-title">🔍 Detection Debug</div>
            <div className="debug-grid">
              <span>Move:</span><span className={debug.move !== "idle" ? "debug-hit" : ""}>{debug.move}</span>
              <span>Score/frame:</span><span>{debug.frameScore}</span>
              <span>R-Wrist vel:</span><span>{debug.rightVel.toFixed(4)}</span>
              <span>L-Wrist vel:</span><span>{debug.leftVel.toFixed(4)}</span>
              <span>R-Arm angle:</span><span>{Math.round(debug.rightAngle)}°</span>
              <span>L-Arm angle:</span><span>{Math.round(debug.leftAngle)}°</span>
              <span>Punches:</span><span>{debug.punchCount}</span>
            </div>
          </div>
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
