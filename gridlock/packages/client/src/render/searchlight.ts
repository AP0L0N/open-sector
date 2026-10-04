/**
 * The Watch Tower's searchlight: a drum lamp in a yoke on a pedestal, drawn on
 * the roof over the baked sprite so it can turn with the beam. Geometry is in
 * the sprite's mesh units (tools/sprites/render_tower.py) and goes through the
 * same 2:1 projection: sx = (X - Y) * u, sy = ((X + Y) / 2 - Z) * u.
 */

/** Pad south contact (W, H, 0) up to the roof slab's centre (CX, CY, ROOF_TOP), mesh units. */
const ROOF_LIFT = 32 + 59.4;
/** Sprite pad width in mesh units (W + H); screen px per unit is footprintW / this. */
const PAD_UNITS = 128;

const PEDESTAL_R = 2.2;
const PEDESTAL_TOP = 1.6;
const PIVOT_Z = 5.6;
const DRUM_R = 2.7;
const BEZEL_R = 3.0;
const LENS_R = 2.35;
const DRUM_BACK = 3.0;
const DRUM_FRONT = 3.6;
/** The lamp dips its nose toward the ground it lights. */
const PITCH = (9 * Math.PI) / 180;
const RING = 20;

const INK = "#15140f";
const METAL_LIT = "#7b7f72";
const METAL_SHADE = "#3a3d35";
const BACK_CAP = "#2f322b";
const YOKE = "#4a4d44";

type V3 = [number, number, number];
type P2 = { x: number; y: number };

export interface SearchlightLook {
  /** 0 by day, 1 at full night: the lens burns. */
  lit: number;
  /** A crit smashed the lamp: dark, cracked glass. */
  broken: boolean;
}

export interface SearchlightPose {
  /** Screen centre of the lens. */
  lens: P2;
  /** 0 when the lens faces away from the viewer, 1 when it stares straight out of the screen. */
  toViewer: number;
}

/** Screen px per mesh unit, and the roof centre, for a tower sprite laid at this pad. */
function roofFrame(southX: number, southY: number, footprintW: number): { o: P2; u: number } {
  const u = footprintW / PAD_UNITS;
  return { o: { x: southX, y: southY - ROOF_LIFT * u }, u };
}

/** Where the lamp's lens sits on screen at this heading, without drawing it. */
export function searchlightPose(southX: number, southY: number, footprintW: number, facing: number): SearchlightPose {
  const { o, u } = roofFrame(southX, southY, footprintW);
  const g = geometry(facing);
  const proj = projector(o, u);
  return { lens: proj(g.front), toViewer: g.toViewer };
}

function geometry(facing: number) {
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  const cp = Math.cos(PITCH);
  const sp = Math.sin(PITCH);
  const axis: V3 = [c * cp, s * cp, -sp];
  const side: V3 = [-s, c, 0];
  const up: V3 = [c * sp, s * sp, cp];
  const pivot: V3 = [0, 0, PIVOT_Z];
  const at = (k: number): V3 => [pivot[0] + axis[0] * k, pivot[1] + axis[1] * k, pivot[2] + axis[2] * k];
  // The viewer looks down (-1, -1, -1); depth grows toward them.
  const toViewer = Math.max(0, (axis[0] + axis[1] + axis[2]) / Math.sqrt(3));
  return { axis, side, up, pivot, back: at(-DRUM_BACK), front: at(DRUM_FRONT), toViewer };
}

function projector(o: P2, u: number): (p: V3) => P2 {
  return (p) => ({ x: o.x + (p[0] - p[1]) * u, y: o.y + ((p[0] + p[1]) / 2 - p[2]) * u });
}

function ring(centre: V3, side: V3, up: V3, r: number, proj: (p: V3) => P2): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < RING; i++) {
    const t = (i / RING) * Math.PI * 2;
    const a = Math.cos(t) * r;
    const b = Math.sin(t) * r;
    out.push(
      proj([
        centre[0] + side[0] * a + up[0] * b,
        centre[1] + side[1] * a + up[1] * b,
        centre[2] + side[2] * a + up[2] * b,
      ]),
    );
  }
  return out;
}

/** Monotone-chain hull: the drum's outline is the hull of its two end rings. */
function hull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: P2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: P2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function path(ctx: CanvasRenderingContext2D, pts: P2[]): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

/**
 * Draws the same searchlight with its pivot base at screen point (x, y), at
 * `u` screen px per mesh unit: the Battle Ship's lamp on its director.
 */
export function drawSearchlightAt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  facing: number,
  look: SearchlightLook,
): SearchlightPose {
  return drawTowerSearchlight(ctx, x, y + ROOF_LIFT * u, u * PAD_UNITS, facing, look);
}

/**
 * Draws the searchlight on a tower sprite laid at this pad, turned to `facing`
 * (world radians, the beam's heading). Returns where its lens landed.
 */
