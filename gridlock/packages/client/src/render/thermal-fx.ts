/**
 * What your Cyborgs pick up off the fog mask: a soldier's heat in a Cyborg's
 * thermal cone or round a Commander, and an armored hull on the Commander's
 * APS radar. Nothing here changes the field; the sim says what is read and where.
 */

/** One breath of a heat spot. */
export const HEAT_PULSE_MS = 1600;
/** One APS sweep: the grid runs over the hull for SCAN_MS of every SCAN_PERIOD_MS. */
export const SCAN_PERIOD_MS = 2400;
export const SCAN_MS = 1000;

/** This contact's own offset, so a squad of contacts does not pulse as one. */
function offset(id: number, period: number): number {
  return (Math.abs(Math.trunc(id)) * 397) % period;
}

/** 0–1, swelling and falling once per HEAT_PULSE_MS. */
export function heatPulse(nowMs: number, id: number): number {
  const t = (nowMs + offset(id, HEAT_PULSE_MS)) / HEAT_PULSE_MS;
  return 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
}

/** 0–1 through the running sweep, or null between sweeps. */
export function scanPhase(nowMs: number, id: number): number | null {
  const t = ((((nowMs + offset(id, SCAN_PERIOD_MS)) % SCAN_PERIOD_MS) + SCAN_PERIOD_MS) % SCAN_PERIOD_MS);
  return t < SCAN_MS ? t / SCAN_MS : null;
}

/**
 * A soldier's heat: a dark orange glow on the ground under him and an upright
 * yellow core where he stands, both breathing. `unit` is one tile in screen px.
 */
export function drawHeatContact(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opts: { nowMs: number; id: number; unit: number },
): void {
  const k = heatPulse(opts.nowMs, opts.id);
  const u = opts.unit;
  ctx.save();
  const rg = u * (0.24 + 0.05 * k);
  ctx.fillStyle = `rgba(190, 80, 10, ${(0.1 + 0.08 * k).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rg, rg / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  const by = y - u * 0.15;
  ctx.fillStyle = `rgba(215, 105, 15, ${(0.3 + 0.15 * k).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(x, by, u * (0.09 + 0.015 * k), u * (0.16 + 0.02 * k), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255, 200, 60, ${(0.25 + 0.25 * k).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(x, by - u * 0.02, u * 0.045, u * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * An armored hull on the APS radar. A faint diamond holds the spot between
 * sweeps; every SCAN_PERIOD_MS a grid laid flat on the ground (2:1 like the
 * map) fades in over the hull, a bright line runs across it, and it fades out.
 */
export function drawScanContact(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opts: { nowMs: number; id: number; unit: number },
): void {
  const w = opts.unit * 0.6;
  const h = w / 2;
  // Grid corners: top, right, bottom, left. A point on it is top + u·(right − top) + v·(left − top).
  const at = (u: number, v: number): [number, number] => [x + (u - v) * w, y - h + (u + v) * h];
  const line = (a: [number, number], b: [number, number]): void => {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  };
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(120, 225, 255, 0.14)";
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x - w, y);
  ctx.closePath();
  ctx.stroke();
  const s = scanPhase(opts.nowMs, opts.id);
  if (s != null) {
    const a = Math.sin(Math.PI * s);
    ctx.strokeStyle = `rgba(120, 225, 255, ${(0.28 * a).toFixed(3)})`;
    const n = 3;
    for (let i = 0; i <= n; i++) {
      line(at(i / n, 0), at(i / n, 1));
      line(at(0, i / n), at(1, i / n));
    }
    ctx.strokeStyle = `rgba(215, 248, 255, ${(0.55 * a).toFixed(3)})`;
    line(at(s, 0), at(s, 1));
  }
  ctx.restore();
}
