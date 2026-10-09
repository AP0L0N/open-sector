/**
 * The three CPU types. One brain (ai.ts) plays all of them; the type sets how long it digs in
 * before it marches, how big its waves are, how fast they come, and how much its Smelters pour.
 *
 * Defensive walls the whole yard first: three towers with wall lines, a Bunker, two soldiers in
 * every slit, and a gate, up to four minutes, then measured waves every 25 s from eight fighters.
 * Balanced raises the same ring but will not wait past two and a half minutes for it, and marches
 * a little sooner with a little more. Aggressive puts up the front tower and the Bunker, skips the
 * walls, and comes at the enemy inside the first minute and a half with waves that grow two at a time.
 */

import { TICK_HZ } from "../catalog.js";
import type { AiDifficulty } from "../protocol.js";

export interface AiProfile {
  /** Lobby name, without "CPU". */
  label: string;
  /** One line for the lobby's help text. */
  blurb: string;
  /** Earliest campaign wave. The fortify posture holds the army at home until then anyway. */
  attackFirstTicks: number;
  /** Pause between task forces leaving. Waves come together, not one by one. */
  attackEveryTicks: number;
  /** Fortify gives up waiting on its defences after this long and campaigns anyway. */
  fortifyMaxTicks: number;
  /** Fortify waits for the flank towers too, not only the front tower and the Bunker. */
  fortifyFlanks: boolean;
  /** Fortify waits for every base tower to be walled and crewed, and for the gate. */
  fortifyWalls: boolean;
  /** Fighters the first force needs before it walks out for the middle. */
  centreForce: number;
  /** Fighters the first wave at the enemy needs. Each later wave needs waveGrowth more, up to waveMax. */
  waveMin: number;
  waveGrowth: number;
  waveMax: number;
  /** Campaigning, the CPU keeps this many times each fighting rank of its army table. */
  campaignArmyMul: number;
  /** Campaigning, the CPU raises Barracks and Machine Shops up to this many of each. */
  campaignFactories: number;
  /** An army this many times the wave size splits and comes at the enemy from both flanks. */
  pincerMul: number;
  /**
   * Smelters the CPU keeps. The yard raises the second right after the Barracks; the rest go up
   * once the base stands, from the yard while its scrap lasts and then by engineers on nearby fields.
   */
  wantSmelters: number;
  /** The CPU's head start: its Smelters pour this many times the normal rate. */
  smelterMul: number;
}

export const AI_PROFILES: Readonly<Record<AiDifficulty, AiProfile>> = {
  defensive: {
    label: "Defensive",
    blurb: "walls its base in, then pushes now and then",
    attackFirstTicks: 70 * TICK_HZ,
    attackEveryTicks: 25 * TICK_HZ,
    fortifyMaxTicks: 4 * 60 * TICK_HZ,
    fortifyFlanks: true,
    fortifyWalls: true,
    centreForce: 6,
    waveMin: 8,
    waveGrowth: 1,
    waveMax: 16,
    campaignArmyMul: 1.5,
    campaignFactories: 2,
    pincerMul: 1.6,
    wantSmelters: 4,
    smelterMul: 2,
  },
  balanced: {
    label: "Balanced",
    blurb: "fortifies, then keeps the waves coming",
    attackFirstTicks: 60 * TICK_HZ,
    attackEveryTicks: 20 * TICK_HZ,
    fortifyMaxTicks: 150 * TICK_HZ,
    fortifyFlanks: true,
    fortifyWalls: true,
    centreForce: 5,
    waveMin: 7,
    waveGrowth: 1,
    waveMax: 18,
    campaignArmyMul: 1.75,
    campaignFactories: 2,
    pincerMul: 1.5,
    wantSmelters: 4,
    smelterMul: 2,
  },
  aggressive: {
    label: "Aggressive",
    blurb: "raises a tower and a Bunker, then comes at you early and often",
    attackFirstTicks: 45 * TICK_HZ,
    attackEveryTicks: 15 * TICK_HZ,
    fortifyMaxTicks: 90 * TICK_HZ,
    fortifyFlanks: false,
    fortifyWalls: false,
    centreForce: 4,
    waveMin: 5,
    waveGrowth: 2,
    waveMax: 20,
    campaignArmyMul: 2,
    campaignFactories: 3,
    pincerMul: 1.4,
    wantSmelters: 5,
    smelterMul: 2.5,
  },
};

/** The type's tuning. A side with no type set, or one this build does not know, plays Defensive, the old Easy. */
export function aiProfile(difficulty: AiDifficulty | undefined): AiProfile {
  return AI_PROFILES[difficulty ?? "defensive"] ?? AI_PROFILES.defensive;
}
