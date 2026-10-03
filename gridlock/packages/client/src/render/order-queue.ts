import type { ClientMessage, PlanKind } from "@gridlock/shared";

/** Unit orders the sim can hold in a Shift queue. */
const QUEUEABLE = new Set<ClientMessage["type"]>([
  "cmd.move",
  "cmd.attack",
  "cmd.attackmove",
  "cmd.forceattack",
  "cmd.guard",
  "cmd.rotate",
  "cmd.garrison",
  "cmd.repair",
  "cmd.supply",
  "cmd.disable",
  "cmd.board",
]);

/** Shift held: tag a unit order so it runs after the ones already given. Anything else passes through. */
export function withQueue(msg: ClientMessage, shift: boolean): ClientMessage {
  if (!shift || !QUEUEABLE.has(msg.type)) return msg;
  return { ...msg, queue: true } as ClientMessage;
}

/** Leg colour for a queued route: move green, attack red, the rest amber. */
export function planColor(kind: PlanKind): string {
  if (kind === "move") return "rgba(126, 214, 110, 0.85)";
  if (kind === "attack") return "rgba(232, 92, 72, 0.9)";
  return "rgba(232, 184, 74, 0.85)";
}
