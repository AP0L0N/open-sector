/**
 * Plays the generated audio (tools/audio): unit answers, the announcer, battlefield
 * and unit sound effects. Files are found by name, so a unit with no file for a cue
 * is simply quiet.
 *
 * Unit answers share one channel: a new answer cuts the last one, as in classic RTS.
 * The announcer has its own queue, one line at a time, each line with a cooldown.
 */
import type { SpatialMix } from "./spatial-sfx.js";
import { playClip, playLoop, playSample, preloadSample, type Clip, type Loop } from "./audio.js";
import { AMBIENT_KINDS, ambientMix, type AmbientKind, type Mover } from "../render/ambient.js";
import { buildBank, LineDeck } from "./sound-bank.js";
import type { LinkVoice, ShieldCue, SoundEvent, Weapon } from "../render/sound-events.js";
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
/** The units the current answer speaks for: if one of them opens fire, the shot wins and the line stops. */
let speakers: ReadonlySet<number> = new Set();

/** One answer from a unit type. `special` falls back to `move` for units without one. Returns whether a line played. */
export function unitVoice(
  type: string,
  cue: UnitCue | "ready" | "load" | "shield_down" | "shield_up" | LinkVoice,
  opts: { withSfx?: boolean; ids?: readonly number[] } = {},
): boolean {
  const folder = unitFolder(type);
  let url = pick(folder, `voice-${cue}`);
  if (!url && cue === "special") url = pick(folder, "voice-move");
  if (!url) return false;
  unitClip?.stop();
  unitClip = playClip(url, UNIT_VOICE_VOLUME, { maxLateS: 0.8 });
  unitClipAt = performance.now();
  speakers = new Set(opts.ids ?? []);
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
  sonarcontact: 8000,
  cyborglinklost: 8000,
  cyborgsoffline: 8000,
  cyborgacquired: 4000,
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
  for (const cue of ["sfx-fire", "sfx-fire_line", "sfx-rockets", "sfx-die", "voice-die", "sfx-shield_hit"]) {
    for (const url of bank.get(folder, cue)) preloadSample(url);
  }
}

