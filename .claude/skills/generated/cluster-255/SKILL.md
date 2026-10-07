---
name: cluster-255
description: "Skill for the Cluster_255 area of open-sector. 9 symbols across 1 files."
---

# Cluster_255

9 symbols | 1 files | Cohesion: 64%

## When to Use

- Working with code in `gridlock/`
- Understanding how fillRect, rectFree, houseSize work
- Modifying cluster_255-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `gridlock/packages/shared/src/maps.ts` | fillRect, rectFree, houseSize, streetBand, lotClear (+4) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `fillRect` | Function | `gridlock/packages/shared/src/maps.ts` | 472 |
| `rectFree` | Function | `gridlock/packages/shared/src/maps.ts` | 1108 |
| `houseSize` | Function | `gridlock/packages/shared/src/maps.ts` | 1320 |
| `streetBand` | Function | `gridlock/packages/shared/src/maps.ts` | 1326 |
| `lotClear` | Function | `gridlock/packages/shared/src/maps.ts` | 1331 |
| `claimLot` | Function | `gridlock/packages/shared/src/maps.ts` | 1343 |
| `layVillage` | Function | `gridlock/packages/shared/src/maps.ts` | 1352 |
| `layFarmstead` | Function | `gridlock/packages/shared/src/maps.ts` | 1407 |
| `scatterCover` | Function | `gridlock/packages/shared/src/maps.ts` | 1459 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `MakeYard64 → Catalog` | cross_community | 4 |
| `MakeYard64 → NextRand` | cross_community | 4 |
| `MakeYard64 → InPad` | cross_community | 4 |
| `MakeYard64 → StreetBand` | cross_community | 4 |
| `MakeYard64 → Idx` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_254 | 12 calls |
| Sim | 2 calls |

## How to Explore

1. `context({name: "fillRect"})` — see callers and callees
2. `query({search_query: "cluster_255"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
