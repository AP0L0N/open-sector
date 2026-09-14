import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { SHELLS, TICK_DT, catalog, isCivilianType } from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
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
  return { state: createMatch(room, started.value), a: "A", b: "B" };
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
    assert.equal(tank.order?.kind, "forceattack");
    assert.equal(tank.order?.once, undefined);
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
    for (let i = 0; i < 80; i++) step(state, TICK_DT);
    assert.equal(tank.ammo.smoke, smoke0 - 1, "must not dump a second smoke");
    assert.equal(tank.order, null);
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
    const pal = makeEntity(state, "hauler", "A", tileCenter(22, ts), tileCenter(24, ts));
    pal.autoHarvest = false;
    const dummy = makeEntity(state, "hauler", "B", tileCenter(30, ts), tileCenter(24, ts));
    dummy.autoHarvest = false;
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
    const flank = makeEntity(state, "hauler", "B", tileCenter(42, ts), tileCenter(48, ts));
    flank.autoHarvest = false;
    const front = makeEntity(state, "hauler", "B", tileCenter(52, ts), tileCenter(40, ts));
    front.autoHarvest = false;
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

  it("Warden reverses with the hull toward unseen fire", () => {
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
    assert.equal(victim.order?.kind, "withdraw");
    assert.equal(victim.order?.reverse, true);
    assert.equal(victim.attackTarget, null);
    const y0 = victim.y;
    for (let i = 0; i < 40; i++) step(state, TICK_DT);
    assert.ok(victim.x < x0 - 12, `should reverse west x=${victim.x} from ${x0}`);
    assert.ok(Math.abs(victim.y - y0) < ts * 2, `should not slide off the reverse line y=${victim.y}`);
    assert.ok(angAbs(victim.facing, 0) < 0.35, `hull should keep the bow on the fire facing=${victim.facing}`);
    assert.ok(angAbs(victim.facing, Math.PI) > 1.2, "must not spin the rear toward the shot");
  });

  it("Warden reverses when engaged and stationary", () => {
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
    assert.equal(victim.order?.kind, "withdraw");
    assert.equal(victim.order?.reverse, true);
    assert.equal(victim.attackTarget, shooter.id);
    for (let i = 0; i < 36; i++) step(state, TICK_DT);
    assert.ok(victim.x < x0 - 12, `should reverse west x=${victim.x} from ${x0}`);
    assert.ok(angAbs(victim.facing, 0) < 0.35, `hull should stay on the shooter facing=${victim.facing}`);
  });

  it("Warden yaws the hull to the fire before it reverses", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    clearCivilians(state);
    const ts = state.tileSize;
    const victim = makeEntity(state, "warden", "A", tileCenter(40, ts), tileCenter(40, ts));
    const shooter = makeEntity(state, "hauler", "B", tileCenter(110, ts), tileCenter(40, ts));
    shooter.autoHarvest = false;
    victim.facing = 0.5;
    victim.turretFacing = 0.5;
    const x0 = victim.x;
    const y0 = victim.y;
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
    assert.equal(victim.order?.kind, "withdraw");
    assert.ok(victim.hp > 0 && victim.hp < victim.hpMax, `hp=${victim.hp}`);
    step(state, TICK_DT);
    assert.ok(victim.facing < 0.5, `should yaw toward the shot facing=${victim.facing}`);
    assert.ok(victim.facing > 0.15, `must not snap onto the fire in one tick facing=${victim.facing}`);
    assert.equal(victim.x, x0, "must not reverse until the bow faces the fire");
    assert.equal(victim.y, y0);
    for (let i = 0; i < 40; i++) step(state, TICK_DT);
    assert.ok(victim.x < x0 - 8, `should reverse west after the yaw x=${victim.x}`);
    assert.ok(angAbs(victim.facing, 0) < 0.35, `hull should finish on the fire facing=${victim.facing}`);
  });

  it("Warden keeps a player attack instead of reversing", () => {
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
    assert.notEqual(victim.order?.reverse, true);
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