export function warmBattle(): void {
  for (const cue of ["explosion_small", "explosion_large", "shell_impact", "ricochet", "penetrate", "splash", "intercept", "cookoff", "explosion_building", "mine_explode", "flak_burst"]) {
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
  "pak43",
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
  flak_burst: 0.55,
};

/** Force-field cues: the shimmer is quick and light, the collapse and the recharge carry. */
const SHIELD_VOLUME: Record<ShieldCue, number> = { hit: 0.4, down: 0.75, up: 0.6 };

/**
 * Which take a shot plays: rockets use the unit's salvo when it has one (the Titan's pod).
 * The Cyborg Commander's single beam on a hull has its own take beside the sweep.
 */
function fireUrl(type: string, weapon: Weapon, line?: boolean): string | null {
  if (weapon === "small" && BIG_GUN_ONLY.has(type)) return null;
  const folder = unitFolder(type);
  if (weapon === "beam" && line) return pick(folder, "sfx-fire_line") ?? pick(folder, "sfx-fire");
  if (weapon === "rocket") return pick(folder, "sfx-rockets") ?? pick(folder, "sfx-fire");
  return pick(folder, "sfx-fire");
}

/** A heavy report close to the middle of the view pushes a unit's answer under it for a moment. */
const DUCK_FROM_GAIN = 0.35;
function duckVoices(gain: number): void {
  if (gain >= DUCK_FROM_GAIN) unitClip?.duck(0.35, 900);
}

/** Plays what the snapshot tracker found. `mixAt` places a world point in the stereo field (null: too far). */
export function playSoundEvents(events: readonly SoundEvent[], mixAt: (x: number, y: number) => SpatialMix | null): void {
  for (const ev of events) {
    switch (ev.kind) {
      case "fire": {
        // The unit that was talking opens fire: its shot cuts the line.
        if (unitClip && speakers.has(ev.id)) {
          unitClip.stop();
          unitClip = null;
          speakers = new Set();
        }
        warmUnit(ev.type);
        const url = fireUrl(ev.type, ev.weapon, ev.line);
        const mix = url ? mixAt(ev.x, ev.y) : null;
        if (url && mix) {
          const heavy = HEAVY_FIRE.has(ev.type);
          playSample(url, mix, { volume: heavy ? HEAVY_FIRE_VOLUME : FIRE_VOLUME, maxVoices: 3, jitter: heavy ? 0.03 : undefined });
          if (heavy) duckVoices(mix.gain);
        }
        break;
      }
      case "impact": {
        const url = pick("sfx/battle", `sfx-${ev.sound}`);
        const mix = url ? mixAt(ev.x, ev.y) : null;
        if (url && mix) {
          playSample(url, mix, { volume: IMPACT_VOLUME[ev.sound] ?? 0.5, maxVoices: 3 });
          if ((IMPACT_VOLUME[ev.sound] ?? 0) >= 0.85) duckVoices(mix.gain);
        }
        break;
      }
      case "death": {
        const folder = unitFolder(ev.type);
        if (ev.building) {
          // A structure's own collapse (a gun's ammunition going up, a tower toppling), else the shared one.
          const url = pick(folder, "sfx-die") ?? pick("sfx/battle", "sfx-explosion_building");
          const mix = url ? mixAt(ev.x, ev.y) : null;
          if (url && mix) {
            playSample(url, mix, { volume: 1, maxVoices: 3 });
            duckVoices(mix.gain);
          }
          break;
        }
        const url = ev.infantry
          ? (pick(folder, "voice-die") ?? pick("sfx/battle", "sfx-body_fall"))
          : (pick(folder, "sfx-die") ?? pick("sfx/battle", "sfx-explosion_large"));
        const mix = url ? mixAt(ev.x, ev.y) : null;
        if (url && mix) playSample(url, mix, { volume: ev.infantry ? 0.6 : 0.8, maxVoices: 2, jitter: 0.03 });
        break;
      }
      case "shield": {
        const folder = unitFolder(ev.type);
        const url = pick(folder, `sfx-shield_${ev.cue}`);
        const mix = url ? mixAt(ev.x, ev.y) : null;
        if (url && mix) playSample(url, mix, { volume: SHIELD_VOLUME[ev.cue], maxVoices: 2, jitter: 0.04 });
        // Your own Commander reports his field going down and coming back.
        if (ev.own && ev.cue !== "hit" && !unitTalking()) unitVoice(ev.type, `shield_${ev.cue}`);
        break;
      }
      case "voice":
        if (!unitTalking()) unitVoice(ev.type, ev.event);
        break;
      case "unitsfx": {
        const url = pick(unitFolder(ev.type), `sfx-${ev.cue}`);
        const mix = url ? mixAt(ev.x, ev.y) : null;
        // A hull crumpling under the Apocalypse is heard over the fight around it; a Cyborg link cue sits between.
        const volume = ev.cue === "crush" ? 0.9 : ev.cue === "special" ? 0.6 : 0.75;
        if (url && mix) playSample(url, mix, { volume, maxVoices: 2, jitter: ev.cue === "special" ? undefined : 0.04 });
        break;
      }
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
  if (type) unitVoice(type, "select", { ids });
}

/** Every order that goes out: the unit answers, or the announcer confirms a base order. */
export function acknowledgeOrder(msg: ClientMessage, match: MatchSnapshot | null): void {
  if (!match) return;
  const cue = orderCue(msg, match.entities, match.youPlayerId);
  if (!cue) return;
  if (cue.kind === "unit")
    unitVoice(cue.type, cue.cue, { withSfx: !cue.noSfx, ids: "ids" in msg && Array.isArray(msg.ids) ? msg.ids : [] });
  else if (cue.kind === "announce") announce(cue.event);
  else uiSound(cue.sound);
}

// --- ambient layer ---------------------------------------------------------

const beds = new Map<AmbientKind, Loop>();
let bedWatchdog: number | null = null;
/** No snapshot for this long (match left, tab asleep): the beds fade out and stop. */
const BED_IDLE_MS = 1500;

function stopBeds(): void {
  for (const bed of beds.values()) bed.stop();
  beds.clear();
}

/** Engines, rotors, tracks, and footsteps for what is moving near the view. Quietest layer of all. */
export function updateAmbient(moving: readonly Mover[], mixAt: (x: number, y: number) => SpatialMix | null): void {
  const mix = ambientMix(moving, mixAt);
  for (const kind of AMBIENT_KINDS) {
    const { level, pan } = mix[kind];
    let bed = beds.get(kind);
    if (!bed && level > 0) {
      const url = bank.get("sfx/ambient", `sfx-${kind}`)[0];
      if (!url) continue;
      bed = playLoop(url);
      beds.set(kind, bed);
    }
    bed?.set(level, pan, level > 0 ? 0.6 : 1.5);
  }
  if (bedWatchdog !== null) window.clearTimeout(bedWatchdog);
  bedWatchdog = window.setTimeout(stopBeds, BED_IDLE_MS);
}

// --- menus -----------------------------------------------------------------

/** Menu sounds sit well under the music; a hover is barely there. */
const MENU_VOLUME: Record<string, number> = {
  hover: 0.16,
  click: 0.45,
  confirm: 0.6,
  back: 0.45,
  toggle: 0.4,
  tick: 0.3,
  type: 0.22,
  deny: 0.5,
  transition: 0.35,
  deploy: 0.75,
};
/** Least gap between two plays of one sound: a dragged slider or fast typing must not machine-gun. */
const MENU_GAP_MS: Record<string, number> = { hover: 60, tick: 70, type: 35, transition: 250 };
const menuLast = new Map<string, number>();

export function menuSound(cue: string, scale = 1): void {
  const now = performance.now();
  if (now - (menuLast.get(cue) ?? -Infinity) < (MENU_GAP_MS[cue] ?? 0)) return;
  const url = pick("sfx/menu", `sfx-${cue}`);
  if (!url) return;
  menuLast.set(cue, now);
  playClip(url, (MENU_VOLUME[cue] ?? 0.4) * scale, { maxLateS: 0.25 });
}
