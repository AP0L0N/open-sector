---
name: sprites
description: "Skill for the Sprites area of open-sector. 817 symbols across 44 files."
---

# Sprites

817 symbols | 44 files | Cohesion: 88%

## When to Use

- Working with code in `tools/`
- Understanding how bob_of, ellipsoid, capsule work
- Modifying sprites-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `tools/sprites/render_infantry.py` | v3, unit, knee_of, elbow_of, lean_pt (+59) |
| `tools/sprites/render_wrecks.py` | place, arr, img, noise, smoothstep (+45) |
| `tools/sprites/render_airfield.py` | to_screen, to_world_ground, make_canvas, rasterize, ink (+40) |
| `tools/sprites/render_industry.py` | shade_frame, __init__, gaslamp, streetlamp, floodlight (+33) |
| `tools/sprites/render_props.py` | rot, box, cylinder, draw_all, image (+32) |
| `tools/sprites/render_ww2_fort.py` | render_turned, soldier, make_canvas, cameo, on_grass (+31) |
| `tools/sprites/render_cyborgcommander.py` | pose_swim, render_sheet, on_magenta, cameo, main (+29) |
| `tools/sprites/render_procedural.py` | v, tri, quad, box, loft (+27) |
| `tools/sprites/render_cyborg.py` | Cloud, add, _frame, ellipsoid, capsule (+26) |
| `tools/sprites/derive_rocketer.py` | save_rgb, derive, place_like, compose, cameo (+25) |

## Entry Points

Start here when exploring this area:

- **`bob_of`** (Function) — `tools/sprites/derive_swim.py:92`
- **`ellipsoid`** (Function) — `tools/sprites/render_cyborg.py:146`
- **`capsule`** (Function) — `tools/sprites/render_cyborg.py:164`
- **`cylinder`** (Function) — `tools/sprites/render_cyborg.py:189`
- **`box`** (Function) — `tools/sprites/render_cyborg.py:206`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `Cloud` | Class | `tools/sprites/render_cyborg.py` | 101 |
| `Mesh` | Class | `tools/sprites/render_airfield.py` | 268 |
| `Axis` | Class | `tools/sprites/derive_rocketer.py` | 210 |
| `Canvas` | Class | `tools/sprites/render_airfield.py` | 663 |
| `bob_of` | Function | `tools/sprites/derive_swim.py` | 92 |
| `ellipsoid` | Function | `tools/sprites/render_cyborg.py` | 146 |
| `capsule` | Function | `tools/sprites/render_cyborg.py` | 164 |
| `cylinder` | Function | `tools/sprites/render_cyborg.py` | 189 |
| `box` | Function | `tools/sprites/render_cyborg.py` | 206 |
| `rot_y` | Function | `tools/sprites/render_cyborg.py` | 225 |
| `rot_z` | Function | `tools/sprites/render_cyborg.py` | 230 |
| `rot_x` | Function | `tools/sprites/render_cyborg.py` | 235 |
| `gatling` | Function | `tools/sprites/render_cyborg.py` | 247 |
| `feed_belt` | Function | `tools/sprites/render_cyborg.py` | 281 |
| `leg_ik` | Function | `tools/sprites/render_cyborg.py` | 289 |
| `mech_leg` | Function | `tools/sprites/render_cyborg.py` | 307 |
| `stumps` | Function | `tools/sprites/render_cyborg.py` | 330 |
| `cy_head` | Function | `tools/sprites/render_cyborg.py` | 344 |
| `cy_torso` | Function | `tools/sprites/render_cyborg.py` | 358 |
| `pauldron` | Function | `tools/sprites/render_cyborg.py` | 389 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Casemate_mesh → W` | cross_community | 5 |
| `Hochstand_mesh → W` | cross_community | 5 |
| `Tobruk_mesh → W` | cross_community | 5 |
| `Main → Is_true_magenta` | intra_community | 5 |
| `Main → Near_chroma` | intra_community | 5 |
| `Tex → _hash` | intra_community | 4 |
| `Leitturm_mesh → W` | cross_community | 4 |
| `Build_mesh → Tri` | intra_community | 4 |
| `Tex → _hash` | intra_community | 4 |
| `Build_lst → Tri` | intra_community | 4 |

## How to Explore

1. `context({name: "bob_of"})` — see callers and callees
2. `query({search_query: "sprites"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
