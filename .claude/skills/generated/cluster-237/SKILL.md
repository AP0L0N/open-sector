---
name: cluster-237
description: "Skill for the Cluster_237 area of open-sector. 21 symbols across 2 files."
---

# Cluster_237

21 symbols | 2 files | Cohesion: 77%

## When to Use

- Working with code in `gridlock/`
- Understanding how isMapUnitType, decodeRuns, isCustomMapId work
- Modifying cluster_237-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `gridlock/packages/shared/src/custom-maps.ts` | isMapUnitType, cleanSpot, cleanPatrol, decodeRuns, isCustomMapId (+8) |
| `gridlock/packages/shared/src/maps.ts` | isClutterType, isLampType, turnQuarter, isPlaytestMapId, listMaps (+3) |

## Entry Points

Start here when exploring this area:

- **`isMapUnitType`** (Function) — `gridlock/packages/shared/src/custom-maps.ts:123`
- **`decodeRuns`** (Function) — `gridlock/packages/shared/src/custom-maps.ts:238`
- **`isCustomMapId`** (Function) — `gridlock/packages/shared/src/custom-maps.ts:259`
- **`featureOnPad`** (Function) — `gridlock/packages/shared/src/custom-maps.ts:279`
- **`validateCustomMap`** (Function) — `gridlock/packages/shared/src/custom-maps.ts:310`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `isMapUnitType` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 123 |
| `decodeRuns` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 238 |
| `isCustomMapId` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 259 |
| `featureOnPad` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 279 |
| `validateCustomMap` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 310 |
| `bad` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 311 |
| `sizeOk` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 322 |
| `coord` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 392 |
| `buildCustomMap` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 516 |
| `loadCustomMap` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 544 |
| `isClutterType` | Function | `gridlock/packages/shared/src/maps.ts` | 204 |
| `isLampType` | Function | `gridlock/packages/shared/src/maps.ts` | 208 |
| `turnQuarter` | Function | `gridlock/packages/shared/src/maps.ts` | 236 |
| `isPlaytestMapId` | Function | `gridlock/packages/shared/src/maps.ts` | 2477 |
| `listMaps` | Function | `gridlock/packages/shared/src/maps.ts` | 2482 |
| `isBuiltinMap` | Function | `gridlock/packages/shared/src/maps.ts` | 2490 |
| `registerMap` | Function | `gridlock/packages/shared/src/maps.ts` | 2495 |
| `peakHeight` | Function | `gridlock/packages/shared/src/maps.ts` | 2515 |
| `cleanSpot` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 200 |
| `cleanPatrol` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 206 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_200 | 7 calls |
| Sim | 1 calls |
| Cluster_238 | 1 calls |
| Cluster_234 | 1 calls |

## How to Explore

1. `context({name: "isMapUnitType"})` — see callers and callees
2. `query({search_query: "cluster_237"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
