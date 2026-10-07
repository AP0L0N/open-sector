---
name: cluster-190
description: "Skill for the Cluster_190 area of open-sector. 7 symbols across 1 files."
---

# Cluster_190

7 symbols | 1 files | Cohesion: 50%

## When to Use

- Working with code in `gridlock/`
- Understanding how bridgeTiles, bridgePath, bridgeBrickProblem work
- Modifying cluster_190-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `gridlock/packages/shared/src/bridge-plan.ts` | water, footing, bridgeTiles, turnBetween, bridgePath (+2) |

## Entry Points

Start here when exploring this area:

- **`bridgeTiles`** (Function) — `gridlock/packages/shared/src/bridge-plan.ts:88`
- **`bridgePath`** (Function) — `gridlock/packages/shared/src/bridge-plan.ts:186`
- **`bridgeBrickProblem`** (Function) — `gridlock/packages/shared/src/bridge-plan.ts:244`
- **`planBridgeLine`** (Function) — `gridlock/packages/shared/src/bridge-plan.ts:273`
- **`water`** (Method) — `gridlock/packages/shared/src/bridge-plan.ts:39`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `bridgeTiles` | Function | `gridlock/packages/shared/src/bridge-plan.ts` | 88 |
| `bridgePath` | Function | `gridlock/packages/shared/src/bridge-plan.ts` | 186 |
| `bridgeBrickProblem` | Function | `gridlock/packages/shared/src/bridge-plan.ts` | 244 |
| `planBridgeLine` | Function | `gridlock/packages/shared/src/bridge-plan.ts` | 273 |
| `water` | Method | `gridlock/packages/shared/src/bridge-plan.ts` | 39 |
| `footing` | Method | `gridlock/packages/shared/src/bridge-plan.ts` | 41 |
| `turnBetween` | Function | `gridlock/packages/shared/src/bridge-plan.ts` | 173 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Sim | 3 calls |
| Cluster_191 | 2 calls |
| Cluster_200 | 1 calls |

## How to Explore

1. `context({name: "bridgeTiles"})` — see callers and callees
2. `query({search_query: "cluster_190"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
