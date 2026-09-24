import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  MAULER_CART_HP,
  MAULER_CART_RESTORE_SECONDS,
  MORTAR,
  SHELLS,
  TICK_DT,
  catalog,
  maulerCartHpOf,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { tickProjectiles } from "./combat.js";
import { damageMaulerCart } from "./mauler-cart.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { smelterDock } from "./harvest.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import type { MatchState, Projectile } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "MC1",
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

function clearCover(state: MatchState): void {
  state.heights.fill(0);
  state.occupy.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    const t = state.terrain[i];
    if (t === TILE_TREE || t === TILE_BLOCKED) state.terrain[i] = TILE_EMPTY;
  }
  for (const e of [...state.entities.values()]) {
    if (e.kind === "building" && e.type !== "rig" && e.type !== "core") destroyEntity(state, e);
  }
}

function placeHauler(state: MatchState): ReturnType<typeof makeEntity> {
  const ts = state.tileSize;
  const hauler = makeEntity(state, "hauler", "A", tileCenter(30, ts), tileCenter(24, ts));
  hauler.autoHarvest = false;
  hauler.holdPosition = true;
  hauler.facing = 0;
  hauler.cargo = 120;
  return hauler;
}

function fireRound(
  state: MatchState,
  hauler: { x: number; y: number },
  face: "front" | "side",
  shell: "he" | "ap",
): void {
  const round = SHELLS[shell];
  const speed = catalog("warden").projectileSpeed;
  const p: Projectile = {
    id: state.nextId++,
    ownerId: "B",
    team: 2,
    x: face === "front" ? hauler.x + 28 : hauler.x,
    y: face === "front" ? hauler.y : hauler.y - 28,
    vx: face === "front" ? -speed : 0,
    vy: face === "front" ? 0 : speed,
    damage: round.damage,
    penetration: round.penetration,
    caliber: round.caliber,
    life: 1,
    ignoreId: -1,
    fromId: -1,
    bounced: false,
    shell,
  };
  state.projectiles.push(p);
}

