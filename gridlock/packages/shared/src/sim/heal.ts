import {
  catalog,
  isInfantryType,
  MEDIC_HEAL_PER_SEC,
  MEDIC_MEND_SECONDS,
  MEDIC_SEEK_TILES,
  MEDIC_TOUCH_SLACK,
  primaryInfantryGun,
} from "../catalog.js";
import { allies } from "./geo.js";
import { escortAnchor, turnToward } from "./orders.js";
import { setPath } from "./path.js";
import { unitClearance } from "./formation.js";
import type { Entity, MatchState } from "./types.js";

function dist2(a: Entity, b: Entity): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function needsCare(e: Entity): boolean {
  return e.hp < e.hpMax || e.crits.length > 0;
}

/** Living allied infantry, not the medic, still short of whole. */
function canTend(state: MatchState, medic: Entity, other: Entity): boolean {
  if (other.id === medic.id) return false;
  if (other.kind !== "unit" || !isInfantryType(other.type)) return false;
  if (other.hp <= 0 || other.wreck) return false;
  if (!needsCare(other)) return false;
  return allies(state, medic.ownerId, other.ownerId);
}

function sameHouse(medic: Entity, other: Entity): boolean {
  return medic.garrisonedIn != null && medic.garrisonedIn === other.garrisonedIn;
}

function withinSeek(state: MatchState, medic: Entity, other: Entity): boolean {
  if (sameHouse(medic, other)) return true;
  if (medic.garrisonedIn != null || other.garrisonedIn != null) return false;
  const seek = MEDIC_SEEK_TILES * state.tileSize;
  return dist2(medic, other) <= seek * seek;
}

function inReach(state: MatchState, medic: Entity, other: Entity): boolean {
  if (sameHouse(medic, other)) return true;
  if (medic.garrisonedIn != null || other.garrisonedIn != null) return false;
  const reach = unitClearance(medic.radius, other.radius) + MEDIC_TOUCH_SLACK;
  return dist2(medic, other) <= reach * reach;
}

function medicActive(e: Entity): boolean {
  return (
    e.type === "medic" &&
    e.kind === "unit" &&
    e.hp > 0 &&
    !e.wreck &&
    e.state !== "deploy" &&
    e.state !== "undeploy"
  );
}

/** Idle, holding a self-issued approach, or shut inside a house. A player order wins. */
function mayWalk(e: Entity): boolean {
  if (e.holdPosition || e.garrisonedIn) return false;
  const o = e.order;
  if (!o) return true;
  return o.auto === true && o.kind === "move";
}

function dropAutoApproach(e: Entity): void {
  if (e.order?.auto === true && e.order.kind === "move") {
    e.order = null;
    e.waypoints = [];
    if (e.state === "move") e.state = "idle";
  }
}

function choosePatient(state: MatchState, medic: Entity): Entity | null {
  if (medic.tendId != null) {
    const current = state.entities.get(medic.tendId);
    if (current && canTend(state, medic, current) && withinSeek(state, medic, current)) return current;
  }
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const other of state.entities.values()) {
    if (!canTend(state, medic, other) || !withinSeek(state, medic, other)) continue;
    const d = dist2(medic, other);
    if (!best || d < bestD - 0.5 || (Math.abs(d - bestD) <= 0.5 && other.id < best.id)) {
      best = other;
      bestD = d;
    }
  }
  return best;
}

function restoreArm(patient: Entity): void {
  const primary = primaryInfantryGun(patient.type);
  if (!primary) return;
  patient.weapon = primary.id;
  patient.clip = primary.clip;
  patient.reload = 0;
}

function applyHeal(medic: Entity, patient: Entity, dt: number): void {
  if (patient.hp < patient.hpMax) {
    patient.hp = Math.min(patient.hpMax, patient.hp + MEDIC_HEAL_PER_SEC * dt);
  }
  if (patient.crits.length === 0) {
    medic.mendTime = 0;
    return;
  }
  medic.mendTime = (medic.mendTime ?? 0) + dt;
  if (medic.mendTime < MEDIC_MEND_SECONDS) return;
  const removed = patient.crits.shift();
  medic.mendTime = 0;
  if (removed === "arm") restoreArm(patient);
}

function approach(state: MatchState, medic: Entity, patient: Entity): void {
  const anchor = escortAnchor(medic, patient);
  const ox = medic.order?.x;
  const oy = medic.order?.y;
  const drifted =
    ox == null || oy == null || Math.hypot(anchor.x - ox, anchor.y - oy) > state.tileSize;
  medic.order = { kind: "move", x: anchor.x, y: anchor.y, auto: true };
  if (medic.waypoints.length === 0 || state.tick % 5 === 0 || drifted) {
    setPath(state, medic, anchor.x, anchor.y);
  }
}

/**
 * Patient id while this medic is hands-on. Omitted during the walk over.
 * Anyone who can see him can see the kneel.
 */
export function medicTendView(state: MatchState, medic: Entity): number | undefined {
  if (medic.type !== "medic" || medic.tendId == null) return undefined;
  const patient = state.entities.get(medic.tendId);
  if (!patient || patient.hp <= 0 || patient.wreck) return undefined;
  if (!isInfantryType(patient.type) || patient.id === medic.id) return undefined;
  if (!allies(state, medic.ownerId, patient.ownerId)) return undefined;
  if (!inReach(state, medic, patient)) return undefined;
  return patient.id;
}

/** Walk to the nearest wounded ally in reach of a short walk, then heal. No weapon, no charges. */
export function tickHeal(state: MatchState, dt: number): void {
  for (const medic of state.entities.values()) {
    if (!medicActive(medic)) continue;
    const patient = choosePatient(state, medic);
    if (!patient) {
      medic.tendId = undefined;
      medic.mendTime = 0;
      dropAutoApproach(medic);
      continue;
    }
    medic.tendId = patient.id;
    if (inReach(state, medic, patient)) {
      if (mayWalk(medic)) {
        dropAutoApproach(medic);
        medic.waypoints = [];
        if (medic.state === "move") medic.state = "idle";
        turnToward(medic, patient.x, patient.y, catalog(medic.type).turnDegPerSec, dt);
      }
      applyHeal(medic, patient, dt);
      continue;
    }
    medic.mendTime = 0;
    if (!mayWalk(medic)) continue;
    approach(state, medic, patient);
  }
}
