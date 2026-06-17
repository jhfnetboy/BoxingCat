import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

/**
 * MediaPipe Pose connections (which landmarks are connected by bones).
 * Only includes upper-body + arm connections relevant for boxing.
 */
const CONNECTIONS: [number, number][] = [
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Right arm
  [12, 14], [14, 16],
  // Left arm
  [11, 13], [13, 15],
  // Head/neck
  [11, 0], [12, 0],
];

// Colors for boxing-relevant body parts
const COLORS = {
  bone: "rgba(0, 255, 100, 0.8)",
  joint: "rgba(255, 255, 255, 0.9)",
  wrist: "rgba(255, 80, 80, 0.95)",   // highlight fists
  elbow: "rgba(255, 180, 50, 0.9)",
  shoulder: "rgba(50, 180, 255, 0.9)",
};

const HIGHLIGHT_JOINTS = new Set([15, 16, 13, 14, 11, 12]);

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
) {
  // Draw bones
  ctx.strokeStyle = COLORS.bone;
  ctx.lineWidth = 3;

  for (const [i, j] of CONNECTIONS) {
    const a = landmarks[i];
    const b = landmarks[j];
    if (a.visibility > 0.5 && b.visibility > 0.5) {
      ctx.beginPath();
      ctx.moveTo(a.x * width, a.y * height);
      ctx.lineTo(b.x * width, b.y * height);
      ctx.stroke();
    }
  }

  // Draw joints
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (lm.visibility < 0.5) continue;

    const x = lm.x * width;
    const y = lm.y * height;
    const isHighlight = HIGHLIGHT_JOINTS.has(i);

    // Glow effect for wrists
    if (i === 15 || i === 16) {
      ctx.shadowColor = "rgba(255, 80, 80, 0.8)";
      ctx.shadowBlur = 12;
    }

    ctx.fillStyle = isHighlight ? getJointColor(i) : "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.arc(x, y, isHighlight ? 6 : 3, 0, 2 * Math.PI);
    ctx.fill();

    ctx.shadowBlur = 0;
  }
}

function getJointColor(index: number): string {
  if (index === 15 || index === 16) return COLORS.wrist;
  if (index === 13 || index === 14) return COLORS.elbow;
  if (index === 11 || index === 12) return COLORS.shoulder;
  return COLORS.joint;
}
