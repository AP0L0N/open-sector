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
  else drawGather(ctx, t);
  ctx.restore();
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
