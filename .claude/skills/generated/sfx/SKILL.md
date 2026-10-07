---
name: sfx
description: "Skill for the Sfx area of open-sector. 6 symbols across 1 files."
---

# Sfx

6 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `tools/`
- Understanding how t_axis, env, one_pole_lp work
- Modifying sfx-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `tools/sfx/tiger_cannon.py` | t_axis, env, one_pole_lp, lp, hp (+1) |

## Entry Points

Start here when exploring this area:

- **`t_axis`** (Function) — `tools/sfx/tiger_cannon.py:30`
- **`env`** (Function) — `tools/sfx/tiger_cannon.py:34`
- **`one_pole_lp`** (Function) — `tools/sfx/tiger_cannon.py:41`
- **`lp`** (Function) — `tools/sfx/tiger_cannon.py:52`
- **`hp`** (Function) — `tools/sfx/tiger_cannon.py:58`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `t_axis` | Function | `tools/sfx/tiger_cannon.py` | 30 |
| `env` | Function | `tools/sfx/tiger_cannon.py` | 34 |
| `one_pole_lp` | Function | `tools/sfx/tiger_cannon.py` | 41 |
| `lp` | Function | `tools/sfx/tiger_cannon.py` | 52 |
| `hp` | Function | `tools/sfx/tiger_cannon.py` | 58 |
| `main` | Function | `tools/sfx/tiger_cannon.py` | 64 |

## How to Explore

1. `context({name: "t_axis"})` — see callers and callees
2. `query({search_query: "sfx"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
