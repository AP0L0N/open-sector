/** How long blown leaves and husk stay in the air, ms. */
export const TREE_FALL_MS = 860;

export interface TreeBit {
  x: number;
  y: number;
  rot: number;
  w: number;
  h: number;
  kind: "leaf" | "husk";
  alpha: number;
  /** 0–1, picks a green. */
  tone: number;
}

function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Screen offsets from the stump. Leaves and husk rise, then drop. */
export function treeFallBits(t: number, seed: number): TreeBit[] {
  const rnd = rng(seed ^ 0x71ee);
  const bits: TreeBit[] = [];
  for (let i = 0; i < 11; i++) {
    const delay = rnd() * 0.07;
    const local = (t - delay) / (0.72 + rnd() * 0.26);
    if (local <= 0 || local >= 1) continue;
    const ang = rnd() * Math.PI * 2;
    const lift = Math.sin(local * Math.PI) * (18 + rnd() * 30);
    const dist = (5 + rnd() * 24) * local;
    bits.push({
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist * 0.38 - lift,
      rot: rnd() * Math.PI + local * 5,
      w: 2.4 + rnd() * 2.6,
      h: 1.3 + rnd() * 1.2,
      kind: "leaf",
      alpha: (1 - local) * 0.92,
      tone: rnd(),
    });
  }
  for (let i = 0; i < 3; i++) {
    const delay = rnd() * 0.04;
    const local = (t - delay) / 0.92;
    if (local <= 0 || local >= 1) continue;
    const side = (rnd() - 0.5) * 34;
    const lift = Math.sin(local * Math.PI) * (12 + rnd() * 18);
    bits.push({
      x: side * local,
      y: local * 6 - lift,
      rot: (rnd() - 0.5) * 0.8 + local * 2.4,
      w: 3.8 + rnd() * 2.8,
      h: 1.7 + rnd() * 1.3,
      kind: "husk",
      alpha: 1 - local * 0.45,
      tone: rnd(),
    });
  }
  return bits;
}

const LEAF = ["#3d5a28", "#4a6b32", "#6a8a42", "#2f4a22"];

/** Leaves and broken trunk tossed off a demolished tree. */
export function drawTreeFall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  seed: number,
): void {
  const bits = treeFallBits(t, seed);
  ctx.save();
  for (const b of bits) {
    ctx.save();
    ctx.translate(x + b.x, y + b.y);
    ctx.rotate(b.rot);
    ctx.globalAlpha = b.alpha;
    if (b.kind === "leaf") {
      ctx.fillStyle = LEAF[Math.floor(b.tone * LEAF.length) % LEAF.length]!;
      ctx.beginPath();
      ctx.ellipse(0, 0, b.w, b.h, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = b.tone > 0.5 ? "#5a4030" : "#3a2a1c";
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    }
    ctx.restore();
  }
  ctx.restore();
}
