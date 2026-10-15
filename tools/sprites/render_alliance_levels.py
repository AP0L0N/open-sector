#!/usr/bin/env python3
"""Alliance level sheets for the painted Barracks and Power Plant.

The Barracks (muster.png) and the Power Plant (dynamo.png) are painted sheets with no
generator of their own. Each researched level (catalog RESEARCH, client LEVEL_SHEETS) is the
painted sheet with that level's add-ons drawn over it, in the inked mesh style of
render_airfield.py, on a camera fitted to the painting: 3 source px per world px across like
every other t(2) sheet, but a deeper ground (RY 0.6 of that, not 0.5). Add-ons stand only on
open slab in front of the building or on its roof, so nothing has to hide behind the paint.

  Barracks   advanced  Advanced Training: a row of man targets on the range, a rifle rack.
             special   Special Forces: also a lattice jump tower with a lamp, and an uplink on the hut.
  Power Plant turbine  Gas Turbines: two gas tanks on saddles piped into the hall, an exhaust stack.
             fission   Fission Reactor: also a cooling tower at the front corner and a containment dome.

Writes <type>-<level>.png beside the base sheet, a .json with the same pad metrics the client
uses for the base (sprites.ts) plus the add-ons' light spots, and a 96 px cameo.

  python tools/sprites/render_alliance_levels.py
  python tools/sprites/render_alliance_levels.py --only muster --preview /tmp/levels.png
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_airfield as ra

ROOT = Path(__file__).resolve().parents[2]
BUILDINGS = ROOT / "gridlock/packages/client/src/assets/buildings"

W = H = 64.0  # t(2) footprint, world px
ra.ZOOM = 3.0
SS = ra.SS
RY = 0.6  # ground depth per world px, as a share of the across scale: the painting's camera

# Per sheet: where the pad's south corner sits (ground level) and the client's metrics (sprites.ts).
SHEETS = {
    "muster": {"south": (194.5, 327.0), "pad": (385.0, 194.5, 333.0, 278.0, 52.0), "levels": ["advanced", "special"]},
    "dynamo": {"south": (194.5, 286.0), "pad": (384.0, 194.0, 291.0, 98.0, 30.0), "levels": ["turbine", "fission"]},
}


class PaintCanvas(ra.Canvas):
    """ra.Canvas on the painted sheets' camera: the ground is deeper than 2:1."""

    def to_screen(self, P: np.ndarray):
        X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
        k = ra.ZOOM * SS
        sx = self.ox + (X - Y) * k
        sy = self.oy + (X + Y) * RY * k - Z * k
        return sx, sy, X + Y + Z


def canvas_for(size: tuple[int, int], south: tuple[float, float]) -> PaintCanvas:
    k = ra.ZOOM * SS
    ox = south[0] * SS
    oy = south[1] * SS - (W + H) * RY * k
    return PaintCanvas(size[0] * SS, size[1] * SS, ox, oy)


def rgb(h: str) -> np.ndarray:
    return ra.rgb(h)


_base_tex = ra.tex


