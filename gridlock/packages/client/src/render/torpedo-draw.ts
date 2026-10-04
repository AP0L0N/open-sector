/**
 * A running torpedo, seen through the water just under the surface: a steel
 * body with an ogive nose, a band of the owner's colour behind the warhead,
 * cruciform tail fins and a spinning screw, all under a green-blue water film
 * so it reads as submerged. Behind it a bubble trail and a faint V wake.
 * Everything is in screen px; the caller projects the nose and tail.
 */

type P2 = { x: number; y: number };

/** The body is drawn this see-through: it runs below the surface. */
export const TORPEDO_SUBMERGED_ALPHA = 0.62;
/** Half the body's thickness on screen, px. */
export const TORPEDO_RADIUS_PX = 2.3;

/**
 * Outline of the body from tail to nose: a tapered tail cone, a straight run,
 * and a round ogive nose. Closed, symmetric about the tail→nose axis.
 */
export function torpedoOutline(tail: P2, nose: P2, r: number): P2[] {
  const dx = nose.x - tail.x;
  const dy = nose.y - tail.y;
  const len = Math.hypot(dx, dy) || 1;
  const ax = dx / len;
  const ay = dy / len;
  const px = -ay;
  const py = ax;
  const at = (t: number, w: number): P2 => ({ x: tail.x + ax * len * t + px * w, y: tail.y + ay * len * t + py * w });
  // Half-width along the body, 0 = tail, 1 = nose tip.
  const profile: [number, number][] = [
    [0, r * 0.35],
    [0.12, r * 0.8],
    [0.2, r],
    [0.78, r],
    [0.86, r * 0.95],
    [0.92, r * 0.8],
    [0.96, r * 0.58],
    [0.99, r * 0.28],
    [1, 0],
  ];
  const left = profile.map(([t, w]) => at(t, w));
  const right = profile
    .slice(0, -1)
    .reverse()
    .map(([t, w]) => at(t, -w));
  return [...left, ...right];
}

function poly(ctx: CanvasRenderingContext2D, pts: readonly P2[]): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

