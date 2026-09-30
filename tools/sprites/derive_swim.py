#!/usr/bin/env python3
"""Per-unit swim sheets, derived from each unit's own accepted stand yaws.

Every infantry type used to borrow the Rifleman's swim sheet. This gives each
one its own: the unit's stand still (same turntable, camera, outline, palette)
sunk to just under the belt in a pool of the Rifleman sheet's water.

  - scale: the unit's walk-sheet scale lock, measured (walk cell height over
    stand still height), so the swimmer is the same miniature as on land
  - placement: the legs' centre on the pool centre, 38% of the standing height
    under water
  - waterline: an iso ellipse fitted to the waist; anything below it is under
    water. The cut's last pixel goes to shadow, the water under it to foam.
  - pool: the Rifleman sheet's flat teal (#2a4b4d), anti-aliased edge, no
    outline, two ripple rings that grow over the 8 frames, plus a 1 px bob
  - W-side yaws are mirrors of the E side, like the stand sheets

The cyborg is rendered in 3D by render_cyborg.py and uses `in_water` and
`waist_half` from here, so every swimmer shares one pool.

Cell 96, 8 frames, contactY 0.68 (the swim sprite lock in sprites.ts).

  python tools/sprites/derive_swim.py                 # every unit below
  python tools/sprites/derive_swim.py --units gunner  # one unit
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True  # the compositor's .pyc is tracked; do not rewrite it
from compose_unit_sheet import (  # noqa: E402
    ENGINE_ORDER,
    MIRROR_OF,
    UNIQUE_ORDER,
    compose_sheet,
    diagnostics,
    key_magenta,
    opaque_bbox,
    preview_strip,
    preview_turntable,
)

ROOT = HERE.parent.parent
UNITS = ROOT / "gridlock/packages/client/src/assets/units"
SRC = HERE / "src"
PREVIEW = HERE / "preview"

CELL = 96
FRAMES = 8
CONTACT_Y = 0.68
# Pool, measured off infantry-swim.png.
POOL_C = (48.0, 47.5)
POOL_R = (38.5, 17.0)
WATER = (42, 75, 77)
RIPPLE = (96, 148, 146)
DEEP = (33, 62, 64)
FOAM = (112, 162, 158)
# Waterline: an iso ellipse around the waist, fitted to each body's width.
WL_Y = 47.0  # side level, the pool centre
WL_DIP = 0.3  # front dip, as a share of the waist half-width
WL_RISE = 0.3  # px the line rises per px out past the waist
# Share of the standing height under water.
SUNK = 0.38
SS = 4  # pool supersample

# unit: (stand-still dir, walk sheet)
HUMANS = {
    "gunner": ("gunner-stand", "gunner-walk.png"),
    "sniper": ("sniper-stand", "sniper-walk.png"),
    "atinfantry": ("atinfantry-stand", "atinfantry-walk.png"),
    "rocketer": ("rocketer-stand", "rocketer-walk.png"),
    "pyro": ("pyro-stand", "pyro-walk.png"),
    "mortarman": ("mortarman-stand", "mortarman-walk.png"),
    "medic": ("medic-stand", "medic-walk.png"),
    "droneop": ("droneop-stand", "droneop-walk.png"),
    "engineer": ("engineer", "engineer-walk.png"),
}


# ---------------------------------------------------------------- shared water


def bob_of(frame: int) -> int:
    """Body lift in px: up on the stroke, down between."""
    return 1 if math.sin(2 * math.pi * frame / FRAMES) > 0.35 else 0


def waist_half(body: np.ndarray, y: float = WL_Y) -> float:
    """Half-width of the body run through the pool centre on row `y`."""
    row = body[int(round(y)), :, 3] > 40
    cx = int(POOL_C[0])
    if not row[cx]:
        return 12.0
    left = cx
    while left > 0 and row[left - 1]:
        left -= 1
    right = cx
    while right < CELL - 1 and row[right + 1]:
        right += 1
    return float(np.clip(max(cx - left, right - cx) + 1, 8, 24))


def pool_layer(frame: int, half: float) -> Image.Image:
    """The pool with this frame's ripple rings. Symmetric about x = 48, so it mirrors clean."""
    big = Image.new("RGBA", (CELL * SS, CELL * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    cx, cy = POOL_C[0] * SS, POOL_C[1] * SS
    rx, ry = POOL_R[0] * SS, POOL_R[1] * SS
    d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=WATER + (255,))
    # Two rings, half a cycle apart, grow from the waist toward the rim and fade.
    a0, a1 = half + 3, POOL_R[0] - 4
    wy = WL_Y * SS
    for k in range(2):
        t = ((frame / FRAMES) + k * 0.5) % 1.0
        a = (a0 + (a1 - a0) * t) * SS
        b = a * 0.44
        fade = 0.85 * (1.0 - t)
        col = tuple(round(w + (r - w) * fade) for w, r in zip(WATER, RIPPLE)) + (255,)
        # Front arc only; the back half sits behind the swimmer.
        d.arc((cx - a, wy - b, cx + a, wy + b), 10, 170, fill=col, width=SS)
    # Still dark streaks near the rim.
    for x0, x1, y in ((-27, -18, 10), (16, 25, 11), (-6, 5, 14)):
        d.line((cx + x0 * SS, cy + y * SS, cx + x1 * SS, cy + y * SS), fill=DEEP + (255,), width=SS)
    return big.resize((CELL, CELL), Image.Resampling.LANCZOS)


def waterline(x: np.ndarray, half: float, dip: float = WL_DIP, cx: float = POOL_C[0]) -> np.ndarray:
    """Front of the waist dips; out past the waist the line rises, so a gun held
    low dips its muzzle under instead of running off the pool."""
    d = np.abs(x - cx)
    u = np.clip((x - cx) / half, -1, 1)
    front = np.where(d < half, np.sqrt(1 - u * u), 0.0)
    return WL_Y + dip * half * front - WL_RISE * np.maximum(0.0, d - half)


def in_water(body: Image.Image, frame: int, half: float, dip: float = WL_DIP) -> Image.Image:
    """Pool under the (already cut) body. Where a column meets the water, its last
    pixel goes to shadow and the water right under it to foam."""
    a = np.array(body)
    cellim = np.array(pool_layer(frame, half))
    solid = a[..., 3] > 40
    line = waterline(np.arange(CELL, dtype=float), half, dip)
    for x in range(CELL):
        ys = np.nonzero(solid[:, x])[0]
        if len(ys) == 0:
            continue
        y = int(ys.max())
        if line[x] - 3 <= y <= line[x] + 2:
            a[y, x, :3] = (a[y, x, :3] * 0.55).astype(np.uint8)
            if y + 1 < CELL and cellim[y + 1, x, 3] > 128:
                cellim[y + 1, x, :3] = FOAM
    out = Image.fromarray(cellim)
    out.alpha_composite(Image.fromarray(a))
    return out


# ---------------------------------------------------------------- human units


def load_still(d: Path, name: str) -> Image.Image:
    im = key_magenta(Image.open(d / f"{name}.png"))
    bb = opaque_bbox(im)
    return im.crop(bb)


def walk_scale(stills: dict[str, Image.Image], walk: Path) -> float:
    """Walk cell height over stand still height, median over the unique rows."""
    sheet = Image.open(walk).convert("RGBA")
    ratios = []
    for name in UNIQUE_ORDER:
        r = ENGINE_ORDER.index(name)
        bb = opaque_bbox(sheet.crop((0, r * CELL, CELL, (r + 1) * CELL)))
        if bb:
            ratios.append((bb[3] - bb[1]) / stills[name].height)
    return float(np.median(ratios))


def swim_cell(still: Image.Image, scale: float, frame: int) -> Image.Image:
    w = max(1, round(still.width * scale))
    h = max(1, round(still.height * scale))
    fig = np.array(still.resize((w, h), Image.Resampling.LANCZOS))
    # Legs' centre: the bottom quarter of the figure.
    legs = fig[int(h * 0.75):, :, 3] > 40
    lx = float(np.nonzero(legs)[1].mean()) if legs.any() else w / 2
    x0 = round(POOL_C[0] - lx)
    y0 = round(WL_Y + SUNK * h - h) - bob_of(frame)
    body = np.zeros((CELL, CELL, 4), dtype=np.uint8)
    sx0, sy0 = max(0, -x0), max(0, -y0)
    dx0, dy0 = max(0, x0), max(0, y0)
    cw = min(w - sx0, CELL - dx0)
    ch = min(h - sy0, CELL - dy0)
    body[dy0:dy0 + ch, dx0:dx0 + cw] = fig[sy0:sy0 + ch, sx0:sx0 + cw]
    # Under the waterline is under water.
    half = waist_half(body)
    ys = np.arange(CELL)[:, None]
    body[ys > waterline(np.arange(CELL, dtype=float), half)[None, :]] = 0
    return in_water(Image.fromarray(body), frame, half)


def derive(unit: str) -> dict:
    src_dir, walk = HUMANS[unit]
    stills = {n: load_still(SRC / src_dir, n) for n in UNIQUE_ORDER}
    scale = walk_scale(stills, UNITS / walk)
    placed: dict[str, list[Image.Image]] = {
        n: [swim_cell(stills[n], scale, f) for f in range(FRAMES)] for n in UNIQUE_ORDER
    }
    for dest, src in MIRROR_OF.items():
        placed[dest] = [im.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for im in placed[src]]
    return write_sheet(unit, placed, {"scale": round(scale, 4), "source": f"derive_swim.py from src/{src_dir}"})


def write_sheet(unit: str, placed: dict[str, list[Image.Image]], extra: dict) -> dict:
    rows = [placed[n] for n in ENGINE_ORDER]
    sheet = compose_sheet(rows, CELL)
    out = UNITS / f"{unit}-swim.png"
    sheet.save(out)
    first = {n: placed[n][0] for n in ENGINE_ORDER}
    diag = diagnostics(first, CELL)
    stem = out.stem
    PREVIEW.mkdir(parents=True, exist_ok=True)
    preview_turntable(first, CELL).save(PREVIEW / f"{stem}-turntable.png")
    preview_strip(sheet, CELL, FRAMES, 26).save(PREVIEW / f"{stem}-strip.png")
    manifest = {
        "id": stem,
        "cell": CELL,
        "cols": FRAMES,
        "rows": 16,
        "facing": 16,
        "order": ENGINE_ORDER,
        "contactY": CONTACT_Y,
        "out": str(out.relative_to(ROOT)),
        "size_pop_dirs": [d["dir"] for d in diag if d.get("pop")],
        "empty_dirs": [d["dir"] for d in diag if d.get("empty")],
        "diag": diag,
        **extra,
    }
    (PREVIEW / f"{stem}-manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"{stem}: {sheet.size} {extra} empty={manifest['empty_dirs']}")
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--units", default=",".join(HUMANS))
    args = ap.parse_args()
    status = 0
    for unit in args.units.split(","):
        m = derive(unit)
        if m["empty_dirs"]:
            status = 2
    return status


if __name__ == "__main__":
    raise SystemExit(main())
