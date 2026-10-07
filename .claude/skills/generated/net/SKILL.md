---
name: net
description: "Skill for the Net area of open-sector. 7 symbols across 4 files."
---

# Net

7 symbols | 4 files | Cohesion: 64%

## When to Use

- Working with code in `gridlock/`
- Understanding how builderError, send, destroy work
- Modifying net-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `gridlock/packages/client/src/net/client.ts` | send, connect, close |
| `gridlock/packages/client/src/main.ts` | goto, onMessage |
| `gridlock/packages/client/src/render/mapview.ts` | destroy |
| `gridlock/packages/client/src/ui/builder.ts` | builderError |

## Entry Points

Start here when exploring this area:

- **`builderError`** (Function) — `gridlock/packages/client/src/ui/builder.ts:2250`
- **`send`** (Method) — `gridlock/packages/client/src/net/client.ts:40`
- **`destroy`** (Method) — `gridlock/packages/client/src/render/mapview.ts:2285`
- **`connect`** (Method) — `gridlock/packages/client/src/net/client.ts:9`
- **`close`** (Method) — `gridlock/packages/client/src/net/client.ts:47`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `builderError` | Function | `gridlock/packages/client/src/ui/builder.ts` | 2250 |
| `send` | Method | `gridlock/packages/client/src/net/client.ts` | 40 |
| `destroy` | Method | `gridlock/packages/client/src/render/mapview.ts` | 2285 |
| `connect` | Method | `gridlock/packages/client/src/net/client.ts` | 9 |
| `close` | Method | `gridlock/packages/client/src/net/client.ts` | 47 |
| `onMessage` | Function | `gridlock/packages/client/src/main.ts` | 208 |
| `goto` | Method | `gridlock/packages/client/src/main.ts` | 70 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `OnMessage → OnSend` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Ui | 15 calls |

## How to Explore

1. `context({name: "builderError"})` — see callers and callees
2. `query({search_query: "net"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
