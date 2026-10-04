const KEY_SFX = "gridlock.sfx";
const KEY_MUSIC = "gridlock.music";

/** Number(null) is 0, so an unset key would read as muted instead of the default. */
function readLevel(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  const n = raw === null || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

export function getSfx(): number {
  return readLevel(KEY_SFX, 0.4);
}

export function getMusic(): number {
  return readLevel(KEY_MUSIC, 0.3);
}

export function setSfx(v: number): void {
  localStorage.setItem(KEY_SFX, String(v));
  document.documentElement.style.setProperty("--sfx", String(v));
}

export function setMusic(v: number): void {
  localStorage.setItem(KEY_MUSIC, String(v));
  document.documentElement.style.setProperty("--music", String(v));
}

let ctx: AudioContext | null = null;

export function beep(): void {
  const vol = getSfx();
  if (vol <= 0) return;
  try {
    ctx ??= new AudioContext();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 420;
    g.gain.value = 0.05 * vol;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.07);
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    /* autoplay restrictions */
  }
}

export function buzzDeny(): void {
  const vol = getSfx();
  if (vol <= 0) return;
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.18);
    g.gain.value = 0.07 * vol;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.stop(now + 0.24);
  } catch {
    /* autoplay restrictions */
  }
}

export function bindClicks(root: HTMLElement): void {
  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const t = e.target;
    const btn = t instanceof HTMLElement ? t.closest("button") : null;
    if (btn instanceof HTMLButtonElement && !btn.disabled && btn.getAttribute("aria-disabled") !== "true") {
      beep();
    }
  });
}

const buffers = new Map<string, Promise<AudioBuffer | null>>();
const voices = new Map<string, number>();
/** Start times (ms) of recent plays per file, for the burst cap. */
const recent = new Map<string, number[]>();
/** Same file started this close together counts as one burst. */
const BURST_MS = 90;
const BURST_MAX = 2;
let bus: AudioNode | null = null;

/** Samples share a soft limiter so a volley sums without clipping. */
function sampleBus(ac: AudioContext): AudioNode {
  if (bus) return bus;
  const lim = ac.createDynamicsCompressor();
  lim.threshold.value = -10;
  lim.knee.value = 8;
  lim.ratio.value = 6;
  lim.attack.value = 0.003;
  lim.release.value = 0.25;
  lim.connect(ac.destination);
  bus = lim;
  return bus;
}

function sample(url: string): Promise<AudioBuffer | null> {
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => (ctx ??= new AudioContext()).decodeAudioData(b))
      .catch(() => null);
    buffers.set(url, p);
  }
  return p;
}

/** Fetch and decode ahead of the first play, so the first shot is not late. */
export function preloadSample(url: string): void {
  void sample(url);
}

/**
 * One positioned play of a sound file. `gain` is 0..1 before the player's SFX volume.
 * At most `maxVoices` copies of one file ring at once, and at most two start inside
 * one short burst (the rest are dropped, as RTS engines do, so a tank line firing
 * on the same tick stays a volley and not a wall). The second of a burst lands a
 * few ms late, and pitch wobbles by `jitter`, so repeats do not sound machine-made.
 */
export function playSample(
  url: string,
  mix: { gain: number; pan: number; lowpassHz: number },
  opts: { volume?: number; maxVoices?: number; jitter?: number } = {},
): void {
  const vol = getSfx() * (opts.volume ?? 1) * mix.gain;
  if (vol <= 0.001 || document.hidden) return;
  const max = opts.maxVoices ?? 4;
  if ((voices.get(url) ?? 0) >= max) return;
  const nowMs = performance.now();
  const burst = (recent.get(url) ?? []).filter((t) => nowMs - t < BURST_MS);
  if (burst.length >= BURST_MAX) return;
  burst.push(nowMs);
  recent.set(url, burst);
  const delay = burst.length > 1 ? 0.012 + Math.random() * 0.023 : 0;
  voices.set(url, (voices.get(url) ?? 0) + 1);
  const release = () => voices.set(url, Math.max(0, (voices.get(url) ?? 1) - 1));
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    release();
    return;
  }
  const at = ctx.currentTime;
  void sample(url).then((buf) => {
    // Decoding the first time can take a moment; a shot that late is stale.
    if (!buf || !ctx || ctx.currentTime - at > 0.25) {
      release();
      return;
    }
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const j = opts.jitter ?? 0.06;
      src.playbackRate.value = 1 + (Math.random() * 2 - 1) * j;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = Math.min(mix.lowpassHz, ctx.sampleRate / 2 - 100);
      const pan = ctx.createStereoPanner();
      pan.pan.value = mix.pan;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(lp).connect(pan).connect(g).connect(sampleBus(ctx));
      src.onended = release;
      src.start(ctx.currentTime + delay);
    } catch {
      release();
    }
  });
}
