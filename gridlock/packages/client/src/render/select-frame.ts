export interface FramePt {
  x: number;
  y: number;
}

/** World corners of an oriented field-structure footprint, grown by `pad` on every side. */
export function fieldFrameCorners(
  x: number,
  y: number,
  facing: number,
  length: number,
  thick: number,
  pad: number,
): FramePt[] {
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  const tx = -fy;
  const ty = fx;
  const a = length / 2 + pad;
  const c = thick / 2 + pad;
  return [
    { x: x - tx * a - fx * c, y: y - ty * a - fy * c },
    { x: x + tx * a - fx * c, y: y + ty * a - fy * c },
    { x: x + tx * a + fx * c, y: y + ty * a + fy * c },
    { x: x - tx * a + fx * c, y: y - ty * a + fy * c },
  ];
}

/** Ground plate plus corner brackets under a selected structure. `pts` are screen corners in ring order. */
export function drawSelectFrame(
  ctx: CanvasRenderingContext2D,
  pts: readonly FramePt[],
  opts: { hostile: boolean; now: number },
): void {
  if (pts.length < 3) return;
  const pulse = 0.5 + 0.5 * Math.sin(opts.now / 260);
  const color = opts.hostile ? "255, 110, 84" : "236, 232, 150";
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
  ctx.fillStyle = `rgba(${color}, ${0.1 + 0.08 * pulse})`;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(${color}, ${0.35 + 0.2 * pulse})`;
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(${color}, ${0.75 + 0.25 * pulse})`;
  ctx.shadowColor = `rgba(${color}, 0.6)`;
  ctx.shadowBlur = 4;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const prev = pts[(i + pts.length - 1) % pts.length]!;
    const next = pts[(i + 1) % pts.length]!;
    ctx.moveTo(p.x + (prev.x - p.x) * 0.3, p.y + (prev.y - p.y) * 0.3);
    ctx.lineTo(p.x, p.y);
    ctx.lineTo(p.x + (next.x - p.x) * 0.3, p.y + (next.y - p.y) * 0.3);
  }
  ctx.stroke();
  ctx.restore();
}
