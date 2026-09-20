import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  HANDGUN,
  HEIGHT_BASE,
  HULL_EYE_HEIGHT,
  SHELLS,
  TANK_MG,
  TICK_DT,
  addCrit,
  catalog,
  coverHeightOf,
  isCivilianType,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { RICOCHET_SPARK_SPEED } from "./ballistics.js";
import { tickCombat, tickProjectiles } from "./combat.js";
import { enterGarrison } from "./garrison.js";
import { weaponRangeWorld } from "./elevation.js";
import { buildingBounds, buildingCenter, destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { inSmokeCloud } from "./smoke.js";
import { createMatch, step } from "./match.js";
import { canSeeEntity } from "./vision.js";
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
  return { state: createMatch(room, started.value, { startingUnits: false }), a: "A", b: "B" };
}

function clearCivilians(state: MatchState): void {
  for (const e of [...state.entities.values()]) {
    if (isCivilianType(e.type)) destroyEntity(state, e);
  }
}

function clearCover(state: MatchState): void {
  state.heights.fill(0);
  state.occupy.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    const t = state.terrain[i];
    if (t === TILE_TREE || t === TILE_BLOCKED) state.terrain[i] = TILE_EMPTY;
  }
  clearCivilians(state);
}

function stripOwner(state: MatchState, ownerId: string): void {
  for (const e of [...state.entities.values()]) {
    if (e.ownerId === ownerId) destroyEntity(state, e);
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

function angAbs(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
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

  it("flies over a short valley house and still hits a tall one", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const y = 22;
    const z = HEIGHT_BASE + HULL_EYE_HEIGHT;
    assert.ok(z > coverHeightOf("cottage"), "hilltop hull must clear a 1-story cottage");
    assert.ok(z <= coverHeightOf("manor"), "manor should still poke the same shot");

    const cotX = 40;
    const cot = buildingCenter(cotX, y, catalog("cottage").tileW, catalog("cottage").tileH, ts);
    const cottage = makeEntity(state, "cottage", "B", cot.x, cot.y, { tileX: cotX, tileY: y });
    const cotBox = buildingBounds(cottage, ts);
    const cotHp = cottage.hp;
    const over = fireShell(state, {
      x: cotBox.x0 - 12,
      y: cottage.y,
      vx: catalog("warden").projectileSpeed,
      vy: 0,
    });
    over.z = z;
    over.vz = 0;
    tickProjectiles(state, TICK_DT);
    assert.equal(cottage.hp, cotHp, "valley cottage must not eat a high shot");
    state.projectiles = [];

    const manX = 56;
    const man = buildingCenter(manX, y, catalog("manor").tileW, catalog("manor").tileH, ts);
    const manor = makeEntity(state, "manor", "B", man.x, man.y, { tileX: manX, tileY: y });
    const manBox = buildingBounds(manor, ts);
    const manHp = manor.hp;
    const into = fireShell(state, {
      x: manBox.x0 - 12,
      y: manor.y,
      vx: catalog("warden").projectileSpeed,
      vy: 0,
    });
    into.z = z;
    into.vz = 0;
    tickProjectiles(state, TICK_DT);
    assert.ok(manor.hp < manHp, `manor hp ${manor.hp} vs ${manHp}`);
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
    const speed = catalog("warden").projectileSpeed;
    const p = fireShell(state, {
      x: dummy.x - 20,
      y: dummy.y,
      vx: speed,
      vy: 0,
      damage: 0,
      penetration: 0,
    });
    p.shell = "smoke";
    p.life = 20 / speed;
    tickProjectiles(state, TICK_DT);
    assert.equal(dummy.hp, hp0, "smoke must not damage");
    assert.ok(state.smokeClouds.length >= 1, "cloud missing");
    const cloud = state.smokeClouds[0]!;
    const miss = Math.hypot(cloud.x - dummy.x, cloud.y - dummy.y);
    assert.ok(miss < ts, `cloud ${miss} from dummy`);
    const cx = Math.floor(cloud.x / ts);
    const cy = Math.floor(cloud.y / ts);
    let covered = 0;
    for (let y = cy - 14; y <= cy + 14; y++) {
      for (let x = cx - 14; x <= cx + 14; x++) {
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
    assert.equal(tank.order?.kind, "forceattack");
    assert.equal(tank.order?.once, undefined);
  });

  it("lands a fused shell on the clicked point, not past it along the barrel", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    const destX = tileCenter(30, ts);
    const destY = tileCenter(24, ts);
    const dist = Math.hypot(destX - tank.x, destY - tank.y);
    assert.equal(applyCommand(state, "A", { type: "cmd.forceattack", ids: [tank.id], x: destX, y: destY }).ok, true);
    let miss: { x: number; y: number } | undefined;
    for (let i = 0; i < 12; i++) {
      step(state, TICK_DT);
      const hit = state.impacts.find((im) => im.kind === "miss");
      if (hit) miss = { x: hit.x, y: hit.y };
    }
    assert.ok(miss, "force-attack must detonate on the ground");
    const err = Math.hypot(miss.x - destX, miss.y - destY);
    const cone = dist * Math.tan((SHELLS.ap.spreadDeg * Math.PI) / 180);
    assert.ok(err <= cone + ts, `impact ${err.toFixed(1)} from click, cone ${cone.toFixed(1)}`);
    const range = weaponRangeWorld(state, tank);
    assert.ok(
      Math.hypot(miss.x - tank.x, miss.y - tank.y) < dist + ts * 2,
      "must not fly out to max range",
    );
    assert.ok(range > dist + ts * 4);
  });

  it("fires smoke at a point once, then stops", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    const destX = tileCenter(30, ts);
    const destY = tileCenter(24, ts);
    const smoke0 = tank.ammo.smoke ?? 0;
    assert.equal(applyCommand(state, "A", { type: "cmd.ammo", ids: [tank.id], shell: "smoke" }).ok, true);
    const res = applyCommand(state, "A", { type: "cmd.forceattack", ids: [tank.id], x: destX, y: destY });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    assert.equal(tank.order?.kind, "forceattack");
    assert.equal(tank.order?.once, true);
    for (let i = 0; i < 8; i++) step(state, TICK_DT);
    assert.equal(tank.ammo.smoke, smoke0 - 1, `smoke ${tank.ammo.smoke}`);
    assert.equal(tank.order, null);
    assert.ok(state.smokeClouds.length >= 1, "cloud missing");
    const cloud = state.smokeClouds[0]!;
    const miss = Math.hypot(cloud.x - destX, cloud.y - destY);
    assert.ok(miss < ts * 4, `cloud at ${cloud.x},${cloud.y} dest ${destX},${destY} miss ${miss}`);
    for (let i = 0; i < 80; i++) step(state, TICK_DT);
    assert.equal(tank.ammo.smoke, smoke0 - 1, "must not dump a second smoke");
    assert.equal(tank.order, null);
  });

  it("still pops smoke at the click when a unit is in the way", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    const dummy = makeEntity(state, "hauler", "B", tileCenter(27, ts), tileCenter(24, ts));
    dummy.autoHarvest = false;
    dummy.facing = Math.PI;
    const hp0 = dummy.hp;
    const destX = tileCenter(30, ts);
    const destY = tileCenter(24, ts);
    assert.equal(applyCommand(state, "A", { type: "cmd.ammo", ids: [tank.id], shell: "smoke" }).ok, true);
    assert.equal(applyCommand(state, "A", { type: "cmd.forceattack", ids: [tank.id], x: destX, y: destY }).ok, true);
    for (let i = 0; i < 8; i++) step(state, TICK_DT);
    assert.equal(dummy.hp, hp0, "smoke must not damage");
    assert.ok(state.smokeClouds.length >= 1, "cloud missing");
    const cloud = state.smokeClouds[0]!;
    const miss = Math.hypot(cloud.x - destX, cloud.y - destY);
    assert.ok(miss < ts * 4, `cloud at ${cloud.x},${cloud.y} dest ${destX},${destY} miss ${miss}`);
  });

  it("honors an explicit one-shot force attack", () => {
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
    const res = applyCommand(state, "A", {
      type: "cmd.forceattack",
      ids: [tank.id],
      x: destX,
      y: destY,
      once: true,
    });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    assert.equal(tank.order?.once, true);
    for (let i = 0; i < 8; i++) step(state, TICK_DT);
    assert.equal(tank.ammo.ap, ap0 - 1, `ammo ${tank.ammo.ap}`);
    assert.equal(tank.order, null);
    for (let i = 0; i < 80; i++) step(state, TICK_DT);
    assert.equal(tank.ammo.ap, ap0 - 1, "must not fire a second one-shot round");
  });

  it("does not auto-attack with leftover smoke when the rack is empty", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    const dummy = makeEntity(state, "hauler", "B", tileCenter(30, ts), tileCenter(24, ts));
    dummy.autoHarvest = false;
    tank.facing = 0;
    tank.turretFacing = 0;
    tank.ammo = { ap: 0, he: 0, heat: 0, smoke: 4 };
    tank.shell = "ap";
    const smoke0 = tank.ammo.smoke ?? 0;
    for (let i = 0; i < 80; i++) step(state, TICK_DT);
    assert.equal(tank.ammo.smoke, smoke0, "must not dump smoke at an auto-acquired target");
    assert.equal(tank.shell, "ap");
    assert.equal(
      state.projectiles.some((p) => p.shell === "smoke") || state.smokeClouds.length > 0,
      false,
    );
  });

  it("does not auto-attack with smoke even if smoke is loaded", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    const dummy = makeEntity(state, "hauler", "B", tileCenter(30, ts), tileCenter(24, ts));
    dummy.autoHarvest = false;
    tank.facing = 0;
    tank.turretFacing = 0;
    assert.equal(applyCommand(state, "A", { type: "cmd.ammo", ids: [tank.id], shell: "smoke" }).ok, true);
    const smoke0 = tank.ammo.smoke ?? 0;
    for (let i = 0; i < 80; i++) step(state, TICK_DT);
    assert.equal(tank.ammo.smoke, smoke0, "idle auto-acquire must not spend smoke");
  });

  it("still fires smoke when the player attacks with smoke loaded", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    const dummy = makeEntity(state, "hauler", "B", tileCenter(30, ts), tileCenter(24, ts));
    dummy.autoHarvest = false;
    tank.facing = 0;
    tank.turretFacing = 0;
    const smoke0 = tank.ammo.smoke ?? 0;
    assert.equal(applyCommand(state, "A", { type: "cmd.ammo", ids: [tank.id], shell: "smoke" }).ok, true);
    assert.equal(applyCommand(state, "A", { type: "cmd.attack", ids: [tank.id], targetId: dummy.id }).ok, true);
    for (let i = 0; i < 8; i++) step(state, TICK_DT);
    assert.equal(tank.ammo.smoke, smoke0 - 1, `smoke ${tank.ammo.smoke}`);
  });

  it("lets a unit force-attack a friendly", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const gun = makeEntity(state, "trooper", "A", tileCenter(24, ts), tileCenter(24, ts));
    const pal = makeEntity(state, "trooper", "A", tileCenter(28, ts), tileCenter(24, ts));
    gun.facing = 0;
    const hp0 = pal.hp;
    const res = applyCommand(state, "A", {
      type: "cmd.forceattack",
      ids: [gun.id],
      x: pal.x,
      y: pal.y,
      targetId: pal.id,
    });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    assert.equal(gun.order?.kind, "forceattack");
    assert.equal(gun.order?.targetId, pal.id);
    for (let i = 0; i < 20; i++) step(state, TICK_DT);
    assert.ok(pal.hp < hp0, `friendly hp ${pal.hp} vs ${hp0}`);
  });
});

