// ── SFX: tiny WebAudio synth (game-feel layer) ─────────────────────────────
// No assets, no network — every sound is a short envelope blip/boom built from
// oscillators. The AudioContext is created lazily on the first user gesture
// (browser autoplay policy). "n" toggles mute, persisted to localStorage.
// Client-only feedback: nothing here touches the server protocol.

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
try {
  muted = localStorage.getItem("tya.muted") === "1";
} catch {
  /* private mode — default unmuted */
}

function ensure(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  if (!ac) {
    ac = new AudioContext();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ac.destination);
  }
  if (ac.state === "suspended") void ac.resume();
  return ac;
}

/** One blip: pitch glides f0→f1 over dur seconds with an exponential fade. */
function blip(
  f0: number,
  f1: number,
  dur: number,
  type: OscillatorType = "square",
  gain = 0.2,
  delay = 0,
): void {
  if (muted || !ensure() || !ac || !master) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, f0), t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

window.addEventListener("pointerdown", () => void ensure(), { once: true });
window.addEventListener("keydown", (e) => {
  void ensure();
  if (e.key.toLowerCase() === "n" && !e.repeat) toggleMute();
});

export function toggleMute(): boolean {
  muted = !muted;
  try {
    localStorage.setItem("tya.muted", muted ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

export function isMuted(): boolean {
  return muted;
}

/** Tank death: low boom, layered. `near` scales volume (0..1, by distance). */
export function boom(near: number): void {
  const v = 0.12 + 0.22 * near;
  blip(150, 34, 0.5, "sawtooth", v);
  blip(76, 28, 0.62, "triangle", v * 0.8, 0.04);
}

/** Mine detonation: sharper, shorter than a death boom. */
export function mineBoom(near: number): void {
  const v = 0.1 + 0.18 * near;
  blip(240, 60, 0.3, "square", v);
  blip(120, 40, 0.36, "triangle", v * 0.7, 0.03);
}

/** You got the kill: bright confirm chirp. */
export function killConfirm(): void {
  blip(660, 990, 0.09, "square", 0.16);
  blip(990, 1320, 0.1, "square", 0.12, 0.07);
}

/** You died: short falling figure. */
export function yourDeath(): void {
  [330, 262, 196].forEach((f, i) => blip(f, f * 0.9, 0.18, "sawtooth", 0.16, i * 0.11));
}

/** Rank/tier up: rising two-note stinger. */
export function rankUp(): void {
  blip(523, 523, 0.12, "triangle", 0.16);
  blip(784, 784, 0.16, "triangle", 0.16, 0.1);
}
