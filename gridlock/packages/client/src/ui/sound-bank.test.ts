import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClientMessage, EntityView } from "@gridlock/shared";
import { buildBank, LineDeck } from "./sound-bank.js";
import { leadType, orderCue } from "./order-cues.js";

describe("buildBank", () => {
  const bank = buildBank({
    "../assets/audio/units/rifleman/voice-select-2.mp3": "/a/s2.mp3",
    "../assets/audio/units/rifleman/voice-select-10.mp3": "/a/s10.mp3",
    "../assets/audio/units/rifleman/voice-select-1.mp3": "/a/s1.mp3",
    "../assets/audio/units/rifleman/sfx-fire-1.mp3": "/a/f1.mp3",
    "../assets/audio/sfx/battle/sfx-explosion_large-1.mp3": "/a/x.mp3",
    "../assets/audio/music/battle-1.mp3": "/a/m.mp3",
    "../assets/other/thing.mp3": "/a/no.mp3",
  });

  it("files takes by folder and cue, in take order", () => {
    assert.deepEqual(bank.get("units/rifleman", "voice-select"), ["/a/s1.mp3", "/a/s2.mp3", "/a/s10.mp3"]);
    assert.deepEqual(bank.get("units/rifleman", "sfx-fire"), ["/a/f1.mp3"]);
    assert.deepEqual(bank.get("sfx/battle", "sfx-explosion_large"), ["/a/x.mp3"]);
    assert.deepEqual(bank.get("music", "battle-1"), ["/a/m.mp3"]);
  });

  it("is empty for anything it does not have", () => {
    assert.deepEqual(bank.get("units/ghost", "voice-select"), []);
    assert.ok(!bank.folders().includes("other"));
  });
});

describe("LineDeck", () => {
  it("never says the same line twice running", () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const deck = new LineDeck(rand);
    const list = ["a", "b", "c", "d"];
    let last = "";
    for (let i = 0; i < 200; i++) {
      const x = deck.pick("k", list)!;
      assert.notEqual(x, last);
      last = x;
    }
  });

  it("deals every line before repeating one", () => {
    const deck = new LineDeck();
    const seen = new Set([deck.pick("k", ["a", "b", "c"]), deck.pick("k", ["a", "b", "c"]), deck.pick("k", ["a", "b", "c"])]);
    assert.equal(seen.size, 3);
  });

  it("returns null for an empty list", () => {
    assert.equal(new LineDeck().pick("k", []), null);
  });
});

describe("order cues", () => {
  const ents = [
    { id: 1, kind: "unit", type: "rifleman", ownerId: "me" },
    { id: 2, kind: "unit", type: "gunner", ownerId: "me" },
    { id: 3, kind: "unit", type: "gunner", ownerId: "me" },
    { id: 4, kind: "unit", type: "warden", ownerId: "them" },
    { id: 5, kind: "building", type: "dynamo", ownerId: "me" },
  ] as EntityView[];

  it("lets the most numerous of your units answer", () => {
    assert.equal(leadType([1, 2, 3], ents, "me"), "gunner");
    assert.equal(leadType([1, 4, 5], ents, "me"), "rifleman");
    assert.equal(leadType([4, 5], ents, "me"), null);
  });

  it("maps orders to unit lines and base orders to the announcer", () => {
    const cue = (m: unknown) => orderCue(m as ClientMessage, ents, "me");
    assert.deepEqual(cue({ type: "cmd.move", ids: [1], x: 0, y: 0 }), { kind: "unit", type: "rifleman", cue: "move" });
    assert.deepEqual(cue({ type: "cmd.attack", ids: [2], targetId: 4 }), { kind: "unit", type: "gunner", cue: "attack" });
    assert.deepEqual(cue({ type: "cmd.deploy", id: 1 }), { kind: "unit", type: "rifleman", cue: "special" });
    assert.deepEqual(cue({ type: "cmd.train", unit: "rifleman" }), { kind: "announce", event: "training" });
    assert.deepEqual(cue({ type: "cmd.continuous", unit: "rifleman", on: true }), { kind: "announce", event: "training" });
    assert.deepEqual(cue({ type: "cmd.continuous", unit: "rifleman", on: false }), { kind: "announce", event: "cancelled" });
    assert.deepEqual(cue({ type: "cmd.pause", what: "train", paused: true }), { kind: "announce", event: "onhold" });
    assert.deepEqual(cue({ type: "cmd.place", building: "dynamo", tx: 1, ty: 1 }), { kind: "ui", sound: "place" });
  });

  it("plays a plane's takeoff sound only while one of the ordered planes is on the pad", () => {
    const planes = [
      { id: 10, kind: "unit", type: "he111", ownerId: "me", air: { phase: "parked", alt: 0 } },
      { id: 11, kind: "unit", type: "he111", ownerId: "me", air: { phase: "fly", alt: 6 } },
      { id: 12, kind: "unit", type: "he111", ownerId: "me", air: { phase: "takeoff", alt: 2 } },
    ] as EntityView[];
    const cue = (ids: number[]) => orderCue({ type: "cmd.move", ids, x: 0, y: 0 } as ClientMessage, planes, "me");
    assert.deepEqual(cue([10]), { kind: "unit", type: "he111", cue: "move" });
    assert.deepEqual(cue([10, 11]), { kind: "unit", type: "he111", cue: "move" });
    assert.deepEqual(cue([11, 12]), { kind: "unit", type: "he111", cue: "move", noSfx: true });
  });

  it("stays quiet for queued orders and toggles", () => {
    const cue = (m: unknown) => orderCue(m as ClientMessage, ents, "me");
    assert.equal(cue({ type: "cmd.move", ids: [1], x: 0, y: 0, queue: true }), null);
    assert.equal(cue({ type: "cmd.selfdestruct", ids: [1], on: false }), null);
    assert.equal(cue({ type: "chat", text: "hi" }), null);
  });
});
