import { GROUND_SCAN_FOLD_SECONDS, GROUND_SCAN_OPEN_SECONDS, GROUND_SCAN_SIDE_TILES, type GroundScanView } from "@gridlock/shared";

/**
 * The Xenite Ground Scan on screen: a square of ground lit from orbit. At night the dark is cut
 * out of it (MapView cuts the night tint and lays the day fog veil in it); day or night its edge
 * shows as a faint energy line, the dome's ground ring, with a slow sweep crossing the square.
 * It opens from its centre and folds back into it.
 */

type Pt = { x: number; y: number };

/** Ticks of animation the client runs a scan on past its last snapshot, at most. */
const EXTRAPOLATE_MS = 250;

/** How open the scan reads `ms` after its snapshot, the game running at `speed`, and where its centre is. */
export function scanNow(s: GroundScanView, ms: number, speed: number): { x: number; y: number; open: number } {
  const t = (Math.min(EXTRAPOLATE_MS, Math.max(0, ms)) / 1000) * Math.max(1, speed);
  if (s.dir === 1) return { x: s.x, y: s.y, open: Math.min(1, s.open + t / GROUND_SCAN_OPEN_SECONDS) };
  if (s.dir === -1) {
    const open = s.open - t / GROUND_SCAN_FOLD_SECONDS;
    if (open > 0 || !s.to) return { x: s.x, y: s.y, open: Math.max(0, open) };
    return { x: s.to.x, y: s.to.y, open: 0 };
  }
  return { x: s.x, y: s.y, open: s.open };
}

/**
 * The square in world px, `open` of the full side, centred where the sim centres it: on the
 * tile the centre falls in, so the lit ground and the drawn edge agree once it is open.
 */
export function scanWorldRect(cx: number, cy: number, open: number, ts: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const side = GROUND_SCAN_SIDE_TILES * Math.max(0, Math.min(1, open));
  if (side <= 0.05) return null;
  const full = GROUND_SCAN_SIDE_TILES;
  const midX = (Math.floor(cx / ts) - Math.floor(full / 2) + full / 2) * ts;
  const midY = (Math.floor(cy / ts) - Math.floor(full / 2) + full / 2) * ts;
  const h = (side / 2) * ts;
  return { x0: midX - h, y0: midY - h, x1: midX + h, y1: midY + h };
}

/** The square's edge on screen, a point every `step` world px, so it rides over hills. Clockwise from the north corner. */
export function scanOutline(
  r: { x0: number; y0: number; x1: number; y1: number },
  step: number,
  toScreen: (wx: number, wy: number) => Pt,
): Pt[] {
  const pts: Pt[] = [];
  const edge = (ax: number, ay: number, bx: number, by: number): void => {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let i = 0; i < n; i++) pts.push(toScreen(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n));
  };
  edge(r.x0, r.y0, r.x1, r.y0);
  edge(r.x1, r.y0, r.x1, r.y1);
  edge(r.x1, r.y1, r.x0, r.y1);
  edge(r.x0, r.y1, r.x0, r.y0);
  return pts;
}

export function tracePoly(ctx: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

/** The energy shimmer the walls and domes breathe with, a little slower: the scan is far off. */
function shimmer(now: number, slot: number): number {
  return 0.85 + 0.15 * Math.sin(now * 0.0035 + slot * 2.1);
}

/**
 * The scan's faint energy edge, and a thin line sweeping across it from one side to the other.
 * Purely a picture: nothing stops on it. `pts` is the outline, `sweep` the sweep line's two ends.
 */
export function drawScanEdge(
  ctx: CanvasRenderingContext2D,
  pts: readonly Pt[],
  sweep: readonly [Pt, Pt] | null,
  open: number,
  slot: number,
  now: number,
): void {
  if (pts.length < 3) return;
  const g = shimmer(now, slot) * Math.min(1, 0.35 + open);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineJoin = "round";
  tracePoly(ctx, pts);
  ctx.fillStyle = `rgba(90, 240, 165, ${0.025 * g})`;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = `rgba(70, 230, 154, ${0.07 * g})`;
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(130, 255, 196, ${0.28 * g})`;
  ctx.stroke();
  if (sweep) {
    const [a, b] = sweep;
    const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    grad.addColorStop(0, "rgba(160, 255, 210, 0)");
    grad.addColorStop(0.5, `rgba(160, 255, 210, ${0.16 * g})`);
    grad.addColorStop(1, "rgba(160, 255, 210, 0)");
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = grad;
    ctx.stroke();
  }
  ctx.restore();
}

/** Where the sweep line crosses the square at `now`: across it north to south and back, one pass every few seconds. */
export function sweepAt(r: { x0: number; y0: number; x1: number; y1: number }, now: number, slot: number): { y: number } {
  const period = 5200;
  const u = ((now + slot * 1700) % (period * 2)) / period;
  const k = u < 1 ? u : 2 - u;
  return { y: r.y0 + (r.y1 - r.y0) * k };
}

/** The ghost of a scan about to be placed: its full square, dashed, where the cursor is. */
export function drawScanGhost(ctx: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  if (pts.length < 3) return;
  ctx.save();
  ctx.setLineDash([7, 5]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(130, 255, 196, 0.75)";
  tracePoly(ctx, pts);
  ctx.stroke();
  ctx.fillStyle = "rgba(90, 240, 165, 0.06)";
  ctx.fill();
  ctx.restore();
}
