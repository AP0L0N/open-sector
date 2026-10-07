---
name: audio
description: "Skill for the Audio area of open-sector. 33 symbols across 3 files."
---

# Audio

33 symbols | 3 files | Cohesion: 85%

## When to Use

- Working with code in `tools/`
- Understanding how log, finish, ensure_voice work
- Modifying audio-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `tools/audio/build.py` | log, finish, ensure_voice, jobs_for, run_job (+11) |
| `tools/audio/elevenlabs.py` | find_voice, _write, _request, voices, design_voice (+10) |
| `tools/audio/qa.py` | probe, check |

## Entry Points

Start here when exploring this area:

- **`log`** (Function) — `tools/audio/build.py:63`
- **`finish`** (Function) — `tools/audio/build.py:73`
- **`ensure_voice`** (Function) — `tools/audio/build.py:163`
- **`jobs_for`** (Function) — `tools/audio/build.py:201`
- **`run_job`** (Function) — `tools/audio/build.py:221`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `log` | Function | `tools/audio/build.py` | 63 |
| `finish` | Function | `tools/audio/build.py` | 73 |
| `ensure_voice` | Function | `tools/audio/build.py` | 163 |
| `jobs_for` | Function | `tools/audio/build.py` | 201 |
| `run_job` | Function | `tools/audio/build.py` | 221 |
| `source_bytes` | Function | `tools/audio/build.py` | 257 |
| `variant_pitch` | Function | `tools/audio/build.py` | 270 |
| `keep_raw` | Function | `tools/audio/build.py` | 279 |
| `remaster` | Function | `tools/audio/build.py` | 285 |
| `build` | Function | `tools/audio/build.py` | 303 |
| `main` | Function | `tools/audio/build.py` | 327 |
| `trim_chain` | Function | `tools/audio/build.py` | 68 |
| `repitch` | Function | `tools/audio/build.py` | 125 |
| `master_heavy` | Function | `tools/audio/build.py` | 132 |
| `find_key` | Function | `tools/audio/elevenlabs.py` | 61 |
| `probe` | Function | `tools/audio/qa.py` | 29 |
| `check` | Function | `tools/audio/qa.py` | 45 |
| `find_voice` | Method | `tools/audio/elevenlabs.py` | 134 |
| `voices` | Method | `tools/audio/elevenlabs.py` | 131 |
| `design_voice` | Method | `tools/audio/elevenlabs.py` | 140 |

## How to Explore

1. `context({name: "log"})` — see callers and callees
2. `query({search_query: "audio"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
