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

function angle3(a: Landmark, b: Landmark, c: Landmark): number {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const mag = Math.sqrt(ba.x * ba.x + ba.y * ba.y) * Math.sqrt(bc.x * bc.x + bc.y * bc.y);
  if (mag === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI);
}

function velocity(prev: Landmark | undefined, curr: Landmark): number {
  if (!prev) return 0;
  const dx = curr.x - prev.x;
  const dy = curr.y - prev.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Thresholds ──────────────────────────────────────────────────────────

const JAB_SPEED = 0.08;
const JAB_ARM_ANGLE_MIN = 130;  // near-straight arm
const HOOK_SPEED = 0.06;
const HOOK_ARM_ANGLE_LO = 50;
const HOOK_ARM_ANGLE_HI = 130;
const HOOK_SHOULDER_ROT = 15;
const UPPERCUT_RISE = 0.03;    // wrist moving upward significantly
const SLIP_HEAD = 0.04;        // head lateral offset

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
  if (move === "idle") return { move, poseScore: 0, powerScore: 0 };

  // Pose score: how "tight" the form is (simplified)
  const R_SHOULDER = 12, R_ELBOW = 14, R_WRIST = 16;
  const armAngle = angle3(landmarks[R_SHOULDER], landmarks[R_ELBOW], landmarks[R_WRIST]);

  let poseScore = 50;
  switch (move) {
    case "jab":
      // Jab wants near-straight arm (150-180°)
      poseScore = armAngle > 150 ? 100 : Math.max(0, 100 - (150 - armAngle));
      break;
    case "hook":
      // Hook wants ~90° arm bend
      poseScore = Math.abs(armAngle - 90) < 20 ? 100 : Math.max(0, 100 - Math.abs(armAngle - 90) * 1.5);
      break;
    default:
      poseScore = 70;
  }

  // Power score: based on wrist velocity (simplified as relative measure)
  const powerScore = Math.min(100, poseScore * 0.8);

  return { move, poseScore: Math.round(poseScore), powerScore: Math.round(powerScore) };
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
