import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

/**
 * MediaPipe Pose connections — upper body focus for boxing.
 */
const CONNECTIONS: [number, number][] = [
  // Torso / shoulders
  [11, 12],
  [11, 23], [12, 24], // shoulders to hips
  [23, 24],           // hip line
  // Right arm (thick)
  [12, 14], [14, 16],
  // Left arm (thick)
  [11, 13], [13, 15],
  // Neck to head
  [11, 0], [12, 0],
  // Face detail
  [0, 1], [0, 2], [1, 3], [2, 4],
  [0, 5], [0, 6],   // mouth corners
];

const BONE_COLORS: Record<string, string> = {
  arm_right: "rgba(0, 220, 80, 0.85)",
  arm_left: "rgba(50, 200, 255, 0.85)",
  torso: "rgba(220, 220, 100, 0.8)",
  head: "rgba(255, 180, 200, 0.7)",
  default: "rgba(255, 255, 255, 0.5)",
};

function boneKey(i: number, j: number): string {
  if ((i === 12 && j === 14) || (i === 14 && j === 16)) return "arm_right";
  if ((i === 11 && j === 13) || (i === 13 && j === 15)) return "arm_left";
  if ([11, 12, 23, 24].includes(i) && [11, 12, 23, 24].includes(j)) return "torso";
  if (i === 0 || j === 0) return "head";
  return "default";
}

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0,
) {
  // ── Draw bones with glow ──────────────────────────────────────────
  for (const [i, j] of CONNECTIONS) {
    const a = landmarks[i];
    const b = landmarks[j];
    if (!a || !b || (a.visibility < 0.4 && b.visibility < 0.4)) continue;

    const key = boneKey(i, j);
    ctx.strokeStyle = BONE_COLORS[key] || BONE_COLORS.default;

    if (key === "arm_right" || key === "arm_left") {
      ctx.lineWidth = 4;
      ctx.shadowColor = key === "arm_right"
        ? "rgba(0, 255, 80, 0.7)"
        : "rgba(50, 200, 255, 0.7)";
      ctx.shadowBlur = 8;
    } else {
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 0;
    }

    ctx.beginPath();
    ctx.moveTo(a.x * width + offsetX, a.y * height + offsetY);
    ctx.lineTo(b.x * width + offsetX, b.y * height + offsetY);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // ── Draw joints as colored circles ────────────────────────────────
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (lm.visibility < 0.4) continue;

    const x = lm.x * width + offsetX;
    const y = lm.y * height + offsetY;

    // Fist glow (wrists = 15, 16)
    if (i === 15 || i === 16) {
      ctx.shadowColor = "rgba(255, 50, 50, 0.9)";
      ctx.shadowBlur = 16;
    } else if (i === 13 || i === 14) {
      ctx.shadowColor = "rgba(255, 160, 40, 0.7)";
      ctx.shadowBlur = 8;
    }

    ctx.fillStyle = jointColor(i);
    ctx.beginPath();
    ctx.arc(x, y, jointRadius(i), 0, 2 * Math.PI);
    ctx.fill();

    // Inner highlight dot
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(x, y, jointRadius(i) * 0.4, 0, 2 * Math.PI);
    ctx.fill();

    ctx.shadowBlur = 0;
  }
}

function jointColor(index: number): string {
  if (index === 15 || index === 16) return "rgba(255, 50, 50, 0.95)";   // wrists = red
  if (index === 13 || index === 14) return "rgba(255, 160, 40, 0.95)"; // elbows = orange
  if (index === 11 || index === 12) return "rgba(50, 200, 255, 0.95)";// shoulders = blue
  if (index === 0) return "rgba(255, 220, 50, 0.95)";                  // nose = yellow
  return "rgba(255, 255, 255, 0.7)";
}

function jointRadius(index: number): number {
  if (index === 15 || index === 16) return 7;   // big fists
  if (index === 13 || index === 14) return 5.5; // elbows
  if (index === 11 || index === 12) return 6;   // shoulders
  if (index === 0) return 5;
  return 3.5;
}
