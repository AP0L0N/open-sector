import {
  beltOf,
  clampGameSpeed,
  DEPLOY_SECONDS,
  entityIsScouting,
  garrisonCapOf,
  hasMg,
  hasScout,
  hasTurret,
  isGarrisonable,
  isInfantryType,
  MG42_BIPOD_SECONDS,
  MORTAR_PLANT_SECONDS,
} from "../catalog.js";
import { garrisonBars, garrisonOwner } from "./garrison.js";
import { allies, unitInWater } from "./geo.js";
import { powerOf } from "./power.js";
import { canSeeWorld, entityOnMask, visionMask } from "./vision.js";
import type { Entity, MatchState } from "./types.js";
import type { CorpseView, EntityView, MatchSnapshot, ScrapCell } from "../protocol.js";

function plantRemaining(e: Entity, friendly: boolean): number | undefined {
  if (!friendly) return undefined;
  const limit = e.type === "gunner" ? MG42_BIPOD_SECONDS : e.type === "mortarman" ? MORTAR_PLANT_SECONDS : 0;
  if (limit <= 0 || e.bipod >= limit) return undefined;
  return Math.max(0, limit - e.bipod);
}

function scoutView(e: Entity, friendly: boolean): EntityView["scout"] {
  if (!hasScout(e.type) || e.scoutHpMax <= 0) return undefined;
  const out = entityIsScouting(e);
  if (!friendly && !out) return undefined;
  return {
    hp: e.scoutHp,
    hpMax: e.scoutHpMax,
    out: out ? true : undefined,
  };
}

