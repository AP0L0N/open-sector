/**
 * Flat-ground arena for unit balance: side A's units attack-move at side B's and the
 * script reports who is left and with what share of their hit points.
 *
 *   npm run bench:arena -w @gridlock/shared -- "warden:4 vs stalker:4" "rifleman:6 vs xenodrone:6"
 *
 * Env: SEC (cap on the fight, default 240), DIST (gameplay tiles apart, default 140: outside every
 * gun's reach), REPS (fights per matchup, default 2; each reseeds the sim), WATER=1 (an all-water
 * map, for boats), LINK=0 (no Cyborg Central / Conversion Chamber behind each side; cyborgs then
 * shut down after CYBORG_SHUTDOWN_SECONDS). The Xenite side gets a 12-Fusion-Core store so nothing
 * starts offline for want of hive energy.
 *
 * With equal numbers a win at hit-point share f reads, by Lanchester's square law, as the winner's
 * unit being worth 1 / (1 - f²) of the loser's: six Drones beating six Riflemen at 92% makes a Drone
 * about six Riflemen in a straight rifle fight.
 */
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { HEIGHT_BASE, TICK_HZ, factionOf, type EntityType } from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE, TILE_WATER } from "../maps.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import type { Entity, MatchState } from "./types.js";

const SEC = Number(process.env.SEC ?? 240);
const DIST = Number(process.env.DIST ?? 140);
const REPS = Number(process.env.REPS ?? 2);
const WATER = process.env.WATER === "1";
const LINK = process.env.LINK !== "0";
/** Buildings the arena stands behind each side so the sim treats the units as fielded, not counted as combatants. */
const scenery = new Set<number>();

function flatMatch(seed: number): MatchState {
  const r = createRoom({ id: "AR" + seed, hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  joinRoom(room, "B", "Bravo");
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.heights.fill(HEIGHT_BASE);
  state.occupy.fill(0);
  state.fortBlock.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    const t = state.terrain[i];
    if (WATER) state.terrain[i] = TILE_WATER;
    else if (t === TILE_TREE || t === TILE_BLOCKED || t === TILE_WATER) state.terrain[i] = TILE_EMPTY;
  }
  for (const e of [...state.entities.values()]) destroyEntity(state, e);
  state.rngState = (seed * 2654435761) >>> 0 || 1;
  return state;
}

type Side = [EntityType, number][];

function parse(spec: string): { a: Side; b: Side } {
  const [l, r] = spec.split(/\s+vs\s+/);
  if (!l || !r) throw new Error(`"${spec}": want "type:n [+ type:n] vs type:n"`);
  const side = (s: string): Side =>
    s.split(/\s*\+\s*/).map((p) => {
      const [t, n] = p.split(":");
      return [t!.trim() as EntityType, Number(n ?? 1)];
    });
  return { a: side(l), b: side(r) };
}

function stand(state: MatchState, type: EntityType, owner: string, tx: number, ty: number): void {
  const e = makeEntity(state, type, owner, tileCenter(tx, state.tileSize), tileCenter(ty, state.tileSize));
  scenery.add(e.id);
}

/** A link building and an energy store well behind each side, so cyborgs stay up and nothing goes offline. */
function backLine(state: MatchState): void {
  for (const [owner, x0, y0, dir] of [["A", 4, 4, 1], ["B", state.width - 5, state.height - 5, -1]] as const) {
    const xeno = state.players.get(owner)!.faction === "xeno";
    stand(state, xeno ? "conversion" : "cyborgcentral", owner, x0, y0);
    const n = xeno ? 12 : 1;
    for (let i = 0; i < n; i++) stand(state, xeno ? "fusioncore" : "dynamo", owner, x0 + dir * (4 + i * 4), y0);
  }
}

function spawn(state: MatchState, owner: string, units: Side, cx: number, cy: number, facing: number): number[] {
  const ts = state.tileSize;
  const ids: number[] = [];
  let i = 0;
  for (const [type, n] of units) {
    for (let k = 0; k < n; k++, i++) {
      const col = i % 6;
      const row = Math.floor(i / 6);
      const across = (col - 2.5) * 1.5;
      const back = (row - 1) * 1.5 * (facing === 0 ? 1 : -1);
      const e = makeEntity(state, type, owner, tileCenter(cx + back, ts), tileCenter(cy + across, ts), { facing });
      e.facing = facing;
      e.turretFacing = facing;
      ids.push(e.id);
    }
  }
  return ids;
}

function left(state: MatchState, owner: string): { alive: number; share: number } {
  let hp = 0;
  let max = 0;
  let alive = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId !== owner || scenery.has(e.id)) continue;
    max += e.hpMax;
    if (e.hp > 0 && !e.wreck) {
      hp += e.hp;
      alive++;
    }
  }
  return { alive, share: max ? hp / max : 0 };
}

function units(state: MatchState, owner: string): Entity[] {
  return [...state.entities.values()].filter((e) => e.ownerId === owner && !scenery.has(e.id));
}

function run(spec: string, seed: number): string {
  const { a, b } = parse(spec);
  const state = flatMatch(seed);
  state.players.get("A")!.faction = factionOf(a[0]![0]);
  state.players.get("B")!.faction = factionOf(b[0]![0]);
  if (LINK) backLine(state);
  const cx = Math.floor(state.width / 2);
  const cy = Math.floor(state.height / 2);
  const ax = cx - DIST / 2;
  const bx = cx + DIST / 2;
  const idsA = spawn(state, "A", a, ax, cy, 0);
  const idsB = spawn(state, "B", b, bx, cy, Math.PI);
  const ts = state.tileSize;
  applyCommand(state, "A", { type: "cmd.attackmove", ids: idsA, x: tileCenter(bx, ts), y: tileCenter(cy, ts) });
  applyCommand(state, "B", { type: "cmd.attackmove", ids: idsB, x: tileCenter(ax, ts), y: tileCenter(cy, ts) });
  const nA = units(state, "A").length;
  const nB = units(state, "B").length;
  let t = 0;
  let ra = left(state, "A");
  let rb = left(state, "B");
  for (; t < SEC * TICK_HZ; t++) {
    step(state);
    ra = left(state, "A");
    rb = left(state, "B");
    if (ra.alive === 0 || rb.alive === 0) break;
  }
  const win = ra.alive && !rb.alive ? "A" : rb.alive && !ra.alive ? "B" : ra.share > rb.share ? "a~" : "b~";
  const pct = (x: number): string => `${(x * 100).toFixed(0)}%`;
  return `${win.padEnd(2)} A ${ra.alive}/${nA} ${pct(ra.share)}  B ${rb.alive}/${nB} ${pct(rb.share)}  ${(t / TICK_HZ).toFixed(0)}s  ${spec}`;
}

const specs = process.argv.slice(2);
if (specs.length === 0) {
  console.log('usage: npm run bench:arena -w @gridlock/shared -- "warden:4 vs stalker:4" ...');
  process.exit(1);
}
for (const spec of specs) {
  for (let r = 0; r < REPS; r++) {
    try {
      console.log(run(spec, r + 1));
    } catch (e) {
      console.log(`ERR ${spec}: ${(e as Error).message}`);
    }
  }
}
