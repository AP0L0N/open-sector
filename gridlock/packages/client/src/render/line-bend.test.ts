import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fieldPath, fieldSpan, type FieldStructureType } from "@gridlock/shared";
import { lineFrame, lineProfile, lineShapes, type LinePiece } from "./line-bend.js";

function line(type: FieldStructureType, pts: { x: number; y: number }[], facing = Math.PI / 2): LinePiece[] {
  const span = fieldSpan(type)!;
  return fieldPath(type, pts, facing).map((p) => ({ x: p.x, y: p.y, facing: p.facing, length: span.length, thick: span.thick }));
}

/** World point at one end of a section, in its own frame. */
function endAt(p: LinePiece, frame: (a: number, c: number) => { x: number; y: number }, end: 0 | 1, across: number) {
  return frame(end === 1 ? p.length / 2 : -p.length / 2, across);
}

describe("field line bends", () => {
  it("a straight line butts end to end, unbent, and a lone section is the plain rectangle", () => {
    const pieces = line("wall", [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
    ]);
    const shapes = lineShapes(pieces);
    assert.equal(pieces.length, 5);
    for (let i = 0; i < pieces.length; i++) {
      assert.equal(shapes[i]!.bendNeg, undefined);
      assert.equal(shapes[i]!.bendPos, undefined);
    }
    // Inner sections meet on both ends, the two at the ends on one.
    assert.equal(shapes.filter((s) => s.neg && s.pos).length, 3);
    const lone = lineShapes([pieces[0]!])[0]!;
    assert.deepEqual(lone, {});
    const f = lineFrame(pieces[0]!, lone);
    const p = pieces[0]!;
    const c = f(p.length / 2, p.thick / 2);
    assert.ok(Math.abs(c.x - (p.x - Math.sin(p.facing) * (p.length / 2) + Math.cos(p.facing) * (p.thick / 2))) < 1e-9);
  });

  for (const type of ["wall", "sandbags", "barbwire", "greatwall"] as FieldStructureType[]) {
    for (const deg of [30, 45, 90, 120]) {
      it(`${type}: both sections of a ${deg}° corner bend onto one curve and meet edge to edge`, () => {
        const a = (deg * Math.PI) / 180;
        const pieces = line(type, [
          { x: 0, y: 0 },
          { x: 96, y: 0 },
          { x: 96 + Math.cos(a) * 96, y: Math.sin(a) * 96 },
        ]);
        const shapes = lineShapes(pieces);
        const bent = shapes.map((s, i) => ({ s, i })).filter(({ s }) => s.bendNeg || s.bendPos);
        assert.equal(bent.length, 2, `${bent.length} bent sections`);
        const [p, q] = bent as [{ s: (typeof shapes)[0]; i: number }, { s: (typeof shapes)[0]; i: number }];
        const pe: 0 | 1 = p.s.bendPos ? 1 : 0;
        const link = pe === 1 ? p.s.pos! : p.s.neg!;
        assert.equal(link.piece, q.i);
        const fp = lineFrame(pieces[p.i]!, p.s);
        const fq = lineFrame(pieces[q.i]!, q.s);
        const t = pieces[p.i]!.thick;
        // A laid line keeps its front on one flank round every corner, so `across` is the same side on both.
        for (const k of [-0.5, 0, 0.5]) {
          const a0 = endAt(pieces[p.i]!, fp, pe, k * t);
          const b0 = endAt(pieces[q.i]!, fq, link.end, k * t);
          assert.ok(Math.hypot(a0.x - b0.x, a0.y - b0.y) < 0.6, `${type} ${deg}° k=${k}: ${Math.hypot(a0.x - b0.x, a0.y - b0.y)}`);
        }
      });
    }
  }

  it("a section on higher ground eases down to its neighbour's level, and both meet at one height", () => {
    const pieces = line("sandbags", [
      { x: 0, y: 0 },
      { x: 96, y: 0 },
      { x: 96, y: 96 },
    ]);
    const shapes = lineShapes(pieces);
    const levels = pieces.map((_, i) => (i < 3 ? 0 : 4));
    const prof = lineProfile(pieces, shapes, levels);
    for (let i = 0; i < pieces.length; i++) {
      // The centre keeps its own level.
      assert.ok(Math.abs(prof[i]!(0) - levels[i]!) < 1e-9);
      for (const end of [0, 1] as const) {
        const link = end === 1 ? shapes[i]!.pos : shapes[i]!.neg;
        if (!link) continue;
        const here = prof[i]!(end === 1 ? pieces[i]!.length / 2 : -pieces[i]!.length / 2);
        const there = prof[link.piece]!(link.end === 1 ? pieces[link.piece]!.length / 2 : -pieces[link.piece]!.length / 2);
        assert.ok(Math.abs(here - there) < 0.25, `joint ${i}/${link.piece}: ${here} vs ${there}`);
      }
    }
    // Between the low and the high section the line climbs, never steps.
    const low = shapes.findIndex((s, i) => levels[i] === 0 && [s.neg, s.pos].some((l) => l && levels[l.piece] === 4));
    assert.ok(low >= 0);
    const toHigh = [shapes[low]!.neg, shapes[low]!.pos].findIndex((l) => l && levels[l.piece] === 4);
    const sign = toHigh === 1 ? 1 : -1;
    const half = pieces[low]!.length / 2;
    const rise = [0, 0.25, 0.5, 0.75, 1].map((f) => prof[low]!(sign * half * f));
    for (let i = 1; i < rise.length; i++) assert.ok(rise[i]! >= rise[i - 1]! - 1e-9, rise.join(","));
    assert.ok(rise[4]! > 1 && rise[4]! < 3, `meets near half way: ${rise[4]}`);
  });
});