describe("friendly fire", () => {
  it("does not auto-attack an ally", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const a = makeEntity(state, "trooper", "A", tileCenter(24, ts), tileCenter(24, ts));
    const b = makeEntity(state, "trooper", "A", tileCenter(26, ts), tileCenter(24, ts));
    a.facing = 0;
    const hpA = a.hp;
    const hpB = b.hp;
    applyCommand(state, "A", { type: "cmd.attack", ids: [a.id], targetId: b.id });
    for (let i = 0; i < 20; i++) step(state, TICK_DT);
    assert.equal(a.hp, hpA);
    assert.equal(b.hp, hpB);
    assert.notEqual(a.order?.kind, "forceattack");
  });

  it("hits an allied unit standing in the line of fire", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const gun = makeEntity(state, "trooper", "A", tileCenter(20, ts), tileCenter(24, ts));
    const pal = makeEntity(state, "trooper", "A", tileCenter(22, ts), tileCenter(24, ts));
    pal.holdPosition = true;
    pal.cooldown = 99;
    const dummy = makeEntity(state, "trooper", "B", tileCenter(30, ts), tileCenter(24, ts));
    dummy.holdPosition = true;
    dummy.cooldown = 99;
    gun.facing = 0;
    const palHp = pal.hp;
    applyCommand(state, "A", { type: "cmd.attack", ids: [gun.id], targetId: dummy.id });
    for (let i = 0; i < 16; i++) step(state, TICK_DT);
    assert.ok(pal.hp < palHp, `blocker hp ${pal.hp} vs ${palHp}`);
  });
});

