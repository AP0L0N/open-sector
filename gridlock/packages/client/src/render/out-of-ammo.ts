/**
 * "Out of ammo" mark beside an allied health bar: a grey cartridge struck
 * through on a dark tile. Shown when every finite store the unit attacks with
 * is empty (outOfAmmo in ammo-bars.ts) — it needs a supply truck to fight.
 */

/** Screen px of the tile, square. */
export const OUT_OF_AMMO_SIZE = 11;
export const OUT_OF_AMMO_GREY = "rgba(176, 174, 166, 0.95)";

/** Tile with its top-left corner at (x, y). */
export function drawOutOfAmmo(ctx: CanvasRenderingContext2D, x: number, y: number, alpha = 1): void {
  const s = OUT_OF_AMMO_SIZE;
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  ctx.save();
  ctx.globalAlpha = alpha;
  // Dark tile with a thin grey rim.
  ctx.fillStyle = "rgba(10, 8, 6, 0.82)";
  ctx.fillRect(x0, y0, s, s);
  ctx.strokeStyle = "rgba(176, 174, 166, 0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, s - 1, s - 1);
  // An upright cartridge: case, then the pointed bullet.
  const cx = x0 + s / 2;
  ctx.fillStyle = OUT_OF_AMMO_GREY;
  ctx.fillRect(cx - 1.5, y0 + 5, 3, 4.5);
  ctx.beginPath();
  ctx.moveTo(cx - 1.5, y0 + 5);
  ctx.lineTo(cx, y0 + 2);
  ctx.lineTo(cx + 1.5, y0 + 5);
  ctx.closePath();
  ctx.fill();
  // Struck through, corner to corner.
  ctx.strokeStyle = OUT_OF_AMMO_GREY;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x0 + 2, y0 + s - 2);
  ctx.lineTo(x0 + s - 2, y0 + 2);
  ctx.stroke();
  ctx.restore();
}
