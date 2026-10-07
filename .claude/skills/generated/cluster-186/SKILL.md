---
name: cluster-186
description: "Skill for the Cluster_186 area of open-sector. 9 symbols across 1 files."
---

# Cluster_186

9 symbols | 1 files | Cohesion: 71%

## When to Use

- Working with code in `gridlock/`
- Understanding how log, disconnect, drop work
- Modifying cluster_186-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `gridlock/packages/server/src/room.ts` | log, disconnect, drop, broadcastSnapshots, detachFromRoom (+4) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `log` | Function | `gridlock/packages/server/src/room.ts` | 54 |
| `disconnect` | Method | `gridlock/packages/server/src/room.ts` | 76 |
| `drop` | Method | `gridlock/packages/server/src/room.ts` | 166 |
| `broadcastSnapshots` | Method | `gridlock/packages/server/src/room.ts` | 187 |
| `detachFromRoom` | Method | `gridlock/packages/server/src/room.ts` | 209 |
| `onCreate` | Method | `gridlock/packages/server/src/room.ts` | 214 |
| `onJoin` | Method | `gridlock/packages/server/src/room.ts` | 245 |
| `leaveInternal` | Method | `gridlock/packages/server/src/room.ts` | 262 |
| `closeRoom` | Method | `gridlock/packages/server/src/room.ts` | 284 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_185 | 9 calls |

## How to Explore

1. `context({name: "log"})` — see callers and callees
2. `query({search_query: "cluster_186"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
