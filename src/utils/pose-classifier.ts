/**
 * Boxing pose classifier — elbow-extension based.
 *
 * Core insight: a punch = elbow rapidly extending.
 * Head turns, standing up, waving — none of these extend the elbow.
 * By measuring elbow ANGLE CHANGE (not absolute wrist velocity),
 * we eliminate false positives from whole-body movement.
 */

export interface Landmark {
  x: number; y: number; z: number;
  visibility: number;
}

export type BoxingMove = "jab" | "cross" | "hook" | "uppercut" | "slip" | "idle";

// ── Geometry helpers ────────────────────────────────────────────────────

export function angle3(a: Landmark, b: Landmark, c: Landmark): number {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const mag = Math.sqrt(ba.x * ba.x + ba.y * ba.y) * Math.sqrt(bc.x * bc.x + bc.y * bc.y);
  if (mag === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI);
}

export function velocity(prev: Landmark | undefined, curr: Landmark): number {
  if (!prev) return 0;
  const dx = curr.x - prev.x;
  const dy = curr.y - prev.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Elbow extension based classifier ────────────────────────────────────

/** How many degrees the elbow must extend in one frame to qualify as a punch */
const ELBOW_EXTEND_SPEED = 3.0;   // degrees per frame at 30fps = 90°/sec

/** Minimum arm extension angle for a "straight" punch (jab/cross) */
const STRAIGHT_ARM = 130;

/** Arm angle range for a hook (bent arm) */
const HOOK_ANGLE_LO = 40;
const HOOK_ANGLE_HI = 110;

export function classifyBoxingMove(
  landmarks: Landmark[],
  prevLandmarks: Landmark[] | null,
): BoxingMove {
  if (landmarks.length < 17) return "idle";
  if (!prevLandmarks) return "idle";

  const R_SHOULDER = 12, R_ELBOW = 14, R_WRIST = 16;
  const L_SHOULDER = 11, L_ELBOW = 13, L_WRIST = 15;

  // Current arm angles
  const rAngle = angle3(landmarks[R_SHOULDER], landmarks[R_ELBOW], landmarks[R_WRIST]);
  const lAngle = angle3(landmarks[L_SHOULDER], landmarks[L_ELBOW], landmarks[L_WRIST]);

  // Previous arm angles
  const prevRAngle = angle3(prevLandmarks[R_SHOULDER], prevLandmarks[R_ELBOW], prevLandmarks[R_WRIST]);
  const prevLAngle = angle3(prevLandmarks[L_SHOULDER], prevLandmarks[L_ELBOW], prevLandmarks[L_WRIST]);

  // Elbow extension speed (degrees changed this frame)
  const rExtend = rAngle - prevRAngle; // positive = arm extending
  const lExtend = lAngle - prevLAngle;

  // Shoulder rotation (for hook detection)
  const shoulderAngle = Math.abs(
    Math.atan2(
      landmarks[L_SHOULDER].y - landmarks[R_SHOULDER].y,
      landmarks[L_SHOULDER].x - landmarks[R_SHOULDER].x,
    )
  ) * (180 / Math.PI);

  const prevShoulder = Math.abs(
    Math.atan2(
      prevLandmarks[L_SHOULDER].y - prevLandmarks[R_SHOULDER].y,
      prevLandmarks[L_SHOULDER].x - prevLandmarks[R_SHOULDER].x,
    )
  ) * (180 / Math.PI);

  const shoulderRot = Math.abs(shoulderAngle - prevShoulder);

  // ── Classify based on elbow extension ────────────────────────────

  // Jab/Cross: right arm extending rapidly → straight arm
  if (rExtend > ELBOW_EXTEND_SPEED && rAngle > STRAIGHT_ARM) {
    return "jab";
  }
  if (lExtend > ELBOW_EXTEND_SPEED && lAngle > STRAIGHT_ARM) {
    return "cross";
  }

  // Hook: arm extending in bent range + shoulder rotating
  if (rExtend > ELBOW_EXTEND_SPEED &&
      rAngle > HOOK_ANGLE_LO && rAngle < HOOK_ANGLE_HI &&
      shoulderRot > 5) {
    return "hook";
  }

  // Uppercut: arm extending + wrist moving upward
  const rWristUp = prevLandmarks[R_WRIST].y - landmarks[R_WRIST].y;
  if (rExtend > ELBOW_EXTEND_SPEED * 0.7 && rWristUp > 0.02) {
    return "uppercut";
  }

  return "idle";
}

// ── Scoring ────────────────────────────────────────────────────────────

export interface ScoreFrame {
  move: BoxingMove;
  poseScore: number;
  powerScore: number;
}

export function scorePose(landmarks: Landmark[], move: BoxingMove): ScoreFrame {
  if (move === "idle") return { move, poseScore: 0, powerScore: 0 };

  const R_SHOULDER = 12, R_ELBOW = 14, R_WRIST = 16;
  const armAngle = angle3(landmarks[R_SHOULDER], landmarks[R_ELBOW], landmarks[R_WRIST]);

  let poseScore = 50;
  switch (move) {
    case "jab": poseScore = armAngle > 150 ? 90 : armAngle > 130 ? 70 : 50; break;
    case "hook": poseScore = Math.abs(armAngle - 90) < 20 ? 80 : 50; break;
    default: poseScore = 60;
  }

  return { move, poseScore, powerScore: Math.round(poseScore * 0.75) };
}

export const MOVE_LABELS: Record<BoxingMove, string> = {
  jab: "🥊 Jab", cross: "💥 Cross", hook: "🪝 Hook",
  uppercut: "⬆️ Uppercut", slip: "↗️ Slip", idle: "⏸️",
};
