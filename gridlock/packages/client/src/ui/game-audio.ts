/**
 * Plays the generated audio (tools/audio): unit answers, the announcer, battlefield
 * and unit sound effects. Files are found by name, so a unit with no file for a cue
 * is simply quiet.
 *
 * Unit answers share one channel: a new answer cuts the last one, as in classic RTS.
 * The announcer has its own queue, one line at a time, each line with a cooldown.
 */
import type { SpatialMix } from "./spatial-sfx.js";
import { playClip, playSample, preloadSample, type Clip } from "./audio.js";
import { buildBank, LineDeck } from "./sound-bank.js";
import type { SoundEvent, Weapon } from "../render/sound-events.js";
import { leadType, orderCue, type UnitCue } from "./order-cues.js";
import type { ClientMessage, MatchSnapshot } from "@gridlock/shared";

const files = import.meta.glob("../assets/audio/**/*.mp3", { eager: true, import: "default" }) as Record<
  string,
  string
>;
const bank = buildBank(files);
const deck = new LineDeck();

const UNIT_VOICE_VOLUME = 0.95;
const ANNOUNCE_VOLUME = 1.0;
const UI_VOLUME = 0.5;

function unitFolder(type: string): string {
  return `units/${type}`;
}

function pick(folder: string, cue: string): string | null {
  return deck.pick(`${folder}/${cue}`, bank.get(folder, cue));
}

export function hasUnitAudio(type: string): boolean {
  return bank.get(unitFolder(type), "voice-select").length > 0;
}

// --- unit answers ----------------------------------------------------------

let unitClip: Clip | null = null;
let unitClipAt = 0;

/** One answer from a unit type. `special` falls back to `move` for units without one. Returns whether a line played. */
export function unitVoice(type: string, cue: UnitCue | "ready", opts: { withSfx?: boolean } = {}): boolean {
  const folder = unitFolder(type);
  let url = pick(folder, `voice-${cue}`);
  if (!url && cue === "special") url = pick(folder, "voice-move");
  if (!url) return false;
  unitClip?.stop();
  unitClip = playClip(url, UNIT_VOICE_VOLUME, { maxLateS: 0.8 });
  unitClipAt = performance.now();
  // The engine, boots, or rotor under a move order: quiet, so the answer stays on top.
  if (opts.withSfx && (cue === "move" || cue === "special")) {
    const sfx = pick(folder, `sfx-${cue}`) ?? (cue === "special" ? pick(folder, "sfx-move") : null);
    if (sfx) playClip(sfx, 0.35, { maxLateS: 0.4 });
  }
  return true;
}

/** True while a unit is still answering (for not burying it under a ready line). */
export function unitTalking(): boolean {
  return performance.now() - unitClipAt < 1200;
}

// --- announcer -------------------------------------------------------------

/** Least gap between two plays of one announcement. */
const ANNOUNCE_GAP_MS: Record<string, number> = {
  ready: 2500,
  unitlost: 9000,
  buildinglost: 6000,
  noscrap: 4000,
  training: 900,
  building: 900,
  complete: 1500,
  onhold: 900,
  cancelled: 900,
  lowpower: 15_000,
};
const lastAnnounce = new Map<string, number>();
const queue: string[] = [];
let announcing = false;

export function announce(event: string): void {
  const now = performance.now();
  if (now - (lastAnnounce.get(event) ?? -Infinity) < (ANNOUNCE_GAP_MS[event] ?? 3000)) return;
  if (queue.includes(event) || queue.length >= 3) return;
  if (bank.get("announcer", `voice-${event}`).length === 0) return;
  lastAnnounce.set(event, now);
  queue.push(event);
  if (!announcing) nextAnnouncement();
}

function nextAnnouncement(): void {
  const event = queue.shift();
  if (!event) {
    announcing = false;
    return;
  }
  const url = pick("announcer", `voice-${event}`);
  if (!url) return nextAnnouncement();
  announcing = true;
  playClip(url, ANNOUNCE_VOLUME, { maxLateS: 3, onEnded: () => window.setTimeout(nextAnnouncement, 150) });
}

// --- effects ---------------------------------------------------------------

export function uiSound(name: string, volume = UI_VOLUME): void {
  const url = pick("sfx/ui", `sfx-${name}`);
  if (url) playClip(url, volume, { maxLateS: 0.3 });
}

/** Warm the files a unit type fires and dies with, so its first shot is not dropped while decoding. */
const warmed = new Set<string>();
export function warmUnit(type: string): void {
  if (warmed.has(type)) return;
  warmed.add(type);
  const folder = unitFolder(type);
  for (const cue of ["sfx-fire", "sfx-rockets", "sfx-die", "voice-die"]) for (const url of bank.get(folder, cue)) preloadSample(url);
}

