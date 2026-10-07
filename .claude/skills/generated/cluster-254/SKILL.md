---
name: cluster-254
description: "Skill for the Cluster_254 area of open-sector. 54 symbols across 1 files."
---

# Cluster_254

54 symbols | 1 files | Cohesion: 89%

## When to Use

- Working with code in `gridlock/`
- Understanding how scatterHeights, makeYard64, scatterClutter work
- Modifying cluster_254-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `gridlock/packages/shared/src/maps.ts` | idx, paintScrapBlob, paintYardScrap, promoteCentreScrap, hash32 (+49) |

## Entry Points

Start here when exploring this area:

- **`scatterHeights`** (Function) — `gridlock/packages/shared/src/maps.ts:1570`
- **`makeYard64`** (Function) — `gridlock/packages/shared/src/maps.ts:2106`
- **`scatterClutter`** (Function) — `gridlock/packages/shared/src/maps.ts:2267`
- **`pick`** (Function) — `gridlock/packages/shared/src/maps.ts:2303`
- **`rollHeights`** (Function) — `gridlock/packages/shared/src/maps.ts:2450`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `scatterHeights` | Function | `gridlock/packages/shared/src/maps.ts` | 1570 |
| `makeYard64` | Function | `gridlock/packages/shared/src/maps.ts` | 2106 |
| `scatterClutter` | Function | `gridlock/packages/shared/src/maps.ts` | 2267 |
| `pick` | Function | `gridlock/packages/shared/src/maps.ts` | 2303 |
| `rollHeights` | Function | `gridlock/packages/shared/src/maps.ts` | 2450 |
| `idx` | Function | `gridlock/packages/shared/src/maps.ts` | 468 |
| `paintScrapBlob` | Function | `gridlock/packages/shared/src/maps.ts` | 504 |
| `paintYardScrap` | Function | `gridlock/packages/shared/src/maps.ts` | 523 |
| `promoteCentreScrap` | Function | `gridlock/packages/shared/src/maps.ts` | 572 |
| `hash32` | Function | `gridlock/packages/shared/src/maps.ts` | 604 |
| `nextRand` | Function | `gridlock/packages/shared/src/maps.ts` | 613 |
| `splatMesa` | Function | `gridlock/packages/shared/src/maps.ts` | 625 |
| `hashNoise` | Function | `gridlock/packages/shared/src/maps.ts` | 663 |
| `smoothNoise` | Function | `gridlock/packages/shared/src/maps.ts` | 669 |
| `rollingDelta` | Function | `gridlock/packages/shared/src/maps.ts` | 685 |
| `paintRolling` | Function | `gridlock/packages/shared/src/maps.ts` | 693 |
| `relaxSlopes` | Function | `gridlock/packages/shared/src/maps.ts` | 704 |
| `cap` | Function | `gridlock/packages/shared/src/maps.ts` | 713 |
| `flattenPad` | Function | `gridlock/packages/shared/src/maps.ts` | 768 |
| `markPad` | Function | `gridlock/packages/shared/src/maps.ts` | 785 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `MakeYard64 → Catalog` | cross_community | 4 |
| `MakeYard64 → NextRand` | cross_community | 4 |
| `MakeYard64 → InPad` | cross_community | 4 |
| `MakeYard64 → StreetBand` | cross_community | 4 |
| `MakeYard64 → Idx` | cross_community | 3 |
| `MakeYard64 → Hash32` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_251 | 5 calls |
| Cluster_255 | 2 calls |
| Cluster_256 | 2 calls |
| Cluster_200 | 2 calls |
| Sim | 1 calls |
| Cluster_237 | 1 calls |

## How to Explore

1. `context({name: "scatterHeights"})` — see callers and callees
2. `query({search_query: "cluster_254"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
