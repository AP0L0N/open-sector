---
name: cluster-178
description: "Skill for the Cluster_178 area of open-sector. 6 symbols across 1 files."
---

# Cluster_178

6 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `gridlock/`
- Understanding how mapLayout, server work
- Modifying cluster_178-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `gridlock/packages/server/src/index.ts` | safeJoin, sendJson, mapLayout, serveApi, serveStatic (+1) |

## Entry Points

Start here when exploring this area:

- **`mapLayout`** (Function) — `gridlock/packages/server/src/index.ts:73`
- **`server`** (Function) — `gridlock/packages/server/src/index.ts:175`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `mapLayout` | Function | `gridlock/packages/server/src/index.ts` | 73 |
| `server` | Function | `gridlock/packages/server/src/index.ts` | 175 |
| `safeJoin` | Function | `gridlock/packages/server/src/index.ts` | 53 |
| `sendJson` | Function | `gridlock/packages/server/src/index.ts` | 67 |
| `serveApi` | Function | `gridlock/packages/server/src/index.ts` | 100 |
| `serveStatic` | Function | `gridlock/packages/server/src/index.ts` | 133 |

## How to Explore

1. `context({name: "mapLayout"})` — see callers and callees
2. `query({search_query: "cluster_178"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
