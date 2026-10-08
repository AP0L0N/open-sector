/**
 * A Titan on its leg jets: two burner flames under the feet and the ground
 * washed bright and dusty below. Client-only.
 */

/** Flame length as a share of the sprite's draw size, from 0 (cold) to full burn. */
export function titanFlameLength(size: number, burn: number, now: number, seed: number): number {
  const flicker = 0.85 + 0.15 * Math.sin(now / 37 + seed) * Math.sin(now / 53 + seed * 1.7);
  return size * 0.34 * Math.max(0, Math.min(1, burn)) * flicker;
}

/**
 * `foot`: the lifted contact point of the sprite. `ground`: the screen point
 * under it. `burn`: 1 while it climbs or holds height, less as it sinks.
 */
export function drawTitanThrust(
  ctx: CanvasRenderingContext2D,
  foot: { x: number; y: number },
  ground: { x: number; y: number },
  size: number,
  burn: number,
  now: number,
  seed: number,
): void {
  if (burn <= 0.02) return;
  ctx.save();
  // Light and dust on the ground below, stronger the lower it hangs.
  const lift = Math.max(1, ground.y - foot.y);
  const near = Math.max(0.15, 1 - lift / (size * 1.6));
  const wash = size * (0.45 + 0.25 * (1 - near));
  ctx.globalCompositeOperation = "lighter";
  const gg = ctx.createRadialGradient(ground.x, ground.y, 0, ground.x, ground.y, wash);
  gg.addColorStop(0, `rgba(255,170,80,${(0.45 * near * burn).toFixed(3)})`);
  gg.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.ellipse(ground.x, ground.y, wash, wash * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Two burners, one under each foot.
  for (const side of [-1, 1]) {
    const x = foot.x + side * size * 0.11;
    const y = foot.y - size * 0.02;
    const len = titanFlameLength(size, burn, now, seed + side * 3.1);
    const w = size * 0.055;
    const fg = ctx.createLinearGradient(x, y, x, y + len);
    fg.addColorStop(0, "rgba(255,255,240,0.95)");
    fg.addColorStop(0.25, "rgba(255,214,110,0.9)");
    fg.addColorStop(0.65, "rgba(255,120,40,0.55)");
    fg.addColorStop(1, "rgba(200,60,20,0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w * 0.6, y + len * 0.5, x, y + len);
    ctx.quadraticCurveTo(x + w * 0.6, y + len * 0.5, x + w, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
