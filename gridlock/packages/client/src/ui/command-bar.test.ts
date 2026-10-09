import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMMAND_GROUPS,
  commandGroupOf,
  commandHotkey,
  commandIconSvg,
  groupCommands,
  hasCommandIcon,
} from "./command-bar.js";

describe("commandGroupOf", () => {
  it("files movement orders, stances, cargo, and engineer jobs apart", () => {
    assert.equal(commandGroupOf("stop"), "orders");
    assert.equal(commandGroupOf("rotate-light"), "orders");
    assert.equal(commandGroupOf("stance-crawl"), "stance");
    assert.equal(commandGroupOf("ungarrison"), "cargo");
    assert.equal(commandGroupOf("garrison-hide"), "cargo");
    assert.equal(commandGroupOf("field-sandbags"), "build");
    assert.equal(commandGroupOf("construct-smelter"), "build");
    assert.equal(commandGroupOf("bridge-bigbridge"), "build");
    assert.equal(commandGroupOf("sell"), "structure");
    assert.equal(commandGroupOf("confirm-field"), "place");
    assert.equal(commandGroupOf("drone-launch"), "special");
    assert.equal(commandGroupOf("scout"), "special");
  });
});

describe("groupCommands", () => {
  it("keeps bar order and the order inside each group, and drops empty groups", () => {
    const items = [
      { slot: "sell" },
      { slot: "stance-stand" },
      { slot: "stop" },
      { slot: "stance-crouch" },
      { slot: "guard" },
    ];
    const groups = groupCommands(items);
    assert.deepEqual(
      groups.map((g) => g.id),
      ["orders", "stance", "structure"],
    );
    assert.deepEqual(
      groups[0]!.items.map((i) => i.slot),
      ["stop", "guard"],
    );
    assert.deepEqual(
      groups[1]!.items.map((i) => i.slot),
      ["stance-stand", "stance-crouch"],
    );
  });

  it("puts a pending placement first so it cannot be missed", () => {
    const groups = groupCommands([{ slot: "stop" }, { slot: "confirm-field" }]);
    assert.equal(groups[0]!.id, "place");
    assert.equal(COMMAND_GROUPS[0]!.id, "place");
  });
});

describe("icons and keys", () => {
  it("draws every common order as an icon", () => {
    for (const act of ["stop", "attackmove", "forceattack", "patrol", "guard", "hold", "rotate", "ungarrison", "sell", "delete"]) {
      assert.ok(hasCommandIcon(act), act);
      assert.match(commandIconSvg(act), /^<svg viewBox="0 0 16 16"/);
    }
    assert.equal(commandIconSvg("no-such-order"), "");
  });

  it("names the map keys for orders that have one", () => {
    assert.equal(commandHotkey("stop"), "S");
    assert.equal(commandHotkey("stance-crawl"), "Z");
    assert.equal(commandHotkey("ungarrison"), "U");
    assert.equal(commandHotkey("sell"), undefined);
    assert.equal(commandHotkey("delete"), "Del");
    assert.equal(commandHotkey("unhitch"), undefined);
  });
});