describe("hold position", () => {
  it("does not walk into range while holding", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(20, ts), tileCenter(24, ts));
    const dummy = makeEntity(state, "hauler", "B", tileCenter(70, ts), tileCenter(24, ts));
    dummy.autoHarvest = false;
    tank.facing = 0;
    tank.turretFacing = 0;
    const x0 = tank.x;
    applyCommand(state, "A", { type: "cmd.hold", ids: [tank.id], hold: true });
    applyCommand(state, "A", { type: "cmd.attack", ids: [tank.id], targetId: dummy.id });
    for (let i = 0; i < 30; i++) step(state, TICK_DT);
    assert.equal(tank.holdPosition, true);
    assert.ok(Math.abs(tank.x - x0) < 6, `held tank walked x=${tank.x} from ${x0}`);
  });

  it("stops a move immediately when Hold is issued", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const u = makeEntity(state, "trooper", "A", tileCenter(20, ts), tileCenter(24, ts));
    applyCommand(state, "A", { type: "cmd.move", ids: [u.id], x: tileCenter(50, ts), y: tileCenter(24, ts) });
    for (let i = 0; i < 4; i++) step(state, TICK_DT);
    assert.equal(u.order?.kind, "move");
    assert.ok(u.waypoints.length > 0);
    const xStop = u.x;
    const res = applyCommand(state, "A", { type: "cmd.hold", ids: [u.id], hold: true });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    assert.equal(u.holdPosition, true);
    assert.equal(u.order, null);
    assert.equal(u.waypoints.length, 0);
    for (let i = 0; i < 12; i++) step(state, TICK_DT);
    assert.ok(Math.abs(u.x - xStop) < 6, `held walker x=${u.x} from ${xStop}`);
  });

  it("replaces a move with an attack immediately", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const u = makeEntity(state, "trooper", "A", tileCenter(20, ts), tileCenter(24, ts));
    const t = makeEntity(state, "trooper", "B", tileCenter(24, ts), tileCenter(30, ts));
    applyCommand(state, "A", { type: "cmd.move", ids: [u.id], x: tileCenter(50, ts), y: tileCenter(24, ts) });
    for (let i = 0; i < 3; i++) step(state, TICK_DT);
    assert.equal(u.order?.kind, "move");
    const hp0 = t.hp;
    const res = applyCommand(state, "A", { type: "cmd.attack", ids: [u.id], targetId: t.id });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    assert.equal(u.order?.kind, "attack");
    assert.equal(u.attackTarget, t.id);
    for (let i = 0; i < 16; i++) step(state, TICK_DT);
    assert.ok(t.hp < hp0, `target hp ${t.hp} vs ${hp0}`);
  });
});

describe("moving units in combat", () => {
  it("lets an idle enemy fire on a unit that is walking past", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const gun = makeEntity(state, "trooper", "B", tileCenter(24, ts), tileCenter(24, ts));
    const mover = makeEntity(state, "trooper", "A", tileCenter(28, ts), tileCenter(24, ts));
    gun.facing = 0;
    mover.facing = 0;
    const hp0 = mover.hp;
    applyCommand(state, "A", { type: "cmd.move", ids: [mover.id], x: tileCenter(50, ts), y: tileCenter(24, ts) });
    for (let i = 0; i < 20; i++) step(state, TICK_DT);
    assert.ok(mover.hp < hp0, `mover hp ${mover.hp} vs ${hp0}`);
    assert.ok(gun.attackTarget === mover.id || mover.hp <= 0, `gun target=${gun.attackTarget}`);
  });

  it("lets an enemy that is itself moving still engage a passer-by", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const a = makeEntity(state, "trooper", "A", tileCenter(20, ts), tileCenter(24, ts));
    const b = makeEntity(state, "trooper", "B", tileCenter(36, ts), tileCenter(24, ts));
    a.facing = 0;
    b.facing = Math.PI;
    const hpA0 = a.hp;
    const hpB0 = b.hp;
    applyCommand(state, "A", { type: "cmd.move", ids: [a.id], x: tileCenter(50, ts), y: tileCenter(24, ts) });
    applyCommand(state, "B", { type: "cmd.move", ids: [b.id], x: tileCenter(8, ts), y: tileCenter(24, ts) });
    for (let i = 0; i < 40; i++) step(state, TICK_DT);
    assert.ok(a.hp < hpA0 || b.hp < hpB0, `no fire a=${a.hp}/${hpA0} b=${b.hp}/${hpB0}`);
  });
});

describe("rotate", () => {
  it("turns a Warden hull and turret toward the click", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    const res = applyCommand(state, "A", {
      type: "cmd.rotate",
      ids: [tank.id],
      x: tank.x,
      y: tank.y + 200,
    });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    for (let i = 0; i < 24; i++) step(state, TICK_DT);
    const hull = Math.abs(tank.facing - Math.PI / 2);
    const gun = Math.abs(tank.turretFacing - Math.PI / 2);
    assert.ok(hull < 0.12, `hull facing=${tank.facing}`);
    assert.ok(gun < 0.12, `turret facing=${tank.turretFacing}`);
    assert.equal(tank.order, null);
  });
});

