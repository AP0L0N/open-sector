import {
  clampGameSpeed,
  DEPLOY_SECONDS,
  garrisonCapOf,
  hasMg,
  hasTurret,
  isGarrisonable,
  isInfantryType,
} from "../catalog.js";
import { garrisonOwner, livingGarrison } from "./garrison.js";
import { allies } from "./geo.js";
import { powerOf } from "./power.js";
import { canSeeWorld, entityOnMask, visionMask } from "./vision.js";
import type { MatchState } from "./types.js";
import type { EntityView, MatchSnapshot, ScrapCell } from "../protocol.js";

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
      deployProgress:
        e.state === "deploy" || e.state === "undeploy"
          ? Math.min(1, e.deployTime / DEPLOY_SECONDS)
          : undefined,
      specialCooldown: e.specialCooldown > 0 ? e.specialCooldown : undefined,
      wreck: e.wreck || undefined,
      crits: e.crits.length > 0 ? [...e.crits] : undefined,
      stance: isInfantryType(e.type) ? e.stance : undefined,
      stanceOrder: isInfantryType(e.type) && e.stanceOrder !== e.stance ? e.stanceOrder : undefined,
      ammo: friendly && Object.keys(e.ammo).length > 0 ? { ...e.ammo } : undefined,
      shell: friendly && e.shell ? e.shell : undefined,
      mgAmmo: friendly && hasMg(e.type) ? e.mgAmmo : undefined,
      mgHeat: friendly && hasMg(e.type) ? e.mgHeat : undefined,
      mgOverheat: friendly && hasMg(e.type) && e.mgOverheat > 0 ? e.mgOverheat : undefined,
      garrisonedIn: friendly && e.garrisonedIn ? e.garrisonedIn : undefined,
      garrison: isGarrisonable(e.type)
        ? {
            count: livingGarrison(state, e).length,
            cap: garrisonCapOf(e.type),
            ownerId: garrisonOwner(state, e) || undefined,
          }
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
    winner: state.winner,
  };
}
