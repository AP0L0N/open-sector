/**
 * Sound cues read off the snapshot stream. The sim sends no event list, so shots,
 * deaths, new units, and base alerts are found by comparing one snapshot with the
 * one before. Pure: no audio, no DOM. `game-audio.ts` plays what this returns.
 */
import { isBuildingType, isInfantryType, tankDeckOf, type EntityView, type MatchSnapshot } from "@gridlock/shared";
import { movers, type Mover } from "./ambient.js";

export type ImpactSound =
  | "explosion_small"
  | "explosion_large"
  | "shell_impact"
  | "ricochet"
  | "penetrate"
  | "splash"
  | "intercept"
  | "cookoff"
  | "explosion_building"
  | "flak_burst";

export type AnnounceEvent =
  | "start"
  | "ready"
  | "building"
  | "complete"
  | "lowpower"
  | "powerrestored"
  | "underattack"
  | "unitattack"
  | "unitlost"
  | "buildinglost"
  | "captured"
  | "buildingcaptured"
  | "sonarcontact"
  | "victory"
  | "defeat";

/** What went off: bullets (and autocannon), a shell or bomb, a rocket, or the Cyborg Commander's laser. */
export type Weapon = "small" | "shell" | "rocket" | "beam";

/** The Cyborg Commander's force field: it soaked a hit, it went down, or it came back on. */
export type ShieldCue = "hit" | "down" | "up";

export type SoundEvent =
  /** A unit fired. Positioned at the shooter. */
  | { kind: "fire"; id: number; type: string; weapon: Weapon; x: number; y: number; line?: boolean }
  /** A force field soaked a hit, collapsed, or came back. `own`: one of your units. */
  | { kind: "shield"; id: number; type: string; cue: ShieldCue; own: boolean; x: number; y: number }
  /** A battlefield sound at a point. */
  | { kind: "impact"; sound: ImpactSound; x: number; y: number }
  /**
   * An infantryman fell (voice) or a machine was destroyed (sfx). `building`: a structure went
   * down; it plays its own collapse when it has one, else the shared one.
   */
  | { kind: "death"; type: string; infantry: boolean; x: number; y: number; building?: boolean }
  /**
   * One of your units speaks without being clicked: it just left the factory, (special) did its work
   * on its own, or (load) took someone aboard.
   */
  | { kind: "voice"; type: string; event: "ready" | "special" | "load" }
  /**
   * A unit's own effect at a point, played without an order: the ASW helicopter settling back on
   * its deck, one of your defences going up (sandbags thumped down, a gun set in its pit), or
   * (crush) an Apocalypse rolling a hull flat.
   */
  | { kind: "unitsfx"; type: string; cue: "special" | "crush"; x: number; y: number }
  | { kind: "announce"; event: AnnounceEvent };

/** Least time between two fire sounds from one shooter, by type. A burst sample covers the rest. */
const FIRE_GAP_MS: Record<string, number> = {
  gunner: 450,
  walker: 500,
  cyborg: 500,
  apocalypse: 450,
  mammoth: 450,
  pyro: 1400,
  jumpjet: 260,
  gunboat: 320,
  destroyer: 280,
  lst: 260,
  fw190: 1500,
  stuka: 500,
  nebelwerfer: 1600,
  titan: 350,
  battleship: 700,
  drone: 400,
  ciws: 450,
  ram: 600,
  bunker: 140,
  tower: 140,
  mgnest: 450,
  // The imported Bofors take is one 1.5 s burst of shells, so the next cue waits it out.
  flak: 1500,
};
const DEFAULT_FIRE_GAP_MS = 140;
/** An LST loading a column calls it once, not once a soldier. */
const LOAD_LINE_GAP_MS = 6000;
/**
 * Shells: each is its own report, except where one sample already holds several
 * barrels (the Apocalypse's pair, a battleship broadside, a Stuka's bomb run).
 */
