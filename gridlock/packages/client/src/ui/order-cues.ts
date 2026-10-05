/**
 * What the player hears when an order goes out: which unit answers, with which
 * kind of line, and what the announcer says for base orders. Pure.
 */
import type { ClientMessage, EntityView } from "@gridlock/shared";

export type UnitCue = "select" | "move" | "attack" | "special";
export type OrderAnnounce = "training" | "onhold" | "cancelled" | "selecttarget";

const UNIT_CUES: Partial<Record<ClientMessage["type"], UnitCue>> = {
  "cmd.move": "move",
  "cmd.patrol": "move",
  "cmd.guard": "move",
  "cmd.garrison": "move",
  "cmd.board": "move",
  "cmd.tow": "move",
  "cmd.land": "move",
  "cmd.attack": "attack",
  "cmd.attackmove": "attack",
  "cmd.forceattack": "attack",
  "cmd.deploy": "special",
  "cmd.selfdestruct": "special",
  "cmd.construct": "special",
  "cmd.field": "special",
  "cmd.repair": "special",
  "cmd.supply": "special",
  "cmd.disable": "special",
  "cmd.payload": "special",
  "cmd.drone": "special",
  "cmd.jet": "special",
  "cmd.dive": "special",
  "cmd.laymine": "special",
};

/** The type that answers for a group: the most common one among your units, first picked on a tie. */
export function leadType(ids: readonly number[], entities: readonly EntityView[], me: string): string | null {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const count = new Map<string, number>();
  let best: string | null = null;
  for (const id of ids) {
    const e = byId.get(id);
    if (!e || e.ownerId !== me || e.kind !== "unit" || e.wreck) continue;
    const n = (count.get(e.type) ?? 0) + 1;
    count.set(e.type, n);
    if (best === null || n > count.get(best)!) best = e.type;
  }
  return best;
}

/**
 * Planes whose move sound is a takeoff: once every one of them is off the pad, an order
 * gets the answer but not the engine, until one of them lands and takes off again.
 */
function airborne(ids: readonly number[], type: string, entities: readonly EntityView[]): boolean {
  const byId = new Map(entities.map((e) => [e.id, e]));
  let planes = 0;
  for (const id of ids) {
    const e = byId.get(id);
    if (!e || e.type !== type || !e.air) continue;
    if (e.air.phase === "parked") return false;
    planes++;
  }
  return planes > 0;
}

export type OrderCue =
  | { kind: "unit"; type: string; cue: UnitCue; noSfx?: true }
  | { kind: "announce"; event: OrderAnnounce }
  | { kind: "ui"; sound: "place" | "sell" };

export function orderCue(msg: ClientMessage, entities: readonly EntityView[], me: string): OrderCue | null {
  const cue = UNIT_CUES[msg.type];
  if (cue) {
    // A turned-off self-destruct or a drone mode switch is a toggle, not a line.
    if (msg.type === "cmd.selfdestruct" && !msg.on) return null;
    if (msg.type === "cmd.drone" && msg.action === "mode") return null;
    if ("queue" in msg && msg.queue) return null;
    const ids: number[] =
      "ids" in msg && Array.isArray(msg.ids)
        ? msg.ids.filter((x): x is number => typeof x === "number")
        : "id" in msg && typeof msg.id === "number"
          ? [msg.id]
          : [];
    const type = leadType(ids, entities, me);
    if (!type) return null;
    return airborne(ids, type, entities) ? { kind: "unit", type, cue, noSfx: true } : { kind: "unit", type, cue };
  }
  switch (msg.type) {
    case "cmd.train":
      return { kind: "announce", event: "training" };
    case "cmd.pause":
      return msg.paused ? { kind: "announce", event: "onhold" } : null;
    case "cmd.cancel":
      return { kind: "announce", event: "cancelled" };
    case "cmd.place":
      return { kind: "ui", sound: "place" };
    case "cmd.sell":
      return { kind: "ui", sound: "sell" };
    default:
      return null;
  }
}
