---
name: cluster-200
description: "Skill for the Cluster_200 area of open-sector. 15 symbols across 3 files."
---

# Cluster_200

15 symbols | 3 files | Cohesion: 60%

## When to Use

- Working with code in `gridlock/`
- Understanding how bridgeBrickLength, featureSeat, lampBlocked work
- Modifying cluster_200-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `gridlock/packages/shared/src/maps.ts` | isMapSection, isMapBridge, isMapLine, featureAngle, featureLotSite (+6) |
| `gridlock/packages/shared/src/custom-maps.ts` | featureSeat, lampBlocked, featuresOverlap |
| `gridlock/packages/shared/src/catalog.ts` | bridgeBrickLength |

## Entry Points

Start here when exploring this area:

- **`bridgeBrickLength`** (Function) — `gridlock/packages/shared/src/catalog.ts:666`
- **`featureSeat`** (Function) — `gridlock/packages/shared/src/custom-maps.ts:148`
- **`lampBlocked`** (Function) — `gridlock/packages/shared/src/custom-maps.ts:289`
- **`featuresOverlap`** (Function) — `gridlock/packages/shared/src/custom-maps.ts:297`
- **`isMapSection`** (Function) — `gridlock/packages/shared/src/maps.ts:212`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `bridgeBrickLength` | Function | `gridlock/packages/shared/src/catalog.ts` | 666 |
| `featureSeat` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 148 |
| `lampBlocked` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 289 |
| `featuresOverlap` | Function | `gridlock/packages/shared/src/custom-maps.ts` | 297 |
| `isMapSection` | Function | `gridlock/packages/shared/src/maps.ts` | 212 |
| `isMapBridge` | Function | `gridlock/packages/shared/src/maps.ts` | 216 |
| `isMapLine` | Function | `gridlock/packages/shared/src/maps.ts` | 221 |
| `featureAngle` | Function | `gridlock/packages/shared/src/maps.ts` | 241 |
| `featureLotSite` | Function | `gridlock/packages/shared/src/maps.ts` | 246 |
| `featureRect` | Function | `gridlock/packages/shared/src/maps.ts` | 273 |
| `featureRectsOverlap` | Function | `gridlock/packages/shared/src/maps.ts` | 316 |
| `featureBox` | Function | `gridlock/packages/shared/src/maps.ts` | 346 |
| `lotFeatures` | Function | `gridlock/packages/shared/src/maps.ts` | 363 |
| `normalizeTerrain` | Function | `gridlock/packages/shared/src/maps.ts` | 2402 |
| `brickSpanOf` | Function | `gridlock/packages/shared/src/maps.ts` | 311 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Sim | 7 calls |
| Cluster_254 | 3 calls |
| Cluster_191 | 1 calls |
| Cluster_251 | 1 calls |

## How to Explore

1. `context({name: "bridgeBrickLength"})` — see callers and callees
2. `query({search_query: "cluster_200"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
