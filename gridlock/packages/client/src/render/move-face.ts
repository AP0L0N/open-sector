import type { ClientMessage } from "@gridlock/shared";

/** Hold this long on a move click and the release also sets an arrival facing. */
export const MOVE_FACE_HOLD_MS = 250;
/** A drag this far (view pixels) arms the facing before the hold timer. */
export const MOVE_FACE_DRAG_PX = 12;
/** World distance squared inside which the pointer has not picked a heading. */
export const MOVE_FACE_AIM_SLOP_SQ = 64;

export interface MoveFaceDraft {
  armed: boolean;
  at: number;
}

/** A still hold or a small drag turns the pending move into move-and-face. */
export function moveFaceArmed(draft: MoveFaceDraft, now: number, dragPx: number): boolean {
  if (draft.armed) return true;
  if (dragPx >= MOVE_FACE_DRAG_PX) return true;
  return now - draft.at >= MOVE_FACE_HOLD_MS;
}

/**
 * Heading from the destination toward the pointer. Inside the slop the
 * previous heading stands, so a still hold keeps the selection's facing.
 */
export function aimMoveFace(
  anchor: { x: number; y: number },
  pointer: { x: number; y: number },
  facing: number,
): { facing: number; aimed: boolean } {
  const dx = pointer.x - anchor.x;
  const dy = pointer.y - anchor.y;
  if (dx * dx + dy * dy < MOVE_FACE_AIM_SLOP_SQ) return { facing, aimed: false };
  return { facing: Math.atan2(dy, dx), aimed: true };
}

/** Quick release is a plain move. An armed hold carries the arrival heading. */
export function moveFaceCommand(g: {
  ids: number[];
  x: number;
  y: number;
  facing: number;
  armed: boolean;
}): ClientMessage {
  if (!g.armed) return { type: "cmd.move", ids: g.ids, x: g.x, y: g.y };
  return { type: "cmd.move", ids: g.ids, x: g.x, y: g.y, facing: g.facing };
}
