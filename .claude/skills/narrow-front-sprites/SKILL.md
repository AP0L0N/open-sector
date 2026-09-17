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
- **One lock for the whole sheet:** camera (2:1 isometric), cell size, outline, palette, subject scale, contactY. Adjacent rows must not pop in size or style.
- Sheet layout: **columns = animation frames, rows = 16 dirs.** Row 0 = screen east, clockwise.
- Buildings are 4 cardinals. Tiles are 1. Do not 2D-rotate an isometric drawing to fake a yaw.

Cell sizes, row order, edit-chain steps, and the strip check live in the brief. Do not invent an 8-dir unit sheet.