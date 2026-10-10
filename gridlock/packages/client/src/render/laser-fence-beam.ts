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
