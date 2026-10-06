/**
 * Engineer and map bridges, drawn procedurally one brick at a time.
 *
 * A bridge is a run of bricks laid end to end. Every brick of a line keeps one deck
 * level, the ground's height where the line was started, and its underside reaches
 * down to whatever lies under it, the way a wall's base follows the ground: water
 * shows under the spans, a valley gets taller piers, a bank comes up to meet the deck.
 * `layoutBridges` finds where the bricks meet and says how each one ends: down onto the
 * bank, joined to the next brick, broken where the next one fell, or cut off over open
 * water. Where the line turns a corner, the two bricks there bend onto one curve
 * (`brickFrame`). `drawBrick` paints one brick from that.
 *
 * The wooden bridge is a timber trestle: a plank deck with wheel runners, a bent of
 * braced piles under every joint, a log crib and an approach ramp at each bank. The
 * stone one is an old masonry arch bridge: one arch per brick between piers with
 * cutwaters that rise into refuges in the parapet, coursed ashlar, a sett roadway,
 * and wing walls at the banks. A fallen brick leaves its deck hanging from the bricks
 * either side, slumped into the water, and its rubble in the river.
 */
import { type BridgeSpan, type BridgeType, type IsoPt } from "@gridlock/shared";
/**
 * How a brick ends. `abut` is a free end of the run on dry land; `join` meets a
 * standing brick; `break` meets a fallen one; `open` stops over the water (the next
 * brick is not built yet).
 */
export type BrickEnd = "abut" | "join" | "break" | "open";
export interface BrickIn {
    type: BridgeType;
    span: BridgeSpan;
    /** Width of the deck, world px. */
    width: number;
    /** Deck level, map height units. */
    deck: number;
    ruined?: boolean;
}
/**
 * A joint where the line turns. Both bricks bend half the turn on a shared circular
 * fillet, so the deck sweeps round the corner instead of meeting at an angle.
 */
export interface BrickBend {
    /** Where the two bricks' centre lines cross, world px. */
    cx: number;
    cy: number;
    /** Signed radians from this brick's heading into the joint to the neighbour's heading out of it. */
    turn: number;
    /** Fillet tangent length: how far back from the crossing the bend starts, world px. */
    tan: number;
}
export interface BrickLayout {
    /** Deck height (height units) at end A (s = 0) and end B (s = 1). One level for a whole line. */
    ha: number;
    hb: number;
    endA: BrickEnd;
    endB: BrickEnd;
    bendA?: BrickBend;
    bendB?: BrickBend;
}
/** Deck height at share `s` along a brick. */
export declare function brickDeckElev(l: Pick<BrickLayout, "ha" | "hb">, s: number): number;
/**
 * How each brick meets its neighbours, and its deck height. `wet` says whether a
 * world point is water. Wreckage takes part, so the bricks either side of a fallen
 * one break toward it.
 */
export declare function layoutBridges(bricks: readonly BrickIn[], wet: (wx: number, wy: number) => boolean): BrickLayout[];
/**
 * World point at share `s` along a brick (0 end A, 1 end B; past them it runs on) and
 * `k` across it (−0.5 to 0.5 of the width). A bent end sweeps round its fillet and
 * meets the neighbour square across the bisector.
 */
export declare function brickFrame(span: BridgeSpan, width: number, bends: Pick<BrickLayout, "bendA" | "bendB">): (s: number, k: number) => {
    x: number;
    y: number;
};
export interface BrickDrawOpts extends BrickLayout {
    type: BridgeType;
    span: BridgeSpan;
    /** Deck width, world px. */
    width: number;
    project: (wx: number, wy: number, elev: number) => IsoPt;
    /** Terrain height at a world point. */
    ground: (wx: number, wy: number) => number;
    /** Ground under this point is water. */
    wet: (wx: number, wy: number) => boolean;
    ruined?: boolean;
    /** 0 whole, 1 nearly down. */
    hurt?: number;
    alpha?: number;
    /** Placement ghost: tinted, no detail. `bad` turns it red. */
    ghost?: boolean;
    bad?: boolean;
    /** Stable per brick, so wreckage and scars do not jump between frames. */
    seed: number;
}
export declare function drawBrick(ctx: CanvasRenderingContext2D, o: BrickDrawOpts): void;
