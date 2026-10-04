/**
 * Sound cues read off the snapshot stream. The sim sends no event list, so shots,
 * deaths, new units, and base alerts are found by comparing one snapshot with the
 * one before. Pure: no audio, no DOM. `game-audio.ts` plays what this returns.
 */
import { isBuildingType, isInfantryType, type EntityView, type MatchSnapshot } from "@gridlock/shared";
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
  | "explosion_building";

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
  /** An infantryman fell (voice) or a machine was destroyed (sfx). */
  | { kind: "death"; type: string; infantry: boolean; x: number; y: number }
  /** One of your units speaks without being clicked: it just left the factory. */
  | { kind: "voice"; type: string; event: "ready" }
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
};
const DEFAULT_FIRE_GAP_MS = 140;
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
  /** Share of health left, not raw hp: bracing or packing up rescales both hp and hpMax. */
  private lastHp = new Map<number, number>();
  private lowPower = false;
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
      this.noteQueues(match, out, true);
      this.prevById = byId;
      out.push({ kind: "announce", event: "start" });
      return out;
    }

    const fire = (shooterId: number, kind: Weapon) => {
      const s = byId.get(shooterId);
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
    };

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
      // The laser's burn is heard when the beam opens (below), not again where it lands.
      if (i.laser) continue;
      // Hitscan rounds and shells too quick for a snapshot are only seen landing.
      if (i.fromId != null && !i.intercept && !i.cookoff && !i.blast && !i.rocket && !i.torpedo && !i.bomb) {
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
        if (e.ownerId === me && e.kind === "unit" && !e.wreck) {
          out.push({ kind: "voice", type: e.type, event: "ready" });
          out.push({ kind: "announce", event: "ready" });
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
      if (isBuildingType(prev.type) && prev.hp <= prev.hpMax * LOST_HP_SHARE) {
        out.push({ kind: "impact", sound: "explosion_building", x: prev.x, y: prev.y });
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

    if (match.winner && !this.ended) {
      this.ended = true;
      const mine = match.players.find((p) => p.playerId === me);
      const won = match.winner.playerId === me || (mine != null && mine.team === match.winner.team);
      out.push({ kind: "announce", event: won ? "victory" : "defeat" });
    }

    this.moving = movers(this.prevById, match.entities);
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
