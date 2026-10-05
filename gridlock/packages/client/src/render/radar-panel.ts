/**
 * The command bar's radar panel. Without a standing, powered Radar Station it is a
 * dark scope with a faint sweep and a legend; with one it paints the map
 * (mapview.drawMini), and blinks the contacts the dish hears but nobody sees.
 * Nothing here changes the field.
 */

/** One blink: lit for the first BLINK_DUTY of every period. */
export const RADAR_BLINK_MS = 900;
export const RADAR_BLINK_DUTY = 0.45;
/** Each contact blinks on its own clock, so a flight does not pulse as one block. */
const CONTACT_PHASE_STEPS = 7;

/** Phase in [0, 1) for a contact: stable per id, spread across the period. */
export function radarContactPhase(id: number): number {
  const n = Math.abs(Math.trunc(id));
  return ((n * 3) % CONTACT_PHASE_STEPS) / CONTACT_PHASE_STEPS;
}

/** True while this contact's dot is on. */
export function radarContactLit(nowMs: number, id: number): boolean {
  const t = (nowMs / RADAR_BLINK_MS + radarContactPhase(id)) % 1;
  return t < RADAR_BLINK_DUTY;
}

/** Red contact square, a little larger than a unit dot and with a dim halo. */
export function drawRadarContact(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(255, 70, 50, 0.28)";
  ctx.fillRect(x - 4, y - 4, 8, 8);
  ctx.fillStyle = "#ff3b2a";
  ctx.fillRect(x - 2, y - 2, 4, 4);
  ctx.restore();
}

/** Period of the dark scope's slow sweep. Decorative. */
export const RADAR_SWEEP_MS = 3600;

/** The dark panel: a dim scope ring, a slow sweep line, and NO RADAR across the middle. */
export function drawRadarOffline(ctx: CanvasRenderingContext2D, w: number, h: number, nowMs: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.42;
  ctx.save();
  ctx.strokeStyle = "rgba(120, 72, 36, 0.35)";
  ctx.lineWidth = 1;
  for (const k of [1, 0.66, 0.33]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.stroke();
  const a = ((nowMs % RADAR_SWEEP_MS) / RADAR_SWEEP_MS) * Math.PI * 2;
  ctx.strokeStyle = "rgba(160, 96, 40, 0.3)";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  ctx.stroke();
  ctx.fillStyle = "rgba(232, 184, 74, 0.55)";
  ctx.font = `${Math.max(10, Math.round(Math.min(w, h) * 0.085))}px "Share Tech Mono", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("NO RADAR", cx, cy - r * 0.12);
  ctx.font = `${Math.max(8, Math.round(Math.min(w, h) * 0.06))}px "Share Tech Mono", monospace`;
  ctx.fillStyle = "rgba(232, 184, 74, 0.35)";
  ctx.fillText("BUILD A RADAR STATION", cx, cy + r * 0.14);
  ctx.restore();
}
