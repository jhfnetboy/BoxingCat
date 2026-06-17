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
import "./styles/cat-house.css";

type CatState = "idle" | "walking" | "sleeping" | "excited" | "training";

function App() {
  const [isTrainingWindow, setIsTrainingWindow] = useState(false);
  useEffect(() => {
    try { setIsTrainingWindow(getCurrentWindow().label === "training"); } catch { /* */ }
  }, []);

  const [catState, setCatState] = useState<CatState>("idle");
  const [catFood, setCatFood] = useState(0);
  const [agility] = useState(10);
  const [message, setMessage] = useState("🐱 Meow!");
  const [showMenu, setShowMenu] = useState(false);

  // ── Training state ──────────────────────────────────────────────────
  const [isTraining, setIsTraining] = useState(false);
  const isTrainingRef = useRef(false); // ref to avoid stale closure in onLandmarks
  const [currentMove, setCurrentMove] = useState<BoxingMove>("idle");
  const [totalScore, setTotalScore] = useState(0);
  const [combo, setCombo] = useState<BoxingMove[]>([]);
  const [poseResult, setPoseResult] = useState<PoseLandmarkerResult | null>(null);
  const [showTutorial, setShowTutorial] = useState(true);
  const prevLandmarksRef = useRef<Landmark[] | null>(null);
  const punchCountRef = useRef(0);
  const frameIdxRef = useRef(0);
  const wasPunchingRef = useRef(false);
  const punchCooldownRef = useRef(0); // frames until next punch can register
  const [debug, setDebug] = useState({
    move: "idle" as string, rightVel: 0, leftVel: 0,
    rightAngle: 0, leftAngle: 0, frameScore: 0, punchCount: 0,
  });

  const { videoRef, isReady: camReady, error: camError, startCamera, stopCamera } = useCamera();

  const onLandmarks = useCallback((result: PoseLandmarkerResult) => {
    setPoseResult(result);
    frameIdxRef.current++;

    if (!isTrainingRef.current) return; // use ref to avoid stale closure

    const lm = result.landmarks[0];
    if (!lm || lm.length < 17) {
      // Log when no person detected
      if (frameIdxRef.current % 60 === 0) console.log("[Pose] No person in frame");
      return;
    }

    const cur = lm as unknown as Landmark[];
    const prev = prevLandmarksRef.current;
    prevLandmarksRef.current = cur;

    // ── Only process scoring when training is active ────────────────
    if (!isTrainingRef.current) return;

    const move = classifyBoxingMove(cur, prev);
    setCurrentMove(move);

    const rv = prev ? velocity(prev[16], cur[16]) : 0;
    const lv = prev ? velocity(prev[15], cur[15]) : 0;
    const ra = angle3(cur[12], cur[14], cur[16]);
    const la = angle3(cur[11], cur[13], cur[15]);

    const { poseScore, powerScore } = scorePose(cur, move);
    const fs = move !== "idle" ? Math.round((poseScore + powerScore) / 2) : 0;

    // Decrement punch cooldown
    if (punchCooldownRef.current > 0) punchCooldownRef.current--;

    // Rising-edge + cooldown: only count when:
    // 1. Transition from idle to punching (rising edge)
    // 2. At least 30 frames since last punch (cooldown)
    // 3. Score exceeds minimum threshold
    const isPunching = fs > 30 && move !== "idle";
    if (isPunching && !wasPunchingRef.current && punchCooldownRef.current === 0) {
      punchCountRef.current++;
      punchCooldownRef.current = 30; // ~0.5s at 60fps
      const p = punchCountRef.current;
      setTotalScore((s) => s + fs);
      if (p % 10 === 0) { setCatFood((f) => f + 1); setMessage(`🥊 10 punches! +1 🍖`); }
      setCombo((prev) => { const n = [...prev, move]; return n.length > 12 ? n.slice(-12) : n; });
      console.log(`[Pose] 🥊 PUNCH #${p} move=${move} fs=${fs} rv=${rv.toFixed(3)} ra=${Math.round(ra)}°`);
    }
    wasPunchingRef.current = isPunching;

    setDebug({ move, rightVel: rv, leftVel: lv, rightAngle: ra, leftAngle: la, frameScore: fs, punchCount: punchCountRef.current });
  }, []); // isTrainingRef used instead of isTraining state

  const { startDetection, stopDetection } = usePoseDetection(onLandmarks);

  const handleStartTraining = useCallback(async () => {
    await startCamera();
    setIsTraining(true);
    isTrainingRef.current = true;
    setCurrentMove("idle"); setTotalScore(0); setCombo([]);
    punchCountRef.current = 0; frameIdxRef.current = 0;
    punchCooldownRef.current = 0; wasPunchingRef.current = false;
    setMessage("🥊 Let's box!");
    console.log("[Pose] Training started, waiting for camera...");
    setTimeout(() => {
      if (videoRef.current) {
        console.log("[Pose] Starting detection, video ready:", videoRef.current.readyState);
        startDetection(videoRef.current);
      } else {
        console.log("[Pose] ERROR: videoRef.current is null!");
      }
    }, 1000);
  }, [startCamera, startDetection, videoRef]);

  const handleStopTraining = useCallback(() => {
    stopDetection(); stopCamera();
    setIsTraining(false);
    isTrainingRef.current = false;
    setCatState("idle"); setCurrentMove("idle");
    setMessage(`🏆 Score: ${totalScore} | Punches: ${punchCountRef.current}`);
    console.log(`[Pose] Training stopped. Final score=${totalScore} punches=${punchCountRef.current}`);
  }, [stopDetection, stopCamera, totalScore]);

  const handleOpenTraining = useCallback(async () => {
    try { await invoke("open_training_window"); } catch (e) { console.error(e); }
  }, []);

  // ── Right-click context menu ────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setShowMenu((v) => !v);
  }, []);

  const handleMenuAction = useCallback((action: string) => {
    setShowMenu(false);
    switch (action) {
      case "training": handleOpenTraining(); break;
      case "idle": setCatState("idle"); break;
      case "walking": setCatState("walking"); break;
      case "excited": setCatState("excited"); break;
      case "sleeping": setCatState("sleeping"); break;
      case "hide": invoke("hide_main_window").catch(() => {}); break;
    }
  }, [handleOpenTraining]);

  useEffect(() => { if (showMenu) { const t = setTimeout(() => setShowMenu(false), 4000); return () => clearTimeout(t); } }, [showMenu]);

  // Auto-idle
  useEffect(() => {
    const i = setInterval(() => {
      setCatState((p) => { if (p === "sleeping") return p; const r = Math.random(); if (r < 0.3) return "walking"; if (r < 0.5) return "idle"; if (r < 0.6) return "excited"; return p; });
      setTimeout(() => setCatState((p2) => (p2 !== "sleeping" ? "idle" : p2)), 3000);
    }, 10000);
    return () => clearInterval(i);
  }, []);

  // ── TRAINING WINDOW RENDER ───────────────────────────────────────────
  if (isTrainingWindow) {
    return (
      <div className="training-window">
        <div className="tw-body" style={{ paddingTop: 12 }}>
          <div className="tw-left">
            <CameraView videoRef={videoRef} isReady={camReady} poseResult={poseResult}
              onStart={handleStartTraining} onStop={handleStopTraining} isTraining={isTraining} />
            {camError && <p className="cam-err">{camError}</p>}
            <div className="training-hud">
              <div className="training-stat"><span className="training-stat-value">{totalScore}</span><span className="training-stat-label">Score</span></div>
              <div className="move-indicator">{MOVE_LABELS[currentMove]}</div>
              <div className="training-stat"><span className="training-stat-value">{catFood}</span><span className="training-stat-label">Cat Food</span></div>
              <div className="training-stat"><span className="training-stat-value">{debug.punchCount}</span><span className="training-stat-label">Punches</span></div>
            </div>
            <div className="combo-feed">{combo.map((m, i) => <span key={i} className="combo-item">{MOVE_LABELS[m]}</span>)}</div>
          </div>
          <div className="tw-right">
            <button className="tutorial-toggle" onClick={() => setShowTutorial((v) => !v)}>
              {showTutorial ? "✕ Hide Tutorial" : "📖 Tutorial / 教程"}
            </button>
            {showTutorial && <Tutorial />}
            <div className="debug-panel">
              <div className="debug-title">🔍 Live Detection (logs in console)</div>
              <div className="debug-grid">
                <span>Move:</span><span className={debug.move !== "idle" ? "debug-hit" : ""}>{debug.move}</span>
                <span>Frame#:</span><span>{frameIdxRef.current}</span>
                <span>Score/f:</span><span>{debug.frameScore}</span>
                <span>R-Vel:</span><span>{debug.rightVel.toFixed(4)}</span>
                <span>L-Vel:</span><span>{debug.leftVel.toFixed(4)}</span>
                <span>R-Ang:</span><span>{Math.round(debug.rightAngle)}°</span>
                <span>L-Ang:</span><span>{Math.round(debug.leftAngle)}°</span>
                <span>Punches:</span><span>{debug.punchCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── CAT WINDOW RENDER ────────────────────────────────────────────────
  return (
    <div className="app-container" onContextMenu={handleContextMenu} onClick={() => setShowMenu(false)}>
      {/* HUD: cat food + agility, top-right */}
      <div className="cat-hud">
        <span className="hud-badge">🍖 {catFood}</span>
        <span className="hud-badge">⚡ {agility}</span>
      </div>

      {/* The cat — positioned left side */}
      <div className="cat-area" onClick={(e) => { e.stopPropagation(); setCatState("excited"); setCatFood((f) => f + 1); setMessage("🐱 Meow! +1 🍖"); setTimeout(() => setCatState("idle"), 2000); }}>
        <CatViewer state={catState} onClick={() => {}} message={message} />
      </div>

      {/* Right-click context menu */}
      {showMenu && (
        <div className="context-menu" onClick={(e) => e.stopPropagation()}>
          <div className="ctx-item" onClick={() => handleMenuAction("training")}>🥊 Training</div>
          <div className="ctx-item" onClick={() => handleMenuAction("idle")}>😺 Idle</div>
          <div className="ctx-item" onClick={() => handleMenuAction("walking")}>🚶 Walk</div>
          <div className="ctx-item" onClick={() => handleMenuAction("excited")}>⭐ Excited</div>
          <div className="ctx-item" onClick={() => handleMenuAction("sleeping")}>😴 Sleep</div>
          <div className="ctx-sep" />
          <div className="ctx-item" onClick={() => handleMenuAction("hide")}>👋 Hide to Dock</div>
        </div>
      )}
    </div>
  );
}

export default App;
