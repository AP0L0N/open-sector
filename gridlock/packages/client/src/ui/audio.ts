const KEY_SFX = "gridlock.sfx";
const KEY_MUSIC = "gridlock.music";

export function getSfx(): number {
  const n = Number(localStorage.getItem(KEY_SFX));
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.4;
}

export function getMusic(): number {
  const n = Number(localStorage.getItem(KEY_MUSIC));
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.3;
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
    if (btn instanceof HTMLButtonElement && !btn.disabled) beep();
  });
}
