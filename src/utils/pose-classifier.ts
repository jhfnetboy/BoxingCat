/**
 * Boxing pose classifier — rule-engine based for Phase 1 MVP.
 *
 * Uses MediaPipe 33-landmark pose data to classify:
 *   jab, cross, hook, uppercut, slip, idle
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

// ── Thresholds (classifier as primary detector) ────────────────────────
// Key insight: a real punch has BOTH high speed AND correct geometry.
// Sitting still: vel ~0.01-0.03. Standing up: all points move together.
// Only a punch: specific arm extension + fast wrist + shoulder rotation.

const JAB_SPEED = 0.08;          // must be a real punch, not a wave
const JAB_ARM_ANGLE_MIN = 110;   // arm must be extending (not bent)
const HOOK_SPEED = 0.07;
const HOOK_ARM_ANGLE_LO = 40;    // arm bent for hook
const HOOK_ARM_ANGLE_HI = 140;
const HOOK_SHOULDER_ROT = 10;    // shoulder must rotate for hook
const UPPERCUT_RISE = 0.04;      // wrist must move upward
const SLIP_HEAD = 0.04;          // head must actually move
const ANY_MOVEMENT = 999;        // disabled — require specific boxing move

// ── Classifier ──────────────────────────────────────────────────────────

export function classifyBoxingMove(
  landmarks: Landmark[],
  prevLandmarks: Landmark[] | null,
): BoxingMove {
  if (landmarks.length < 17) return "idle";

  // Key indices from MediaPipe
  const NOSE = 0;
  const L_SHOULDER = 11, R_SHOULDER = 12;
  const L_ELBOW = 13, R_ELBOW = 14;
  const L_WRIST = 15, R_WRIST = 16;

  const prev = prevLandmarks;

  // Arm angles
  const rightArmAngle = angle3(landmarks[R_SHOULDER], landmarks[R_ELBOW], landmarks[R_WRIST]);
  const leftArmAngle = angle3(landmarks[L_SHOULDER], landmarks[L_ELBOW], landmarks[L_WRIST]);

  // Wrist velocities
  const rightWristVel = velocity(prev?.[R_WRIST], landmarks[R_WRIST]);
  const leftWristVel = velocity(prev?.[L_WRIST], landmarks[L_WRIST]);

  // Shoulder rotation (for hook detection)
  const shoulderAngle = Math.abs(
    Math.atan2(
      landmarks[L_SHOULDER].y - landmarks[R_SHOULDER].y,
      landmarks[L_SHOULDER].x - landmarks[R_SHOULDER].x,
    )
  ) * (180 / Math.PI);

  // Head offset (for slip detection)
  const headOffset = prev
    ? Math.abs(landmarks[NOSE].x - prev[NOSE].x)
    : 0;

  // ── Classify ────────────────────────────────────────────────────────

  // Jab: right arm near-straight + high velocity
  if (rightWristVel > JAB_SPEED && rightArmAngle > JAB_ARM_ANGLE_MIN) {
    return "jab";
  }

  // Cross: left arm near-straight + high velocity
  if (leftWristVel > JAB_SPEED && leftArmAngle > JAB_ARM_ANGLE_MIN) {
    return "cross";
  }

  // Hook: bent arm + shoulder rotation + velocity
  if (
    rightWristVel > HOOK_SPEED &&
    rightArmAngle > HOOK_ARM_ANGLE_LO &&
    rightArmAngle < HOOK_ARM_ANGLE_HI &&
    shoulderAngle > HOOK_SHOULDER_ROT
  ) {
    return "hook";
  }

  // Uppercut: wrist moving upward
  if (prev && rightWristVel > HOOK_SPEED && (prev[R_WRIST].y - landmarks[R_WRIST].y) > UPPERCUT_RISE) {
    return "uppercut";
  }

  // Slip: head moved laterally
  if (headOffset > SLIP_HEAD) {
    return "slip";
  }

  // Any significant arm movement → at least a "jab" (base score)
  if (rightWristVel > ANY_MOVEMENT || leftWristVel > ANY_MOVEMENT) {
    return "jab"; // default punch
  }

  return "idle";
}

// ── Scoring ────────────────────────────────────────────────────────────

export interface ScoreFrame {
  move: BoxingMove;
  poseScore: number;
  powerScore: number;
}

export function scorePose(
  landmarks: Landmark[],
  move: BoxingMove,
): ScoreFrame {
  // Base score for any non-idle movement
  if (move === "idle") return { move, poseScore: 0, powerScore: 0 };

  const R_SHOULDER = 12, R_ELBOW = 14, R_WRIST = 16;
  const L_SHOULDER = 11, L_ELBOW = 13, L_WRIST = 15;

  const rightArmAngle = angle3(landmarks[R_SHOULDER], landmarks[R_ELBOW], landmarks[R_WRIST]);
  const leftArmAngle = angle3(landmarks[L_SHOULDER], landmarks[L_ELBOW], landmarks[L_WRIST]);

  let poseScore = 40; // base score for any movement

  switch (move) {
    case "jab":
      // Standard jab: arm near-straight gives bonus
      if (rightArmAngle > 120) poseScore = 70;
      if (rightArmAngle > 150) poseScore = 90;
      break;
    case "cross":
      if (leftArmAngle > 120) poseScore = 70;
      if (leftArmAngle > 150) poseScore = 90;
      break;
    case "hook":
      // Hook: arm ~90° is ideal
      const hookDeviation = Math.abs(rightArmAngle - 90);
      if (hookDeviation < 30) poseScore = 70;
      if (hookDeviation < 15) poseScore = 90;
      break;
    case "uppercut":
      poseScore = 80;
      break;
    case "slip":
      poseScore = 60;
      break;
    default:
      poseScore = 40;
  }

  const powerScore = Math.round(poseScore * 0.75);

  return { move, poseScore: Math.round(poseScore), powerScore };
}

// Move display names
export const MOVE_LABELS: Record<BoxingMove, string> = {
  jab: "🥊 Jab",
  cross: "💥 Cross",
  hook: "🪝 Hook",
  uppercut: "⬆️ Uppercut",
  slip: "↗️ Slip",
  idle: "⏸️",
};
