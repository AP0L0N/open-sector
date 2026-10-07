---
name: cluster-251
description: "Skill for the Cluster_251 area of open-sector. 5 symbols across 1 files."
---

# Cluster_251

5 symbols | 1 files | Cohesion: 57%

## When to Use

- Working with code in `gridlock/`
- Understanding how isScrapTile work
- Modifying cluster_251-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `gridlock/packages/shared/src/maps.ts` | isScrapTile, inHouseBox, paintLane, stampRoad, paintVillageStreets |

## Entry Points

Start here when exploring this area:

- **`isScrapTile`** (Function) — `gridlock/packages/shared/src/maps.ts:439`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `isScrapTile` | Function | `gridlock/packages/shared/src/maps.ts` | 439 |
| `inHouseBox` | Function | `gridlock/packages/shared/src/maps.ts` | 837 |
| `paintLane` | Function | `gridlock/packages/shared/src/maps.ts` | 1638 |
| `stampRoad` | Function | `gridlock/packages/shared/src/maps.ts` | 1671 |
| `paintVillageStreets` | Function | `gridlock/packages/shared/src/maps.ts` | 1783 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_254 | 2 calls |

## How to Explore

1. `context({name: "isScrapTile"})` — see callers and callees
2. `query({search_query: "cluster_251"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
