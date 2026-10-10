/**
 * One Laser Fence beam between two posts' emitter collars: a soft cyan glow and a hot white-green
 * core that shimmers along its length. Purely a picture; sim/laser-fence.ts burns what touches it.
 */

/** Brightness 0.75–1 of a beam at `now`, out of step with its neighbours by `seed`. */
export function fenceBeamFlicker(now: number, seed: number): number {
  const a = Math.sin(now / 47 + seed * 1.7);
  const b = Math.sin(now / 113 + seed * 0.61);
  return 0.875 + 0.0625 * (a + b);
}

export function drawFenceBeam(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  now: number,
  seed: number,
  alpha = 1,
): void {
  const k = fenceBeamFlicker(now, seed) * alpha;
  ctx.save();
  ctx.lineCap = "round";
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(60, 230, 200, ${0.22 * k})`;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.strokeStyle = `rgba(120, 255, 220, ${0.55 * k})`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = `rgba(235, 255, 245, ${0.85 * k})`;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // A bead of light runs along the beam, so it reads as live current, not a painted line.
  const u = ((now / 900 + seed * 0.37) % 1 + 1) % 1;
  const bx = from.x + (to.x - from.x) * u;
  const by = from.y + (to.y - from.y) * u;
  ctx.fillStyle = `rgba(220, 255, 240, ${0.7 * k})`;
  ctx.beginPath();
  ctx.arc(bx, by, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** New arcs this often, in ms: the crackle jumps rather than slides. */
const ZAP_FRAME_MS = 55;

/** 0–1, the same for a given frame and seed. */
function zapRand(frame: number, seed: number, k: number): number {
  const s = Math.sin(frame * 12.9898 + seed * 78.233 + k * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * A unit burning in a fence beam: jagged arcs crackle over its body, in the beam's colours, and a
 * cyan sheen sits on it. (cx, cy) is the body's centre on screen, (rx, ry) its half width and height.
 */
export function drawFenceZap(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, now: number, seed: number): void {
  const frame = Math.floor(now / ZAP_FRAME_MS);
  const kink = Math.min(rx, ry) * 0.9;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const sheen = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  sheen.addColorStop(0, `rgba(120, 255, 220, ${0.3 + 0.15 * zapRand(frame, seed, 0)})`);
  sheen.addColorStop(1, "rgba(60, 230, 200, 0)");
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 1.3, ry * 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const arcs = 3 + Math.floor(zapRand(frame, seed, 1) * 2);
  for (let i = 0; i < arcs; i++) {
    // Rim to rim across the body, kinked at every step.
    const a0 = zapRand(frame, seed, 10 + i) * Math.PI * 2;
    const a1 = a0 + Math.PI * (0.6 + 0.8 * zapRand(frame, seed, 20 + i));
    const x0 = cx + Math.cos(a0) * rx;
    const y0 = cy + Math.sin(a0) * ry;
    const x1 = cx + Math.cos(a1) * rx;
    const y1 = cy + Math.sin(a1) * ry;
    const steps = 5;
    const pts: { x: number; y: number }[] = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const jag = s === 0 || s === steps ? 0 : (zapRand(frame, seed, 100 + i * 10 + s) - 0.5) * kink;
      pts.push({ x: x0 + (x1 - x0) * t + jag, y: y0 + (y1 - y0) * t + jag * 0.6 });
    }
    const trace = () => {
      ctx.beginPath();
      pts.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    };
    ctx.strokeStyle = "rgba(60, 230, 200, 0.45)";
    ctx.lineWidth = 3;
    trace();
    ctx.strokeStyle = "rgba(235, 255, 245, 0.95)";
    ctx.lineWidth = 1;
    trace();
  }
  ctx.restore();
}