const SHELL_GAP_MS: Record<string, number> = {
  apocalypse: 1500,
  battleship: 2500,
  stuka: 2000,
};
/** Rockets: one salvo sample covers a whole ripple. Kept apart from the gun, so a Titan's pod never mutes its cannon. */
const ROCKET_GAP_MS: Record<string, number> = {
  nebelwerfer: 2500,
  titan: 2500,
};
const DEFAULT_ROCKET_GAP_MS = 600;
/** Least time between two force-field shimmers from one unit. A gatling would otherwise buzz every tick. */
const SHIELD_HIT_GAP_MS = 220;
/** A shell's impact after its own projectile was already heard is not a second shot. */
const SHELL_ECHO_MS = 2500;

const UNDER_ATTACK_GAP_MS = 25_000;
const UNIT_ATTACK_GAP_MS = 30_000;
/** A building at or under this share of its health that vanishes was destroyed, not sold. */
const LOST_HP_SHARE = 0.4;

function hpShare(e: EntityView): number {
  return e.hpMax > 0 ? e.hp / e.hpMax : 1;
}

function isShell(caliber: number | undefined): boolean {
  return (caliber ?? 0) >= 40;
}

export class SoundTracker {
  private started = false;
  private prevById = new Map<number, EntityView>();
  private everSeen = new Set<number>();
  private seenShots = new Set<number>();
  private seenImpacts = new Set<number>();
  private seenBodies = new Set<number>();
  private lastFire = new Map<number, number>();
  private lastRocket = new Map<number, number>();
  private lastShellFire = new Map<number, number>();
  private lastShieldHit = new Map<number, number>();
  private lastLoadLine = new Map<number, number>();
  /** Share of health left, not raw hp: bracing or packing up rescales both hp and hpMax. */
  private lastHp = new Map<number, number>();
  private lowPower = false;
  /** Submarines your sonar heard in the last snapshot. One that was not there is a new contact. */
  private sonarHeard = new Set<number>();
  private queueReady = new Map<string, boolean>();
  private queueType = new Map<string, string | null>();
  private underAttackAt = -Infinity;
  private unitAttackAt = -Infinity;
  private ended = false;
  /** Units that moved since the last snapshot, for the ambient layer. */
  moving: Mover[] = [];

