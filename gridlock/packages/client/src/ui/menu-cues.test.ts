import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buttonCue, screenCue, typingKey } from "./menu-cues.js";

describe("buttonCue", () => {
  const btn = (classes: string[], text: string, disabled = false) => buttonCue({ classes, text, disabled });

  it("gives primary buttons the heavy lever", () => {
    assert.equal(btn(["btn", "btn-primary"], "Skirmish"), "confirm");
    assert.equal(btn(["btn", "btn-primary"], "Start"), "confirm");
  });

  it("gives leaving the softer switch-off", () => {
    assert.equal(btn(["btn", "btn-ghost"], "Back"), "back");
    assert.equal(btn(["btn", "btn-ghost"], " Leave "), "back");
    assert.equal(btn(["btn"], "Exit"), "back");
  });

  it("clicks everything else, and buzzes a disabled button", () => {
    assert.equal(btn(["btn", "btn-ghost"], "Invite URL"), "click");
    assert.equal(btn(["btn", "btn-primary"], "Start", true), "deny");
  });
});

describe("screenCue", () => {
  it("is quiet on the first screen and on a redraw", () => {
    assert.equal(screenCue(null, "menu"), null);
    assert.equal(screenCue("lobby", "lobby"), null);
  });

  it("slides between menu screens and stings the match start", () => {
    assert.equal(screenCue("menu", "play"), "transition");
    assert.equal(screenCue("lobby", "deploy"), "deploy");
  });

  it("leaves the battle to its own sounds", () => {
    assert.equal(screenCue("deploy", "battle"), null);
    assert.equal(screenCue("battle", "menu"), null);
  });
});

describe("typingKey", () => {
  it("strikes for characters and deletions only", () => {
    assert.ok(typingKey("a"));
    assert.ok(typingKey(" "));
    assert.ok(typingKey("Backspace"));
    assert.ok(!typingKey("Shift"));
    assert.ok(!typingKey("Enter"));
  });
});
