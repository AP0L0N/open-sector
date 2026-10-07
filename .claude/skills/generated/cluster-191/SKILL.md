---
name: cluster-191
description: "Skill for the Cluster_191 area of open-sector. 7 symbols across 1 files."
---

# Cluster_191

7 symbols | 1 files | Cohesion: 64%

## When to Use

- Working with code in `gridlock/`
- Understanding how bridgeAxes, bridgeEnds, bridgeAlong work
- Modifying cluster_191-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `gridlock/packages/shared/src/bridge-plan.ts` | bridgeAxes, bridgeEnds, bridgeAlong, bricksConflict, half (+2) |

## Entry Points

Start here when exploring this area:

- **`bridgeAxes`** (Function) — `gridlock/packages/shared/src/bridge-plan.ts:46`
- **`bridgeEnds`** (Function) — `gridlock/packages/shared/src/bridge-plan.ts:53`
- **`bridgeAlong`** (Function) — `gridlock/packages/shared/src/bridge-plan.ts:78`
- **`bricksConflict`** (Function) — `gridlock/packages/shared/src/bridge-plan.ts:117`
- **`half`** (Function) — `gridlock/packages/shared/src/bridge-plan.ts:120`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `bridgeAxes` | Function | `gridlock/packages/shared/src/bridge-plan.ts` | 46 |
| `bridgeEnds` | Function | `gridlock/packages/shared/src/bridge-plan.ts` | 53 |
| `bridgeAlong` | Function | `gridlock/packages/shared/src/bridge-plan.ts` | 78 |
| `bricksConflict` | Function | `gridlock/packages/shared/src/bridge-plan.ts` | 117 |
| `half` | Function | `gridlock/packages/shared/src/bridge-plan.ts` | 120 |
| `bridgeSegmentT` | Function | `gridlock/packages/shared/src/bridge-plan.ts` | 288 |
| `mitreJoint` | Function | `gridlock/packages/shared/src/bridge-plan.ts` | 145 |

## How to Explore

1. `context({name: "bridgeAxes"})` — see callers and callees
2. `query({search_query: "cluster_191"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