describe("guard", () => {
  it("groups at the point, holds, and faces the commanded heading", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const a = makeEntity(state, "trooper", "A", tileCenter(20, ts), tileCenter(24, ts));
    const b = makeEntity(state, "trooper", "A", tileCenter(22, ts), tileCenter(24, ts));
    a.facing = 0;
    b.facing = 0;
    const destX = tileCenter(40, ts);
    const destY = tileCenter(24, ts);
    const facing = Math.PI / 2;
    const res = applyCommand(state, "A", {
      type: "cmd.guard",
      ids: [a.id, b.id],
      x: destX,
      y: destY,
      facing,
    });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    assert.equal(a.holdPosition, true);
    assert.equal(b.holdPosition, true);
    assert.equal(a.order?.kind, "guard");
    assert.equal(b.order?.kind, "guard");
    for (let i = 0; i < 80; i++) step(state, TICK_DT);
    assert.ok(Math.hypot(a.x - destX, a.y - destY) < 48, `a at ${a.x},${a.y}`);
    assert.ok(Math.hypot(b.x - destX, b.y - destY) < 48, `b at ${b.x},${b.y}`);
    assert.ok(Math.abs(a.facing - facing) < 0.2, `a facing=${a.facing}`);
    assert.ok(Math.abs(b.facing - facing) < 0.2, `b facing=${b.facing}`);
    assert.equal(a.holdPosition, true);
    assert.equal(b.waypoints.length, 0);
  });

  it("does not chase while guarding", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    const dummy = makeEntity(state, "hauler", "B", tileCenter(70, ts), tileCenter(24, ts));
    dummy.autoHarvest = false;
    tank.facing = 0;
    tank.turretFacing = 0;
    const x0 = tank.x;
    applyCommand(state, "A", {
      type: "cmd.guard",
      ids: [tank.id],
      x: tank.x,
      y: tank.y,
      facing: 0,
    });
    for (let i = 0; i < 30; i++) step(state, TICK_DT);
    assert.equal(tank.holdPosition, true);
    assert.ok(Math.abs(tank.x - x0) < 6, `guarding tank walked x=${tank.x} from ${x0}`);
  });

  it("engages a cone target before a closer flanker", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(40, ts), tileCenter(40, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    const flank = makeEntity(state, "trooper", "B", tileCenter(42, ts), tileCenter(48, ts));
    flank.holdPosition = true;
    flank.cooldown = 99;
    const front = makeEntity(state, "trooper", "B", tileCenter(52, ts), tileCenter(40, ts));
    front.holdPosition = true;
    front.cooldown = 99;
    applyCommand(state, "A", {
      type: "cmd.guard",
      ids: [tank.id],
      x: tank.x,
      y: tank.y,
      facing: 0,
    });
    for (let i = 0; i < 8; i++) step(state, TICK_DT);
    assert.equal(tank.attackTarget, front.id, `attackTarget=${tank.attackTarget} front=${front.id} flank=${flank.id}`);
  });

  it("keeps the hull on the cone while the turret tracks a flanker, then returns", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(40, ts), tileCenter(40, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    const flank = makeEntity(state, "trooper", "B", tileCenter(40, ts), tileCenter(48, ts));
    applyCommand(state, "A", {
      type: "cmd.guard",
      ids: [tank.id],
      x: tank.x,
      y: tank.y,
      facing: 0,
    });
    let sawTurret = false;
    for (let i = 0; i < 20; i++) {
      step(state, TICK_DT);
      if (Math.abs(tank.turretFacing - Math.PI / 2) < 0.4) sawTurret = true;
    }
    assert.ok(Math.abs(tank.facing) < 0.2, `hull drifted facing=${tank.facing}`);
    assert.equal(sawTurret, true, `turretFacing=${tank.turretFacing}`);
    for (let i = 0; i < 80; i++) step(state, TICK_DT);
    assert.ok(flank.hp <= 0, `flank hp=${flank.hp}`);
    for (let i = 0; i < 16; i++) step(state, TICK_DT);
    assert.ok(Math.abs(tank.turretFacing) < 0.25, `turret did not return turretFacing=${tank.turretFacing}`);
    assert.ok(Math.abs(tank.facing) < 0.2, `hull facing=${tank.facing}`);
  });
});

describe("escort", () => {
  it("walks beside a friendly unit and keeps the guard order", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(20, ts), tileCenter(24, ts));
    const hauler = makeEntity(state, "hauler", "A", tileCenter(50, ts), tileCenter(24, ts));
    hauler.autoHarvest = false;
    const res = applyCommand(state, "A", { type: "cmd.guard", ids: [tank.id], targetId: hauler.id });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    assert.equal(tank.order?.kind, "guard");
    assert.equal(tank.order?.targetId, hauler.id);
    assert.equal(tank.holdPosition, false);
    assert.equal(tank.guardFacing, null);
    for (let i = 0; i < 80; i++) step(state, TICK_DT);
    const dist = Math.hypot(tank.x - hauler.x, tank.y - hauler.y);
    assert.ok(dist < 64, `tank at ${tank.x},${tank.y} hauler at ${hauler.x},${hauler.y} dist=${dist}`);
    assert.equal(tank.order?.kind, "guard");
    assert.equal(tank.order?.targetId, hauler.id);
  });

  it("stays with a moving unit and fires without chasing off", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    const hauler = makeEntity(state, "hauler", "A", tileCenter(26, ts), tileCenter(24, ts));
    hauler.autoHarvest = false;
    const dummy = makeEntity(state, "trooper", "B", tileCenter(40, ts), tileCenter(24, ts));
    dummy.holdPosition = true;
    dummy.cooldown = 99;
    applyCommand(state, "A", { type: "cmd.guard", ids: [tank.id], targetId: hauler.id });
    for (let i = 0; i < 12; i++) step(state, TICK_DT);
    assert.equal(tank.attackTarget, dummy.id, `attackTarget=${tank.attackTarget}`);
    assert.equal(tank.order?.kind, "guard");
    const destX = tileCenter(55, ts);
    applyCommand(state, "A", { type: "cmd.move", ids: [hauler.id], x: destX, y: hauler.y });
    for (let i = 0; i < 90; i++) step(state, TICK_DT);
    assert.equal(tank.order?.kind, "guard");
    assert.equal(tank.order?.targetId, hauler.id);
    const dist = Math.hypot(tank.x - hauler.x, tank.y - hauler.y);
    assert.ok(dist < 72, `tank left the hauler dist=${dist} tank=${tank.x} hauler=${hauler.x}`);
    assert.ok(tank.x > tileCenter(40, ts), `tank did not follow x=${tank.x}`);
  });

  it("drops the escort when the target dies", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    const hauler = makeEntity(state, "hauler", "A", tileCenter(26, ts), tileCenter(24, ts));
    hauler.autoHarvest = false;
    applyCommand(state, "A", { type: "cmd.guard", ids: [tank.id], targetId: hauler.id });
    destroyEntity(state, hauler);
    for (let i = 0; i < 4; i++) step(state, TICK_DT);
    assert.equal(tank.order, null);
  });

  it("rejects enemies and the selected unit itself", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    const foe = makeEntity(state, "hauler", "B", tileCenter(30, ts), tileCenter(24, ts));
    foe.autoHarvest = false;
    const enemy = applyCommand(state, "A", { type: "cmd.guard", ids: [tank.id], targetId: foe.id });
    assert.equal(enemy.ok, false);
    const self = applyCommand(state, "A", { type: "cmd.guard", ids: [tank.id], targetId: tank.id });
    assert.equal(self.ok, false);
  });
});

