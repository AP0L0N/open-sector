/**
 * A soldier killed by fire is already dead. For a second or two the client
 * holds a blackened standing sprite in the flames, then collapses it.
 * Wall-clock, not sim ticks: the default match speed would skip a sim-timed
 * pose before it could be seen. Three poses, picked from the corpse id.
 */

export interface BurnPoseSpec {
  /** Black burning sprite, milliseconds. */
  standMs: number;
  /** Collapse onto the die sheet, milliseconds. */
  fallMs: number;
  /** Tip during the collapse, radians. */
  rot: number;
  /** Extra drop at the end of the collapse, screen pixels. */
  sink: number;
  /** Standing char. 0 is black, 1 is the painted sprite. */
  brightness: number;
  /** Fallen body. Darker than life, still a shade rather than a flat black. */
  downBrightness: number;
  sepia: number;
}

export const BURN_POSES: readonly [BurnPoseSpec, BurnPoseSpec, BurnPoseSpec] = [
  { standMs: 1000, fallMs: 520, rot: -0.42, sink: 7, brightness: 0.1, downBrightness: 0.26, sepia: 0.45 },
  { standMs: 1500, fallMs: 680, rot: 0.58, sink: 11, brightness: 0.08, downBrightness: 0.2, sepia: 0.28 },
  { standMs: 2000, fallMs: 820, rot: 0.12, sink: 16, brightness: 0.14, downBrightness: 0.32, sepia: 0.62 },
];

export function burnAnimMs(variant: 0 | 1 | 2): number {
  const pose = BURN_POSES[variant];
  return pose.standMs + pose.fallMs;
}

export interface BurnPose {
  phase: "burn" | "fall" | "down";
  /** 0 at the first collapse frame, 1 on the last. */
  fallT: number;
  rot: number;
  sink: number;
  /** Flame strength. 0 once the body is on the ground. */
  heat: number;
  brightness: number;
  sepia: number;
}

export function burnDeathPose(ageMs: number, variant: 0 | 1 | 2): BurnPose {
  const spec = BURN_POSES[variant];
  const age = Math.max(0, ageMs);
  if (age < spec.standMs) {
    return {
      phase: "burn",
      fallT: 0,
      rot: 0,
      sink: 0,
      heat: 1,
      brightness: spec.brightness,
      sepia: spec.sepia,
    };
  }
  if (age < spec.standMs + spec.fallMs) {
    const fallT = (age - spec.standMs) / spec.fallMs;
    return {
      phase: "fall",
      fallT,
      rot: spec.rot * fallT,
      sink: spec.sink * fallT,
      heat: 1 - fallT,
      brightness: spec.brightness + (spec.downBrightness - spec.brightness) * fallT,
      sepia: spec.sepia,
    };
  }
  return {
    phase: "down",
    fallT: 1,
    rot: spec.rot,
    sink: spec.sink,
    heat: 0,
    brightness: spec.downBrightness,
    sepia: spec.sepia,
  };
}

/** Die-sheet age that lands on the frame `fallT` selects. */
export function burnFallAgeMs(fallT: number, fps: number, frames: number): number {
  if (frames <= 1 || fps <= 0) return 0;
  const span = ((frames - 1) / fps) * 1000;
  return Math.min(1, Math.max(0, fallT)) * span;
}
