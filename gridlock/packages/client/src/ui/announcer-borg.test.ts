import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { describe, it } from "node:test";

const AUDIO = new URL("../assets/audio/", import.meta.url);

function cues(folder: string): Set<string> {
  const out = new Set<string>();
  for (const f of readdirSync(new URL(folder + "/", AUDIO))) {
    const m = /^(voice-[a-z0-9_]+)-\d+\.mp3$/.exec(f);
    if (m) out.add(m[1]!);
  }
  return out;
}

describe("Borg announcer", () => {
  it("voices every cue Battle Control voices, so a Borg commander never falls back mid-match", () => {
    const eu = cues("announcer");
    const borg = cues("announcer-borg");
    assert.ok(eu.size > 0);
    for (const cue of eu) assert.ok(borg.has(cue), cue);
  });

  it("gives the Seed and the Borg structures their own sounds", () => {
    assert.ok(cues("units/seed").has("voice-select"));
    for (const t of ["hivecore", "fusionnode", "assimilator"]) {
      const files = readdirSync(new URL(`units/${t}/`, AUDIO));
      assert.ok(files.some((f) => f.startsWith("sfx-special-")), t);
      assert.ok(files.some((f) => f.startsWith("sfx-die-")), t);
    }
  });
});