describe("Mauler cart", () => {
  it("spawns with a full cart and heavy plate on every face", () => {
    const { state } = twoPlayerMatch();
    const hauler = placeHauler(state);
    const def = catalog("hauler");
    assert.equal(hauler.cartHp, MAULER_CART_HP);
    assert.equal(maulerCartHpOf("hauler"), MAULER_CART_HP);
    assert.equal(maulerCartHpOf("warden"), 0);
    assert.ok(def.armorFront >= def.armorSide && def.armorSide === def.armorRear);
    assert.ok(def.armorSide >= 80);
    const view = snapshotFor(state, "A").entities.find((e) => e.id === hauler.id);
    assert.equal(view?.cart, MAULER_CART_HP);
  });

  it("lets a side HE pop the cart and keeps a frontal glance off it", () => {
    const { state } = twoPlayerMatch();
    const hauler = placeHauler(state);
    const hp0 = hauler.hp;
    fireRound(state, hauler, "front", "he");
    tickProjectiles(state, TICK_DT);
    assert.equal(hauler.cartHp, MAULER_CART_HP, "the blade catches a frontal HE");
    assert.equal(hauler.hp, hp0);
    assert.equal(hauler.cargo, 120);

    fireRound(state, hauler, "side", "he");
    tickProjectiles(state, TICK_DT);
    assert.equal(hauler.cartHp, 0);
    assert.equal(hauler.cargo, 0, "the load was in the cart");
    assert.equal(hauler.hp, hp0, "HE does not go through the side plate");
    assert.equal(hauler.returnToBase, false);
  });

  it("takes two AP hits on the flank to shed the cart", () => {
    const { state } = twoPlayerMatch();
    const hauler = placeHauler(state);
    fireRound(state, hauler, "side", "ap");
    tickProjectiles(state, TICK_DT);
    assert.equal(hauler.cartHp, MAULER_CART_HP - SHELLS.ap.damage);
    assert.ok(hauler.hp > 0 && hauler.hp < hauler.hpMax, "AP still bites the hull");
    fireRound(state, hauler, "side", "ap");
    tickProjectiles(state, TICK_DT);
    assert.equal(hauler.cartHp, 0);
    assert.equal(hauler.cargo, 0);
  });

  it("ignores rifles, smoke, and a direct call that is not a shell", () => {
    const { state } = twoPlayerMatch();
    const hauler = placeHauler(state);
    damageMaulerCart(hauler, {
      caliber: 8,
      damage: 40,
      shell: null,
      face: "side",
      kind: "hit",
    });
    damageMaulerCart(hauler, {
      caliber: 75,
      damage: 0,
      shell: "smoke",
      face: "side",
      kind: "hit",
    });
    damageMaulerCart(hauler, {
      caliber: 14.5,
      damage: 20,
      shell: null,
      face: "rear",
      kind: "pen",
    });
    assert.equal(hauler.cartHp, MAULER_CART_HP);
    assert.equal(hauler.cargo, 120);
  });

  it("lets a mortar bomb chip the cart without needing to pen the hull", () => {
    const { state } = twoPlayerMatch();
    const hauler = placeHauler(state);
    const hp0 = hauler.hp;
    const bomb = (): Projectile => ({
      id: state.nextId++,
      ownerId: "B",
      team: 2,
      x: hauler.x,
      y: hauler.y - 40,
      vx: 0,
      vy: 80,
      damage: MORTAR.damage,
      penetration: MORTAR.penetration,
      caliber: MORTAR.caliber,
      life: 0.01,
      ignoreId: -1,
      fromId: -1,
      bounced: false,
      shell: null,
      flight: "mortar",
      flightTime: 1,
      landX: hauler.x,
      landY: hauler.y,
      apex: 40,
    });
    state.projectiles.push(bomb());
    tickProjectiles(state, TICK_DT);
    assert.equal(hauler.cartHp, MAULER_CART_HP - MORTAR.damage);
    assert.ok(hauler.hp < hp0 && hauler.hp > hp0 - 40, `hull nick hp=${hauler.hp}`);
    state.projectiles.push(bomb());
    tickProjectiles(state, TICK_DT);
    assert.equal(hauler.cartHp, 0);
    assert.equal(hauler.cargo, 0);
  });

  it("refuses to harvest until the cart is back", () => {
    const { state } = twoPlayerMatch();
    const hauler = placeHauler(state);
    hauler.cartHp = 0;
    const res = applyCommand(state, "A", { type: "cmd.harvest", ids: [hauler.id] });
    assert.equal(res.ok, false);
    if (!res.ok) assert.match(res.message, /Smelter/);
  });

  it("drives to the Smelter and waits there for a new cart", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const sm = catalog("smelter");
    const smelter = makeEntity(state, "smelter", "A", tileCenter(8, ts), tileCenter(10, ts), {
      tileX: 8,
      tileY: 10,
    });
    const dock = smelterDock(state, smelter);
    assert.ok(dock, "smelter has a dock");
    const hx = 8 + sm.tileW + 16;
    const hy = 10 + Math.floor(sm.tileH / 2);
    const hauler = makeEntity(state, "hauler", "A", tileCenter(hx, ts), tileCenter(hy, ts));
    hauler.autoHarvest = true;
    hauler.cargo = 80;
    hauler.cartHp = 0;
    const scrapBefore = state.players.get("A")!.scrap;
    let restored = false;
    for (let i = 0; i < 250 && !restored; i++) {
      step(state, TICK_DT);
      if (hauler.cartHp === MAULER_CART_HP) restored = true;
    }
    assert.equal(restored, true, `cart never returned hp=${hauler.cartHp} x=${hauler.x}`);
    assert.ok(dock);
    assert.ok(Math.hypot(hauler.x - dock.x, hauler.y - dock.y) < ts * 2, "refit happens at the dock");
    assert.equal(hauler.cargo, 0);
    assert.equal(state.players.get("A")!.scrap, scrapBefore, "a lost load is not delivered");
    assert.ok(MAULER_CART_RESTORE_SECONDS >= 8);
  });
});
