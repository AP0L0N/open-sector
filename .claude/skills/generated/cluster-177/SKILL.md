---
name: cluster-177
description: "Skill for the Cluster_177 area of open-sector. 8 symbols across 4 files."
---

# Cluster_177

8 symbols | 4 files | Cohesion: 100%

## When to Use

- Working with code in `gridlock/`
- Understanding how startServer, attachSocket, MapStore work
- Modifying cluster_177-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `gridlock/packages/server/src/index.ts` | defaultMapsDir, defaultStaticDir, startServer |
| `gridlock/packages/server/src/map-store.ts` | MapStore, load |
| `gridlock/packages/server/src/ws.ts` | parseClient, attachSocket |
| `gridlock/packages/server/src/room.ts` | constructor |

## Entry Points

Start here when exploring this area:

- **`startServer`** (Function) — `gridlock/packages/server/src/index.ts:156`
- **`attachSocket`** (Function) — `gridlock/packages/server/src/ws.ts:23`
- **`MapStore`** (Class) — `gridlock/packages/server/src/map-store.ts:29`
- **`load`** (Method) — `gridlock/packages/server/src/map-store.ts:35`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `MapStore` | Class | `gridlock/packages/server/src/map-store.ts` | 29 |
| `startServer` | Function | `gridlock/packages/server/src/index.ts` | 156 |
| `attachSocket` | Function | `gridlock/packages/server/src/ws.ts` | 23 |
| `load` | Method | `gridlock/packages/server/src/map-store.ts` | 35 |
| `defaultMapsDir` | Function | `gridlock/packages/server/src/index.ts` | 43 |
| `defaultStaticDir` | Function | `gridlock/packages/server/src/index.ts` | 49 |
| `parseClient` | Function | `gridlock/packages/server/src/ws.ts` | 6 |
| `constructor` | Method | `gridlock/packages/server/src/room.ts` | 65 |

## How to Explore

1. `context({name: "startServer"})` — see callers and callees
2. `query({search_query: "cluster_177"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