describe("withdraw", () => {
  it("retreats when idle and hit from out of sight", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const victim = makeEntity(state, "trooper", "A", tileCenter(40, ts), tileCenter(40, ts));
    const shooter = makeEntity(state, "trooper", "B", tileCenter(110, ts), tileCenter(40, ts));
    victim.facing = 0;
    const x0 = victim.x;
    const p = fireShell(state, {
      x: victim.x - 16,
      y: victim.y,
      vx: catalog("trooper").projectileSpeed,
      vy: 0,
      damage: 12,
      penetration: 6,
      caliber: 8,
    });
    p.fromId = shooter.id;
    p.ownerId = "B";
    p.team = 2;
    for (let i = 0; i < 18; i++) step(state, TICK_DT);
    assert.ok(victim.hp > 0, "victim should survive the rifle hit");
    assert.ok(
      victim.order?.kind === "withdraw" || victim.x < x0 - 8,
      `expected withdraw x=${victim.x} from ${x0} order=${victim.order?.kind}`,
    );
  });

  it("stays put when the shooter is in sight", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const victim = makeEntity(state, "hauler", "A", tileCenter(40, ts), tileCenter(40, ts));
    victim.autoHarvest = false;
    const shooter = makeEntity(state, "trooper", "B", tileCenter(44, ts), tileCenter(40, ts));
    const x0 = victim.x;
    const p = fireShell(state, {
      x: victim.x - 16,
      y: victim.y,
      vx: catalog("trooper").projectileSpeed,
      vy: 0,
      damage: 12,
      penetration: 6,
      caliber: 8,
    });
    p.fromId = shooter.id;
    p.ownerId = "B";
    p.team = 2;
    for (let i = 0; i < 8; i++) step(state, TICK_DT);
    assert.notEqual(victim.order?.kind, "withdraw");
    assert.ok(Math.abs(victim.x - x0) < 8, `visible hit moved x=${victim.x}`);
  });

  it("stays put while holding even if the shot is from fog", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const victim = makeEntity(state, "trooper", "A", tileCenter(40, ts), tileCenter(40, ts));
    const shooter = makeEntity(state, "trooper", "B", tileCenter(110, ts), tileCenter(40, ts));
    applyCommand(state, "A", { type: "cmd.hold", ids: [victim.id], hold: true });
    const x0 = victim.x;
    const p = fireShell(state, {
      x: victim.x - 16,
      y: victim.y,
      vx: catalog("trooper").projectileSpeed,
      vy: 0,
      damage: 12,
      penetration: 6,
      caliber: 8,
    });
    p.fromId = shooter.id;
    p.ownerId = "B";
    p.team = 2;
    for (let i = 0; i < 12; i++) step(state, TICK_DT);
    assert.equal(victim.holdPosition, true);
    assert.notEqual(victim.order?.kind, "withdraw");
    assert.ok(Math.abs(victim.x - x0) < 6, `held unit fled x=${victim.x}`);
  });

  it("does not dump a garrison when the house is hit", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", tileCenter(48, ts), tileCenter(40, ts), {
      tileX: 46,
      tileY: 38,
    });
    const inf = makeEntity(state, "trooper", a, tileCenter(44, ts), tileCenter(38, ts));
    assert.equal(enterGarrison(state, inf, house), true);
    const shooter = makeEntity(state, "trooper", "B", tileCenter(110, ts), tileCenter(40, ts));
    const box = buildingBounds(house, ts);
    const p = fireShell(state, {
      x: box.x0 - 12,
      y: house.y,
      vx: catalog("warden").projectileSpeed,
      vy: 0,
      damage: 12,
      penetration: 6,
      caliber: 8,
    });
    p.fromId = shooter.id;
    p.ownerId = "B";
    p.team = 2;
    for (let i = 0; i < 8; i++) step(state, TICK_DT);
    assert.equal(inf.garrisonedIn, house.id);
    assert.notEqual(inf.order?.kind, "withdraw");
  });

  it("Warden stays put when hit from out of sight", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const victim = makeEntity(state, "warden", "A", tileCenter(40, ts), tileCenter(40, ts));
    const shooter = makeEntity(state, "hauler", "B", tileCenter(110, ts), tileCenter(40, ts));
    shooter.autoHarvest = false;
    victim.facing = 0;
    victim.turretFacing = 0;
    const x0 = victim.x;
    const y0 = victim.y;
    const facing0 = victim.facing;
    const p = fireShell(state, {
      x: victim.x + 20,
      y: victim.y,
      vx: -catalog("warden").projectileSpeed,
      vy: 0,
    });
    p.fromId = shooter.id;
    p.ownerId = "B";
    p.team = 2;
    step(state, TICK_DT);
    assert.ok(victim.hp > 0 && victim.hp < victim.hpMax, `hp=${victim.hp}`);
    assert.notEqual(victim.order?.kind, "withdraw");
    for (let i = 0; i < 40; i++) step(state, TICK_DT);
    assert.notEqual(victim.order?.kind, "withdraw");
    assert.ok(Math.abs(victim.x - x0) < 8, `tank backed up x=${victim.x} from ${x0}`);
    assert.ok(Math.abs(victim.y - y0) < 8, `tank slid y=${victim.y}`);
    assert.ok(angAbs(victim.facing, facing0) < 0.35, `hull yawed facing=${victim.facing}`);
  });

  it("Warden stays put when engaged and stationary", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const victim = makeEntity(state, "warden", "A", tileCenter(40, ts), tileCenter(40, ts));
    const shooter = makeEntity(state, "hauler", "B", tileCenter(48, ts), tileCenter(40, ts));
    shooter.autoHarvest = false;
    victim.facing = 0;
    victim.turretFacing = 0;
    const x0 = victim.x;
    const p = fireShell(state, {
      x: victim.x + 20,
      y: victim.y,
      vx: -catalog("warden").projectileSpeed,
      vy: 0,
    });
    p.fromId = shooter.id;
    p.ownerId = "B";
    p.team = 2;
    step(state, TICK_DT);
    assert.notEqual(victim.order?.kind, "withdraw");
    for (let i = 0; i < 36; i++) step(state, TICK_DT);
    assert.notEqual(victim.order?.kind, "withdraw");
    assert.ok(Math.abs(victim.x - x0) < 8, `tank backed up x=${victim.x} from ${x0}`);
    assert.ok(angAbs(victim.facing, 0) < 0.35, `hull yawed facing=${victim.facing}`);
  });

  it("Warden keeps a player attack when hit", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const victim = makeEntity(state, "warden", "A", tileCenter(40, ts), tileCenter(40, ts));
    const shooter = makeEntity(state, "hauler", "B", tileCenter(48, ts), tileCenter(40, ts));
    shooter.autoHarvest = false;
    victim.facing = 0;
    applyCommand(state, "A", { type: "cmd.attack", ids: [victim.id], targetId: shooter.id });
    const x0 = victim.x;
    const p = fireShell(state, {
      x: victim.x + 20,
      y: victim.y,
      vx: -catalog("warden").projectileSpeed,
      vy: 0,
    });
    p.fromId = shooter.id;
    p.ownerId = "B";
    p.team = 2;
    for (let i = 0; i < 8; i++) step(state, TICK_DT);
    assert.equal(victim.order?.kind, "attack");
    assert.ok(Math.abs(victim.x - x0) < 8, `player attack fled x=${victim.x}`);
  });
});

