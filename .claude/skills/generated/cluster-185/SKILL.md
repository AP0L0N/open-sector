---
name: cluster-185
description: "Skill for the Cluster_185 area of open-sector. 10 symbols across 1 files."
---

# Cluster_185

10 symbols | 1 files | Cohesion: 81%

## When to Use

- Working with code in `gridlock/`
- Understanding how sanitizeName, handle, err work
- Modifying cluster_185-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `gridlock/packages/server/src/room.ts` | sanitizeName, handle, err, broadcast, broadcastState (+5) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `sanitizeName` | Function | `gridlock/packages/server/src/room.ts` | 49 |
| `handle` | Method | `gridlock/packages/server/src/room.ts` | 108 |
| `err` | Method | `gridlock/packages/server/src/room.ts` | 171 |
| `broadcast` | Method | `gridlock/packages/server/src/room.ts` | 175 |
| `broadcastState` | Method | `gridlock/packages/server/src/room.ts` | 181 |
| `roomOf` | Method | `gridlock/packages/server/src/room.ts` | 195 |
| `onHello` | Method | `gridlock/packages/server/src/room.ts` | 200 |
| `onSlotUpdate` | Method | `gridlock/packages/server/src/room.ts` | 303 |
| `onHostSlot` | Method | `gridlock/packages/server/src/room.ts` | 314 |
| `onMap` | Method | `gridlock/packages/server/src/room.ts` | 347 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_186 | 3 calls |

## How to Explore

1. `context({name: "sanitizeName"})` — see callers and callees
2. `query({search_query: "cluster_185"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