def tex(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    nf = ra.vnoise(X / 1.1 + Z * 0.7, Y / 1.1 - Z * 0.5, 7)
    nm = ra.fbm(X / 6 + Z * 0.2, Y / 6 + Z * 0.3, 9, 3)

    def base(h):
        return np.broadcast_to(rgb(h), (len(X), 3)).copy()

    if mat == "olive":
        # The painted buildings' olive drab, a shade brighter than the Machine Shop's plate.
        return base("#55613d") * (0.9 + 0.14 * nm[:, None]) * (0.95 + 0.08 * nf[:, None])
    if mat == "olive_dark":
        return base("#3a4430") * (0.9 + 0.14 * nm[:, None])
    if mat == "board":
        # Plywood target: a dark man shape on pale board (the shape comes from its own part).
        return base("#cdb68a") * (0.9 + 0.12 * nf[:, None])
    if mat == "figure":
        return base("#2b2a24") * (0.9 + 0.12 * nf[:, None])
    if mat == "ring":
        return base("#c4332a") * (0.92 + 0.1 * nf[:, None])
    if mat == "rifle":
        return base("#3d3426") * (0.9 + 0.2 * nf[:, None])
    if mat == "tank":
        # Pale gas tanks with a hoop every few px.
        c = base("#c9c6b4") * (0.9 + 0.1 * nm[:, None])
        c[np.mod(Y, 5.0) < 0.35] *= 0.8
        return c
    if mat == "hazard":
        stripe = np.floor((X + Y + Z) / 1.2) % 2 == 0
        c = base("#1d1a14")
        c[stripe] = rgb("#d4a017")
        return c
    if mat == "tower":
        # Cooling tower shell: poured rings, darker toward the foot.
        c = base("#b9b8ac") * (0.88 + 0.12 * nm[:, None])
        c[np.mod(Z, 2.4) < 0.25] *= 0.86
        return c * (0.82 + 0.18 * np.clip(Z / 18.0, 0, 1))[:, None]
    if mat == "throat":
        return base("#2a2622")
    if mat == "steam":
        return base("#f6f2e6")
    if mat == "dome":
        return base("#a9aca0") * (0.9 + 0.1 * nm[:, None])
    if mat == "pipe":
        return base("#6d6e66") * (0.9 + 0.16 * nf[:, None])
    if mat == "soot":
        return base("#1f1d1a") * (0.9 + 0.2 * nf[:, None])
    if mat == "radio":
        return base("#4a4c46") * (0.9 + 0.14 * nm[:, None])
    return _base_tex(mat, P, n)


ra.tex = tex


# ---------------------------------------------------------------- Barracks


def target(m: ra.Mesh, x: float, y: float) -> None:
    """A man target on two stakes, facing the camera's right (+x)."""
    m.box((x - 0.3, y - 1.9, 0), (x + 0.3, y - 1.4, 7.6), "wood")
    m.box((x - 0.3, y + 1.4, 0), (x + 0.3, y + 1.9, 7.6), "wood")
    m.box((x - 0.2, y - 2.2, 2.4), (x + 0.2, y + 2.2, 8.6), "board")
    # Head and shoulders, then the red ring on the chest.
    m.box((x + 0.2, y - 1.5, 3.0), (x + 0.4, y + 1.5, 6.4), "figure")
    m.cyl((x + 0.2, y, 6.4), (x + 0.2, y, 8.0), 0.9, 0.8, "figure", n=10)
    m.cyl((x + 0.4, y, 4.8), (x + 0.6, y, 4.8), 0.9, 0.9, "ring", n=12, part=False)


def rifle_rack(m: ra.Mesh, x0: float, x1: float, y: float) -> None:
    """A rifle rack facing the camera's left (+y): a frame, its rail, and rifles leant on it."""
    for x in (x0, x1):
        m.box((x - 0.35, y - 0.35, 0), (x + 0.35, y + 0.35, 5.0), "wood")
    m.box((x0, y - 0.3, 4.4), (x1, y + 0.3, 5.0), "wood")
    m.box((x0, y - 1.2, 0.2), (x1, y + 0.6, 0.8), "wood")
    for i in range(int((x1 - x0) / 1.3)):
        rx = x0 + 0.8 + i * 1.3
        m.box((rx - 0.22, y + 0.1, 0.8), (rx + 0.22, y + 0.5, 5.6), "rifle")


def jump_tower(m: ra.Mesh, cx: float, cy: float, top: float) -> dict:
    """A four-legged lattice tower with a railed platform and a red lamp: the jump school."""
    r0, r1 = 3.6, 2.4
    legs = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    for sx, sy in legs:
        m.cyl((cx + sx * r0, cy + sy * r0, 0), (cx + sx * r1, cy + sy * r1, top), 0.35, 0.3, "steel", n=6)
    for z in (top * 0.33, top * 0.66):
        f = z / top
        r = r0 + (r1 - r0) * f
        for (ax, ay), (bx, by) in zip(legs, legs[1:] + legs[:1]):
            m.cyl((cx + ax * r, cy + ay * r, z), (cx + bx * r, cy + by * r, z), 0.2, 0.2, "steel", n=5, part=False)
    m.box((cx - r1 - 0.8, cy - r1 - 0.8, top), (cx + r1 + 0.8, cy + r1 + 0.8, top + 0.6), "wood")
    for sx, sy in legs:
        m.cyl((cx + sx * (r1 + 0.6), cy + sy * (r1 + 0.6), top + 0.6), (cx + sx * (r1 + 0.6), cy + sy * (r1 + 0.6), top + 3.0), 0.18, 0.18, "steel", n=5, part=False)
    m.box((cx - r1 - 0.7, cy + r1 + 0.4, top + 2.6), (cx + r1 + 0.7, cy + r1 + 0.8, top + 3.0), "steel", part=False)
    m.box((cx + r1 + 0.4, cy - r1 - 0.7, top + 2.6), (cx + r1 + 0.8, cy + r1 + 0.7, top + 3.0), "steel", part=False)
    # A boom over the side with the drop line, and the lamp on a post.
    m.box((cx + r1, cy - 0.3, top + 3.4), (cx + r1 + 5.0, cy + 0.3, top + 4.0), "steel")
    m.cyl((cx + r1 + 4.6, cy, top + 3.4), (cx + r1 + 4.6, cy, 3.0), 0.12, 0.12, "metal", n=4, part=False)
    m.cyl((cx - r1, cy - r1, top + 0.6), (cx - r1, cy - r1, top + 5.4), 0.2, 0.2, "steel", n=5)
    m.cyl((cx - r1, cy - r1, top + 5.4), (cx - r1, cy - r1, top + 6.4), 0.55, 0.55, "lamp", n=8)
    return {"lamp": (cx - r1, cy - r1, top + 5.9)}


def uplink(m: ra.Mesh, x: float, y: float, z: float) -> dict:
    """Whip antennas and a small dish on a box on the hut's roof."""
    m.box((x - 1.6, y - 1.2, z - 1.0), (x + 1.6, y + 1.2, z + 1.4), "radio")
    for dx in (-1.1, 1.1):
        m.cyl((x + dx, y, z + 1.4), (x + dx, y, z + 13.0), 0.14, 0.08, "steel", n=4)
    m.cyl((x, y + 0.6, z + 1.4), (x, y + 0.6, z + 4.4), 0.3, 0.3, "steel", n=6)
    m.cyl((x - 0.2, y + 1.0, z + 5.2), (x + 0.6, y + 1.8, z + 5.6), 2.2, 2.4, "metal", n=16)
    m.cyl((x + 0.9, y + 2.1, z + 5.7), (x + 0.9, y + 2.1, z + 6.1), 0.25, 0.25, "lamp", n=6, part=False)
    return {"uplink": (x + 1.1, y, z + 13.0)}


def muster_mesh(level: int) -> tuple[ra.Mesh, dict]:
    m = ra.Mesh()
    spots: dict = {}
    for y in (22.0, 29.0, 36.0):
        target(m, 61.0, y)
    rifle_rack(m, 44.0, 52.0, 61.5)
    if level >= 2:
        spots |= jump_tower(m, 57.0, 52.0, 22.0)
        spots |= uplink(m, 26.0, 30.0, 33.0)
    return m, spots


# ---------------------------------------------------------------- Power Plant


def gas_tank(m: ra.Mesh, x: float, y0: float, y1: float, z: float, r: float) -> None:
    """A horizontal gas tank along y on two concrete saddles, a valve on top."""
    for sy in (y0 + 2.0, y1 - 2.0):
        m.box((x - r * 0.8, sy - 0.8, 0), (x + r * 0.8, sy + 0.8, z - r * 0.5), "concrete")
    m.cyl((x, y0, z), (x, y1, z), r, r, "tank", n=18)
    m.cyl((x, y0 - 0.5, z), (x, y0, z), r * 0.7, r * 0.9, "tank", n=18, part=False)
    m.cyl((x, y1, z), (x, y1 + 0.5, z), r * 0.9, r * 0.7, "tank", n=18, part=False)
    m.cyl((x, (y0 + y1) / 2, z + r), (x, (y0 + y1) / 2, z + r + 1.2), 0.4, 0.4, "pipe", n=8)
    m.box((x - 0.8, (y0 + y1) / 2 - 0.2, z + r + 1.2), (x + 0.8, (y0 + y1) / 2 + 0.2, z + r + 1.6), "ring")


def dynamo_mesh(level: int) -> tuple[ra.Mesh, dict]:
    m = ra.Mesh()
    spots: dict = {}
    # Gas Turbines: two tanks on the right-hand strip, a feed pipe into the hall's side.
    gas_tank(m, 59.5, 12.0, 26.0, 4.6, 3.0)
    gas_tank(m, 59.5, 29.0, 43.0, 4.6, 3.0)
    m.cyl((59.5, 26.0, 9.0), (59.5, 29.0, 9.0), 0.45, 0.45, "pipe", n=8)
    m.cyl((59.5, 27.5, 9.0), (54.0, 27.5, 9.0), 0.45, 0.45, "pipe", n=8)
    # The turbines' exhaust stack at the front of the strip, banded, a lamp on its lip.
    m.box((57.5, 46.0, 0), (62.0, 50.5, 2.2), "concrete")
    m.cyl((59.8, 48.2, 2.2), (59.8, 48.2, 24.0), 1.6, 1.25, "radio", n=14)
    for z in (8.0, 16.0):
        m.cyl((59.8, 48.2, z), (59.8, 48.2, z + 0.8), 1.5, 1.45, "hazard", n=14, part=False)
    m.cyl((59.8, 48.2, 24.0), (59.8, 48.2, 25.0), 1.4, 1.4, "soot", n=14)
    m.cyl((61.0, 48.2, 25.0), (61.0, 48.2, 25.8), 0.35, 0.35, "lamp", n=6, part=False)
    spots["stackLamp"] = (61.0, 48.2, 25.6)
    if level >= 2:
        # Fission Reactor: a squat cooling tower at the front corner, its throat lit from below.
        cx, cy = 55.5, 57.0
        m.cyl((cx, cy, 0), (cx, cy, 9.0), 7.4, 5.4, "tower", n=28, caps=False)
        m.cyl((cx, cy, 9.0), (cx, cy, 17.0), 5.4, 6.0, "tower", n=28, caps=False)
        m.cyl((cx, cy, 16.6), (cx, cy, 17.0), 5.6, 5.6, "throat", n=28, part=False)
        m.cyl((cx, cy, 17.0), (cx, cy, 18.0), 4.6, 3.2, "steam", n=20)
        m.cyl((cx, cy, 18.0), (cx, cy, 19.6), 3.2, 1.6, "steam", n=20, part=False)
        spots["tower"] = (cx, cy, 17.5)
        # The containment dome on the left strip, a hazard band round its foot.
        dx, dy = 24.0, 59.0
        m.cyl((dx, dy, 0), (dx, dy, 1.6), 4.6, 4.6, "hazard", n=24)
        for i in range(5):
            z0 = 1.6 + 4.2 * math.sin(math.pi / 2 * i / 5)
            z1 = 1.6 + 4.2 * math.sin(math.pi / 2 * (i + 1) / 5)
            r0 = 4.4 * math.cos(math.pi / 2 * i / 5)
            r1 = max(0.2, 4.4 * math.cos(math.pi / 2 * (i + 1) / 5))
            m.cyl((dx, dy, z0), (dx, dy, z1), r0, r1, "dome", n=24, caps=False, part=False)
        m.cyl((dx, dy, 5.6), (dx, dy, 6.4), 0.4, 0.4, "lamp", n=6, part=False)
        spots["dome"] = (dx, dy, 6.1)
    return m, spots


# ---------------------------------------------------------------- render


def overlay(mesh: ra.Mesh, cv: PaintCanvas) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """The add-ons drawn and inked at SS, plus a soft contact shade on the ground round them."""
    fr = ra.rasterize(mesh, cv)
    ra.ink(fr, SS)
    ra.silhouette(fr, SS)
    ao = ra.contact_ao(mesh, cv)
    return fr.color, fr.alpha, ao


def compose(name: str, level: int) -> tuple[Image.Image, dict]:
    sheet = SHEETS[name]
    base = Image.open(BUILDINGS / f"{name}.png").convert("RGBA")
    cv = canvas_for(base.size, sheet["south"])
    mesh, spots = (muster_mesh if name == "muster" else dynamo_mesh)(level)
    color, alpha, ao = overlay(mesh, cv)
    add = ra.downsample(color, alpha, SS)
    shade = Image.fromarray((np.clip(ao * 0.28, 0, 0.28) * 255).astype(np.uint8), "L").resize(base.size, Image.BOX)
    out = base.copy()
    # Darken the painting under and round each add-on, only where the painting is opaque.
    dark = Image.new("RGBA", base.size, (26, 20, 16, 0))
    dark.putalpha(Image.fromarray((np.asarray(shade, dtype=np.float64) * (np.asarray(base.getchannel("A")) / 255.0)).astype(np.uint8)))
    out.alpha_composite(dark)
    out.alpha_composite(add)
    k = ra.ZOOM * SS

    def at(p):
        sx, sy, _ = cv.to_screen(np.array([p], dtype=np.float64))
        return [round(float(sx[0]) / SS, 1), round(float(sy[0]) / SS, 1)]

    pw, psx, psy, stx, sty = sheet["pad"]
    info = {"padWidth": pw, "padSouthX": psx, "padSouthY": psy, "stackX": stx, "stackY": sty, "size": list(out.size)}
    for key, p in spots.items():
        info[key] = at(p)
    del k
    return out, info


def cameo(img: Image.Image) -> Image.Image:
    cam = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    bb = img.getbbox()
    if bb:
        crop = img.crop(bb)
        f = min(92 / crop.width, 92 / crop.height)
        crop = crop.resize((max(1, round(crop.width * f)), max(1, round(crop.height * f))), Image.Resampling.LANCZOS)
        cam.alpha_composite(crop, ((96 - crop.width) // 2, (96 - crop.height) // 2))
    return cam


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="muster or dynamo")
    ap.add_argument("--out", default=str(BUILDINGS), help="where to write (default: the buildings assets)")
    ap.add_argument("--preview", help="also write the base and its levels side by side here")
    args = ap.parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    row: list[Image.Image] = []
    for name, sheet in SHEETS.items():
        if args.only and name != args.only:
            continue
        row.append(Image.open(BUILDINGS / f"{name}.png").convert("RGBA"))
        for i, lv in enumerate(sheet["levels"]):
            img, info = compose(name, i + 1)
            img.save(out_dir / f"{name}-{lv}.png", optimize=True)
            (out_dir / f"{name}-{lv}.json").write_text(json.dumps(info, indent=2) + "\n")
            cameo(img).save(out_dir / f"{name}-{lv}-cameo.png")
            row.append(img)
            print("wrote", out_dir / f"{name}-{lv}.png", info)
    if args.preview and row:
        w = sum(im.width for im in row) + 8 * len(row)
        h = max(im.height for im in row)
        sheet_im = Image.new("RGBA", (w, h), (120, 128, 110, 255))
        x = 0
        for im in row:
            sheet_im.alpha_composite(im, (x, 0))
            x += im.width + 8
        sheet_im.save(args.preview)


if __name__ == "__main__":
    main()
