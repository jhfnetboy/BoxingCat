import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import CatViewer from "./components/CatViewer";
import "./styles/cat.css";

// Cat state machine states
type CatState = "idle" | "walking" | "sleeping" | "excited" | "training";

function App() {
  const [catState, setCatState] = useState<CatState>("idle");
  const [catFood, setCatFood] = useState(0);
  const [agility, _setAgility] = useState(10);
  const [message, setMessage] = useState("🐱 Meow! Welcome to BoxingCat!");

  // Auto-idle animation cycle: cat randomly walks around
  useEffect(() => {
    const interval = setInterval(() => {
      setCatState((prev) => {
        if (prev === "sleeping") return prev; // don't interrupt sleep
        const rand = Math.random();
        if (rand < 0.3) return "walking";
        if (rand < 0.5) return "idle";
        if (rand < 0.6) return "excited";
        return prev;
      });

      // Return to idle after a brief action
      setTimeout(() => {
        setCatState((prev) => (prev !== "sleeping" ? "idle" : prev));
      }, 3000 + Math.random() * 4000);
    }, 8000 + Math.random() * 12000);

    return () => clearInterval(interval);
  }, []);

  // Click cat → excited
  const handleCatClick = useCallback(() => {
    setCatState("excited");
    setCatFood((f) => f + 1);
    setMessage("🐱 Meow! +1 Cat Food!");
    setTimeout(() => setCatState("idle"), 2000);
  }, []);

  // Test Tauri invoke
  const handleTestBackend = useCallback(async () => {
    try {
      const result = await invoke<string>("greet", { name: "BoxingCat" });
      setMessage(result);
    } catch (e) {
      setMessage(`Backend not ready: ${e}`);
    }
  }, []);

  return (
    <div className="app-container">
      {/* The cat */}
      <CatViewer
        state={catState}
        onClick={handleCatClick}
        message={message}
      />

      {/* HUD overlay */}
      <div className="hud">
        <span className="hud-item">🍖 {catFood}</span>
        <span className="hud-item">⚡ {agility}</span>
      </div>

      {/* Dev controls (remove in production) */}
      <div className="dev-controls">
        <button onClick={() => setCatState("idle")}>Idle</button>
        <button onClick={() => setCatState("walking")}>Walk</button>
        <button onClick={() => setCatState("excited")}>Excited</button>
        <button onClick={() => setCatState("sleeping")}>Sleep</button>
        <button onClick={() => setCatState("training")}>Training</button>
        <button onClick={handleTestBackend}>Test Backend</button>
      </div>
    </div>
  );
}

export default App;
