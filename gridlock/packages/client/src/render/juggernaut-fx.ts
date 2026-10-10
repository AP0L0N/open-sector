import { JUGGERNAUT_FIST_SECONDS, JUGGERNAUT_HAMMER_SECONDS } from "@gridlock/shared";

/**
 * Juggernaut on the map: which of its sheets shows and on which frame, and the
 * hammer tumbling through the air once it is thrown.
 */

export type JuggernautSheet = "walk" | "swing" | "fists" | "punch" | "throw" | "ram" | "ramhit";

/** World px it covers in one 8-frame stride (two steps): a giant's step is long. */
export const JUGGERNAUT_STRIDE_WORLD = 45;
/** The charge's stride: longer, low bounding steps. */
export const JUGGERNAUT_RAM_STRIDE_WORLD = 65;
/** Game ms the throw sheet plays, four frames. */
export const JUGGERNAUT_THROW_MS = 640;
/** Game ms the slam sheet plays: the contact, rocked back, settling, on guard. */
export const JUGGERNAUT_RAMHIT_MS = 560;
/** Real ms the slam's shock and dust last on the ground. */
export const RAM_SHOCK_MS = 700;
/** Game ms a punch takes on its sheet: four frames, then the guard is held. */
const PUNCH_MS = JUGGERNAUT_FIST_SECONDS * 1000;
const SWING_MS = JUGGERNAUT_HAMMER_SECONDS * 1000;
/** Swing frame held while the hammer waits high for the next blow. */
const SWING_HELD_FRAME = 5;

export interface JuggernautPose {
  sheet: JuggernautSheet;
  /** Set when the frame comes from the blow or throw clock; unset: stride with the ground. */
  frame?: number;
}

/**
 * Sheet and frame. `blowAt`/`throwAt` are the moments (ms, same clock as `now`) its last blow
 * landed and the hammer left its hands; `speed` is the game speed. A swing loops from the hit:
 * frame 0 is the hammer on the ground, and the hammer waits high until the next blow lands.
 * Punches alternate hands, `blows` counting them. Walking ends a fight pose. A charge (`ramming`)
 * runs on the ram sheet, striding with the ground; the slam (`ramHitAt`) plays over everything.
 * The client swaps in the fists' ram sheets once the hammer is gone.
 */
export function pickJuggernautPose(o: {
  fists: boolean;
  stepping: boolean;
  now: number;
  speed: number;
  blowAt?: number;
  blows?: number;
  throwAt?: number;
  ramming?: boolean;
  ramHitAt?: number;
}): JuggernautPose {
  const speed = o.speed > 0 ? o.speed : 1;
  if (o.ramHitAt != null) {
    const age = (o.now - o.ramHitAt) * speed;
    if (age >= 0 && age < JUGGERNAUT_RAMHIT_MS) return { sheet: "ramhit", frame: Math.min(3, Math.floor((age / JUGGERNAUT_RAMHIT_MS) * 4)) };
  }
  if (o.ramming) return { sheet: "ram" };
  if (o.throwAt != null) {
    const age = (o.now - o.throwAt) * speed;
    if (age >= 0 && age < JUGGERNAUT_THROW_MS) return { sheet: "throw", frame: Math.min(3, Math.floor((age / JUGGERNAUT_THROW_MS) * 4)) };
  }
  const walk: JuggernautPose = { sheet: o.fists ? "fists" : "walk" };
  if (o.blowAt == null) return walk;
  const age = (o.now - o.blowAt) * speed;
  if (age < 0) return walk;
  if (o.stepping && age > 250) return walk;
  if (o.fists) {
    if (age > PUNCH_MS * 1.6) return walk;
    const offset = (o.blows ?? 1) % 2 === 1 ? 0 : 4;
    return { sheet: "punch", frame: offset + Math.min(3, Math.floor((age / PUNCH_MS) * 4)) };
  }
  if (age > SWING_MS * 1.6) return walk;
  if (age >= SWING_MS * (SWING_HELD_FRAME / 8)) return { sheet: "swing", frame: SWING_HELD_FRAME };
  return { sheet: "swing", frame: Math.floor((age / SWING_MS) * 8) };
}

/**
 * The thrown hammer: a dark haft and a lit alloy head turning end over end at (x, y), with a
 * shadow on the ground at (gx, gy). Screen px, sized to the hammer on the sprite.
 */
