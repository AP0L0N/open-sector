---
name: cluster-238
description: "Skill for the Cluster_238 area of open-sector. 6 symbols across 2 files."
---

# Cluster_238

6 symbols | 2 files | Cohesion: 57%

## When to Use

- Working with code in `gridlock/`
- Understanding how mapUnitGroundOk, mapUnitHostAt, mapUnitsInside work
- Modifying cluster_238-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `gridlock/packages/shared/src/custom-maps.ts` | mapUnitGroundOk, unitGap, mapUnitHostAt, mapUnitsInside, mapUnitProblem |
| `gridlock/packages/shared/src/maps.ts` | featureContains |

## Entry Points

Start here when exploring this area:

- **`mapUnitGroundOk`** (Function) — `gridlock/packages/shared/src/custom-maps.ts:128`
- **`mapUnitHostAt`** (Function) — `gridlock/packages/shared/src/custom-maps.ts:154`
- **`mapUnitsInside`** (Function) — `gridlock/packages/shared/src/custom-maps.ts:159`
- **`mapUnitProblem`** (Function) — `gridlock/packages/shared/src/custom-maps.ts:170`
- **`featureContains`** (Function) — `gridlock/packages/shared/src/maps.ts:303`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `mapUnitGroundOk` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 128 |
| `mapUnitHostAt` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 154 |
| `mapUnitsInside` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 159 |
| `mapUnitProblem` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 170 |
| `featureContains` | Function | `gridlock/packages/shared/src/maps.ts` | 303 |
| `unitGap` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 134 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Sim | 6 calls |
| Cluster_200 | 1 calls |

## How to Explore

1. `context({name: "mapUnitGroundOk"})` — see callers and callees
2. `query({search_query: "cluster_238"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
