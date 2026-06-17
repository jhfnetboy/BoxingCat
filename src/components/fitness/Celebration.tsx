import { useEffect, useRef } from "react";
import type { BoxingMove } from "../../utils/pose-classifier";
import { playCheerSound } from "../../hooks/useSound";

interface Props {
  move: BoxingMove | null;
  onDone: () => void;
}

const CELEBRATION_EMOJI = ["🎉", "🌸", "✨", "🎊", "🌟", "💐", "🏆", "🥊"];
const MOVE_NAMES: Record<string, string> = {
  jab: "Jab 直拳!",
  cross: "Cross 交叉拳!",
  hook: "Hook 勾拳!",
  uppercut: "Uppercut 上勾拳!",
};

export default function Celebration({ move, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);

  const playedRef = useRef(false);

  useEffect(() => {
    if (!move || playedRef.current) return;
    playedRef.current = true;
    playCheerSound();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    // Create particles
    const particles: Array<{
      x: number; y: number; vx: number; vy: number;
      emoji: string; size: number; life: number; maxLife: number;
      rotation: number; rotSpeed: number;
    }> = [];

    for (let i = 0; i < 60; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 100,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 6,
        vy: -Math.random() * 8 - 2,
        emoji: CELEBRATION_EMOJI[Math.floor(Math.random() * CELEBRATION_EMOJI.length)],
        size: 20 + Math.random() * 30,
        life: 0,
        maxLife: 80 + Math.random() * 40,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
      });
    }

    const start = performance.now();
    const animate = () => {
      const elapsed = performance.now() - start;
      if (elapsed > 2500) {
        onDone();
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.life++;
        if (p.life > p.maxLife) continue;

        const progress = p.life / p.maxLife;
        p.x += p.vx;
        p.vy += 0.15; // gravity
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        const alpha = progress < 0.1 ? progress * 10 : progress > 0.7 ? (1 - progress) / 0.3 : 1;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.font = `${p.size}px serif`;
        ctx.fillText(p.emoji, -p.size / 2, p.size / 2);
        ctx.restore();
      }

      // Draw move name in center
      const textAlpha = elapsed < 300 ? elapsed / 300 : elapsed > 2000 ? (2500 - elapsed) / 500 : 1;
      ctx.save();
      ctx.globalAlpha = textAlpha;
      ctx.font = "bold 36px -apple-system, sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(255,150,50,0.8)";
      ctx.shadowBlur = 20;
      ctx.fillText(
        `${MOVE_NAMES[move] || move} 解锁!`,
        canvas.width / 2,
        canvas.height / 2 - 10,
      );
      ctx.font = "18px -apple-system, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText("New move discovered!", canvas.width / 2, canvas.height / 2 + 25);
      ctx.restore();

      animRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animRef.current);
  }, [move, onDone]);

  if (!move) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 100,
      }}
    />
  );
}
