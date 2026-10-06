import type { HoverAction } from "./hover-action.js";

const INK = "#140e0a";
const AMBER = "#e8b84a";
const RED = "#ff5a4a";
const FLAG = "#dce8c8";
const RUST = "#e08a3c";

/** Context pointer for the hovered order. `t` is seconds. */
export function drawActionCursor(
  ctx: CanvasRenderingContext2D,
  action: HoverAction,
  x: number,
  y: number,
  t: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (action === "garrison" || action === "board") drawGarrison(ctx, t, false);
  else if (action === "ungarrison") drawGarrison(ctx, t, true);
  else if (action === "attack") drawAttack(ctx, t);
  else if (action === "capture") drawCapture(ctx, t);
  else if (action === "repair") drawRepair(ctx, "FIX");
  else if (action === "scrap") drawRepair(ctx, "SCRAP");
  else if (action === "supply") drawRepair(ctx, "AMMO");
  else if (action === "disable") drawRepair(ctx, "DISABLE");
  else if (action === "tow") drawRepair(ctx, "TOW");
  else if (action === "land") drawLand(ctx, t);
  else drawGather(ctx, t);
  ctx.restore();
}

export type DeployCursorMode = "deploy" | "pack";

/** Seconds one bracket wave takes to cross the deploy cursor. */
export const DEPLOY_CURSOR_CYCLE = 1.1;
const DEPLOY_WAVES = 2;
/** Half-width (screen px) of the 2:1 footprint at the inner and outer end of a wave's run. */
const WAVE_NEAR = 8;
const WAVE_FAR = 20;

/**
 * The deploy cursor's corner brackets: each wave's half-width and opacity at `t`
 * seconds. Deploy waves run out from the hull to the Core's footprint, pack waves
 * run back in; each fades at both ends so the loop has no seam.
 */
export function deployCursorWaves(mode: DeployCursorMode, t: number): { reach: number; alpha: number }[] {
  const out: { reach: number; alpha: number }[] = [];
  for (let i = 0; i < DEPLOY_WAVES; i++) {
    const u = (((t / DEPLOY_CURSOR_CYCLE + i / DEPLOY_WAVES) % 1) + 1) % 1;
    const run = mode === "deploy" ? u : 1 - u;
    out.push({ reach: WAVE_NEAR + (WAVE_FAR - WAVE_NEAR) * run, alpha: Math.sin(Math.PI * u) });
  }
  return out;
}

/**
 * Pointer over a unit whose click deploys or packs it (Rig, Core, Titan). A small
 * hull sits in the middle; corner brackets of its 2:1 footprint stream outward to
 * deploy and inward to pack.
 */
export function drawDeployCursor(
  ctx: CanvasRenderingContext2D,
  mode: DeployCursorMode,
  x: number,
  y: number,
  t: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const w of deployCursorWaves(mode, t)) {
    if (w.alpha <= 0.02) continue;
    ctx.globalAlpha = w.alpha;
    ctx.beginPath();
    footprintCorners(ctx, w.reach);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.4;
    ctx.stroke();
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  hull(ctx, mode === "deploy" ? 1 + Math.sin(t * 5.4) * 0.06 : 1 - Math.abs(Math.sin(t * 5.4)) * 0.08);
  label(ctx, mode === "deploy" ? "DEPLOY" : "PACK", AMBER);
  ctx.restore();
}

/** The four corners of a 2:1 diamond of half-width `hw`, each arm a third of a side. */
function footprintCorners(ctx: CanvasRenderingContext2D, hw: number): void {
  const pts: [number, number][] = [
    [0, -hw / 2],
    [hw, 0],
    [0, hw / 2],
    [-hw, 0],
  ];
  for (let i = 0; i < 4; i++) {
    const [vx, vy] = pts[i]!;
    const [ax, ay] = pts[(i + 3) % 4]!;
    const [bx, by] = pts[(i + 1) % 4]!;
    ctx.moveTo(vx + (ax - vx) * 0.32, vy + (ay - vy) * 0.32);
    ctx.lineTo(vx, vy);
    ctx.lineTo(vx + (bx - vx) * 0.32, vy + (by - vy) * 0.32);
  }
}

/** A small iso box: the hull that unpacks. */
function hull(ctx: CanvasRenderingContext2D, scale: number): void {
  const w = 4.6 * scale;
  const h = 3.4 * scale;
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.lineTo(0, w / 2);
  ctx.lineTo(0, w / 2 - h);
  ctx.lineTo(-w, -h);
  ctx.closePath();
  ctx.fillStyle = "#a07a2c";
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(0, w / 2);
  ctx.lineTo(0, w / 2 - h);
  ctx.lineTo(w, -h);
  ctx.closePath();
  ctx.fillStyle = "#c8962f";
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -w / 2 - h);
  ctx.lineTo(w, -h);
  ctx.lineTo(0, w / 2 - h);
  ctx.lineTo(-w, -h);
  ctx.closePath();
  ctx.fillStyle = AMBER;
  ctx.fill();
  ctx.stroke();
}

function paint(ctx: CanvasRenderingContext2D, fill: string, width = 2.1): void {
  ctx.fillStyle = fill;
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
}

