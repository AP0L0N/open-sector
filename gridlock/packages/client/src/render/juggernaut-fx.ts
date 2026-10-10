import { JUGGERNAUT_FIST_SECONDS, JUGGERNAUT_HAMMER_SECONDS } from "@gridlock/shared";

/**
 * Juggernaut on the map: which of its sheets shows and on which frame, and the
 * hammer tumbling through the air once it is thrown.
 */

export type JuggernautSheet = "walk" | "swing" | "fists" | "punch" | "throw";

/** World px it covers in one 8-frame stride (two steps): a giant's step is long. */
export const JUGGERNAUT_STRIDE_WORLD = 36;
/** Game ms the throw sheet plays, four frames. */
export const JUGGERNAUT_THROW_MS = 640;
/** Game ms a punch takes on its sheet: four frames, then the guard is held. */
const PUNCH_MS = JUGGERNAUT_FIST_SECONDS * 1000;
const SWING_MS = JUGGERNAUT_HAMMER_SECONDS * 1000;
/** Swing frame held while the hammer waits high for the next blow. */
const SWING_HELD_FRAME = 5;

export interface JuggernautPose {
  sheet: JuggernautSheet;
  /** Set when the frame comes from the blow or throw clock; unset: stride with the ground. */
  frame?: number;
}

/**
 * Sheet and frame. `blowAt`/`throwAt` are the moments (ms, same clock as `now`) its last blow
 * landed and the hammer left its hands; `speed` is the game speed. A swing loops from the hit:
 * frame 0 is the hammer on the ground, and the hammer waits high until the next blow lands.
 * Punches alternate hands, `blows` counting them. Walking ends a fight pose.
 */
export function pickJuggernautPose(o: {
  fists: boolean;
  stepping: boolean;
  now: number;
  speed: number;
  blowAt?: number;
  blows?: number;
  throwAt?: number;
}): JuggernautPose {
  const speed = o.speed > 0 ? o.speed : 1;
  if (o.throwAt != null) {
    const age = (o.now - o.throwAt) * speed;
    if (age >= 0 && age < JUGGERNAUT_THROW_MS) return { sheet: "throw", frame: Math.min(3, Math.floor((age / JUGGERNAUT_THROW_MS) * 4)) };
  }
  const walk: JuggernautPose = { sheet: o.fists ? "fists" : "walk" };
  if (o.blowAt == null) return walk;
  const age = (o.now - o.blowAt) * speed;
  if (age < 0) return walk;
  if (o.stepping && age > 250) return walk;
  if (o.fists) {
    if (age > PUNCH_MS * 1.6) return walk;
    const offset = (o.blows ?? 1) % 2 === 1 ? 0 : 4;
    return { sheet: "punch", frame: offset + Math.min(3, Math.floor((age / PUNCH_MS) * 4)) };
  }
  if (age > SWING_MS * 1.6) return walk;
  if (age >= SWING_MS * (SWING_HELD_FRAME / 8)) return { sheet: "swing", frame: SWING_HELD_FRAME };
  return { sheet: "swing", frame: Math.floor((age / SWING_MS) * 8) };
}

/**
 * The thrown hammer: a dark haft and a lit alloy head turning end over end at (x, y), with a
 * shadow on the ground at (gx, gy). Screen px, sized to the hammer on the sprite.
 */
export function drawThrownHammer(ctx: CanvasRenderingContext2D, x: number, y: number, gx: number, gy: number, now: number, id: number): void {
  const spin = now * 0.016 + id * 1.7;
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.ellipse(gx, gy, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#1a1410";
  // Haft: butt to head, through the middle so it turns about its weight.
  ctx.fillStyle = "#2a302c";
  ctx.fillRect(-9, -1.2, 14, 2.4);
  ctx.strokeRect(-9, -1.2, 14, 2.4);
  // Head across the haft, a green band either side.
  ctx.fillStyle = "#62706a";
  ctx.fillRect(4, -5.5, 6, 11);
  ctx.strokeRect(4, -5.5, 6, 11);
  ctx.fillStyle = "#60cc48";
  ctx.fillRect(5, -5, 1, 10);
  ctx.fillRect(8, -5, 1, 10);
  ctx.restore();
}