describe("spotted fire", () => {
  it("does not auto-attack past own sight even when the gun can reach", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    stripOwner(state, "A");
    const ts = state.tileSize;
    const ox = 48;
    const oy = 16;
    const tank = makeEntity(state, "warden", "A", tileCenter(ox, ts), tileCenter(oy, ts));
    const sight = catalog("warden").sightTiles;
    const range = weaponRangeWorld(state, tank);
    const gap = sight + Math.floor((range / ts - sight) / 2);
    assert.ok(gap * ts < range, `gap ${gap} rangeTiles ${range / ts}`);
    const dummy = makeEntity(state, "hauler", "B", tileCenter(ox + gap, ts), tileCenter(oy, ts));
    dummy.autoHarvest = false;
    tank.facing = 0;
    tank.turretFacing = 0;
    assert.equal(canSeeEntity(state, "A", dummy), false);
    tickCombat(state, TICK_DT);
    assert.equal(tank.attackTarget, null);
    assert.equal(state.projectiles.length, 0);
  });

  it("auto-attacks past own sight when an ally spots the target", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    stripOwner(state, "A");
    const ts = state.tileSize;
    const ox = 48;
    const oy = 16;
    const tank = makeEntity(state, "warden", "A", tileCenter(ox, ts), tileCenter(oy, ts));
    const sight = catalog("warden").sightTiles;
    const range = weaponRangeWorld(state, tank);
    const gap = sight + Math.floor((range / ts - sight) / 2);
    const dummy = makeEntity(state, "hauler", "B", tileCenter(ox + gap, ts), tileCenter(oy, ts));
    dummy.autoHarvest = false;
    makeEntity(state, "trooper", "A", tileCenter(ox + sight - 2, ts), tileCenter(oy, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    assert.equal(canSeeEntity(state, "A", dummy), true, "spotter must light the target");
    tickCombat(state, TICK_DT);
    assert.equal(tank.attackTarget, dummy.id);
    assert.ok(state.projectiles.length >= 1, `shots=${state.projectiles.length}`);
  });
});

describe("wrecks", () => {
  it("drops auto-attack after a tank wrecks and leaves the hull", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const gun = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    const foe = makeEntity(state, "warden", "B", tileCenter(30, ts), tileCenter(24, ts));
    foe.holdPosition = true;
    foe.cooldown = 99;
    foe.mgCooldown = 99;
    gun.facing = 0;
    gun.turretFacing = 0;
    gun.holdPosition = true;
    let acquired = false;
    for (let i = 0; i < 40; i++) {
      step(state, TICK_DT);
      if (gun.attackTarget === foe.id || gun.order?.targetId === foe.id) acquired = true;
      if (foe.wreck) break;
    }
    assert.equal(acquired, true, `expected auto-attack on tank, order=${gun.order?.kind} target=${gun.attackTarget}`);
    if (!foe.wreck) {
      foe.hp = 0;
      step(state, TICK_DT);
    }
    assert.equal(foe.wreck, true);
    assert.ok(foe.hp > 0, "wreck should keep hull hp");
    state.projectiles = [];
    gun.cooldown = 0;
    gun.mgCooldown = 0;
    const wreckHp = foe.hp;
    for (let i = 0; i < 40; i++) step(state, TICK_DT);
    assert.equal(state.entities.has(foe.id), true, "wreck should remain");
    assert.equal(foe.wreck, true);
    assert.equal(foe.hp, wreckHp, "auto-fire must not chew the wreck");
    assert.notEqual(gun.attackTarget, foe.id);
    assert.ok(!gun.order || gun.order.targetId !== foe.id || gun.order.kind !== "attack");
  });

  it("still demolishes a wreck on a player attack order", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const gun = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    const foe = makeEntity(state, "warden", "B", tileCenter(30, ts), tileCenter(24, ts));
    foe.holdPosition = true;
    foe.cooldown = 99;
    foe.mgCooldown = 99;
    gun.facing = 0;
    gun.turretFacing = 0;
    gun.holdPosition = true;
    foe.hp = 0;
    step(state, TICK_DT);
    assert.equal(foe.wreck, true);
    const wreckHp = foe.hp;
    const res = applyCommand(state, "A", { type: "cmd.attack", ids: [gun.id], targetId: foe.id });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    for (let i = 0; i < 40; i++) step(state, TICK_DT);
    assert.ok(
      foe.hp < wreckHp || !state.entities.has(foe.id),
      `player attack should damage wreck hp=${foe.hp} start=${wreckHp}`,
    );
  });
});

describe("armor impact scatter", () => {
  function pingTank(
    state: MatchState,
    tank: { x: number; y: number; radius: number },
    shot: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      damage: number;
      penetration: number;
      caliber: number;
    },
    n: number,
  ): { hitOff: number[]; puffDist: number[]; spawnDist: number[] } {
    const hitOff: number[] = [];
    const puffDist: number[] = [];
    const spawnDist: number[] = [];
    for (let i = 0; i < n; i++) {
      state.projectiles = [];
      state.impacts = [];
      fireShell(state, shot);
      tickProjectiles(state, TICK_DT);
      for (const im of state.impacts) {
        if (im.kind !== "ricochet" && im.kind !== "glance" && im.kind !== "hit" && im.kind !== "pen") {
          continue;
        }
        hitOff.push(Math.hypot(im.x - tank.x, im.y - tank.y));
      }
      for (const p of state.projectiles) {
        if (p.bounced) spawnDist.push(Math.hypot(p.x - tank.x, p.y - tank.y));
      }
      state.impacts = [];
      for (let k = 0; k < 16; k++) {
        tickProjectiles(state, TICK_DT);
        for (const im of state.impacts) {
          if (im.kind === "puff") puffDist.push(Math.hypot(im.x - tank.x, im.y - tank.y));
        }
        state.impacts = [];
        if (state.projectiles.length === 0) break;
      }
    }
    return { hitOff, puffDist, spawnDist };
  }

  it("rifle ricochets leave the hull and fly a random distance", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    stripOwner(state, "A");
    stripOwner(state, "B");
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "B", tileCenter(40, ts), tileCenter(24, ts));
    tank.facing = Math.PI;
    const gun = catalog("trooper");
    const samples = pingTank(
      state,
      tank,
      {
        x: tank.x - 40,
        y: tank.y,
        vx: gun.projectileSpeed,
        vy: 0,
        damage: gun.damage,
        penetration: gun.penetration,
        caliber: gun.caliber,
      },
      40,
    );
    assert.ok(samples.hitOff.length > 10, `hits=${samples.hitOff.length}`);
    assert.ok(Math.min(...samples.hitOff) > 2, `impact glued to center min=${Math.min(...samples.hitOff)}`);
    assert.ok(
      Math.max(...samples.hitOff) - Math.min(...samples.hitOff) > 6,
      `impact span ${Math.max(...samples.hitOff) - Math.min(...samples.hitOff)}`,
    );
    assert.ok(samples.spawnDist.length > 10, `bounces=${samples.spawnDist.length}`);
    assert.ok(
      Math.max(...samples.spawnDist) < tank.radius * 3,
      `bounce spawned far from hull max=${Math.max(...samples.spawnDist)}`,
    );
    assert.ok(samples.puffDist.length > 10, `puffs=${samples.puffDist.length}`);
    assert.ok(Math.min(...samples.puffDist) < 50, `no short ricochet min=${Math.min(...samples.puffDist)}`);
    assert.ok(Math.max(...samples.puffDist) > 90, `no long ricochet max=${Math.max(...samples.puffDist)}`);
    assert.ok(
      Math.max(...samples.puffDist) - Math.min(...samples.puffDist) > 50,
      `puff span ${Math.max(...samples.puffDist) - Math.min(...samples.puffDist)}`,
    );
  });

  it("tank shells also strike a random hull point and bounce a random distance", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    stripOwner(state, "A");
    stripOwner(state, "B");
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "B", tileCenter(40, ts), tileCenter(24, ts));
    tank.facing = 0;
    const gun = catalog("warden");
    const a = (48 * Math.PI) / 180;
    const ux = -Math.cos(a);
    const uy = -Math.sin(a);
    const samples = pingTank(
      state,
      tank,
      {
        x: tank.x - ux * 36,
        y: tank.y - uy * 36,
        vx: ux * gun.projectileSpeed,
        vy: uy * gun.projectileSpeed,
        damage: gun.damage,
        penetration: gun.penetration,
        caliber: gun.caliber,
      },
      36,
    );
    assert.ok(samples.hitOff.length > 8, `hits=${samples.hitOff.length}`);
    assert.ok(Math.min(...samples.hitOff) > 2, `shell impact glued to center min=${Math.min(...samples.hitOff)}`);
    assert.ok(
      Math.max(...samples.hitOff) - Math.min(...samples.hitOff) > 5,
      `shell impact span ${Math.max(...samples.hitOff) - Math.min(...samples.hitOff)}`,
    );
    if (samples.puffDist.length > 4) {
      assert.ok(Math.min(...samples.puffDist) < 55, `shell short bounce min=${Math.min(...samples.puffDist)}`);
      assert.ok(Math.max(...samples.puffDist) > 80, `shell long bounce max=${Math.max(...samples.puffDist)}`);
    }
  });

  it("caps bounced 75mm sparks to the same zip speed as rifles", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    stripOwner(state, "A");
    stripOwner(state, "B");
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "B", tileCenter(40, ts), tileCenter(24, ts));
    tank.facing = 0;
    const gun = catalog("warden");
    const a = (48 * Math.PI) / 180;
    const ux = -Math.cos(a);
    const uy = -Math.sin(a);
    let bounced = 0;
    for (let i = 0; i < 24; i++) {
      state.projectiles = [];
      state.impacts = [];
      fireShell(state, {
        x: tank.x - ux * 36,
        y: tank.y - uy * 36,
        vx: ux * gun.projectileSpeed,
        vy: uy * gun.projectileSpeed,
        damage: gun.damage,
        penetration: gun.penetration,
        caliber: gun.caliber,
      });
      tickProjectiles(state, TICK_DT);
      for (const p of state.projectiles) {
        if (!p.bounced) continue;
        bounced++;
        const sp = Math.hypot(p.vx, p.vy);
        assert.ok(sp <= RICOCHET_SPARK_SPEED + 1e-6, `spark ${sp} inbound ${gun.projectileSpeed}`);
      }
    }
    assert.ok(bounced > 0, "expected at least one 75mm bounce");
  });
});