function drawGarrison(ctx: CanvasRenderingContext2D, t: number, leave: boolean): void {
  const breathe = 1 + Math.sin(t * 5.2) * 0.05;
  ctx.save();
  ctx.scale(breathe, breathe);
  paint(ctx, AMBER);
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(9, -4);
  ctx.lineTo(6.5, -4);
  ctx.lineTo(6.5, 6);
  ctx.lineTo(-6.5, 6);
  ctx.lineTo(-6.5, -4);
  ctx.lineTo(-9, -4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(-2.2, 0.5, 4.4, 5.5);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.restore();

  const bob = Math.sin(t * 6.1) * 1.6;
  const y0 = leave ? -13.5 - bob : 10.5 - bob;
  paint(ctx, AMBER, 2);
  chevron(ctx, 0, y0, 1);
  chevron(ctx, 0, y0 + (leave ? -4.2 : 4.2), 1);
  label(ctx, leave ? "OUT" : "IN", AMBER);
}

function chevron(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number): void {
  ctx.beginPath();
  ctx.moveTo(x - 4.4, y + 2.4 * dir);
  ctx.lineTo(x, y - 1.6 * dir);
  ctx.lineTo(x + 4.4, y + 2.4 * dir);
  ctx.stroke();
}

function drawAttack(ctx: CanvasRenderingContext2D, t: number): void {
  const r = 9.5 + Math.sin(t * 5.6) * 1.1;
  const g = 3.4;
  paint(ctx, RED, 2);
  ctx.beginPath();
  bracket(ctx, -r, -r, g, 1, 1);
  bracket(ctx, r, -r, g, -1, 1);
  bracket(ctx, -r, r, g, 1, -1);
  bracket(ctx, r, r, g, -1, -1);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  label(ctx, "ATK", RED);
}

function bracket(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  sx: number,
  sy: number,
): void {
  ctx.moveTo(x + len * sx, y);
  ctx.lineTo(x, y);
  ctx.lineTo(x, y + len * sy);
}

function drawCapture(ctx: CanvasRenderingContext2D, t: number): void {
  const wave = Math.sin(t * 6.4);
  paint(ctx, AMBER, 2.1);
  ctx.beginPath();
  ctx.moveTo(-1.2, 8);
  ctx.lineTo(-1.2, -10);
  ctx.lineTo(1.2, -10);
  ctx.lineTo(1.2, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  paint(ctx, FLAG, 2);
  ctx.beginPath();
  ctx.moveTo(1.2, -10);
  ctx.lineTo(12 + wave * 1.6, -8.2 + wave * 0.6);
  ctx.lineTo(9.2 - wave * 1.2, -3.4);
  ctx.lineTo(1.2, -2.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  label(ctx, "CAP", AMBER);
}

function drawGather(ctx: CanvasRenderingContext2D, t: number): void {
  const bob = Math.sin(t * 5.8) * 1.3;
  paint(ctx, RUST, 2.1);
  ctx.beginPath();
  ctx.moveTo(0, 5);
  ctx.lineTo(8, 1);
  ctx.lineTo(0, -3);
  ctx.lineTo(-8, 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.lineTo(4.5, -6.2);
  ctx.lineTo(8, 1);
  ctx.closePath();
  ctx.fillStyle = "#f0b060";
  ctx.fill();
  ctx.stroke();
  paint(ctx, AMBER, 2);
  ctx.beginPath();
  ctx.moveTo(-5.5, -7.5 + bob);
  ctx.lineTo(0, -12.5 + bob);
  ctx.lineTo(5.5, -7.5 + bob);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -12.5 + bob);
  ctx.lineTo(0, -6.5 + bob);
  ctx.stroke();
  label(ctx, "GET", RUST);
}

function drawLand(ctx: CanvasRenderingContext2D, t: number): void {
  // A 2:1 strip with its centre dashes, and a plane gliding down onto it.
  paint(ctx, "#5a4a3a", 2);
  ctx.beginPath();
  ctx.moveTo(-11, 6);
  ctx.lineTo(3, -1);
  ctx.lineTo(11, 3);
  ctx.lineTo(-3, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = FLAG;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (const k of [-0.3, 0.05, 0.4]) {
    ctx.moveTo(-7 + 14 * k, 8 - 7 * k);
    ctx.lineTo(-5 + 14 * k, 7 - 7 * k);
  }
  ctx.stroke();

  const glide = (t * 0.9) % 1;
  const px = 7 - glide * 7;
  const py = -12 + glide * 10;
  ctx.save();
  ctx.globalAlpha = glide > 0.85 ? (1 - glide) / 0.15 : 1;
  ctx.translate(px, py);
  ctx.rotate(-0.46);
  paint(ctx, AMBER, 1.8);
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.lineTo(-5, -1.4);
  ctx.lineTo(-1, -1.2);
  ctx.lineTo(1, -5.5);
  ctx.lineTo(3, -5.5);
  ctx.lineTo(2.5, -1);
  ctx.lineTo(6.5, -0.6);
  ctx.lineTo(7.5, 0);
  ctx.lineTo(6.5, 0.6);
  ctx.lineTo(2.5, 1);
  ctx.lineTo(3, 5.5);
  ctx.lineTo(1, 5.5);
  ctx.lineTo(-1, 1.2);
  ctx.lineTo(-5, 1.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  label(ctx, "LAND", AMBER);
}

function drawRepair(ctx: CanvasRenderingContext2D, word: string): void {
  paint(ctx, AMBER, 2);
  ctx.beginPath();
  ctx.moveTo(-7, 2);
  ctx.lineTo(-2, 7);
  ctx.lineTo(8, -4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(7, -5, 2.2, 0, Math.PI * 2);
  ctx.stroke();
  label(ctx, word, AMBER);
}

function label(ctx: CanvasRenderingContext2D, text: string, fill: string): void {
  ctx.font = "11px 'Share Tech Mono', monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, 12, 8);
  ctx.fillStyle = fill;
  ctx.fillText(text, 12, 8);
}
