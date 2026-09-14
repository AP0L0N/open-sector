import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { SHELLS, TICK_DT, catalog, isCivilianType } from "../catalog.js";
import { applyCommand } from "./commands.js";
import { tickProjectiles } from "./combat.js";
import { buildingBounds, buildingCenter, destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { inSmokeCloud } from "./smoke.js";
import { createMatch, step } from "./match.js";
import type { MatchState, Projectile } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "CB1",
    hostId: "A",
    hostName: "Alpha",
    mapId: "yard-64",
    maxSlots: 8,
  });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  return { state: createMatch(room, started.value), a: "A", b: "B" };
}

function clearCivilians(state: MatchState): void {
  for (const e of [...state.entities.values()]) {
    if (isCivilianType(e.type)) destroyEntity(state, e);
  }
}

function fireShell(
  state: MatchState,
  opts: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    damage?: number;
    penetration?: number;
    caliber?: number;
  },
): Projectile {
  const gun = catalog("warden");
  const p: Projectile = {
    id: state.nextId++,
    ownerId: "A",
    team: 1,
    x: opts.x,
    y: opts.y,
    vx: opts.vx,
    vy: opts.vy,
    damage: opts.damage ?? gun.damage,
    penetration: opts.penetration ?? gun.penetration,
    caliber: opts.caliber ?? gun.caliber,
    life: 1,
    ignoreId: -1,
    fromId: -1,
    bounced: false,
    shell: null,
  };
  state.projectiles.push(p);
  return p;
}

describe("tank shells vs buildings", () => {
  it("hits a cottage the round tunnels through in one tick", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tileX = 44;
    const tileY = 20;
    const c = buildingCenter(tileX, tileY, catalog("cottage").tileW, catalog("cottage").tileH, ts);
    const house = makeEntity(state, "cottage", "B", c.x, c.y, { tileX, tileY });
    const box = buildingBounds(house, ts);
    const speed = catalog("warden").projectileSpeed;
    const hp0 = house.hp;
    fireShell(state, { x: box.x0 - 12, y: house.y, vx: speed, vy: 0 });
    tickProjectiles(state, TICK_DT);
    assert.ok(house.hp < hp0, `cottage hp ${house.hp} vs ${hp0}`);
    assert.equal(
      state.impacts.some((i) => i.kind === "ricochet"),
      false,
      `impacts=${state.impacts.map((i) => i.kind).join(",")}`,
    );
    assert.ok(
      state.impacts.some((i) => i.kind === "hit" || i.kind === "pen" || i.kind === "kill"),
      `impacts=${state.impacts.map((i) => i.kind).join(",")}`,
    );
  });

  it("strikes the house, not a tank sitting behind it", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tileX = 44;
    const tileY = 20;
    const c = buildingCenter(tileX, tileY, catalog("cottage").tileW, catalog("cottage").tileH, ts);
    const house = makeEntity(state, "cottage", "B", c.x, c.y, { tileX, tileY });
    const box = buildingBounds(house, ts);
    const tank = makeEntity(state, "warden", "B", box.x1 + 24, house.y);
    tank.facing = Math.PI;
    const houseHp = house.hp;
    const tankHp = tank.hp;
    fireShell(state, {
      x: box.x0 - 12,
      y: house.y,
      vx: catalog("warden").projectileSpeed,
      vy: 0,
    });
    tickProjectiles(state, TICK_DT);
    assert.ok(house.hp < houseHp, `house hp ${house.hp}`);
    assert.equal(tank.hp, tankHp, "rear tank must not eat the round");
    assert.equal(state.impacts.some((i) => i.kind === "ricochet"), false);
  });

  it("lets a Warden's gun chip an enemy Dynamo", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tileX = 40;
    const tileY = 24;
    const dynDef = catalog("dynamo");
    const c = buildingCenter(tileX, tileY, dynDef.tileW, dynDef.tileH, ts);
    const dyn = makeEntity(state, "dynamo", "B", c.x, c.y, { tileX, tileY });
    const tank = makeEntity(state, "warden", "A", tileCenter(tileX - 6, ts), c.y);
    tank.facing = 0;
    tank.turretFacing = 0;
    const hp0 = dyn.hp;
    applyCommand(state, "A", { type: "cmd.attack", ids: [tank.id], targetId: dyn.id });
    for (let i = 0; i < 20; i++) step(state, TICK_DT);
    assert.ok(dyn.hp < hp0, `dynamo hp ${dyn.hp} vs ${hp0}; impacts=${state.impacts.map((i) => i.kind).join(",")}`);
    assert.equal(state.impacts.some((i) => i.kind === "ricochet"), false);
  });

  it("lets HE slam a house instead of skipping it", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tileX = 36;
    const tileY = 28;
    const c = buildingCenter(tileX, tileY, catalog("house").tileW, catalog("house").tileH, ts);
    const house = makeEntity(state, "house", "B", c.x, c.y, { tileX, tileY });
    const box = buildingBounds(house, ts);
    const hp0 = house.hp;
    fireShell(state, {
      x: box.x0 - 12,
      y: house.y,
      vx: catalog("warden").projectileSpeed,
      vy: 0,
      damage: SHELLS.he.damage,
      penetration: SHELLS.he.penetration,
      caliber: SHELLS.he.caliber,
    });
    tickProjectiles(state, TICK_DT);
    assert.ok(house.hp <= hp0 - 70, `HE dmg hp ${house.hp} vs ${hp0}`);
    assert.equal(state.impacts.some((i) => i.kind === "ricochet"), false);
  });
});

describe("smoke shells", () => {
  it("detonates into a cloud that covers several tiles and does not wound", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const dummy = makeEntity(state, "hauler", "B", tileCenter(40, ts), tileCenter(20, ts));
    dummy.autoHarvest = false;
    dummy.facing = Math.PI;
    const hp0 = dummy.hp;
    const p = fireShell(state, {
      x: dummy.x - 20,
      y: dummy.y,
      vx: catalog("warden").projectileSpeed,
      vy: 0,
      damage: 0,
      penetration: 0,
    });
    p.shell = "smoke";
    tickProjectiles(state, TICK_DT);
    assert.equal(dummy.hp, hp0, "smoke must not damage");
    assert.ok(state.smokeClouds.length >= 1, "cloud missing");
    const cloud = state.smokeClouds[0]!;
    const cx = Math.floor(cloud.x / ts);
    const cy = Math.floor(cloud.y / ts);
    let covered = 0;
    for (let y = cy - 8; y <= cy + 8; y++) {
      for (let x = cx - 12; x <= cx + 12; x++) {
        if (state.smokeClouds.some((c) => inSmokeCloud(c, ts, x, y))) covered++;
      }
    }
    assert.ok(covered >= 20, `cloud tiles ${covered}`);
  });
});

describe("force attack", () => {
  it("fires at an empty point with no target", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    const destX = tileCenter(30, ts);
    const destY = tileCenter(24, ts);
    const ap0 = tank.ammo.ap ?? 0;
    const res = applyCommand(state, "A", { type: "cmd.forceattack", ids: [tank.id], x: destX, y: destY });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    assert.equal(tank.order?.kind, "forceattack");
    let fired = false;
    for (let i = 0; i < 8; i++) {
      step(state, TICK_DT);
      if (state.projectiles.length > 0 || state.impacts.length > 0) fired = true;
    }
    assert.equal(tank.ammo.ap, ap0 - 1, `ammo ${tank.ammo.ap}`);
    assert.equal(fired, true, "must have fired at the point");
  });
});