export function drawTowerSearchlight(
  ctx: CanvasRenderingContext2D,
  southX: number,
  southY: number,
  footprintW: number,
  facing: number,
  look: SearchlightLook,
): SearchlightPose {
  const { o, u } = roofFrame(southX, southY, footprintW);
  const proj = projector(o, u);
  const g = geometry(facing);
  const ink = Math.max(0.6, u / 3);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;

  // Pedestal: a squat round post, the same from every side.
  const prx = PEDESTAL_R * Math.SQRT2 * u;
  const pry = prx / 2;
  const top = proj([0, 0, PEDESTAL_TOP]);
  ctx.lineWidth = ink;
  ctx.fillStyle = METAL_SHADE;
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, prx, pry, 0, 0, Math.PI);
  ctx.lineTo(top.x - prx, top.y);
  ctx.ellipse(top.x, top.y, prx, pry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = YOKE;
  ctx.beginPath();
  ctx.ellipse(top.x, top.y, prx, pry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Yoke: a fork from the pedestal up to the drum's trunnions. The near arm goes on after the drum.
  const armOff = DRUM_R + 0.55;
  const arm = (sgn: number): P2[] => {
    const sx = g.side[0] * armOff * sgn;
    const sy = g.side[1] * armOff * sgn;
    return [proj([sx, sy, PIVOT_Z]), proj([sx, sy, PEDESTAL_TOP + 0.5])];
  };
  const nearSgn = g.side[0] + g.side[1] >= 0 ? 1 : -1;
  const strokeArm = (pts: P2[], withBase: boolean) => {
    const base = withBase ? [arm(nearSgn)[1]!] : [];
    const line = [...pts, ...base];
    ctx.lineWidth = u * 0.9 + ink * 2;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    line.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.lineWidth = u * 0.9;
    ctx.strokeStyle = YOKE;
    ctx.stroke();
  };
  strokeArm(arm(-nearSgn), true);

  // Drum: the hull of its end rings, lit from above.
  const backRing = ring(g.back, g.side, g.up, DRUM_R, proj);
  const frontRing = ring(g.front, g.side, g.up, BEZEL_R, proj);
  const body = hull([...backRing, ...frontRing]);
  const pc = proj(g.pivot);
  const shade = ctx.createLinearGradient(pc.x, pc.y - DRUM_R * u * 1.1, pc.x, pc.y + DRUM_R * u * 1.1);
  shade.addColorStop(0, METAL_LIT);
  shade.addColorStop(1, METAL_SHADE);
  ctx.fillStyle = shade;
  ctx.lineWidth = ink;
  ctx.strokeStyle = INK;
  path(ctx, body);
  ctx.fill();
  ctx.stroke();

  // Trunnion caps where the yoke holds the drum.
  const hub = proj([g.side[0] * DRUM_R * nearSgn, g.side[1] * DRUM_R * nearSgn, PIVOT_Z]);

  // Whichever end faces the viewer: the lens or the back cap.
  const frontShows = g.axis[0] + g.axis[1] + g.axis[2] > 0;
  if (frontShows) {
    const lens = ring(g.front, g.side, g.up, LENS_R, proj);
    const lc = proj(g.front);
    path(ctx, frontRing);
    ctx.fillStyle = METAL_SHADE;
    ctx.fill();
    ctx.stroke();
    path(ctx, lens);
    if (look.broken) {
      ctx.fillStyle = "#23251f";
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = Math.max(0.5, ink * 0.7);
      ctx.strokeStyle = "rgba(170, 176, 160, 0.7)";
      ctx.beginPath();
      ctx.moveTo(lens[2]!.x, lens[2]!.y);
      ctx.lineTo(lc.x, lc.y);
      ctx.lineTo(lens[13]!.x, lens[13]!.y);
      ctx.moveTo(lc.x, lc.y);
      ctx.lineTo(lens[8]!.x, lens[8]!.y);
      ctx.stroke();
    } else {
      const r = LENS_R * u * 1.2;
      const glass = ctx.createRadialGradient(lc.x - r * 0.3, lc.y - r * 0.3, 0, lc.x, lc.y, r);
      const l = Math.min(1, Math.max(0, look.lit));
      glass.addColorStop(0, mix([214, 228, 226], [255, 253, 236], l));
      glass.addColorStop(0.55, mix([132, 156, 160], [255, 236, 170], l));
      glass.addColorStop(1, mix([64, 80, 86], [236, 186, 96], l));
      ctx.fillStyle = glass;
      ctx.fill();
      ctx.stroke();
    }
  } else {
    path(ctx, backRing);
    ctx.fillStyle = BACK_CAP;
    ctx.fill();
    ctx.stroke();
    // A boss in the back cap, where the carbon feed goes in.
    const bc = proj(g.back);
    ctx.fillStyle = METAL_SHADE;
    ctx.beginPath();
    ctx.ellipse(bc.x, bc.y, u * 0.9, u * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  strokeArm(arm(nearSgn), false);
  ctx.fillStyle = METAL_LIT;
  ctx.lineWidth = ink;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.ellipse(hub.x, hub.y, u * 0.75, u * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  return { lens: proj(g.front), toViewer: g.toViewer };
}

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const c = (i: number) => Math.round(a[i]! + (b[i]! - a[i]!) * t);
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
}