export function warmBattle(): void {
  for (const cue of ["explosion_small", "explosion_large", "shell_impact", "ricochet", "penetrate", "splash", "intercept", "cookoff", "explosion_building", "mine_explode"]) {
    for (const url of bank.get("sfx/battle", `sfx-${cue}`)) preloadSample(url);
  }
}

const FIRE_VOLUME = 0.55;
/** Guns and rocket launchers whose report is mastered hot (spec "lufs") and plays at full weight. */
const HEAVY_FIRE = new Set([
  "warden",
  "ss3",
  "jagdtiger",
  "apocalypse",
  "titan",
  "artillery",
  "battleship",
  "mortarman",
  "rocketer",
  "nebelwerfer",
  "stuka",
  "fw190",
]);
const HEAVY_FIRE_VOLUME = 1;
/** Their `fire` is a cannon, a bomb or a broadside: their machine guns and CIWS must not set it off. */
const BIG_GUN_ONLY = new Set(["warden", "ss3", "jagdtiger", "apocalypse", "titan", "battleship", "stuka"]);
const IMPACT_VOLUME: Record<string, number> = {
  explosion_large: 1,
  explosion_small: 0.85,
  cookoff: 1,
  explosion_building: 1,
  shell_impact: 0.75,
  ricochet: 0.4,
  penetrate: 0.85,
  splash: 0.45,
  intercept: 0.5,
};

/** Which take a shot plays: rockets use the unit's salvo when it has one (the Titan's pod). */
function fireUrl(type: string, weapon: Weapon): string | null {
  if (weapon === "small" && BIG_GUN_ONLY.has(type)) return null;
  const folder = unitFolder(type);
  if (weapon === "rocket") return pick(folder, "sfx-rockets") ?? pick(folder, "sfx-fire");
  return pick(folder, "sfx-fire");
}

/** Plays what the snapshot tracker found. `mixAt` places a world point in the stereo field (null: too far). */
export function playSoundEvents(events: readonly SoundEvent[], mixAt: (x: number, y: number) => SpatialMix | null): void {
  for (const ev of events) {
    switch (ev.kind) {
      case "fire": {
        warmUnit(ev.type);
        const url = fireUrl(ev.type, ev.weapon);
        const mix = url ? mixAt(ev.x, ev.y) : null;
        if (url && mix) {
          const heavy = HEAVY_FIRE.has(ev.type);
          playSample(url, mix, { volume: heavy ? HEAVY_FIRE_VOLUME : FIRE_VOLUME, maxVoices: 3, jitter: heavy ? 0.03 : undefined });
        }
        break;
      }
      case "impact": {
        const url = pick("sfx/battle", `sfx-${ev.sound}`);
        const mix = url ? mixAt(ev.x, ev.y) : null;
        if (url && mix) playSample(url, mix, { volume: IMPACT_VOLUME[ev.sound] ?? 0.5, maxVoices: 3 });
        break;
      }
      case "death": {
        const folder = unitFolder(ev.type);
        const url = ev.infantry
          ? (pick(folder, "voice-die") ?? pick("sfx/battle", "sfx-body_fall"))
          : (pick(folder, "sfx-die") ?? pick("sfx/battle", "sfx-explosion_large"));
        const mix = url ? mixAt(ev.x, ev.y) : null;
        if (url && mix) playSample(url, mix, { volume: ev.infantry ? 0.6 : 0.8, maxVoices: 2, jitter: 0.03 });
        break;
      }
      case "voice":
        if (!unitTalking()) unitVoice(ev.type, ev.event);
        break;
      case "announce":
        announce(ev.event);
        break;
    }
  }
}

// --- player input ----------------------------------------------------------

/** A selection answers with one of the lead unit's select lines. */
export function selectionVoice(ids: readonly number[], match: MatchSnapshot | null): void {
  if (!match || ids.length === 0) return;
  const type = leadType(ids, match.entities, match.youPlayerId);
  if (type) unitVoice(type, "select");
}

/** Every order that goes out: the unit answers, or the announcer confirms a base order. */
export function acknowledgeOrder(msg: ClientMessage, match: MatchSnapshot | null): void {
  if (!match) return;
  const cue = orderCue(msg, match.entities, match.youPlayerId);
  if (!cue) return;
  if (cue.kind === "unit") unitVoice(cue.type, cue.cue, { withSfx: true });
  else if (cue.kind === "announce") announce(cue.event);
  else uiSound(cue.sound);
}
