---
name: cluster-181
description: "Skill for the Cluster_181 area of open-sector. 6 symbols across 1 files."
---

# Cluster_181

6 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `gridlock/`
- Understanding how save, remove, file work
- Modifying cluster_181-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `gridlock/packages/server/src/map-store.ts` | keyHash, validKey, save, remove, file (+1) |

## Entry Points

Start here when exploring this area:

- **`save`** (Method) — `gridlock/packages/server/src/map-store.ts:59`
- **`remove`** (Method) — `gridlock/packages/server/src/map-store.ts:77`
- **`file`** (Method) — `gridlock/packages/server/src/map-store.ts:89`
- **`write`** (Method) — `gridlock/packages/server/src/map-store.ts:93`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `save` | Method | `gridlock/packages/server/src/map-store.ts` | 59 |
| `remove` | Method | `gridlock/packages/server/src/map-store.ts` | 77 |
| `file` | Method | `gridlock/packages/server/src/map-store.ts` | 89 |
| `write` | Method | `gridlock/packages/server/src/map-store.ts` | 93 |
| `keyHash` | Function | `gridlock/packages/server/src/map-store.ts` | 16 |
| `validKey` | Function | `gridlock/packages/server/src/map-store.ts` | 20 |

## How to Explore

1. `context({name: "save"})` — see callers and callees
2. `query({search_query: "cluster_181"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
