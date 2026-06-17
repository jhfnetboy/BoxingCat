import { useEffect, useRef } from "react";
import type { BoxingMove } from "../../utils/pose-classifier";
import { playCheerSound } from "../../hooks/useSound";

const MOVE_NAMES: Record<string, string> = {
  jab: "Jab!", cross: "Cross!", hook: "Hook!", uppercut: "Uppercut!",
};

interface Props {
  move: BoxingMove | null;
  onDone: () => void;
}

export default function Celebration({ move, onDone }: Props) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!move) return;
    playCheerSound();
    const timer = setTimeout(() => onDoneRef.current(), 2500);
    return () => clearTimeout(timer);
  }, [move]); // only re-run when move changes, not onDone

  if (!move) return null;

  return (
    <div className="celebration-overlay">
      <div className="celebration-text">{MOVE_NAMES[move] || move}</div>
      <div className="celebration-sub">New move discovered!</div>
      <div className="celebration-particles">
        {["🎉","🌸","✨","🎊","🌟","💐","🏆","🥊"].map((e, i) => (
          <span key={i} className="celeb-particle" style={{
            animationDelay: `${i * 0.15}s`,
            left: `${10 + Math.random() * 80}%`,
          }}>{e}</span>
        ))}
      </div>
    </div>
  );
}
