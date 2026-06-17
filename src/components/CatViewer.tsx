import { useRef, useEffect } from "react";

interface CatViewerProps {
  state: "idle" | "walking" | "sleeping" | "excited" | "training";
  onClick: () => void;
  message: string;
}

/**
 * CatViewer — renders the boxing cat character.
 *
 * Phase 0: CSS-based cat placeholder (cat face emoji + animations).
 * Phase 1+: Replace with PixiJS + Live2D Web SDK rendering.
 */
export default function CatViewer({ state, onClick, message }: CatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Future: PixiJS Application initialization here
  useEffect(() => {
    // Phase 1: init PixiJS app + load Live2D model
    // const app = new PIXI.Application({ ... });
    // const model = await Live2DModel.from('/assets/cat.model3.json');
  }, []);

  const catEmoji = {
    idle: "🐱",
    walking: "🚶🐱",
    sleeping: "😴🐱",
    excited: "⭐🐱",
    training: "🥊🐱",
  }[state];

  const animationClass = {
    idle: "cat-idle",
    walking: "cat-walk",
    sleeping: "cat-sleep",
    excited: "cat-excited",
    training: "cat-training",
  }[state];

  return (
    <div ref={containerRef} className="cat-container" onClick={onClick}>
      <div className={`cat-sprite ${animationClass}`}>
        <span className="cat-emoji">{catEmoji}</span>
      </div>
      <div className="cat-speech-bubble">{message}</div>
    </div>
  );
}
