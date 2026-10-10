import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cloakDepth, cloakFilter } from "./cloak-fx.js";

const opacity = (f: string): number => Number(/opacity\(([\d.]+)\)/.exec(f)?.[1]);

describe("cloak shimmer", () => {
  it("fades from solid to faint going on, and back coming off", () => {
    assert.equal(cloakDepth({ kind: "in", u: 0 }), 0);
    assert.equal(cloakDepth({ kind: "in", u: 1 }), 1);
    assert.equal(cloakDepth({ kind: "out", u: 1 }), 0);
    assert.ok(opacity(cloakFilter({ kind: "in", u: 0.05 }, 0)) > 0.9, "starts solid");
    assert.ok(opacity(cloakFilter(null, 0)) < 0.45, "steady cloak is faint");
  });

  it("flares along the outline only while the cloak is changing", () => {
    assert.match(cloakFilter({ kind: "in", u: 0.3 }, 0), /drop-shadow/);
    assert.match(cloakFilter({ kind: "out", u: 0.3 }, 0), /drop-shadow/);
    assert.doesNotMatch(cloakFilter(null, 1234), /drop-shadow/);
  });
});
