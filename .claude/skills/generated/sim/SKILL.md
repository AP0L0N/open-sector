---
name: sim
description: "Skill for the Sim area of open-sector. 1995 symbols across 135 files."
---

# Sim

1995 symbols | 135 files | Cohesion: 61%

## When to Use

- Working with code in `gridlock/`
- Understanding how isConcreteLine, isLowFieldWork, scopedHpFraction work
- Modifying sim-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `gridlock/packages/shared/src/catalog.ts` | isConcreteLine, isLowFieldWork, scopedHpFraction, isLightHull, ptrdPenetration (+143) |
| `gridlock/packages/shared/src/sim/combat.ts` | tickCombat, interceptRockets, burstRockets, roofCiwsRange, roofRoundCanHarm (+126) |
| `gridlock/packages/shared/src/sim/ai.ts` | watchSky, scramble, lineLane, shellShore, thinkEasy (+123) |
| `gridlock/packages/shared/src/sim/air.ts` | isAirborne, isCrashing, reachesAircraft, airTargetSpreadMul, patrolPlaneTarget (+78) |
| `gridlock/packages/shared/src/sim/field.ts` | isTankShell, coverStrike, fieldTiles, fieldTilesOn, sitedLineTiles (+69) |
| `gridlock/packages/shared/src/sim/vision.ts` | canSeeEntity, sightBoxRadius, coverOf, ensureSmokeMask, mix (+61) |
| `gridlock/packages/shared/src/sim/geo.ts` | allies, ownerless, segmentCapsuleT, pointSegmentDist, segmentCircleT (+56) |
| `gridlock/packages/shared/src/sim/commands.ts` | fieldPathOf, ok, fail, runCommand, commandIds (+48) |
| `gridlock/packages/shared/src/sim/supply.ts` | isSupplyBullet, dropPoint, supplyCanDrive, footprintNearest, supplyHasDriver (+44) |
| `gridlock/packages/shared/src/sim/elevation.ts` | worldTileHeight, entityHeight, muzzleHeight, airAlt, droneSightExtra (+39) |

## Entry Points

Start here when exploring this area:

- **`isConcreteLine`** (Function) — `gridlock/packages/shared/src/catalog.ts:635`
- **`isLowFieldWork`** (Function) — `gridlock/packages/shared/src/catalog.ts:642`
- **`scopedHpFraction`** (Function) — `gridlock/packages/shared/src/catalog.ts:1381`
- **`isLightHull`** (Function) — `gridlock/packages/shared/src/catalog.ts:1434`
- **`ptrdPenetration`** (Function) — `gridlock/packages/shared/src/catalog.ts:1449`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `isConcreteLine` | Function | `gridlock/packages/shared/src/catalog.ts` | 635 |
| `isLowFieldWork` | Function | `gridlock/packages/shared/src/catalog.ts` | 642 |
| `scopedHpFraction` | Function | `gridlock/packages/shared/src/catalog.ts` | 1381 |
| `isLightHull` | Function | `gridlock/packages/shared/src/catalog.ts` | 1434 |
| `ptrdPenetration` | Function | `gridlock/packages/shared/src/catalog.ts` | 1449 |
| `gatlingSprayOf` | Function | `gridlock/packages/shared/src/catalog.ts` | 2477 |
| `hasTracks` | Function | `gridlock/packages/shared/src/catalog.ts` | 5461 |
| `trackCritAllowed` | Function | `gridlock/packages/shared/src/catalog.ts` | 5469 |
| `submergesOf` | Function | `gridlock/packages/shared/src/catalog.ts` | 5489 |
| `isJumpJetType` | Function | `gridlock/packages/shared/src/catalog.ts` | 5517 |
| `isAircraftType` | Function | `gridlock/packages/shared/src/catalog.ts` | 5522 |
| `isDroneType` | Function | `gridlock/packages/shared/src/catalog.ts` | 5556 |
| `hasForceField` | Function | `gridlock/packages/shared/src/catalog.ts` | 5582 |
| `isMotorVehicle` | Function | `gridlock/packages/shared/src/catalog.ts` | 5662 |
| `addCrit` | Function | `gridlock/packages/shared/src/catalog.ts` | 5682 |
| `isGarrisonable` | Function | `gridlock/packages/shared/src/catalog.ts` | 5717 |
| `garrisonWoundMulOf` | Function | `gridlock/packages/shared/src/catalog.ts` | 5783 |
| `coverHeightOf` | Function | `gridlock/packages/shared/src/catalog.ts` | 5814 |
| `gunArcDegOf` | Function | `gridlock/packages/shared/src/catalog.ts` | 5852 |
| `leavesWreck` | Function | `gridlock/packages/shared/src/catalog.ts` | 5972 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `FireAtCurrent → IsBridge` | cross_community | 5 |
| `FireAtCurrent → AirAlt` | cross_community | 5 |
| `FireAtCurrent → IsInfantryType` | cross_community | 5 |
| `FireAtCurrent → HasCrit` | cross_community | 5 |
| `RunCommand → Catalog` | cross_community | 5 |
| `RunCommand → OpOf` | cross_community | 5 |
| `RunCommand → DroneOf` | cross_community | 5 |
| `RunCommand → IsTransportType` | cross_community | 5 |
| `FireAtCurrent → IsCrashing` | cross_community | 4 |
| `FireAtCurrent → Catalog` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_200 | 12 calls |
| Cluster_191 | 6 calls |
| Cluster_190 | 6 calls |
| Cluster_245 | 2 calls |
| Cluster_238 | 1 calls |
| Cluster_237 | 1 calls |

## How to Explore

1. `context({name: "isConcreteLine"})` — see callers and callees
2. `query({search_query: "sim"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
