# Unit sprite pipeline

Authoritative how-to: repo-root `narrow-front-sprite-agent-brief.md`.

**Standard (3D / Blender):** 16 unique locked-camera frames, south-first, clockwise 22.5°. `0001` = south, `0016` = last unique yaw (a 17th file would equal `0001`). Hull and turret share one transform. Top-down: N up, E right.

```
blender 16-dir (0001 = south, clockwise 22.5°, 0016 unique; 0017 = 0001, omit)
  → drop 0001.png–0016.png in the unit folder (engine uses names as-is)
  → optional compose_blender_turntable.py for a preview sheet
```

**2D fallback:** 9 unique yaws + mirror.

```
east lock (image_gen)
  → turntable video (image_to_video, camera locked)
  → ffmpeg fps=8
  → harvest_turntable.py   (9 unique yaws)
  → compose_unit_sheet.py  (scale-lock, mirror 7, engine PNG)
```

## Commands

```bash
# In-game drop folder (preferred): overwrite 0001.png–0016.png and reload.
#   gridlock/packages/client/src/assets/units/tiger/hull/0001.png
#   gridlock/packages/client/src/assets/units/tiger/turret/0001.png
# 0001 = world south (screen down), clockwise 22.5°, 0016 unique (0017 = 0001, omit). Mapping: src/render/turntable.ts
# Optional offline preview from the same files:
python tools/sprites/compose_blender_turntable.py \
    --src gridlock/packages/client/src/assets/units/tiger \
    --hull-subdir hull --turret-subdir turret \
    --id tiger --cell 128 --contact-y 0.92 --padding 4 \
    --out-hull /tmp/tiger-hull.png \
    --out-turret /tmp/tiger-turret.png \
    --out-cameo /tmp/tiger-cameo.png

# 2D 1-frame vehicle / turret / head
python tools/sprites/harvest_turntable.py \
  --frames-dir tools/sprites/work/<id>-turn \
  --picks E=1,ESE=2,SE=3,SSE=4,S=5,N=25,NNE=28,NE=32,ENE=34 \
  --out-dir tools/sprites/src/<id>

python tools/sprites/compose_unit_sheet.py \
  --unique-dir tools/sprites/src/<id> \
  --cell <96|128|48|192> --contact-y <from brief> --padding 8 \
  --out gridlock/packages/client/src/assets/units/<file>.png \
  --draw-size <gameplay px>

# turret (cyan pivot, 2D)
python tools/sprites/compose_unit_sheet.py \
  --unique-dir tools/sprites/src/<id> \
  --cell 128 --pivot cyan --pivot-y 0.58 --padding 4 \
  --out gridlock/packages/client/src/assets/units/<file>.png

# infantry 8-frame strips (E.png is a horizontal strip)
python tools/sprites/compose_unit_sheet.py \
  --strips-dir tools/sprites/src/<id> \
  --cell 96 --frames 8 --contact-y <from brief> \
  --out gridlock/packages/client/src/assets/units/<file>.png
```

Previews land in `tools/sprites/preview/`: 4×4 labeled turntable, gameplay strip, JSON manifest.

`size_pop_dirs` is a fail for hulls and standing infantry. It is expected for turrets (gun axis) and prone crawl (silhouette).