export function snapshotFor(state: MatchState, youPlayerId: string): MatchSnapshot {
  const you = state.players.get(youPlayerId);
  const power = you ? powerOf(state, youPlayerId) : { provided: 0, used: 0, lowPower: false };
  const vis = you ? visionMask(state, youPlayerId) : new Uint8Array(state.width * state.height);
  const entities: EntityView[] = [];
  for (const e of state.entities.values()) {
    if (e.hp <= 0) continue;
    const friendly = allies(state, youPlayerId, e.ownerId);
    if (e.garrisonedIn && !friendly) continue;
    if (!friendly && !entityOnMask(e, vis, state.width, state.height, state.tileSize)) continue;
    const job = e.queue[0];
    const occBars = isGarrisonable(e.type) ? garrisonBars(state, e) : [];
    entities.push({
      id: e.id,
      kind: e.kind,
      type: e.type,
      ownerId: e.ownerId,
      x: e.x,
      y: e.y,
      facing: e.facing,
      turretFacing: hasTurret(e.type) ? e.turretFacing : undefined,
      hp: e.hp,
      hpMax: e.hpMax,
      state: e.state,
      tileW: e.tileW,
      tileH: e.tileH,
      tileX: e.tileX,
      tileY: e.tileY,
      trainProgress: job ? job.progressTicks / job.totalTicks : undefined,
      trainQueue:
        friendly && e.queue.length > 0
          ? e.queue.map((j) => ({
              id: j.id,
              type: j.type,
              progress: j.progressTicks / j.totalTicks,
              paused: j.paused,
            }))
          : undefined,
      cargo: e.type === "hauler" ? e.cargo : undefined,
      smokeCharges: friendly && e.type === "hauler" && !e.wreck ? e.smokeCharges : undefined,
      deployProgress:
        e.state === "deploy" || e.state === "undeploy"
          ? Math.min(1, e.deployTime / DEPLOY_SECONDS)
          : undefined,
      specialCooldown: e.specialCooldown > 0 ? e.specialCooldown : undefined,
      wreck: e.wreck || undefined,
      crits: e.crits.length > 0 ? [...e.crits] : undefined,
      stance: isInfantryType(e.type) ? e.stance : undefined,
      stanceOrder: isInfantryType(e.type) && e.stanceOrder !== e.stance ? e.stanceOrder : undefined,
      swimming: isInfantryType(e.type) && unitInWater(state, e) ? true : undefined,
      holdPosition: friendly && e.holdPosition ? true : undefined,
      guardFacing: friendly && e.guardFacing != null ? e.guardFacing : undefined,
      guardTargetId:
        friendly && e.order?.kind === "guard" && e.order.targetId != null ? e.order.targetId : undefined,
      scout: scoutView(e, friendly),
      ammo: friendly && Object.keys(e.ammo).length > 0 ? { ...e.ammo } : undefined,
      shell: friendly && e.shell ? e.shell : undefined,
      mgAmmo: friendly && hasMg(e.type) ? e.mgAmmo : undefined,
      mgHeat: friendly && hasMg(e.type) ? e.mgHeat : undefined,
      mgOverheat: friendly && hasMg(e.type) && e.mgOverheat > 0 ? e.mgOverheat : undefined,
      weapon: friendly && isInfantryType(e.type) ? (e.weapon ?? undefined) : undefined,
      clip: friendly && (isInfantryType(e.type) || beltOf(e.type)) ? e.clip : undefined,
      guns: friendly && e.type === "walker" ? (e.gatlingGuns === 1 ? 1 : 2) : undefined,
      reload: friendly && (isInfantryType(e.type) || beltOf(e.type)) && e.reload > 0 ? e.reload : undefined,
      bipod: plantRemaining(e, friendly),
      garrisonedIn: friendly && e.garrisonedIn ? e.garrisonedIn : undefined,
      garrison: isGarrisonable(e.type)
        ? (() => {
            const occOwner = garrisonOwner(state, e);
            const occFriendly = allies(state, youPlayerId, occOwner);
            const conceal = e.garrisonHide && occBars.length > 0 && !occFriendly;
            return {
              count: conceal ? 0 : occBars.length,
              cap: garrisonCapOf(e.type),
              ownerId: conceal ? undefined : occOwner || undefined,
              bars: conceal || occBars.length === 0 ? undefined : occBars,
              hide: occFriendly && occBars.length > 0 && e.garrisonHide ? true : undefined,
            };
          })()
        : undefined,
      capture:
        e.kind === "building" && e.captureProgress > 0 && e.captureOwnerId
          ? { ownerId: e.captureOwnerId, progress: e.captureProgress }
          : undefined,
    });
  }
  const scrap: ScrapCell[] = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const yld = state.scrapYield[y * state.width + x] ?? 0;
      if (yld > 0) scrap.push({ x, y, yield: yld });
    }
  }
  const hq = you ? state.entities.get(you.hqId) : undefined;
  return {
    tick: state.tick,
    gameSpeed: clampGameSpeed(state.gameSpeed),
    mapId: state.mapId,
    youPlayerId,
    you: {
      scrap: you?.scrap ?? 0,
      provided: power.provided,
      used: power.used,
      lowPower: power.lowPower,
      structureQueue: you?.structure
        ? {
            type: you.structure.type,
            progressTicks: you.structure.progressTicks,
            totalTicks: you.structure.totalTicks,
            ready: you.structure.ready,
            paused: you.structure.paused,
          }
        : null,
      placingType: you?.placingType ?? null,
      alive: you?.alive ?? false,
      hqId: hq && hq.hp > 0 ? hq.id : (you?.hqId ?? null),
    },
    players: [...state.players.values()].map((p) => ({
      playerId: p.playerId,
      name: p.name,
      colorId: p.colorId,
      team: p.team,
      alive: p.alive,
    })),
    entities,
    projectiles: state.projectiles
      .filter((p) => allies(state, youPlayerId, p.ownerId) || canSeeWorld(state, vis, p.x, p.y))
      .map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        caliber: p.caliber,
        fromId: p.fromId,
        bounced: p.bounced,
        shell: p.shell ?? undefined,
        z: p.flight === "mortar" ? (p.z ?? 0) : undefined,
        mortar: p.flight === "mortar" ? true : undefined,
        apex: p.flight === "mortar" ? p.apex : undefined,
        arc:
          p.flight === "mortar" && (p.flightTime ?? 0) > 0
            ? Math.min(1, Math.max(0, ((p.flightTime ?? 0) - Math.max(0, p.life)) / (p.flightTime ?? 1)))
            : undefined,
        hang: p.flight === "mortar" ? p.flightTime : undefined,
      })),
    impacts: state.impacts.filter(
      (i) => allies(state, youPlayerId, i.ownerId) || canSeeWorld(state, vis, i.x, i.y),
    ),
    smoke: state.smokeClouds.map((c) => ({
      id: c.id,
      x: c.x,
      y: c.y,
      ux: c.ux,
      uy: c.uy,
      halfAlong: c.halfAlong,
      halfAcross: c.halfAcross,
      life: c.life,
      lifeMax: c.lifeMax,
    })),
    scrap,
    clearedTrees: state.clearedTrees.map((t) => ({ x: t.x, y: t.y })),
    bodies: visibleBodies(state, youPlayerId, vis),
    holes: state.holes.map((h) => ({ ...h })),
    winner: state.winner,
  };
}

function visibleBodies(state: MatchState, youPlayerId: string, vis: Uint8Array): CorpseView[] {
  const bodies: CorpseView[] = [];
  for (const b of state.bodies) {
    const friendly = allies(state, youPlayerId, b.ownerId);
    if (!friendly && !canSeeWorld(state, vis, b.x, b.y)) continue;
    bodies.push({
      id: b.id,
      type: b.type,
      ownerId: b.ownerId,
      x: b.x,
      y: b.y,
      facing: b.facing,
      bornTick: b.bornTick,
      blood: b.blood.map((s) => ({ ...s })),
    });
  }
  return bodies;
}