  step(match: MatchSnapshot, now: number): SoundEvent[] {
    const out: SoundEvent[] = [];
    const me = match.youPlayerId;
    const byId = new Map(match.entities.map((e) => [e.id, e]));

    if (!this.started) {
      // The first picture of the match: everything in it was already there.
      this.started = true;
      for (const e of match.entities) {
        this.everSeen.add(e.id);
        this.lastHp.set(e.id, hpShare(e));
      }
      for (const p of match.projectiles) this.seenShots.add(p.id);
      for (const l of match.launches ?? []) this.seenShots.add(l.id);
      for (const i of match.impacts ?? []) this.seenImpacts.add(i.id);
      for (const b of match.bodies ?? []) this.seenBodies.add(b.id);
      this.lowPower = match.you.lowPower;
      this.sonarHeard = new Set((match.sonar ?? []).map((c) => c.id));
      this.noteQueues(match, out, true);
      this.prevById = byId;
      out.push({ kind: "announce", event: "start" });
      return out;
    }

    const fire = (shooterId: number, kind: Weapon) => {
      const gunner = byId.get(shooterId);
      // A soldier on an LST deck tub fires the ship's mount: the ship's gun is what you hear.
      const deck = gunner?.mountedGun != null && gunner.garrisonedIn != null ? byId.get(gunner.garrisonedIn) : undefined;
      const s = deck ?? gunner;
      if (!s || s.wreck) return;
      const gap =
        kind === "small"
          ? (FIRE_GAP_MS[s.type] ?? DEFAULT_FIRE_GAP_MS)
          : kind === "rocket"
            ? (ROCKET_GAP_MS[s.type] ?? DEFAULT_ROCKET_GAP_MS)
            : (SHELL_GAP_MS[s.type] ?? 0);
      const track = kind === "rocket" ? this.lastRocket : this.lastFire;
      if (now - (track.get(shooterId) ?? -Infinity) < gap) return;
      track.set(shooterId, now);
      if (kind === "shell") this.lastShellFire.set(shooterId, now);
      out.push({ kind: "fire", id: s.id, type: s.type, weapon: kind, x: s.x, y: s.y });
      // Nobody orders the ASW helicopter: its pilot calls the drop himself.
      if (s.type === "aswheli" && s.ownerId === me) out.push({ kind: "voice", type: s.type, event: "special" });
    };

    // Your LST took someone up its ramp, or put them down it onto the beach.
    const loaded = new Set<number>();
    const landed = new Set<number>();
    for (const e of match.entities) {
      if (e.ownerId !== me || e.kind !== "unit") continue;
      const prev = this.prevById.get(e.id);
      if (!prev || prev.garrisonedIn === e.garrisonedIn) continue;
      const into = e.garrisonedIn != null ? byId.get(e.garrisonedIn) : undefined;
      const outOf = prev.garrisonedIn != null ? byId.get(prev.garrisonedIn) : undefined;
      if (into && tankDeckOf(into.type)) loaded.add(into.id);
      if (outOf && tankDeckOf(outOf.type) && e.garrisonedIn == null) landed.add(outOf.id);
    }
    for (const id of landed) {
      const ship = byId.get(id)!;
      out.push({ kind: "unitsfx", type: ship.type, cue: "special", x: ship.x, y: ship.y });
      if (ship.ownerId === me) out.push({ kind: "voice", type: ship.type, event: "special" });
    }
    for (const id of loaded) {
      if (landed.has(id)) continue;
      const ship = byId.get(id)!;
      if (ship.ownerId === me && now - (this.lastLoadLine.get(id) ?? -Infinity) >= LOAD_LINE_GAP_MS) {
        this.lastLoadLine.set(id, now);
        out.push({ kind: "voice", type: ship.type, event: "load" });
      }
    }

    // Shots that made a snapshot in flight.
    for (const p of match.projectiles) {
      if (p.bounced || this.seenShots.has(p.id)) continue;
      this.seenShots.add(p.id);
      fire(p.fromId, p.rocket ? "rocket" : isShell(p.caliber) || p.mortar || p.bomb ? "shell" : "small");
    }
    for (const l of match.launches ?? []) {
      if (this.seenShots.has(l.id)) continue;
      this.seenShots.add(l.id);
      fire(l.fromId, "rocket");
    }

    for (const i of match.impacts ?? []) {
      if (this.seenImpacts.has(i.id)) continue;
      this.seenImpacts.add(i.id);
      if (i.kind === "crush") continue;
      // An Apocalypse rolled a hull flat: steel crumpling under its tracks.
      if (i.crusher != null) {
        out.push({ kind: "unitsfx", type: "apocalypse", cue: "crush", x: i.x, y: i.y });
        continue;
      }
      // The laser's burn is heard when the beam opens (below), not again where it lands.
      if (i.laser) continue;
      // Hitscan rounds and shells too quick for a snapshot are only seen landing.
      // A flak burst is heard where it bursts (flak_burst); its gun was heard when the shell left.
      if (i.fromId != null && !i.intercept && !i.cookoff && !i.blast && !i.rocket && !i.torpedo && !i.bomb && !i.flak) {
        if (!isShell(i.caliber)) {
          if ((i.caliber ?? 0) > 0) fire(i.fromId, "small");
        } else if (now - (this.lastShellFire.get(i.fromId) ?? -Infinity) > SHELL_ECHO_MS && !this.seenShots.has(i.id)) {
          fire(i.fromId, "shell");
        }
      }
      const sound = impactSound(i);
      if (sound) out.push({ kind: "impact", sound, x: i.x, y: i.y });
    }

    // Infantry deaths leave a body.
    for (const b of match.bodies ?? []) {
      if (this.seenBodies.has(b.id)) continue;
      this.seenBodies.add(b.id);
      out.push({ kind: "death", type: b.type, infantry: true, x: b.x, y: b.y });
      if (b.ownerId === me) out.push({ kind: "announce", event: "unitlost" });
    }

    let ownBuildingHit = false;
    let ownUnitHit = false;
    for (const e of match.entities) {
      const prev = this.prevById.get(e.id);
      if (!this.everSeen.has(e.id)) {
        this.everSeen.add(e.id);
        if (e.ownerId === me && e.kind === "unit" && !e.wreck && e.type !== "torpedo") {
          out.push({ kind: "voice", type: e.type, event: "ready" });
          // A helicopter off its ship's deck is a sortie, not a new unit: its pilot answers, the announcer does not.
          if (e.type !== "aswheli") out.push({ kind: "announce", event: "ready" });
        }
        // One of your structures just went up: its own setting-up sound, where it has one.
        if (e.ownerId === me && e.kind === "building" && isBuildingType(e.type)) {
          out.push({ kind: "unitsfx", type: e.type, cue: "special", x: e.x, y: e.y });
        }
      }
      if (prev && !prev.wreck && e.wreck) {
        out.push({ kind: "death", type: e.type, infantry: false, x: e.x, y: e.y });
        if (e.ownerId === me) out.push({ kind: "announce", event: "unitlost" });
      }
      if (prev && prev.ownerId !== e.ownerId && isBuildingType(e.type)) {
        if (e.ownerId === me) out.push({ kind: "announce", event: "captured" });
        else if (prev.ownerId === me) out.push({ kind: "announce", event: "buildingcaptured" });
      }
      if (e.laser && !e.wreck) {
        const was = prev?.laser;
        if (!was || was.a0 !== e.laser.a0 || e.laser.u < was.u) {
          out.push({ kind: "fire", id: e.id, type: e.type, weapon: "beam", x: e.x, y: e.y, line: e.laser.line });
        }
      }
      if (e.field && prev?.field && !e.wreck) {
        const own = e.ownerId === me;
        if (e.field.hp <= 0 && prev.field.hp > 0) {
          out.push({ kind: "shield", id: e.id, type: e.type, cue: "down", own, x: e.x, y: e.y });
        } else if (e.field.hp > 0 && prev.field.hp <= 0) {
          out.push({ kind: "shield", id: e.id, type: e.type, cue: "up", own, x: e.x, y: e.y });
        } else if (e.field.hp < prev.field.hp && now - (this.lastShieldHit.get(e.id) ?? -Infinity) >= SHIELD_HIT_GAP_MS) {
          this.lastShieldHit.set(e.id, now);
          out.push({ kind: "shield", id: e.id, type: e.type, cue: "hit", own, x: e.x, y: e.y });
        }
      }
      const share = this.lastHp.get(e.id);
      if (share !== undefined && hpShare(e) < share - 1e-6 && e.ownerId === me && !e.wreck) {
        if (isBuildingType(e.type)) ownBuildingHit = true;
        else if (e.kind === "unit") ownUnitHit = true;
      }
      this.lastHp.set(e.id, hpShare(e));
    }

    // A vanished own building that was badly hurt went down. A machine with no wreck (Walker, drone) blew up.
    for (const [id, prev] of this.prevById) {
      if (byId.has(id)) continue;
      this.lastHp.delete(id);
      if (prev.wreck) continue;
      if (prev.type === "aswheli" && prev.hp > prev.hpMax * LOST_HP_SHARE) {
        // Gone whole: it came down on its ship's deck and was stowed.
        out.push({ kind: "unitsfx", type: prev.type, cue: "special", x: prev.x, y: prev.y });
        continue;
      }
      if (isBuildingType(prev.type) && prev.hp <= prev.hpMax * LOST_HP_SHARE) {
        out.push({ kind: "death", type: prev.type, infantry: false, building: true, x: prev.x, y: prev.y });
        if (prev.ownerId === me) out.push({ kind: "announce", event: "buildinglost" });
      } else if (prev.kind === "unit" && !isInfantryType(prev.type) && prev.hp <= prev.hpMax * LOST_HP_SHARE && !prev.garrisonedIn) {
        out.push({ kind: "death", type: prev.type, infantry: false, x: prev.x, y: prev.y });
      }
    }

    if (ownBuildingHit && now - this.underAttackAt > UNDER_ATTACK_GAP_MS) {
      this.underAttackAt = now;
      this.unitAttackAt = now;
      out.push({ kind: "announce", event: "underattack" });
    } else if (ownUnitHit && now - this.unitAttackAt > UNIT_ATTACK_GAP_MS) {
      this.unitAttackAt = now;
      out.push({ kind: "announce", event: "unitattack" });
    }

    if (match.you.lowPower !== this.lowPower) {
      this.lowPower = match.you.lowPower;
      out.push({ kind: "announce", event: this.lowPower ? "lowpower" : "powerrestored" });
    }
    this.noteQueues(match, out, false);

    const heard = new Set((match.sonar ?? []).map((c) => c.id));
    if ([...heard].some((id) => !this.sonarHeard.has(id))) out.push({ kind: "announce", event: "sonarcontact" });
    this.sonarHeard = heard;

    if (match.winner && !this.ended) {
      this.ended = true;
      const mine = match.players.find((p) => p.playerId === me);
      const won = match.winner.playerId === me || (mine != null && mine.team === match.winner.team);
      out.push({ kind: "announce", event: won ? "victory" : "defeat" });
    }

    this.moving = movers(this.prevById, match.entities, me);
    this.prevById = byId;
    if (this.seenShots.size > 2000) this.seenShots = new Set([...this.seenShots].slice(-500));
    if (this.seenImpacts.size > 4000) this.seenImpacts = new Set([...this.seenImpacts].slice(-1000));
    if (this.lastFire.size > 500) this.lastFire.clear();
    if (this.lastRocket.size > 500) this.lastRocket.clear();
    if (this.lastShieldHit.size > 500) this.lastShieldHit.clear();
    return out;
  }

