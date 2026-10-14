import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GroundScanView, MatchSnapshot } from "@gridlock/shared";
import { scanDockSlots } from "./scan-dock.js";

function snap(slots: number | undefined, scans: GroundScanView[]): MatchSnapshot {
  return { youPlayerId: "A", you: { groundScanSlots: slots }, scans } as unknown as MatchSnapshot;
}

const at = (slot: number, open: number, dir: 1 | 0 | -1, ownerId = "A"): GroundScanView => ({ ownerId, slot, x: 0, y: 0, open, dir });

describe("Ground Scan dock", () => {
  it("shows a button per scan the hive holds, none for other sides", () => {
    assert.deepEqual(scanDockSlots(snap(undefined, [])), []);
    assert.deepEqual(scanDockSlots(snap(3, [])).map((s) => s.slot), [0, 1, 2]);
  });

  it("reads ready, active, or moving from the scan", () => {
    const states = scanDockSlots(snap(3, [at(0, 1, 0), at(1, 0.4, -1), at(0, 1, 0, "B")])).map((s) => s.state);
    assert.deepEqual(states, ["active", "moving", "ready"]);
    assert.equal(scanDockSlots(snap(1, [at(0, 0.5, 1)]))[0]!.state, "moving", "still opening");
  });
});
