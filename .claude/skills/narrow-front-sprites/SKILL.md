---
name: narrow-front-sprites
description: >
  Create or replace Narrow Front / Gridlock unit sprites. Use when adding a
  unit, stance sheet, hull, turret, or hatch head, or when the user asks for
  sprites, facings, or a sprite sheet.
---

# Narrow Front unit sprites

Read and follow `narrow-front-sprite-agent-brief.md` in the repo root before generating or compositing any unit art.

Non-negotiable:

- **16 faces at 22.5°** for every unit sheet (infantry, vehicles, turret, hatch head). `UnitSpriteDef.dirs` is `16`.
- **One lock for the whole sheet:** camera (2:1 isometric), cell size, outline, palette, subject scale, contactY.
- **Preferred (3D):** 16 unique locked-camera frames. Frame 1 faces the camera (screen south), then clockwise 22.5° for 360°. Hull and turret are separate passes of the **same** camera — compose with `python tools/sprites/compose_blender_turntable.py` so they share one scale and offset (independent turret aim stays on the ring). Do not mirror 3D yaws.
- **2D fallback:** 9 unique yaws from a locked-camera turntable VIDEO of the east lock, then `compose_unit_sheet.py --unique-dir` mirrors the other 7. Do not edit-chain 16 stills. Do not trust a 3×3 still contact sheet.
- Sheet layout: **columns = animation frames, rows = 16 dirs.** Row 0 = screen east, clockwise. The compositor remaps south-first Blender sequences onto that order.
- Turret and hull stay separate sheets (runtime composite). Infantry swim / crouch / crawl stay separate sheets.
- Buildings are 4 cardinals. Tiles are 1. Do not 2D-rotate an isometric drawing to fake a yaw.

Cell sizes, remap table, 2D harvest, and the strip check live in the brief.