describe("infantry weapons", () => {
  it("switches a trooper to the handgun via cmd.weapon", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const t = makeEntity(state, "trooper", "A", tileCenter(24, ts), tileCenter(24, ts));
    assert.equal(t.weapon, "rifle");
    const rifleRange = weaponRangeWorld(state, t);
    const res = applyCommand(state, "A", { type: "cmd.weapon", ids: [t.id], weapon: "handgun" });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    assert.equal(t.weapon, "handgun");
    assert.equal(t.clip, HANDGUN.clip);
    assert.equal(t.reload, 0);
    assert.equal(weaponRangeWorld(state, t), HANDGUN.rangeTiles * ts);
    assert.ok(weaponRangeWorld(state, t) < rifleRange);
    assert.equal(applyCommand(state, "A", { type: "cmd.weapon", ids: [t.id], weapon: "rifle" }).ok, true);
    assert.equal(t.weapon, "rifle");
    assert.equal(weaponRangeWorld(state, t), rifleRange);
  });

  it("refuses the rifle when the shooting arm is broken", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const t = makeEntity(state, "trooper", "A", tileCenter(24, ts), tileCenter(24, ts));
    addCrit(t, "arm");
    assert.equal(t.weapon, "handgun");
    const res = applyCommand(state, "A", { type: "cmd.weapon", ids: [t.id], weapon: "rifle" });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, "busy");
    assert.equal(t.weapon, "handgun");
  });

  it("ignores cmd.weapon on a tank", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    const res = applyCommand(state, "A", { type: "cmd.weapon", ids: [tank.id], weapon: "handgun" });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, "not_yours");
  });

  it("lets a rifle engage past handgun reach and keeps the pistol quiet there", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    stripOwner(state, "A");
    stripOwner(state, "B");
    const ts = state.tileSize;
    const rifle = makeEntity(state, "trooper", "A", tileCenter(24, ts), tileCenter(24, ts));
    const pistol = makeEntity(state, "trooper", "A", tileCenter(24, ts), tileCenter(28, ts));
    const dummy = makeEntity(state, "trooper", "B", tileCenter(44, ts), tileCenter(24, ts));
    dummy.holdPosition = true;
    dummy.cooldown = 99;
    rifle.facing = 0;
    pistol.facing = 0;
    pistol.holdPosition = true;
    rifle.holdPosition = true;
    assert.equal(applyCommand(state, "A", { type: "cmd.weapon", ids: [pistol.id], weapon: "handgun" }).ok, true);
    const dist = Math.hypot(dummy.x - pistol.x, dummy.y - pistol.y);
    assert.ok(dist > weaponRangeWorld(state, pistol));
    assert.ok(dist < weaponRangeWorld(state, rifle));
    const dummyHp = dummy.hp;
    const pistolClip = pistol.clip;
    applyCommand(state, "A", { type: "cmd.attack", ids: [rifle.id, pistol.id], targetId: dummy.id });
    for (let i = 0; i < 20; i++) step(state, TICK_DT);
    assert.ok(dummy.hp < dummyHp, `rifle must land dummy hp ${dummy.hp} vs ${dummyHp}`);
    assert.equal(pistol.clip, pistolClip, "handgun must not fire past its range");
  });

  it("lets the handgun dump more rounds than the rifle in a short-range duel", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    stripOwner(state, "A");
    stripOwner(state, "B");
    const ts = state.tileSize;
    const rifle = makeEntity(state, "trooper", "A", tileCenter(24, ts), tileCenter(24, ts));
    const pistol = makeEntity(state, "trooper", "A", tileCenter(24, ts), tileCenter(26, ts));
    const dummy = makeEntity(state, "trooper", "B", tileCenter(28, ts), tileCenter(25, ts));
    dummy.holdPosition = true;
    dummy.cooldown = 99;
    dummy.hp = 4000;
    dummy.hpMax = 4000;
    rifle.facing = 0;
    pistol.facing = 0;
    rifle.holdPosition = true;
    pistol.holdPosition = true;
    rifle.reloadMul = 1;
    pistol.reloadMul = 1;
    assert.equal(applyCommand(state, "A", { type: "cmd.weapon", ids: [pistol.id], weapon: "handgun" }).ok, true);
    const rifleClip0 = rifle.clip;
    const pistolClip0 = pistol.clip;
    applyCommand(state, "A", { type: "cmd.attack", ids: [rifle.id, pistol.id], targetId: dummy.id });
    for (let i = 0; i < 16; i++) step(state, TICK_DT);
    const rifleShots = rifleClip0 - rifle.clip;
    const pistolShots = pistolClip0 - pistol.clip;
    assert.ok(rifleShots >= 1, `rifle shots ${rifleShots}`);
    assert.ok(pistolShots > rifleShots, `pistol ${pistolShots} vs rifle ${rifleShots}`);
  });
});

