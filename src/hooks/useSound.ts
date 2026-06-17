/**
 * Web Audio API sound effects — no external files needed.
 * Generates punch hit, combo milestone, and training start/stop sounds.
 */

let audioCtx: AudioContext | null = null;

function ctx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

/** Short punch hit — low thud + click */
export function playPunchSound() {
  try {
    const c = ctx();
    const now = c.currentTime;

    // Low thud
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.12);

    // High click for impact feel
    const osc2 = c.createOscillator();
    const gain2 = c.createGain();
    osc2.type = "square";
    osc2.frequency.setValueAtTime(800, now);
    osc2.frequency.exponentialRampToValueAtTime(200, now + 0.04);
    gain2.gain.setValueAtTime(0.15, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc2.connect(gain2).connect(c.destination);
    osc2.start(now);
    osc2.stop(now + 0.06);
  } catch { /* audio not available */ }
}

/** Combo milestone (10 punches) — rising chime */
export function playComboSound() {
  try {
    const c = ctx();
    const now = c.currentTime;

    [523, 659, 784].forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const t = now + i * 0.08;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(gain).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  } catch { /* */ }
}

/** Training start — short rising tone */
export function playStartSound() {
  try {
    const c = ctx();
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(600, now + 0.2);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch { /* */ }
}

/** Celebration cheer — fanfare for new move discovery */
export function playCheerSound() {
  try {
    const c = ctx();
    const now = c.currentTime;
    // Rising fanfare
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const t = now + i * 0.1;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.3, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  } catch { /* */ }
}

/** Training stop — short descending tone */
export function playStopSound() {
  try {
    const c = ctx();
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(200, now + 0.3);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch { /* */ }
}