  /** Construction lanes: a new job is "Building", the flip to ready is "Construction complete". */
  private noteQueues(match: MatchSnapshot, out: SoundEvent[], quiet: boolean): void {
    const lanes = {
      structure: match.you.structureQueue,
      defence: match.you.defenceQueue,
      line: match.you.lineQueue,
    };
    for (const [lane, q] of Object.entries(lanes)) {
      const type = q?.type ?? null;
      const ready = !!q?.ready;
      if (!quiet) {
        if (type && type !== this.queueType.get(lane) && !ready) out.push({ kind: "announce", event: "building" });
        if (ready && !this.queueReady.get(lane)) out.push({ kind: "announce", event: "complete" });
      }
      this.queueType.set(lane, type);
      this.queueReady.set(lane, ready);
    }
  }
}

export function impactSound(i: MatchSnapshot["impacts"][number]): ImpactSound | null {
  if (i.flak) return "flak_burst";
  if (i.intercept) return "intercept";
  if (i.cookoff) return "cookoff";
  if (i.splash || i.torpedo) return i.torpedo ? "explosion_large" : "splash";
  if (i.blast || i.bomb) return "explosion_large";
  if (i.kind === "kill" && isShell(i.caliber)) return "explosion_large";
  if (i.rocket || i.mortar || i.heBurst) return "explosion_small";
  if (!isShell(i.caliber)) return null; // bullets: the shot itself carries the sound
  if (i.kind === "ricochet" || i.kind === "glance") return "ricochet";
  if (i.kind === "pen" || i.kind === "hit") return "penetrate";
  return "shell_impact";
}