export function drawThrownHammer(ctx: CanvasRenderingContext2D, x: number, y: number, gx: number, gy: number, now: number, id: number): void {
  const spin = now * 0.016 + id * 1.7;
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.ellipse(gx, gy, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#1a1410";
  // Haft: butt to head, through the middle so it turns about its weight.
  ctx.fillStyle = "#2a302c";
  ctx.fillRect(-9, -1.2, 14, 2.4);
  ctx.strokeRect(-9, -1.2, 14, 2.4);
  // Head across the haft, a green band either side.
  ctx.fillStyle = "#62706a";
  ctx.fillRect(4, -5.5, 6, 11);
  ctx.strokeRect(4, -5.5, 6, 11);
  ctx.fillStyle = "#60cc48";
  ctx.fillRect(5, -5, 1, 10);
  ctx.fillRect(8, -5, 1, 10);
  ctx.restore();
}

/**
 * Behind a charging Juggernaut: dust kicked up from its heels and a few streaks of speed, at
 * (x, y) screen px, running back from it along (dx, dy) (screen, unit length). `unit` is a cell.
 */
export function drawRamTrail(ctx: CanvasRenderingContext2D, x: number, y: number, o: { dx: number; dy: number; nowMs: number; id: number; unit: number }): void {
  const { dx, dy, unit } = o;
  ctx.save();
  for (let k = 0; k < 9; k++) {
    // Each puff drifts back and fades on its own clock, so the trail churns.
    const u = ((o.nowMs / 420 + k / 9 + o.id * 0.37) % 1 + 1) % 1;
    const back = unit * (0.3 + 1.5 * u);
    const side = Math.sin(k * 2.4 + o.id) * unit * 0.35;
    const px = x - dx * back - dy * side;
    const py = y - dy * back + dx * side * 0.5;
    const r = unit * (0.55 + 0.7 * u);
    ctx.fillStyle = `rgba(128, 112, 88, ${(0.3 * (1 - u)).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(220, 230, 210, 0.35)";
  ctx.lineWidth = 1;
  for (const s of [-0.5, 0.1, 0.6]) {
    const ox = -dy * s * unit * 0.7;
    const oy = dx * s * unit * 0.35 - unit * 0.6;
    const len = unit * (1.1 + 0.4 * Math.sin(o.nowMs / 90 + s * 5));
    ctx.beginPath();
    ctx.moveTo(x + ox - dx * unit * 0.6, y + oy - dy * unit * 0.6);
    ctx.lineTo(x + ox - dx * (unit * 0.6 + len), y + oy - dy * (unit * 0.6 + len));
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Where a Juggernaut's ram struck: a green flash, a shock ring on the ground, dirt and chunks
 * thrown forward along (dx, dy). `age` runs 0–1 over RAM_SHOCK_MS.
 */
export function drawRamShock(ctx: CanvasRenderingContext2D, x: number, y: number, o: { age: number; dx: number; dy: number; unit: number; seed: number }): void {
  const a = Math.max(0, Math.min(1, o.age));
  if (a >= 1) return;
  const { unit, dx, dy } = o;
  ctx.save();
  const flash = Math.max(0, 1 - a * 6);
  if (flash > 0) {
    const g = ctx.createRadialGradient(x, y - unit * 0.6, 0, x, y - unit * 0.6, unit * 2.2);
    g.addColorStop(0, `rgba(232, 255, 214, ${(0.95 * flash).toFixed(3)})`);
    g.addColorStop(0.4, `rgba(130, 255, 96, ${(0.6 * flash).toFixed(3)})`);
    g.addColorStop(1, "rgba(96, 204, 72, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y - unit * 0.6, unit * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // The dust cloud, rolling forward off the blow.
  const dust = unit * (0.9 + 1.9 * Math.sqrt(a));
  ctx.fillStyle = `rgba(124, 110, 86, ${(0.5 * (1 - a)).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(x + dx * dust * 0.5, y + dy * dust * 0.25, dust, dust / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Shock ring, 2:1 on the ground.
  const wave = unit * (0.6 + 3.2 * a);
  ctx.strokeStyle = `rgba(214, 238, 200, ${(0.75 * (1 - a)).toFixed(3)})`;
  ctx.lineWidth = 2.5 * (1 - a) + 0.5;
  ctx.beginPath();
  ctx.ellipse(x, y, wave, wave / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Chunks flung forward on arcs.
  ctx.fillStyle = "#3a332a";
  for (let k = 0; k < 7; k++) {
    const spread = (((k * 7919 + o.seed * 31) % 100) / 100 - 0.5) * 1.6;
    const cx = dx * Math.cos(spread) - dy * Math.sin(spread);
    const cy = dy * Math.cos(spread) + dx * Math.sin(spread);
    const run = unit * (0.5 + 2.6 * a) * (0.6 + ((k * 37) % 10) / 20);
    const lift = unit * 2.2 * a * (1 - a) * (1 + (k % 3) * 0.4);
    const s = Math.max(1, 2.4 * (1 - a));
    ctx.fillRect(x + cx * run - s / 2, y + cy * run * 0.5 - lift - s / 2, s, s);
  }
  ctx.restore();
}
