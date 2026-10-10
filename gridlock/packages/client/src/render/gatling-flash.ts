/** Walker gatling muzzle flashes. Pure geometry plus a small canvas draw. */

/** Muzzle offsets on the Walker sheet, as fractions of the drawn cell. */
const ARM_SIDE = 0.21;
const ARM_REACH = 0.31;
const ARM_LIFT = 0.45;
const SHEET_STEP = (Math.PI * 2) / 16;

export interface GatlingMuzzle {
  x: number;
  y: number;
  /** Screen direction the barrel points, unit length. */
  dirX: number;
  dirY: number;
}

/** World direction to a screen vector where a horizontal world step is length 1 and depth is halved. */
function isoDir(angle: number): { x: number; y: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: (c - s) / Math.SQRT2, y: (c + s) / (2 * Math.SQRT2) };
}

function unit(v: { x: number; y: number }): { x: number; y: number } {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

/**
 * Screen muzzle points for the arms that fired. One gun is the right arm.
 * `offAim` turns the left barrel toward a second target.
 */
export function gatlingMuzzles(
  contactX: number,
  contactY: number,
  size: number,
  facing: number,
  arms: 1 | 2,
  offAim?: number,
): GatlingMuzzle[] {
  const face = Math.round(facing / SHEET_STEP) * SHEET_STEP;
  const f = isoDir(face);
  const r = isoDir(face + Math.PI / 2);
  const baseX = contactX + f.x * ARM_REACH * size;
  const baseY = contactY + f.y * ARM_REACH * size - ARM_LIFT * size;
  const aim = unit(f);
  const out: GatlingMuzzle[] = [
    { x: baseX + r.x * ARM_SIDE * size, y: baseY + r.y * ARM_SIDE * size, dirX: aim.x, dirY: aim.y },
  ];
  if (arms === 2) {
    const off = offAim != null ? unit(isoDir(offAim)) : aim;
    out.push({ x: baseX - r.x * ARM_SIDE * size, y: baseY - r.y * ARM_SIDE * size, dirX: off.x, dirY: off.y });
  }
  return out;
}

/** Rotating barrels: a short star that flickers every frame step. */
export function drawGatlingFlash(
  ctx: CanvasRenderingContext2D,
  m: GatlingMuzzle,
  size: number,
  now: number,
  seed: number,
  /** A Xenite pulse repeater: the flash is green light, not powder flame. */
  energy?: boolean,
): void {
  const phase = Math.floor(now / 45 + seed) % 3;
  const len = size * (0.16 + phase * 0.04);
  const w = size * 0.05;
  const { dirX: dx, dirY: dy } = m;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = phase === 1 ? 0.75 : 1;
  ctx.fillStyle = energy ? "#7dffc0" : "#ffd76a";
  ctx.beginPath();
  ctx.moveTo(m.x + dx * len, m.y + dy * len);
  ctx.lineTo(m.x - dy * w, m.y + dx * w);
  ctx.lineTo(m.x - dx * w * 0.6, m.y - dy * w * 0.6);
  ctx.lineTo(m.x + dy * w, m.y - dx * w);
  ctx.closePath();
  ctx.fill();
  const spread = phase === 0 ? 0.55 : -0.55;
  const sx = dx * Math.cos(spread) - dy * Math.sin(spread);
  const sy = dx * Math.sin(spread) + dy * Math.cos(spread);
  ctx.strokeStyle = energy ? "#d8fff0" : "#fff0b0";
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.beginPath();
  ctx.moveTo(m.x, m.y);
  ctx.lineTo(m.x + sx * len * 0.55, m.y + sy * len * 0.55);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(m.x, m.y, Math.max(1, size * 0.04), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
