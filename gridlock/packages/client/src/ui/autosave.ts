import type { CustomMapSpec, SaveGame } from "@gridlock/shared";
import type { Ctx } from "../ctx.js";
import { inPlaytest } from "./pause.js";
import { AUTOSAVE_EVERY_MS, writeAutosave, type AutosaveKind } from "./saves.js";

/**
 * Skirmish and play test autosave: every five minutes of unpaused play the hub
 * is asked for the fight, and the answer replaces that kind's one autosave.
 */
let playedMs = 0;
let lastAt = 0;
let waiting = false;
let askedAt = 0;
/** The sheet the play test underway was built from. A play test autosave carries it. */
let playtestMap: CustomMapSpec | null = null;

export function rememberPlaytestMap(spec: CustomMapSpec): void {
  playtestMap = spec;
}

/** A new, restarted or loaded fight starts its own five minutes. */
export function resetAutosaveClock(): void {
  playedMs = 0;
  lastAt = 0;
  waiting = false;
}

function autosaving(ctx: Ctx): boolean {
  return (
    ctx.screen === "battle" &&
    ctx.playMode === "skirmish" &&
    ctx.connected &&
    !!ctx.match &&
    !ctx.match.paused &&
    !ctx.winner &&
    !!ctx.room &&
    ctx.room.hostId === ctx.net.playerId
  );
}

/** Called about once a second. Counts only time the fight was running. */
export function tickAutosave(ctx: Ctx, now: number): void {
  const dt = lastAt ? now - lastAt : 0;
  lastAt = now;
  // An ask the hub turned down never answers; try again next round.
  if (waiting && now - askedAt > 30_000) waiting = false;
  if (!autosaving(ctx) || waiting) return;
  playedMs += dt;
  if (playedMs < AUTOSAVE_EVERY_MS) return;
  playedMs = 0;
  waiting = true;
  askedAt = now;
  ctx.net.send({ type: "match.save", auto: true });
}

export function storeAutosave(ctx: Ctx, save: SaveGame): void {
  waiting = false;
  const kind: AutosaveKind = inPlaytest(ctx) ? "playtest" : "skirmish";
  if (kind === "playtest" && playtestMap?.id !== save.mapId) return;
  const wrote = writeAutosave(
    kind,
    {
      savedAt: save.savedAt,
      mapId: save.mapId,
      tick: save.tick,
      save,
      ...(kind === "playtest" ? { map: playtestMap! } : {}),
    },
    localStorage,
  );
  ctx.chat.push({ name: "HQ", text: wrote.ok ? "Autosaved." : wrote.message, at: Date.now() });
  if (ctx.chat.length > 50) ctx.chat.shift();
  ctx.render();
}