describe("broken tracks", () => {
  it("freezes the hull but still traverses a turret onto a flank target", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(40, ts), tileCenter(40, ts));
    const armor = makeEntity(state, "warden", "B", tileCenter(40, ts), tileCenter(48, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    addCrit(tank, "tracks");
    tank.holdPosition = true;
    armor.holdPosition = true;
    armor.facing = -Math.PI / 2;
    armor.turretFacing = armor.facing;
    armor.mgAmmo = 0;
    armor.cooldown = 99;
    applyCommand(state, "A", { type: "cmd.attack", ids: [tank.id], targetId: armor.id });
    for (let i = 0; i < 24; i++) step(state, TICK_DT);
    assert.ok(Math.abs(tank.facing) < 0.01, `hull yawed facing=${tank.facing}`);
    assert.ok(Math.abs(tank.turretFacing - Math.PI / 2) < 0.2, `turretFacing=${tank.turretFacing}`);
    assert.ok((tank.ammo.ap ?? 12) < 12, `ap=${tank.ammo.ap}`);
  });

  it("fires the MG only along hull facing, and uses the 75mm on a flank trooper", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(40, ts), tileCenter(40, ts));
    const front = makeEntity(state, "trooper", "B", tileCenter(48, ts), tileCenter(40, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    addCrit(tank, "tracks");
    tank.holdPosition = true;
    front.holdPosition = true;
    front.cooldown = 99;
    applyCommand(state, "A", { type: "cmd.attack", ids: [tank.id], targetId: front.id });
    for (let i = 0; i < 6; i++) step(state, TICK_DT);
    assert.ok(tank.mgAmmo < TANK_MG.ammo, `front mgAmmo=${tank.mgAmmo}`);
    assert.equal(tank.ammo.ap, 12);

    const { state: s2 } = twoPlayerMatch();
    clearCover(s2);
    const gun = makeEntity(s2, "warden", "A", tileCenter(40, ts), tileCenter(40, ts));
    const flank = makeEntity(s2, "trooper", "B", tileCenter(40, ts), tileCenter(48, ts));
    gun.facing = 0;
    gun.turretFacing = 0;
    addCrit(gun, "tracks");
    gun.holdPosition = true;
    flank.holdPosition = true;
    flank.cooldown = 99;
    applyCommand(s2, "A", { type: "cmd.attack", ids: [gun.id], targetId: flank.id });
    for (let i = 0; i < 24; i++) step(s2, TICK_DT);
    assert.equal(gun.mgAmmo, TANK_MG.ammo, `flank mgAmmo=${gun.mgAmmo}`);
    assert.ok(Math.abs(gun.facing) < 0.01, `hull yawed facing=${gun.facing}`);
    assert.ok(
      (gun.ammo.ap ?? 12) < 12 || flank.hp < flank.hpMax || flank.hp <= 0,
      `ap=${gun.ammo.ap} flank hp=${flank.hp}`,
    );
  });

  it("lets a turreted hull still rotate the turret on a rotate order", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    addCrit(tank, "tracks");
    const res = applyCommand(state, "A", {
      type: "cmd.rotate",
      ids: [tank.id],
      x: tank.x,
      y: tank.y + 200,
    });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    for (let i = 0; i < 24; i++) step(state, TICK_DT);
    assert.ok(Math.abs(tank.facing) < 0.01, `hull facing=${tank.facing}`);
    assert.ok(Math.abs(tank.turretFacing - Math.PI / 2) < 0.12, `turretFacing=${tank.turretFacing}`);
    assert.equal(tank.order, null);
  });

  it("cannot hull-steer a casemate StuG onto a target outside the gun arc", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const gun = makeEntity(state, "ss3", "A", tileCenter(24, ts), tileCenter(24, ts));
    const tgt = makeEntity(state, "trooper", "B", tileCenter(28, ts), tileCenter(24, ts));
    tgt.holdPosition = true;
    tgt.cooldown = 99;
    gun.facing = Math.PI / 2;
    gun.turretFacing = Math.PI / 2;
    gun.holdPosition = true;
    addCrit(gun, "tracks");
    applyCommand(state, "A", { type: "cmd.attack", ids: [gun.id], targetId: tgt.id });
    const face0 = gun.facing;
    const mg0 = gun.mgAmmo;
    const ap0 = gun.ammo.ap;
    for (let i = 0; i < 20; i++) step(state, TICK_DT);
    assert.equal(gun.facing, face0);
    assert.equal(gun.turretFacing, face0);
    assert.equal(gun.mgAmmo, mg0);
    assert.equal(gun.ammo.ap, ap0);
    assert.equal(state.projectiles.filter((p) => p.fromId === gun.id).length, 0);
  });
});

describe("ss3 casemate", () => {
  it("must hull-steer onto a target outside the gun arc before firing", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const gun = makeEntity(state, "ss3", "A", tileCenter(24, ts), tileCenter(24, ts));
    const tgt = makeEntity(state, "trooper", "B", tileCenter(28, ts), tileCenter(24, ts));
    tgt.holdPosition = true;
    tgt.cooldown = 99;
    gun.facing = Math.PI / 2;
    gun.turretFacing = Math.PI / 2;
    gun.holdPosition = true;
    applyCommand(state, "A", { type: "cmd.attack", ids: [gun.id], targetId: tgt.id });
    step(state, TICK_DT);
    assert.equal(state.projectiles.filter((p) => p.fromId === gun.id).length, 0);
    assert.ok(Math.abs(gun.facing - Math.PI / 2) > 0.01, "hull should start turning");
    assert.equal(gun.turretFacing, gun.facing);
    let fired = false;
    for (let i = 0; i < 20; i++) {
      step(state, TICK_DT);
      if (state.projectiles.some((p) => p.fromId === gun.id) || state.impacts.length > 0) fired = true;
      assert.equal(gun.turretFacing, gun.facing);
    }
    assert.equal(fired, true, "should fire once the hull faces the target");
    assert.ok(Math.abs(gun.facing) < 0.2, `facing=${gun.facing}`);
  });
});
