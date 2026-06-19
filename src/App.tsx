import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import CatViewer from "./components/CatViewer";
import CameraView from "./components/fitness/CameraView";
import Tutorial from "./components/fitness/Tutorial";
import Celebration from "./components/fitness/Celebration";
import { useCamera } from "./hooks/useCamera";
import { usePoseDetection } from "./hooks/usePoseDetection";
import {
  classifyBoxingMove,
  velocity,
  angle3,
  type BoxingMove,
  type Landmark,
  MOVE_LABELS,
} from "./utils/pose-classifier";
import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { playPunchSound, playComboSound, playStartSound, playStopSound } from "./hooks/useSound";
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
  type PetType = "calico" | "dancer" | "rem";
  const PET_TYPES: PetType[] = ["calico", "dancer", "rem"];
  const PET_LABELS: Record<PetType, string> = {
    calico: "🐱 Calico APNG", dancer: "💃 Dancer 帧动画", rem: "💙 Rem Live2D",
  };
  const [petType, setPetType] = useState<PetType>("calico");
  const [agility] = useState(10);
  const [message, setMessage] = useState("🐱 Meow!");
  const [showMenu, setShowMenu] = useState(false);

  // ── Training state ──────────────────────────────────────────────────
  const [isTraining, setIsTraining] = useState(false);
  const isTrainingRef = useRef(false); // ref to avoid stale closure in onLandmarks
  const [totalScore, setTotalScore] = useState(0);
  const [combo, setCombo] = useState<BoxingMove[]>([]);
  const [poseResult, setPoseResult] = useState<PoseLandmarkerResult | null>(null);
  const [showTutorial, setShowTutorial] = useState(true);
  const discoveredRef = useRef<Set<string>>(new Set()); // ref for instant check
  const [discoveredMoves, setDiscoveredMoves] = useState<Set<string>>(new Set());
  const [celebrationMove, setCelebrationMove] = useState<BoxingMove | null>(null);
  const prevLandmarksRef = useRef<Landmark[] | null>(null);
  const punchCountRef = useRef(0);
  const frameIdxRef = useRef(0);
  const wasPunchingRef = useRef(false);
  const punchCooldownRef = useRef(0);
  const consecutivePunchRef = useRef(0);
  const currentMoveRef = useRef<BoxingMove>("idle");
  // Simplified debug — just punch count for leaderboard
  const [punchDisplay, setPunchDisplay] = useState(0);

  const { videoRef, isReady: camReady, error: camError, startCamera, stopCamera } = useCamera();

  const onLandmarks = useCallback((result: PoseLandmarkerResult) => {
    frameIdxRef.current++;
    // Throttle skeleton re-render to every 5 frames
    if (frameIdxRef.current % 5 === 0) setPoseResult(result);

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
    currentMoveRef.current = move;

    const rv = prev ? velocity(prev[16], cur[16]) : 0;
    const lv = prev ? velocity(prev[15], cur[15]) : 0;
    const ra = angle3(cur[12], cur[14], cur[16]);

    // ── Consecutive-frame punch detection ────────────────────────
    // Jitter: 1-2 frames of random "punch". Real punch: 5+ frames.
    // Require 3 consecutive frames of punch detection before counting.
    const PUNCH_COOLDOWN = 40;
    const MIN_CONSECUTIVE = 2;
    const maxVel = Math.max(rv, lv);

    if (punchCooldownRef.current > 0) punchCooldownRef.current--;

    if (move !== "idle") {
      consecutivePunchRef.current++;
    } else {
      consecutivePunchRef.current = 0;
    }

    const isPunch = consecutivePunchRef.current >= MIN_CONSECUTIVE;
    if (isPunch && !wasPunchingRef.current && punchCooldownRef.current === 0) {
      punchCountRef.current++;
      punchCooldownRef.current = PUNCH_COOLDOWN;
      consecutivePunchRef.current = 0;
      const p = punchCountRef.current;
      const fs = Math.round(maxVel * 300);
      setTotalScore((s) => s + fs);
      playPunchSound();
      if (p % 10 === 0) { setCatFood((f) => f + 1); setMessage(`🥊 10 punches! +1 🍖`); playComboSound(); }
      setCombo((prev) => { const n = [...prev, move]; return n.length > 12 ? n.slice(-12) : n; });
      // First time discovering this punch type → celebrate!
      if (!discoveredRef.current.has(move) && move !== "idle") {
        discoveredRef.current = new Set([...discoveredRef.current, move]);
        setDiscoveredMoves(discoveredRef.current);
        setCelebrationMove(move);
      }
      console.log(`🥊 PUNCH #${p} move=${move} maxVel=${maxVel.toFixed(3)} ra=${Math.round(ra)}°`);
    }
    wasPunchingRef.current = isPunch;

    setPunchDisplay(punchCountRef.current);
  }, []); // isTrainingRef used instead of isTraining state

  const { startDetection, stopDetection } = usePoseDetection(onLandmarks);

  const handleStartTraining = useCallback(async () => {
    await startCamera();
    setIsTraining(true);
    isTrainingRef.current = true;
    currentMoveRef.current = "idle"; setTotalScore(0); setCombo([]);
    punchCountRef.current = 0; frameIdxRef.current = 0;
    punchCooldownRef.current = 0; wasPunchingRef.current = false;
    consecutivePunchRef.current = 0;
    discoveredRef.current = new Set();
    setDiscoveredMoves(new Set());
    setMessage("🥊 Let's box!");
    playStartSound();
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
    setCatState("idle"); currentMoveRef.current = "idle";
    setMessage(`🏆 Score: ${totalScore} | Punches: ${punchCountRef.current}`);
    playStopSound();
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
      case "swap": {
        const idx = PET_TYPES.indexOf(petType);
        setPetType(PET_TYPES[(idx + 1) % PET_TYPES.length]);
        break;
      }
    }
  }, [handleOpenTraining, petType]);

  useEffect(() => { if (showMenu) { const t = setTimeout(() => setShowMenu(false), 4000); return () => clearTimeout(t); } }, [showMenu]);

  // Auto-open pet window on startup (SVG pet test)
  useEffect(() => {
    if (!isTrainingWindow) {
      console.log("[BoxingCat] Opening pet window...");
      invoke("open_pet_window")
        .then(() => console.log("[BoxingCat] Pet window opened"))
        .catch((e) => console.error("[BoxingCat] Pet window failed:", e));
    }
  }, [isTrainingWindow]);

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
        <Celebration move={celebrationMove} onDone={() => setCelebrationMove(null)} />
        <div className="tw-body" style={{ paddingTop: 12 }}>
          <div className="tw-left">
            <CameraView videoRef={videoRef} isReady={camReady} poseResult={poseResult}
              onStart={handleStartTraining} onStop={handleStopTraining} isTraining={isTraining} />
            {camError && <p className="cam-err">{camError}</p>}
            <div className="training-hud">
              <div className="training-stat"><span className="training-stat-value">{totalScore}</span><span className="training-stat-label">Score</span></div>
              <div className="training-stat"><span className="training-stat-value">{catFood}</span><span className="training-stat-label">🍖 Food</span></div>
              <div className="training-stat"><span className="training-stat-value">{punchDisplay}</span><span className="training-stat-label">Punches</span></div>
            </div>
            <div className="combo-feed">{combo.map((m, i) => <span key={i} className="combo-item">{MOVE_LABELS[m]}</span>)}</div>
          </div>
          <div className="tw-right">
            {/* Tabs */}
            <div className="tw-tabs">
              <button className={`tw-tab ${showTutorial ? "active" : ""}`} onClick={() => setShowTutorial(true)}>📖 Tutorial</button>
              <button className={`tw-tab ${!showTutorial ? "active" : ""}`} onClick={() => setShowTutorial(false)}>🏆 Leaderboard</button>
            </div>
            {showTutorial ? (
              <Tutorial />
            ) : (
              <div className="leaderboard-panel">
                <div className="lb-title">Your Session</div>
                <div className="lb-row"><span>🥊 Punches</span><span>{punchDisplay}</span></div>
                <div className="lb-row"><span>⭐ Score</span><span>{totalScore}</span></div>
                <div className="lb-row"><span>🍖 Cat Food</span><span>{catFood}</span></div>
                <div className="lb-row"><span>🏅 Discoveries</span><span>{[...discoveredMoves].length}/4</span></div>

                <div className="lb-title" style={{ marginTop: 16 }}>🏆 Global Rankings</div>
                <div className="lb-section-title">Most Punches</div>
                <div className="lb-row"><span>🥇 ShadowBoxer99</span><span>2,847</span></div>
                <div className="lb-row"><span>🥈 CatNinja42</span><span>1,932</span></div>
                <div className="lb-row"><span>🥉 PunchLord</span><span>1,456</span></div>

                <div className="lb-section-title">Most Agile Cats</div>
                <div className="lb-row"><span>🥇 SwiftPaws</span><span>⚡ 980</span></div>
                <div className="lb-row"><span>🥈 LightningCat</span><span>⚡ 872</span></div>
                <div className="lb-row"><span>🥉 NeoWhiskers</span><span>⚡ 765</span></div>

                <div className="lb-section-title">Most Frisbees Caught</div>
                <div className="lb-row"><span>🥇 DiscMaster</span><span>🥏 342</span></div>
                <div className="lb-row"><span>🥈 SkyHunter</span><span>🥏 218</span></div>
                <div className="lb-row"><span>🥉 FrisbeeCat</span><span>🥏 156</span></div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── CAT WINDOW RENDER ────────────────────────────────────────────────
  return (
    <div className="app-container" onContextMenu={handleContextMenu} onClick={() => setShowMenu(false)}>
      {/* Drag handle */}
      <div data-tauri-drag-region style={{ height: 22, width: "100%", cursor: "grab", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.2)", fontSize: 10, userSelect: "none" }}>⋮⋮ drag ⋮⋮</div>
      {/* HUD: cat food + agility, top-right */}
      <div className="cat-hud">
        <span className="hud-badge">🍖 {catFood}</span>
        <span className="hud-badge">⚡ {agility}</span>
      </div>

      {/* The cat — positioned left side */}
      <div className="cat-area" onClick={(e) => { e.stopPropagation(); setCatState("excited"); setCatFood((f) => f + 1); setMessage("🐱 Meow! +1 🍖"); setTimeout(() => setCatState("idle"), 2000); }}>
        <CatViewer state={catState} petType={petType} onClick={() => {}} message={message} />
      </div>

      {/* Right-click context menu */}
      {showMenu && (
        <div className="context-menu" onClick={(e) => e.stopPropagation()}>
          <div className="ctx-item" onClick={() => handleMenuAction("training")}>🥊 Training</div>
          <div className="ctx-item" onClick={() => handleMenuAction("idle")}>😺 Idle</div>
          <div className="ctx-item" onClick={() => handleMenuAction("walking")}>🚶 Walk</div>
          <div className="ctx-item" onClick={() => handleMenuAction("excited")}>⭐ Excited</div>
          <div className="ctx-item" onClick={() => handleMenuAction("sleeping")}>😴 Sleep</div>
          <div className="ctx-item" onClick={() => handleMenuAction("swap")}>
            🔄 Swap Pet ({PET_LABELS[petType]})
          </div>
          <div className="ctx-sep" />
          <div className="ctx-item" onClick={() => handleMenuAction("hide")}>👋 Hide to Dock</div>
        </div>
      )}
    </div>
  );
}

export default App;