/** Deterministic 0–1 noise for bubble `i` of torpedo `seed`. */
function hash(seed: number, i: number): number {
  let h = (seed * 374761393 + i * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function drawTorpedoBody(
  ctx: CanvasRenderingContext2D,
  opts: {
    tail: P2;
    nose: P2;
    /** Far end of the wake, behind the tail. */
    wake: P2;
    /** Owner colour for the band. */
    color: string;
    /** ms clock for the screw and the bubbles. */
    now: number;
    seed: number;
  },
): void {
  const { tail, nose, wake, color, now, seed } = opts;
  const dx = nose.x - tail.x;
  const dy = nose.y - tail.y;
  const len = Math.hypot(dx, dy) || 1;
  const ax = dx / len;
  const ay = dy / len;
  const px = -ay;
  const py = ax;
  const r = TORPEDO_RADIUS_PX;
  const wl = Math.hypot(wake.x - tail.x, wake.y - tail.y) || 1;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // V wake: two thin lines of disturbed water opening out behind it.
  for (const side of [-1, 1]) {
    const end = { x: wake.x + px * side * wl * 0.22, y: wake.y + py * side * wl * 0.22 };
    const g = ctx.createLinearGradient(tail.x, tail.y, end.x, end.y);
    g.addColorStop(0, "rgba(225,242,246,0.38)");
    g.addColorStop(1, "rgba(225,242,246,0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
  // Churned centre line, brightest right behind the screw.
  {
    const g = ctx.createLinearGradient(tail.x, tail.y, wake.x, wake.y);
    g.addColorStop(0, "rgba(236,248,250,0.5)");
    g.addColorStop(1, "rgba(236,248,250,0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(wake.x, wake.y);
    ctx.stroke();
  }
  // Bubbles rising off the screw, drifting back along the trail and popping.
  const n = 14;
  const flow = (now / 900) % 1;
  for (let i = 0; i < n; i++) {
    const u = (i / n + flow + hash(seed, i) * 0.07) % 1;
    const jitter = (hash(seed, i + 31) - 0.5) * 2 * (1 + u * 3);
    const bx = tail.x + (wake.x - tail.x) * u * 0.85 + px * jitter;
    const by = tail.y + (wake.y - tail.y) * u * 0.85 + py * jitter;
    const br = 0.5 + hash(seed, i + 77) * 0.8 * (1 - u * 0.5);
    ctx.globalAlpha = 0.65 * (1 - u);
    ctx.fillStyle = "#f4fbfc";
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }

  // The body itself, under the water.
  ctx.globalAlpha = TORPEDO_SUBMERGED_ALPHA;
  // Tail fins: cruciform, seen as a pair of swept tabs and a short dorsal stroke.
  const finAt = { x: tail.x + ax * len * 0.1, y: tail.y + ay * len * 0.1 };
  ctx.fillStyle = "#2c353b";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(finAt.x + px * side * r * 0.7, finAt.y + py * side * r * 0.7);
    ctx.lineTo(tail.x + px * side * r * 1.9 - ax * 1.2, tail.y + py * side * r * 1.9 - ay * 1.2);
    ctx.lineTo(tail.x + px * side * r * 0.4, tail.y + py * side * r * 0.4);
    ctx.closePath();
    ctx.fill();
  }
  // Steel body, lit along one flank.
  const outline = torpedoOutline(tail, nose, r);
  const mid = { x: tail.x + dx * 0.5, y: tail.y + dy * 0.5 };
  const shade = ctx.createLinearGradient(mid.x + px * r, mid.y + py * r, mid.x - px * r, mid.y - py * r);
  shade.addColorStop(0, "#a9b4b9");
  shade.addColorStop(0.35, "#6d7a81");
  shade.addColorStop(1, "#1d2428");
  poly(ctx, outline);
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.strokeStyle = "rgba(12,16,18,0.9)";
  ctx.lineWidth = 0.7;
  ctx.stroke();
  // Owner band behind the warhead, and a darker warhead seam.
  const band = (t0: number, t1: number, fill: string): void => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(tail.x + dx * t0 + px * r, tail.y + dy * t0 + py * r);
    ctx.lineTo(tail.x + dx * t1 + px * r, tail.y + dy * t1 + py * r);
    ctx.lineTo(tail.x + dx * t1 - px * r, tail.y + dy * t1 - py * r);
    ctx.lineTo(tail.x + dx * t0 - px * r, tail.y + dy * t0 - py * r);
    ctx.closePath();
    ctx.fill();
  };
  band(0.62, 0.72, color);
  band(0.77, 0.79, "rgba(18,22,24,0.8)");
  // A glint running down the lit flank.
  ctx.strokeStyle = "rgba(235,244,246,0.75)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(tail.x + dx * 0.22 + px * r * 0.55, tail.y + dy * 0.22 + py * r * 0.55);
  ctx.lineTo(tail.x + dx * 0.9 + px * r * 0.45, tail.y + dy * 0.9 + py * r * 0.45);
  ctx.stroke();
  // The screw: a blurred disc with one blade catching the light as it spins.
  const spin = (now / 45 + seed) % (Math.PI * 2);
  ctx.fillStyle = "rgba(60,68,72,0.8)";
  ctx.beginPath();
  ctx.ellipse(tail.x, tail.y, r * 0.5, r * 1.15, Math.atan2(ay, ax), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(200,208,210,0.85)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(tail.x + px * Math.cos(spin) * r * 1.1, tail.y + py * Math.cos(spin) * r * 1.1);
  ctx.lineTo(tail.x - px * Math.cos(spin) * r * 1.1, tail.y - py * Math.cos(spin) * r * 1.1);
  ctx.stroke();

  // Water over the top: a green-blue film and a ripple line, so it sits below the surface.
  ctx.globalAlpha = 0.3;
  poly(ctx, torpedoOutline({ x: tail.x - ax, y: tail.y - ay }, { x: nose.x + ax, y: nose.y + ay }, r + 0.8));
  ctx.fillStyle = "#2f6b78";
  ctx.fill();
  const ripple = 0.5 + 0.5 * Math.sin(now / 160 + seed);
  ctx.globalAlpha = 0.25 + 0.2 * ripple;
  ctx.strokeStyle = "#d9f1f4";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(nose.x + ax * 1.5 + px * r * 1.4, nose.y + ay * 1.5 + py * r * 1.4);
  ctx.quadraticCurveTo(nose.x + ax * 3.2, nose.y + ay * 3.2, nose.x + ax * 1.5 - px * r * 1.4, nose.y + ay * 1.5 - py * r * 1.4);
  ctx.stroke();
  ctx.restore();
}
