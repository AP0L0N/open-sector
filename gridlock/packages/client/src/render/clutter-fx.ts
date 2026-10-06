/** How long a piece of map clutter takes to fall apart on screen, in ms. */
export const CLUTTER_BREAK_MS = 420;

const CHIPS = 7;
const CHIP_COLORS = ["#8a6a44", "#a88a5c", "#5a4632", "#6e6a62"];

/** One splinter thrown from a breaking piece: screen offset from its foot at `k` (0..1) of the break. */
export function clutterChip(seed: number, n: number, k: number): { x: number; y: number; size: number; color: string } {
  let h = Math.imul(seed + 1, 2654435761) ^ Math.imul(n + 7, 40503);
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  const ang = ((h & 0xffff) / 0x10000) * Math.PI * 2;
  const speed = 6 + ((h >>> 16) % 9);
  const lift = 7 + ((h >>> 8) % 6);
  return {
    x: Math.cos(ang) * speed * k,
    // Up and back down onto the ground round the foot, iso-squashed.
    y: Math.sin(ang) * speed * 0.5 * k - lift * 4 * k * (1 - k),
    size: 1 + ((h >>> 4) % 2),
    color: CHIP_COLORS[(h >>> 20) % CHIP_COLORS.length]!,
  };
}

/** Splinters flying off clutter at `k` (0..1) of its break, around the screen foot (x, y). */
export function drawClutterSplinters(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, seed: number): void {
  if (k >= 1) return;
  ctx.save();
  ctx.globalAlpha *= 1 - k * k;
  for (let n = 0; n < CHIPS; n++) {
    const c = clutterChip(seed, n, k);
    ctx.fillStyle = c.color;
    ctx.fillRect(Math.round(x + c.x), Math.round(y - 3 + c.y), c.size, c.size);
  }
  ctx.restore();
}
