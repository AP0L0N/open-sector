/**
 * The ground a Neural Pulsar's dome covers (sim/energy-shield.ts, NEURAL_PULSAR_DOME): a faint
 * energy rim where the dome meets the ground, a breath of green inside it, and a slow ring that
 * pulses out from the Nexus to the rim. By night the whole area is lit as by day (the cut layer,
 * MapView.cutGlow), feathered at the rim. Nothing shows while the dome is down.
 */

type Pt = { x: number; y: number };

/** Points round the rim: enough that a 12-cell circle reads round on screen. */
export const PULSAR_AREA_SEGMENTS = 48;
/** Ms for one pulse to travel from the Nexus out to the rim. */
export const PULSAR_PULSE_MS = 4200;
/** How strong the area reads by day; full strength comes with the dark (lampGlow). */
export const PULSAR_AREA_DAY = 0.6;

/** How strong the area draws at `lamp` (0 by day, 1 at night). */
export function pulsarAreaStrength(lamp: number): number {
  return PULSAR_AREA_DAY + (1 - PULSAR_AREA_DAY) * Math.max(0, Math.min(1, lamp));
}

/** World points round the dome's ground circle, centre (x, y), radius r. */
export function pulsarRim(x: number, y: number, r: number, n = PULSAR_AREA_SEGMENTS): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
  }
  return pts;
}

/** How far out (0–1) the pulse ring is at `now`, and how bright (fading as it nears the rim). */
export function pulsarPulse(now: number, id: number): { k: number; a: number } {
  const k = (((now + id * 977) % PULSAR_PULSE_MS) + PULSAR_PULSE_MS) % PULSAR_PULSE_MS / PULSAR_PULSE_MS;
  return { k, a: Math.sin(Math.PI * k) * (1 - k * 0.4) };
}

function trace(ctx: CanvasRenderingContext2D, pts: readonly Pt[], c: Pt, k = 1): void {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const x = c.x + (p.x - c.x) * k;
    const y = c.y + (p.y - c.y) * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * The area on the ground: `rim` is the dome's ground circle on screen, `c` the Nexus's foot.
 * `strength` from pulsarAreaStrength, `charge` the dome's points left 0–1 (a failing dome dims).
 */
export function drawPulsarArea(ctx: CanvasRenderingContext2D, rim: readonly Pt[], c: Pt, strength: number, charge: number, now: number, id: number): void {
  const s = strength * (0.45 + 0.55 * Math.max(0, Math.min(1, charge)));
  if (s <= 0 || rim.length < 3) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineJoin = "round";
  // A breath of green over the ground it holds.
  trace(ctx, rim, c);
  ctx.fillStyle = `rgba(90, 240, 165, ${0.035 * s})`;
  ctx.fill();
  // The rim: a soft halo and a fine bright line, shimmering a little.
  const shimmer = 0.9 + 0.1 * Math.sin(now * 0.004 + id);
  ctx.lineWidth = 7;
  ctx.strokeStyle = `rgba(90, 240, 165, ${0.07 * s * shimmer})`;
  ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = `rgba(150, 255, 210, ${0.4 * s * shimmer})`;
  ctx.stroke();
  // The pulse, out from the Nexus to the rim.
  const pulse = pulsarPulse(now, id);
  if (pulse.a > 0.01 && pulse.k > 0.04) {
    trace(ctx, rim, c, pulse.k);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = `rgba(170, 255, 220, ${0.22 * s * pulse.a})`;
    ctx.stroke();
  }
  ctx.restore();
}

/** Into the night cut layer: the whole area lit as by day, feathered at the rim. */
export function cutPulsarArea(ctx: CanvasRenderingContext2D, rim: readonly Pt[], c: Pt): void {
  if (rim.length < 3) return;
  ctx.lineJoin = "round";
  trace(ctx, rim, c);
  ctx.fillStyle = "rgba(0, 0, 0, 1)";
  ctx.fill();
  // Feather: wider, fainter bands outward from the rim.
  for (const [w, a] of [
    [6, 0.6],
    [14, 0.3],
    [26, 0.12],
  ] as const) {
    ctx.lineWidth = w;
    ctx.strokeStyle = `rgba(0, 0, 0, ${a})`;
    ctx.stroke();
  }
}
