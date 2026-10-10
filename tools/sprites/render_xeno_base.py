#!/usr/bin/env python3
"""Xenomorph base buildings: Hive Core, Fusion Node, Assimilator, Conversion Chamber,
Nanite Forge, Neural Nexus, Aerie.

Each writes <id>.png, <id>-cameo.png (96 px), and <id>.json (pad metrics plus
glow spots, source px in the image frame) into the buildings asset folder.

  hivecore     t(3) x t(3)  the Xenomorph HQ: a ribbed hive dome in a crown of
                            ringed spines, a great glowing iris on its face
  fusionnode   t(2) x t(2)  power: two coil spires on a plinth, a plasma
                            core held between their tips over a glowing well
  assimilator  t(3) x t(3)  scrap: a crawling claw-rig on four legs straddling
                            a glowing intake pit, a feed silo beside it
  conversion   t(2) x t(2)  infantry: a low chitin dome ringed with glass pods,
                            a taken body standing dark in each, under a
                            synapse spire with a neural bulb
  forge        t(3) x t(3)  ground units: a telescoping chitin vault, a lit maw,
                            nanite vats, a crane arm lowering a walker pod
  nexus        t(2) x t(2)  a brain in a rib cage under a sensor crown
  aerie        t(3) x t(3)  air: a segmented brood spire in an exoskeleton of
                            ribs, bat-wing membrane fins either side, a flared
                            launch maw on top with a glowing birth membrane and
                            hooked claws round its rim (the hovering fliers lift
                            straight up out of it), three brood cradles with
                            glowing sacs on the pad in front

Look: forked from render_cyborgcentral.py, so the inked structure style of
render_airfield.py (mesh, raster, ink, silhouette, key light, cast shadow),
the same gunmetal palette family and the same concrete pad. The Xenomorph glow is
cyan-green, as on the Seed (render_seed.py). Pad scale matches the shipped
sheets: a t(3) footprint at zoom 2 and a t(2) at zoom 3 both give a 384 px
pad, like core.png, smelter.png, and dynamo.png.

  python tools/sprites/render_xeno_base.py --out gridlock/packages/client/src/assets/buildings
  python tools/sprites/render_xeno_base.py --out ... --only hivecore
  python tools/sprites/render_xeno_base.py --out ... --only aerie
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_airfield as ra

SS = ra.SS
SIDE_MARGIN = 6.0
HEADROOM = 4.0  # world px above the highest point

GLOW = "#3fe8b8"  # seams and rings
CORE = "#86ffd9"  # the hot cores
EMISSIVE = ("glow", "core", "iris", "pit", "hot")


def rgb(h: str) -> np.ndarray:
    return ra.rgb(h)


# Iris frame for the Hive Core's eye texture: centre and axis, set by the builder.
IRIS: dict[str, np.ndarray] = {}
PIT: dict[str, float] = {}

_base_tex = ra.tex


def _flat(n: np.ndarray) -> float:
    """The key-light shade the rasterizer will apply; emissive colours divide it back out."""
    lam = max(0.0, float(np.dot(n, ra.LIGHT)))
    return 0.5 + 0.62 * lam


def tex(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    nf = ra.vnoise(X / 1.1 + Z * 0.7, Y / 1.1 - Z * 0.5, 7)
    nm = ra.fbm(X / 6 + Z * 0.2, Y / 6 + Z * 0.3, 9, 3)
    along = X if abs(n[1]) >= abs(n[0]) else Y

    def base(h):
        return np.broadcast_to(rgb(h), (len(X), 3)).copy()

    if mat == "slab":
        c = base("#a9aea4") * (0.9 + 0.12 * nm[:, None]) * (0.96 + 0.06 * nf[:, None])
        joint = (np.abs(np.mod(X, 16.0) - 8.0) > 7.7) | (np.abs(np.mod(Y, 16.0) - 8.0) > 7.7)
        if abs(n[2]) > 0.7:
            c[joint] *= 0.74
        return c
    if mat == "steel":
        # Gunmetal hull plate: horizontal plate lines, grime low down.
        c = base("#4c5258") * (0.9 + 0.14 * nm[:, None]) * (0.95 + 0.08 * nf[:, None])
        if abs(n[2]) < 0.75:
            c[np.mod(Z, 3.2) < 0.3] *= 0.72
        grime = ra.smooth(0.65, 0.9, ra.fbm(X / 3, Y / 3 + Z, 23))
        return ra.mix(c, base("#33302e"), grime * 0.3)
    if mat == "ribbed":
        # Vertical ribs: the hive's shell and the spires.
        c = base("#5b636a") * (0.9 + 0.14 * nm[:, None]) * (0.95 + 0.08 * nf[:, None])
        ang = np.arctan2(Y - RIB_C[1], X - RIB_C[0])
        rib = np.mod(ang * RIB_N / (2 * np.pi), 1.0) < 0.18
        c[rib] *= 0.68
        return c
    if mat == "steel_dark":
        return base("#2e3236") * (0.9 + 0.14 * nm[:, None])
    if mat == "roof":
        return base("#5a5f63") * (0.9 + 0.12 * nm[:, None]) * (0.96 + 0.06 * nf[:, None])
    if mat == "spine":
        c = base("#3a3f44") * (0.9 + 0.16 * nf[:, None])
        return c
    if mat == "pipe":
        return base("#6a6c68") * (0.9 + 0.16 * nf[:, None])
    if mat == "coil":
        # Dark wound coil with bright gaps between the turns.
        c = base("#3d4246") * (0.9 + 0.12 * nf[:, None])
        c[np.mod(Z, 1.6) < 0.35] = rgb("#22262a")
        return c
    if mat == "scrap":
        c = ra.mix(base("#5a4a3c"), base("#7a5134"), ra.smooth(0.4, 0.8, nm))
        return c * (0.8 + 0.3 * nf[:, None])
    if mat == "hazard":
        stripe = np.floor((X + Y + Z) / 1.4) % 2 == 0
        c = base("#1d1a14")
        c[stripe] = rgb("#d4a017")
        return c
    # ---- emissive: divide out the key light so the glow reads on the shaded side too.
    s = _flat(n)
    if mat == "glow":
        return base(GLOW) * (0.92 + 0.12 * nf[:, None]) / s
    if mat == "core":
        c = base(CORE) * (0.9 + 0.14 * nf[:, None])
        c[np.mod(Z, 2.6) < 0.3] = rgb("#2fbf97")
        return c / s
    if mat == "hot":
        return base("#e6fff4") / s
    if mat == "iris":
        c0, ax = IRIS["c"], IRIS["a"]
        u = np.cross(ax, np.array([0.0, 0.0, 1.0]))
        u /= np.linalg.norm(u)
        w = np.cross(ax, u)
        d = P - c0
        pu, pw = d @ u, d @ w
        rad = np.hypot(pu, pw) / IRIS["r"]
        ang = np.arctan2(pw, pu)
        # Six shutter blades, swept, with a bright pupil and a dim outer ring.
        blade = np.mod(ang * 6 / (2 * np.pi) + rad * 0.7, 1.0) < 0.12
        c = ra.mix(base("#e6fff4"), base("#2fd4a4"), np.clip(rad * 1.3, 0, 1))
        c[blade & (rad > 0.28)] = rgb("#14463a")
        c[rad > 0.88] = rgb("#1f6b58")
        return c / s
    if mat == "pit":
        # Molten feedstock: bright swirl, dark scrap floating in it.
        r = np.hypot(X - PIT["x"], Y - PIT["y"]) / PIT["r"]
        a = np.arctan2(Y - PIT["y"], X - PIT["x"])
        swirl = 0.5 + 0.5 * np.sin(a * 3 + r * 9)
        c = ra.mix(base("#2fd8a4"), base("#c8fff0"), np.clip((1 - r) * 0.8 + swirl * 0.25, 0, 1))
        chunk = ra.smooth(0.62, 0.7, ra.fbm(X / 2.2, Y / 2.2, 41)) * ra.smooth(0.3, 0.6, r)
        c = ra.mix(c, base("#24302c"), chunk)
        return c / s
    return _base_tex(mat, P, n)


ra.tex = tex

RIB_C = (0.0, 0.0)
RIB_N = 24


# ---------------------------------------------------------------- shapes


def axis_point(a, b, t: float) -> np.ndarray:
    a = np.asarray(a, float)
    b = np.asarray(b, float)
    return a + (b - a) * t


def collar(m: ra.Mesh, a, b, t: float, r: float, half: float, mat: str) -> None:
    """A short ring around the a-b shaft at fraction t."""
    a = np.asarray(a, float)
    b = np.asarray(b, float)
    d = (b - a) / np.linalg.norm(b - a)
    p = axis_point(a, b, t)
    m.cyl(p - d * half, p + d * half, r, r, mat, n=10)


def ball(m: ra.Mesh, c, r: float, mat: str, rings: int = 6, n: int = 14, squash: float = 1.0) -> None:
    """A sphere from stacked frusta, one part."""
    m.new_part()
    cx, cy, cz = c
    for i in range(rings):
        a0 = -math.pi / 2 + math.pi * i / rings
        a1 = -math.pi / 2 + math.pi * (i + 1) / rings
        z0, z1 = cz + r * squash * math.sin(a0), cz + r * squash * math.sin(a1)
        r0, r1 = max(r * math.cos(a0), 0.05), max(r * math.cos(a1), 0.05)
        m.cyl((cx, cy, z0), (cx, cy, z1), r0, r1, mat, n=n, caps=False, part=False)


def dome(m: ra.Mesh, cx: float, cy: float, z0: float, r: float, h: float, bands: int, mat: str, seam: str, n: int = 28) -> list[float]:
    """A ribbed dome of `bands` shell rings with a thin glowing seam between each. Returns band tops."""
    tops = []
    gap = 0.06
    for i in range(bands):
        t0 = i / bands
        t1 = (i + 1) / bands
        if i > 0:
            # Seam: a thin glowing ring, a touch inside the shell.
            ts = t0
            te = t0 + gap / bands * 4
            rs = r * math.sqrt(max(0.0, 1 - ts * ts)) * 0.97
            re = r * math.sqrt(max(0.0, 1 - te * te)) * 0.97
            m.cyl((cx, cy, z0 + h * ts), (cx, cy, z0 + h * te), rs, re, seam, n=n, caps=False)
            t0 = te
        r0 = r * math.sqrt(max(0.0, 1 - t0 * t0))
        r1 = max(r * math.sqrt(max(0.0, 1 - t1 * t1)), 0.4)
        # Shell band with a proud lower lip.
        m.cyl((cx, cy, z0 + h * t0), (cx, cy, z0 + h * t1), r0 * 1.03, r1, mat, n=n, caps=(i == bands - 1))
        tops.append(z0 + h * t1)
    return tops


def make_canvas(mesh: ra.Mesh, W: float, H: float) -> ra.Canvas:
    k = ra.ZOOM * SS
    verts = np.array(mesh.verts)
    # Highest screen point of the mesh, measured from the north corner (0, 0, 0).
    top = float(np.max(verts[:, 2] - (verts[:, 0] + verts[:, 1]) * 0.5)) + HEADROOM
    top = max(top, SIDE_MARGIN)
    left = -(H + SIDE_MARGIN) * k
    right = (W + SIDE_MARGIN) * k
    bottom = ((W + H) * 0.5 + SIDE_MARGIN) * k
    w = int(math.ceil((right - left) / SS)) * SS
    h = int(math.ceil((bottom + top * k) / SS)) * SS
    return ra.Canvas(w, h, -left, top * k)


def screen(cv: ra.Canvas, x: float, y: float, z: float) -> list[float]:
    sx, sy, _ = cv.to_screen(np.array([[x, y, z]]))
    return [round(float(sx[0]) / SS, 1), round(float(sy[0]) / SS, 1)]


def render_building(out_dir: Path, bid: str, W: float, H: float, zoom: float, build, spots) -> None:
    ra.ZOOM = zoom
    props = build(False)
    full = build(True)
    cv = make_canvas(full, W, H)
    print(bid, "canvas", cv.w // SS, "x", cv.h // SS)

    sh = ra.shadow_mask(props, cv)
    ao = ra.contact_ao(props, cv)
    fr = ra.rasterize(full, cv)
    ra.ink(fr, SS)
    ra.silhouette(fr, SS)
    ys, xs = np.mgrid[0 : cv.h, 0 : cv.w].astype(np.float64) + 0.5
    gx, gy = cv.to_world_ground(xs, ys)
    near = (gx > -3) & (gx < W + 3) & (gy > -3) & (gy < H + 3)
    shadow = np.clip(sh * 0.42 + ao * 0.12, 0, 0.6) * near
    solid = fr.alpha > 0.5
    c = fr.color
    glowing = (c[..., 1] > 0.55) & (c[..., 1] > c[..., 0] * 1.4)
    up = solid & (fr.normal[..., 2] > 0.7) & ~glowing
    color = fr.color.copy()
    color[up] *= (1 - shadow[up])[:, None]
    alpha = fr.alpha.copy()
    outside = ~solid & (shadow > 0.02)
    color[outside] = ra.OUTLINE * 0.4
    alpha[outside] = shadow[outside]
    img = ra.downsample(color, alpha, SS)

    out_dir.mkdir(parents=True, exist_ok=True)
    img.save(out_dir / f"{bid}.png", optimize=True)

    south = screen(cv, W, H, 0.0)
    info = {
        "padWidth": round((W + H) * ra.ZOOM, 1),
        "padSouthX": south[0],
        "padSouthY": south[1],
        "size": list(img.size),
    }
    for key, pts in spots.items():
        if key == "stack":
            info["stackX"], info["stackY"] = screen(cv, *pts)
        elif isinstance(pts, tuple):
            info[key] = screen(cv, *pts)
        else:
            info[key] = [screen(cv, *p) for p in pts]
    (out_dir / f"{bid}.json").write_text(json.dumps(info, indent=2) + "\n")
    print("wrote", out_dir / f"{bid}.png", info)

    cam = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    bb = img.getbbox()
    if bb:
        crop = img.crop(bb)
        f = min(92 / crop.width, 92 / crop.height)
        crop = crop.resize((max(1, round(crop.width * f)), max(1, round(crop.height * f))), Image.Resampling.LANCZOS)
        cam.alpha_composite(crop, ((96 - crop.width) // 2, (96 - crop.height) // 2))
    cam.save(out_dir / f"{bid}-cameo.png")


def pad(m: ra.Mesh, W: float, H: float) -> None:
    m.box((0.6, 0.6, 0), (W - 0.6, H - 0.6, 1.0), "slab")


# ---------------------------------------------------------------- Hive Core, t(3) x t(3)

HC = 96.0
HC_C = (47.0, 47.0)
HC_DOME_Z = 6.0
HC_DOME_R = 31.0
HC_DOME_H = 42.0
HC_SPINES = 8
HC_SPINE_TIP_Z = 74.0
HC_IRIS_EL = math.radians(28.0)
HC_IRIS_R = 9.0


def hc_spine(i: int) -> tuple[np.ndarray, np.ndarray]:
    a = 2 * math.pi * (i + 0.5) / HC_SPINES + math.pi / 4
    cx, cy = HC_C
    base = np.array([cx + 37.0 * math.cos(a), cy + 37.0 * math.sin(a), 4.0])
    tip = np.array([cx + 15.0 * math.cos(a), cy + 15.0 * math.sin(a), HC_SPINE_TIP_Z - 8.0 * (i % 2)])
    return base, tip


def hc_iris() -> tuple[np.ndarray, np.ndarray]:
    cx, cy = HC_C
    d = np.array([math.cos(HC_IRIS_EL) / math.sqrt(2), math.cos(HC_IRIS_EL) / math.sqrt(2), math.sin(HC_IRIS_EL) * HC_DOME_H / HC_DOME_R])
    d /= np.linalg.norm(d)
    # Surface point on the ellipsoidal dome along d.
    t = 1.0 / math.sqrt((d[0] ** 2 + d[1] ** 2) / HC_DOME_R**2 + d[2] ** 2 / HC_DOME_H**2)
    p = np.array([cx, cy, HC_DOME_Z]) + d * t
    # Normal of the ellipsoid at p.
    nrm = np.array([(p[0] - cx) / HC_DOME_R**2, (p[1] - cy) / HC_DOME_R**2, (p[2] - HC_DOME_Z) / HC_DOME_H**2])
    return p, nrm / np.linalg.norm(nrm)


def build_hivecore(with_pad: bool) -> ra.Mesh:
    global RIB_C
    RIB_C = HC_C
    m = ra.Mesh()
    if with_pad:
        pad(m, HC, HC)
    cx, cy = HC_C
    # Plinth: a low ringed drum with a glowing seam, then a skirt.
    m.cyl((cx, cy, 1.0), (cx, cy, 3.0), 41.0, 40.0, "steel_dark", n=32)
    m.cyl((cx, cy, 3.0), (cx, cy, 3.6), 39.6, 39.4, "glow", n=32, caps=False)
    m.cyl((cx, cy, 3.6), (cx, cy, HC_DOME_Z), 38.5, 36.0, "steel", n=32)
    m.cyl((cx, cy, HC_DOME_Z - 0.2), (cx, cy, HC_DOME_Z + 0.4), 36.5, 36.5, "steel_dark", n=32)
    # The hive shell.
    dome(m, cx, cy, HC_DOME_Z, HC_DOME_R, HC_DOME_H, 5, "ribbed", "glow", n=32)
    # Crown: a collar and a glowing beacon at the apex.
    top = HC_DOME_Z + HC_DOME_H
    m.cyl((cx, cy, top - 1.5), (cx, cy, top + 2.5), 7.0, 5.0, "steel_dark", n=16)
    m.cyl((cx, cy, top + 2.5), (cx, cy, top + 6.5), 3.0, 2.2, "core", n=12)
    m.cyl((cx, cy, top + 6.5), (cx, cy, top + 8.0), 3.4, 1.0, "spine", n=12)
    # Ringed spines leaning in over the shell.
    for i in range(HC_SPINES):
        b, t = hc_spine(i)
        m.box((b[0] - 3.0, b[1] - 3.0, 1.0), (b[0] + 3.0, b[1] + 3.0, 4.5), "steel_dark")
        m.cyl(b, t, 2.2, 0.35, "spine", n=6)
        for f in (0.32, 0.55, 0.74):
            collar(m, b, t, f, 2.2 * (1 - f) + 0.9, 0.45, "glow")
    # The iris on the south face, toward the camera.
    p, a = hc_iris()
    IRIS["c"] = p + a * 1.6
    IRIS["a"] = a
    IRIS["r"] = HC_IRIS_R
    m.cyl(p - a * 1.5, p + a * 1.2, HC_IRIS_R + 2.6, HC_IRIS_R + 2.2, "steel_dark", n=24)
    m.cyl(p + a * 1.2, p + a * 1.6, HC_IRIS_R, HC_IRIS_R, "iris", n=28)
    # Two lesser vents low on the east and west flanks.
    for ang in (math.radians(-20), math.radians(110)):
        vx, vy = cx + 31.0 * math.cos(ang), cy + 31.0 * math.sin(ang)
        dirv = np.array([math.cos(ang), math.sin(ang), 0.25])
        pv = np.array([vx, vy, HC_DOME_Z + 6.0])
        m.cyl(pv - dirv * 2.0, pv + dirv * 1.5, 4.0, 3.6, "steel_dark", n=12)
        m.cyl(pv + dirv * 1.5, pv + dirv * 1.8, 2.6, 2.6, "core", n=12)
    return m


def hivecore_spots() -> dict:
    cx, cy = HC_C
    p, a = hc_iris()
    top = HC_DOME_Z + HC_DOME_H
    spines = [hc_spine(i) for i in range(HC_SPINES)]
    return {
        "iris": tuple(p + a * 1.6),
        "beacon": (cx, cy, top + 4.5),
        "rings": [tuple(axis_point(b, t, 0.74)) for b, t in spines],
        "seams": [(cx + 30.5 * math.cos(math.radians(a_)), cy + 30.5 * math.sin(math.radians(a_)), HC_DOME_Z + HC_DOME_H * 0.2)
                  for a_ in (20, 45, 70)],
        "stack": (cx, cy, top + 9.0),
    }


# ---------------------------------------------------------------- Fusion Node, t(2) x t(2)

FN = 64.0
FN_C = (31.0, 31.0)
FN_SPIRE_OFF = 12.5
FN_SPIRE_TOP = 52.0
FN_ORB_Z = 40.0


def fn_spires() -> list[tuple[float, float]]:
    cx, cy = FN_C
    # Across the view (one screen-left, one screen-right) so both read.
    return [(cx + FN_SPIRE_OFF, cy - FN_SPIRE_OFF), (cx - FN_SPIRE_OFF, cy + FN_SPIRE_OFF)]


def build_fusionnode(with_pad: bool) -> ra.Mesh:
    global RIB_C
    RIB_C = FN_C
    m = ra.Mesh()
    if with_pad:
        pad(m, FN, FN)
    cx, cy = FN_C
    # Octagonal plinth, a glowing seam, and a deck.
    m.cyl((cx, cy, 1.0), (cx, cy, 4.0), 27.0, 26.0, "steel_dark", n=8)
    m.cyl((cx, cy, 4.0), (cx, cy, 4.6), 25.6, 25.6, "glow", n=8, caps=False)
    m.cyl((cx, cy, 4.6), (cx, cy, 7.0), 25.0, 23.0, "steel", n=8)
    # The well: a glowing core column in a ribbed cage, between the spires.
    m.cyl((cx, cy, 7.0), (cx, cy, 9.0), 9.0, 8.0, "steel_dark", n=16)
    m.cyl((cx, cy, 9.0), (cx, cy, 24.0), 5.0, 4.2, "core", n=16)
    for k in range(6):
        a = 2 * math.pi * k / 6 + math.pi / 12
        b = (cx + 6.2 * math.cos(a), cy + 6.2 * math.sin(a), 9.0)
        t = (cx + 5.0 * math.cos(a), cy + 5.0 * math.sin(a), 24.0)
        m.cyl(b, t, 0.8, 0.7, "spine", n=6)
    m.cyl((cx, cy, 24.0), (cx, cy, 26.0), 7.0, 6.0, "steel_dark", n=16)
    m.cyl((cx, cy, 26.0), (cx, cy, 27.5), 3.0, 1.5, "spine", n=12)
    # Twin coil spires.
    for sx, sy in fn_spires():
        m.box((sx - 5.5, sy - 5.5, 7.0), (sx + 5.5, sy + 5.5, 10.0), "steel_dark", top="roof")
        m.cyl((sx, sy, 10.0), (sx, sy, FN_SPIRE_TOP), 3.6, 1.4, "ribbed", n=10)
        for z in np.arange(13.0, FN_SPIRE_TOP - 6.0, 4.2):
            r = 3.6 + (1.4 - 3.6) * (z - 10.0) / (FN_SPIRE_TOP - 10.0)
            m.cyl((sx, sy, z), (sx, sy, z + 2.6), r + 1.5, r + 1.3, "coil", n=12)
            m.cyl((sx, sy, z + 2.6), (sx, sy, z + 3.1), r + 0.9, r + 0.9, "glow", n=12, caps=False)
        ball(m, (sx, sy, FN_SPIRE_TOP + 1.2), 2.0, "core", rings=5, n=10)
        # Prong toward the orb.
        tx = cx + (sx - cx) * 0.35
        ty = cy + (sy - cy) * 0.35
        m.cyl((sx, sy, FN_ORB_Z + 3.0), (tx, ty, FN_ORB_Z + 0.5), 0.9, 0.4, "spine", n=6)
    # The plasma core, held between the spires, in a halo ring.
    ball(m, (cx, cy, FN_ORB_Z), 5.6, "core", rings=8, n=16)
    # Two thin containment hoops, crossed, around the core.
    m.cyl((cx - 0.3, cy + 0.3, FN_ORB_Z - 6.6), (cx + 0.3, cy - 0.3, FN_ORB_Z + 6.6), 0.35, 0.35, "spine", n=6)
    m.cyl((cx, cy, FN_ORB_Z - 0.25), (cx, cy, FN_ORB_Z + 0.25), 6.6, 6.6, "spine", n=20, caps=False)
    # Conduits from the plinth to the spires.
    for sx, sy in fn_spires():
        m.cyl((cx, cy, 8.0), (sx, sy, 8.6), 1.0, 1.0, "pipe", n=8)
    # A capacitor tower behind the well, north corner.
    px_, py_ = cx - 15.0, cy - 15.0
    m.cyl((px_, py_, 1.0), (px_, py_, 18.0), 4.2, 3.6, "steel", n=12)
    for z in (8.0, 12.0, 16.0):
        m.cyl((px_, py_, z), (px_, py_, z + 0.7), 4.0, 4.0, "glow", n=12, caps=False)
    m.cyl((px_, py_, 18.0), (px_, py_, 19.5), 3.6, 1.8, "steel_dark", n=12)
    # Glowing vents in the deck toward the camera.
    for k in (-1, 1):
        vx, vy = cx + 15.0 + k * 5.0, cy + 15.0 - k * 5.0
        m.box((vx - 2.0, vy - 2.0, 7.0), (vx + 2.0, vy + 2.0, 7.4), "glow")
    return m


def fusionnode_spots() -> dict:
    cx, cy = FN_C
    sp = fn_spires()
    return {
        "core": (cx, cy, FN_ORB_Z),
        "well": (cx + 4.0, cy + 4.0, 16.0),
        "tips": [(sx, sy, FN_SPIRE_TOP + 1.2) for sx, sy in sp],
        "arcs": [(cx + (sx - cx) * 0.35, cy + (sy - cy) * 0.35, FN_ORB_Z + 0.5) for sx, sy in sp],
        "stack": (cx, cy, FN_SPIRE_TOP + 4.0),
    }


# ---------------------------------------------------------------- Assimilator, t(3) x t(3)

AS = 96.0
AS_PIT = (54.0, 54.0)
AS_PIT_R = 19.0
AS_BODY = (40.0, 40.0)
AS_BODY_Z = (26.0, 36.0)


def leg_path(hip, knee, foot) -> list[tuple[np.ndarray, np.ndarray, float, float]]:
    return [(np.asarray(hip, float), np.asarray(knee, float), 2.4, 1.9), (np.asarray(knee, float), np.asarray(foot, float), 1.9, 1.0)]


def as_legs() -> list[tuple[tuple, tuple, tuple]]:
    bx, by = AS_BODY
    z = AS_BODY_Z[0] + 3.0
    out = []
    for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        hip = (bx + dx * 9.0, by + dy * 9.0, z)
        knee = (bx + dx * 24.0, by + dy * 24.0, z + 12.0)
        foot = (bx + dx * 34.0, by + dy * 34.0, 1.0)
        out.append((hip, knee, foot))
    return out


def as_claws() -> list[tuple[tuple, tuple, tuple]]:
    """Shoulder, elbow, wrist for the two claw arms reaching into the pit."""
    bx, by = AS_BODY
    px, py = AS_PIT
    out = []
    for off in (-1, 1):
        sh = (bx + 6.0 + off * 5.0, by + 6.0 - off * 5.0, AS_BODY_Z[0] + 2.0)
        el = (px + off * 8.0, py - off * 8.0, AS_BODY_Z[0] + 4.0)
        wr = (px + off * 4.0 + 2.0, py - off * 4.0 + 2.0, 8.0)
        out.append((sh, el, wr))
    return out


def build_assimilator(with_pad: bool) -> ra.Mesh:
    global RIB_C
    RIB_C = AS_BODY
    m = ra.Mesh()
    if with_pad:
        pad(m, AS, AS)
    px, py = AS_PIT
    PIT.update({"x": px, "y": py, "r": AS_PIT_R})
    # The intake pit: a ringed rim, toothed, and the glowing melt inside.
    m.cyl((px, py, 1.0), (px, py, 1.3), AS_PIT_R, AS_PIT_R, "pit", n=32)
    m.cyl((px, py, 1.0), (px, py, 3.4), AS_PIT_R + 3.4, AS_PIT_R + 3.0, "steel_dark", n=32, caps=False)
    m.cyl((px, py, 3.4), (px, py, 3.8), AS_PIT_R + 3.0, AS_PIT_R + 2.2, "glow", n=32, caps=False)
    m.cyl((px, py, 1.0), (px, py, 3.4), AS_PIT_R + 0.2, AS_PIT_R, "steel", n=32, caps=False)
    for k in range(10):
        a = 2 * math.pi * k / 10
        tx, ty = px + (AS_PIT_R + 1.6) * math.cos(a), py + (AS_PIT_R + 1.6) * math.sin(a)
        m.cyl((tx, ty, 3.4), (px + (AS_PIT_R - 1.5) * math.cos(a), py + (AS_PIT_R - 1.5) * math.sin(a), 5.2), 1.0, 0.2, "spine", n=5)
    # Feed silo, north-east, and a chute down to the pit.
    sx, sy = 78.0, 18.0
    m.cyl((sx, sy, 1.0), (sx, sy, 4.0), 10.5, 10.0, "steel_dark", n=16)
    m.cyl((sx, sy, 4.0), (sx, sy, 30.0), 8.6, 8.0, "steel", n=16)
    for z in (11.0, 19.0, 27.0):
        m.cyl((sx, sy, z), (sx, sy, z + 0.6), 8.7, 8.7, "glow", n=16, caps=False)
    m.cyl((sx, sy, 30.0), (sx, sy, 34.0), 8.0, 3.0, "steel_dark", n=16)
    m.cyl((sx - 4.0, sy + 5.0, 14.0), (px + 6.0, py - 14.0, 5.0), 2.0, 2.0, "pipe", n=8)
    # Scrap heaped by the pit, waiting to go in.
    for (x0, y0, w, d, h) in ((14, 74, 9, 6, 4), (22, 82, 6, 5, 3), (8, 62, 5, 7, 3), (84, 46, 6, 5, 3)):
        m.box((x0, y0, 1.0), (x0 + w, y0 + d, 1.0 + h), "scrap")

    # The claw-rig: a ribbed carapace body on four legs, straddling the pit.
    bx, by = AS_BODY
    z0, z1 = AS_BODY_Z
    m.cyl((bx, by, z0 - 2.5), (bx, by, z0), 7.0, 10.0, "steel_dark", n=12)
    m.cyl((bx, by, z0), (bx, by, z1), 12.5, 11.0, "ribbed", n=16)
    m.cyl((bx, by, z0 + 4.0), (bx, by, z0 + 4.6), 12.3, 12.3, "glow", n=16, caps=False)
    m.cyl((bx, by, z1), (bx, by, z1 + 3.5), 11.0, 6.0, "steel", n=16)
    ball(m, (bx, by, z1 + 4.5), 4.0, "core", rings=5, n=12, squash=0.8)
    # A sensor head on the pit side, eyes down on the melt.
    hx, hy, hz = bx + 9.0, by + 9.0, z0 + 2.0
    m.box((hx - 3.5, hy - 3.5, hz - 2.5), (hx + 3.5, hy + 3.5, hz + 3.0), "steel", top="roof")
    m.box((hx + 3.5, hy - 2.5, hz - 0.5), (hx + 3.9, hy + 2.5, hz + 1.2), "glow")
    m.box((hx - 2.5, hy + 3.5, hz - 0.5), (hx + 2.5, hy + 3.9, hz + 1.2), "glow")
    for hip, knee, foot in as_legs():
        m.cyl(hip, knee, 2.4, 1.9, "spine", n=8)
        m.cyl(knee, foot, 1.9, 0.9, "spine", n=8)
        ball(m, knee, 2.6, "steel", rings=4, n=10)
        collar(m, knee, foot, 0.25, 2.3, 0.5, "glow")
        m.cyl((foot[0], foot[1], 1.0), (foot[0], foot[1], 2.2), 3.0, 2.0, "steel_dark", n=8)
    for sh, el, wr in as_claws():
        m.cyl(sh, el, 2.5, 2.0, "steel", n=8)
        ball(m, el, 2.2, "steel_dark", rings=4, n=10)
        m.cyl(el, wr, 2.0, 1.5, "steel", n=8)
        collar(m, el, wr, 0.35, 1.9, 0.4, "glow")
        # Three fingers, splayed, tips in the melt.
        w = np.asarray(wr, float)
        for k in range(3):
            a = 2 * math.pi * k / 3 + 0.4
            tip = w + np.array([3.4 * math.cos(a), 3.4 * math.sin(a), -5.6])
            mid = w + np.array([2.6 * math.cos(a), 2.6 * math.sin(a), -1.6])
            m.cyl(w, mid, 1.1, 0.85, "spine", n=5)
            m.cyl(mid, tip, 0.85, 0.2, "spine", n=5)
    return m


def assimilator_spots() -> dict:
    px, py = AS_PIT
    bx, by = AS_BODY
    return {
        "pit": (px, py, 1.3),
        "pitRim": [(px + (AS_PIT_R + 2.6) * math.cos(a), py + (AS_PIT_R + 2.6) * math.sin(a), 3.6) for a in (0.3, 0.8, 1.3)],
        "core": (bx, by, AS_BODY_Z[1] + 4.5),
        "silo": [(78.0 + 8.6 * math.cos(0.8), 18.0 + 8.6 * math.sin(0.8), z) for z in (11.3, 19.3, 27.3)],
        "smoke": (px, py, 4.0),
        "stack": (bx, by, AS_BODY_Z[1] + 9.0),
    }


# ---------------------------------------------------------------- extra materials (Forge, Nexus)

# The Forge's maw and the Nexus brain: frames set by their builders, read by the texture.
MAW: dict[str, float] = {}
BRAIN: dict[str, float] = {}
WOMB: dict[str, float] = {}

_tex_v1 = tex


def tex_v2(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    nf = ra.vnoise(X / 1.1 + Z * 0.7, Y / 1.1 - Z * 0.5, 7)
    nm = ra.fbm(X / 6 + Z * 0.2, Y / 6 + Z * 0.3, 9, 3)

    def base(h):
        return np.broadcast_to(rgb(h), (len(X), 3)).copy()

    if mat == "chitin":
        # Dark green-grey carapace plate: glossy mottling, a dark groove every few units along the vault.
        c = base("#6b7773") * (0.88 + 0.16 * nm[:, None]) * (0.94 + 0.1 * nf[:, None])
        c[np.mod(Y, 4.0) < 0.45] *= 0.66
        return c
    if mat == "chitin_dark":
        return base("#3c4644") * (0.9 + 0.16 * nm[:, None])
    s = _flat(n)
    if mat == "maw":
        # The assembly bay seen through the door: hot at the floor centre, dimmer up the arch, ribbed.
        dx = (X - MAW["x"]) / MAW["hw"]
        dz = (Z - MAW["z0"]) / MAW["h"]
        r = np.clip(np.hypot(dx, dz * 0.9), 0, 1)
        c = ra.mix(base("#e6fff4"), base("#1f8f6e"), r ** 0.8)
        c[np.mod(X - MAW["x"] + 40.0, 4.0) < 0.5] *= 0.55
        return c / s
    if mat == "vat":
        # Nanite slurry behind glass: bright, with darker drifting clouds and a pale top.
        cl = ra.smooth(0.45, 0.75, ra.fbm(X / 2.0 + Z * 0.3, Y / 2.0 - Z * 0.4, 71, 3))
        c = ra.mix(base("#7dffd0"), base("#1d7a5c"), cl * 0.75)
        return c / s
    if mat == "neural":
        # The brain: folded lobes, bright ridges and dark sulci.
        w = np.sin(ra.fbm(X / 3.0 + Z * 0.15, Y / 3.0 - Z * 0.35, 73, 3) * 22.0 + Z * 0.6)
        c = ra.mix(base("#bfffe8"), base("#2cc995"), ra.smooth(-0.2, 0.7, w))
        c[np.abs(w) < 0.22] = rgb("#0f4a3a")
        return c / s
    if mat == "membrane":
        # Wing membrane stretched between ribs: dusky, a faint glow through it, dark veins.
        v = np.abs(np.sin(ra.fbm(X / 4.0 + Z * 0.2, Y / 4.0 - Z * 0.2, 77, 3) * 14.0))
        c = ra.mix(base("#3f6a5c"), base("#5f9a84"), ra.smooth(0.2, 0.9, nm))
        c[v < 0.12] = rgb("#1d2f2a")
        return c * (0.95 + 0.08 * nf[:, None]) / np.sqrt(s)
    if mat == "womb":
        # The launch maw's membrane, seen from above: a hot heart, a swirl, dark veins out to the rim.
        dx, dy = X - WOMB["x"], Y - WOMB["y"]
        r = np.clip(np.hypot(dx, dy) / WOMB["r"], 0, 1)
        a = np.arctan2(dy, dx)
        swirl = 0.5 + 0.5 * np.sin(a * 5 + r * 8)
        c = ra.mix(base("#e6fff4"), base("#1f9c72"), np.clip(r ** 0.9 - swirl * 0.12, 0, 1))
        vein = (np.mod(a * 9 / (2 * np.pi) + r * 0.6, 1.0) < 0.07) & (r > 0.35)
        c[vein] = rgb("#14463a")
        return c / s
    if mat == "egg":
        # A brood sac in its cradle: glowing, with a dark curled flier in it.
        cl = ra.smooth(0.5, 0.7, ra.fbm(X / 1.6 + Z * 0.4, Y / 1.6 - Z * 0.4, 79, 3))
        c = ra.mix(base("#a8ffe0"), base("#2a9e78"), cl * 0.8)
        dark = ra.smooth(0.6, 0.68, ra.fbm(X / 1.3 + Z * 0.5, Y / 1.3 + Z * 0.5, 83, 3))
        c = ra.mix(c, base("#16352b"), dark * 0.85)
        return c / s
    return _tex_v1(mat, P, n)


ra.tex = tex_v2


# ---------------------------------------------------------------- Nanite Forge, t(3) x t(3)

NF = 96.0
NF_CX = 36.0          # vault axis runs along y at this x
NF_Y0, NF_Y1 = 14.0, 74.0
NF_SEGS = 5
NF_Z0 = 4.0
NF_HW = (21.0, 27.0)  # half-width back -> front
NF_HT = (25.0, 33.0)  # height back -> front
NF_VATS = [(80.0, 30.0), (80.0, 50.0), (80.0, 70.0)]
NF_VAT_R = 6.4
NF_VAT_TOP = 19.0
NF_PYLON = (76.0, 10.0)
NF_CLAW = (44.0, 34.0)
NF_ARM_Z = 48.0
NF_MAW_W = 0.7
NF_MAW_H = 0.74


def vault_prof(cx: float, hw: float, ht: float, z0: float, n: int = 18) -> list[tuple[float, float]]:
    out = []
    for i in range(n + 1):
        t = math.pi * i / n
        out.append((cx - hw * math.cos(t), z0 + ht * max(0.0, math.sin(t)) ** 0.8))
    return out


def vault_shell(m: ra.Mesh, cx: float, y0: float, y1: float, hw0: float, ht0: float, hw1: float, ht1: float, z0: float, mat: str) -> None:
    m.new_part()
    a = vault_prof(cx, hw0, ht0, z0)
    b = vault_prof(cx, hw1, ht1, z0)
    va = [m.v((x, y0, z)) for x, z in a]
    vb = [m.v((x, y1, z)) for x, z in b]
    for i in range(len(a) - 1):
        m.quad(va[i], va[i + 1], vb[i + 1], vb[i], mat)


def arch_face(m: ra.Mesh, cx: float, y: float, hw_in: float, ht_in: float, hw_out: float, ht_out: float, z0: float, mat: str) -> None:
    """The flat annular arch between two profiles at one y (a rib's front face)."""
    m.new_part()
    a = vault_prof(cx, hw_in, ht_in, z0)
    b = vault_prof(cx, hw_out, ht_out, z0)
    va = [m.v((x, y, z)) for x, z in a]
    vb = [m.v((x, y, z)) for x, z in b]
    for i in range(len(a) - 1):
        m.quad(va[i], va[i + 1], vb[i + 1], vb[i], mat)


def nf_seg(i: int) -> tuple[float, float, float, float, float, float]:
    """Segment i: y0, y1, and half-width / height at each end. Each one telescopes a little larger."""
    L = (NF_Y1 - NF_Y0) / NF_SEGS
    y0 = NF_Y0 + i * L
    y1 = y0 + L
    f0 = i / NF_SEGS
    f1 = (i + 1) / NF_SEGS
    hw0 = NF_HW[0] + (NF_HW[1] - NF_HW[0]) * f0
    ht0 = NF_HT[0] + (NF_HT[1] - NF_HT[0]) * f0
    hw1 = NF_HW[0] + (NF_HW[1] - NF_HW[0]) * f1
    ht1 = NF_HT[0] + (NF_HT[1] - NF_HT[0]) * f1
    # Each plate narrows toward its back edge so the next one overlaps it like a shell.
    return y0, y1, hw0 - 2.0, ht0 - 2.0, hw1, ht1


def build_forge(with_pad: bool) -> ra.Mesh:
    m = ra.Mesh()
    if with_pad:
        pad(m, NF, NF)
    cx = NF_CX
    # Plinth under the vault, with a glowing seam.
    m.box((cx - 31.0, NF_Y0 - 5.0, 1.0), (cx + 31.0, NF_Y1 + 3.0, 3.0), "steel_dark")
    m.box((cx - 30.4, NF_Y0 - 4.4, 3.0), (cx + 30.4, NF_Y1 + 2.4, 3.5), "glow")
    m.box((cx - 30.0, NF_Y0 - 4.0, 3.5), (cx + 30.0, NF_Y1 + 2.0, NF_Z0), "steel", top="roof")
    # The carapace: telescoping shell plates, each with a heavy rib at its front lip and a glow seam.
    for i in range(NF_SEGS):
        y0, y1, hw0, ht0, hw1, ht1 = nf_seg(i)
        vault_shell(m, cx, y0, y1, hw0, ht0, hw1, ht1, NF_Z0, "chitin")
        # Rib: a raised band over the lip.
        vault_shell(m, cx, y1 - 2.2, y1, hw1 + 0.6, ht1 + 0.6, hw1 + 1.4, ht1 + 1.4, NF_Z0, "chitin_dark")
        arch_face(m, cx, y1, hw1 - 2.0, ht1 - 2.0, hw1 + 1.4, ht1 + 1.4, NF_Z0, "chitin_dark")
        if i < NF_SEGS - 1:
            # Glow seam where the next plate slides out from under this rib.
            vault_shell(m, cx, y1, y1 + 1.3, hw1 - 0.3, ht1 - 0.3, hw1 - 0.3, ht1 - 0.3, NF_Z0, "glow")
    # Back wall.
    m.new_part()
    _, _, hwb, htb, _, _ = nf_seg(0)
    m.poly([(x, NF_Y0, z) for x, z in vault_prof(cx, hwb, htb, NF_Z0)], "chitin_dark")
    # Front: a dark frame wall and the glowing maw where the walkers come out.
    hwf, htf = NF_HW[1], NF_HT[1]
    yf = NF_Y1
    m.new_part()
    m.poly([(x, yf + 0.05, z) for x, z in vault_prof(cx, hwf - 1.9, htf - 1.9, NF_Z0)], "steel_dark")
    MAW.update({"x": cx, "z0": NF_Z0, "hw": hwf * NF_MAW_W, "h": htf * NF_MAW_H})
    m.new_part()
    m.poly([(x, yf + 0.3, z) for x, z in vault_prof(cx, hwf * NF_MAW_W, htf * NF_MAW_H, NF_Z0, n=16)], "maw")
    # Mandible frame round the maw: a thick arch and teeth along its edge.
    arch_face(m, cx, yf + 1.4, hwf * NF_MAW_W, htf * NF_MAW_H, hwf * NF_MAW_W + 2.6, htf * NF_MAW_H + 2.6, NF_Z0, "steel_dark")
    vault_shell(m, cx, yf + 0.3, yf + 1.4, hwf * NF_MAW_W + 2.6, htf * NF_MAW_H + 2.6, hwf * NF_MAW_W + 2.6, htf * NF_MAW_H + 2.6, NF_Z0, "steel_dark")
    arch_face(m, cx, yf + 1.8, hwf * NF_MAW_W + 0.4, htf * NF_MAW_H + 0.4, hwf * NF_MAW_W + 1.0, htf * NF_MAW_H + 1.0, NF_Z0, "glow")
    prof = vault_prof(cx, hwf * NF_MAW_W, htf * NF_MAW_H, NF_Z0, n=10)
    for k in range(1, len(prof) - 1):
        x, z = prof[k]
        ix = cx + (x - cx) * 0.78
        iz = NF_Z0 + (z - NF_Z0) * 0.8
        m.cyl((x, yf + 1.2, z), (ix, yf + 2.4, iz), 1.3, 0.15, "spine", n=6)
    # Apron: a ramp out to the pad edge with glowing guide strips.
    m.box((cx - 15.0, yf + 1.0, 1.0), (cx + 15.0, NF - 3.0, 2.0), "steel", top="roof")
    for s in (-1, 1):
        m.box((cx + s * 11.0 - 0.8, yf + 2.0, 2.0), (cx + s * 11.0 + 0.8, NF - 4.0, 2.25), "glow")
    for y in (yf + 6.0, yf + 11.0, yf + 16.0):
        m.box((cx - 3.0, y, 2.0), (cx + 3.0, y + 1.2, 2.25), "glow")
    # Dorsal spines along the ridge.
    for i in range(NF_SEGS):
        y0, y1, hw0, ht0, hw1, ht1 = nf_seg(i)
        yb = y1 - 2.0
        zb = NF_Z0 + ht1 + 1.0
        m.cyl((cx, yb, zb - 1.0), (cx, yb - 4.0, zb + 5.5 + i * 0.6), 1.8, 0.25, "spine", n=6)
    # Nanite vats on the east side, linked into the vault.
    for vx, vy in NF_VATS:
        m.cyl((vx, vy, 1.0), (vx, vy, 4.0), NF_VAT_R + 2.0, NF_VAT_R + 1.4, "steel_dark", n=16)
        m.cyl((vx, vy, 4.0), (vx, vy, NF_VAT_TOP - 3.0), NF_VAT_R, NF_VAT_R, "vat", n=16)
        for k in range(6):
            a = 2 * math.pi * k / 6 + 0.3
            px, py = vx + (NF_VAT_R + 0.3) * math.cos(a), vy + (NF_VAT_R + 0.3) * math.sin(a)
            m.cyl((px, py, 4.0), (px, py, NF_VAT_TOP - 3.0), 0.55, 0.55, "spine", n=5)
        m.cyl((vx, vy, NF_VAT_TOP - 3.0), (vx, vy, NF_VAT_TOP), NF_VAT_R + 0.8, NF_VAT_R * 0.5, "steel_dark", n=16)
        m.cyl((vx, vy, NF_VAT_TOP), (vx, vy, NF_VAT_TOP + 1.6), 1.6, 1.2, "core", n=10)
        m.cyl((vx - NF_VAT_R, vy, 9.0), (cx + 24.0, vy, 10.0), 1.3, 1.3, "pipe", n=8)
        collar(m, (vx - NF_VAT_R, vy, 9.0), (cx + 24.0, vy, 10.0), 0.5, 1.8, 0.4, "glow")
    # Crane: a pylon at the back-west corner, a jointed arm out over the vault, a claw holding a pod.
    px_, py_ = NF_PYLON
    m.box((px_ - 4.5, py_ - 4.5, 1.0), (px_ + 4.5, py_ + 4.5, 5.0), "steel_dark", top="roof")
    m.cyl((px_, py_, 5.0), (px_, py_, NF_ARM_Z), 3.0, 2.2, "spine", n=8)
    for f in (0.3, 0.6):
        collar(m, (px_, py_, 5.0), (px_, py_, NF_ARM_Z), f, 3.0, 0.5, "glow")
    ball(m, (px_, py_, NF_ARM_Z), 3.4, "steel", rings=4, n=10)
    kx, ky = NF_CLAW
    elbow = (px_ + (kx - px_) * 0.55, py_ + (ky - py_) * 0.55, NF_ARM_Z + 6.0)
    m.cyl((px_, py_, NF_ARM_Z), elbow, 2.2, 1.9, "steel", n=8)
    ball(m, elbow, 2.4, "steel_dark", rings=4, n=10)
    wrist = (kx, ky, NF_ARM_Z - 2.0)
    m.cyl(elbow, wrist, 1.9, 1.5, "steel", n=8)
    collar(m, elbow, wrist, 0.4, 1.9, 0.4, "glow")
    w = np.asarray(wrist, float)
    ball(m, wrist, 2.0, "steel_dark", rings=4, n=10)
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.5
        mid = w + np.array([3.0 * math.cos(a), 3.0 * math.sin(a), -2.5])
        tip = w + np.array([1.6 * math.cos(a), 1.6 * math.sin(a), -6.5])
        m.cyl(w, mid, 1.0, 0.8, "spine", n=5)
        m.cyl(mid, tip, 0.8, 0.2, "spine", n=5)
    # The pod it carries: a glowing walker core being lowered in.
    ball(m, (kx, ky, NF_ARM_Z - 6.5), 2.6, "core", rings=5, n=10)
    return m


def forge_spots() -> dict:
    cx = NF_CX
    hwf, htf = NF_HW[1], NF_HT[1]
    kx, ky = NF_CLAW
    segs = [nf_seg(i) for i in range(NF_SEGS - 1)]
    return {
        "maw": (cx, NF_Y1 + 0.3, NF_Z0 + htf * NF_MAW_H * 0.35),
        "apron": [(cx, NF_Y1 + y + 0.6, 2.25) for y in (6.0, 11.0, 16.0)],
        "vats": [(vx - NF_VAT_R * 0.7, vy + NF_VAT_R * 0.7, 11.0) for vx, vy in NF_VATS],
        "pod": (kx, ky, NF_ARM_Z - 6.5),
        "seams": [(cx - hw1 * 0.95, y1 + 0.35, NF_Z0 + ht1 * 0.35) for _, y1, _, _, hw1, ht1 in segs[1:]],
        "smoke": (NF_VATS[1][0], NF_VATS[1][1], NF_VAT_TOP + 1.6),
        "stack": (cx, (NF_Y0 + NF_Y1) / 2, NF_Z0 + NF_HT[1] + 12.0),
    }


# ---------------------------------------------------------------- Neural Nexus, t(2) x t(2)

NX = 64.0
NX_C = (31.0, 31.0)
NX_BRAIN_Z = 25.0
NX_BRAIN_R = 9.0
NX_RIBS = 8
NX_MAST_TOP = 64.0
NX_CROWN_Z = 54.0
NX_PRONGS = 6


def nx_rib(i: int) -> list[np.ndarray]:
    cx, cy = NX_C
    a = 2 * math.pi * (i + 0.5) / NX_RIBS
    pts = []
    for t in np.linspace(0.0, 1.0, 7):
        r = 14.0 + 3.5 * math.sin(math.pi * t * 0.8) - 10.5 * t ** 1.6
        z = 9.0 + 33.0 * t
        pts.append(np.array([cx + r * math.cos(a), cy + r * math.sin(a), z]))
    return pts


def nx_prong(i: int) -> tuple[np.ndarray, np.ndarray]:
    cx, cy = NX_C
    a = 2 * math.pi * i / NX_PRONGS + math.pi / 4
    b = np.array([cx + 3.0 * math.cos(a), cy + 3.0 * math.sin(a), NX_CROWN_Z])
    t = np.array([cx + 13.0 * math.cos(a), cy + 13.0 * math.sin(a), NX_CROWN_Z + 6.0])
    return b, t


def build_nexus(with_pad: bool) -> ra.Mesh:
    global RIB_C
    RIB_C = NX_C
    m = ra.Mesh()
    if with_pad:
        pad(m, NX, NX)
    cx, cy = NX_C
    # Octagonal plinth like the Fusion Node, a glowing seam, a ribbed drum.
    m.cyl((cx, cy, 1.0), (cx, cy, 4.0), 26.0, 25.0, "steel_dark", n=8)
    m.cyl((cx, cy, 4.0), (cx, cy, 4.6), 24.6, 24.6, "glow", n=8, caps=False)
    m.cyl((cx, cy, 4.6), (cx, cy, 7.0), 24.0, 22.0, "steel", n=8)
    m.cyl((cx, cy, 7.0), (cx, cy, 11.0), 15.0, 13.0, "ribbed", n=24)
    m.cyl((cx, cy, 11.0), (cx, cy, 11.6), 13.2, 13.2, "glow", n=24, caps=False)
    m.cyl((cx, cy, 11.6), (cx, cy, 14.0), 12.0, 8.0, "steel_dark", n=24)
    # The brain, on a short stalk, in its cage.
    m.cyl((cx, cy, 13.0), (cx, cy, NX_BRAIN_Z - 6.0), 3.0, 2.4, "spine", n=10)
    ball(m, (cx, cy, NX_BRAIN_Z), NX_BRAIN_R, "neural", rings=10, n=22, squash=1.12)
    for i in range(NX_RIBS):
        pts = nx_rib(i)
        for k in range(len(pts) - 1):
            r0 = 1.5 - 0.12 * k
            m.cyl(pts[k], pts[k + 1], r0, r0 - 0.12, "spine", n=6)
        collar(m, pts[2], pts[3], 0.5, 1.6, 0.45, "glow")
    # Where the ribs meet: a collar, and the mast rising out of it.
    m.cyl((cx, cy, 40.0), (cx, cy, 44.0), 6.0, 4.5, "steel_dark", n=14)
    m.cyl((cx, cy, 44.0), (cx, cy, NX_MAST_TOP), 3.0, 1.0, "ribbed", n=10)
    for z in (46.0, 50.0):
        m.cyl((cx, cy, z), (cx, cy, z + 0.7), 3.0 - (z - 44.0) * 0.1 + 0.4, 3.0 - (z - 44.0) * 0.1 + 0.4, "glow", n=10, caps=False)
    # The sensor crown: a ring, prongs fanning out, a node lit at each tip.
    m.cyl((cx, cy, NX_CROWN_Z - 0.6), (cx, cy, NX_CROWN_Z + 0.6), 4.2, 4.2, "steel_dark", n=14)
    m.cyl((cx, cy, NX_CROWN_Z + 2.0), (cx, cy, NX_CROWN_Z + 2.5), 9.5, 9.5, "glow", n=24, caps=False)
    for i in range(NX_PRONGS):
        b, t = nx_prong(i)
        m.cyl(b, t, 1.0, 0.35, "spine", n=6)
        ball(m, tuple(t), 1.2, "core", rings=4, n=8)
    ball(m, (cx, cy, NX_MAST_TOP + 0.8), 1.6, "core", rings=4, n=10)
    # Two pickup pods on the plinth, toward the camera, looking out.
    for k in (-1, 1):
        px, py = cx + 15.0 + k * 6.0, cy + 15.0 - k * 6.0
        m.cyl((px, py, 7.0), (px, py, 10.0), 3.0, 2.4, "steel_dark", n=10)
        ball(m, (px, py, 11.0), 2.0, "core", rings=4, n=10)
    return m


def nexus_spots() -> dict:
    cx, cy = NX_C
    return {
        "brain": (cx, cy, NX_BRAIN_Z),
        "ribs": [tuple(axis_point(nx_rib(i)[2], nx_rib(i)[3], 0.5)) for i in range(NX_RIBS)],
        "crown": [tuple(nx_prong(i)[1]) for i in range(NX_PRONGS)],
        "beacon": (cx, cy, NX_MAST_TOP + 0.8),
        "pods": [(cx + 15.0 + k * 6.0, cy + 15.0 - k * 6.0, 11.0) for k in (-1, 1)],
        "stack": (cx, cy, NX_MAST_TOP + 4.0),
    }


# ---------------------------------------------------------------- Aerie, t(3) x t(3)

AE = 96.0
AE_C = (44.0, 44.0)
# Spire body: (z0, z1, r0, r1) per ribbed shell band, bottom up; a glow seam rides each joint.
AE_BANDS = [(7.0, 15.0, 20.5, 19.0), (15.0, 27.0, 18.5, 15.0), (27.0, 38.0, 14.6, 12.0), (38.0, 48.0, 11.6, 9.6)]
# The launch maw: a flaring cup on a neck, open to the sky.
AE_NECK = (48.0, 53.0, 9.2, 8.2)
AE_CUP = [(53.0, 57.0, 8.4, 10.8), (57.0, 61.0, 10.8, 14.6), (61.0, 64.5, 14.6, 17.0)]
AE_RIM_Z = 65.6
AE_RIM_R = 17.4
AE_WOMB_Z = 61.5
AE_WOMB_R = 14.0
AE_CLAWS = [math.radians(a) for a in (10.0, 82.0, 154.0, 226.0, 298.0)]
AE_FINS = [math.radians(135.0), math.radians(315.0)]
AE_CRADLES = [math.radians(a) for a in (14.0, 45.0, 76.0)]
AE_CRADLE_D = 35.0
AE_CRADLE_R = 7.5
AE_EGG_Z = 8.6


def ae_polar(r: float, a: float, z: float) -> np.ndarray:
    return np.array([AE_C[0] + r * math.cos(a), AE_C[1] + r * math.sin(a), z])


def ae_claw(a: float) -> list[np.ndarray]:
    """Root on the rim, knee out and up, hooked tip back over the maw."""
    return [ae_polar(AE_RIM_R - 0.6, a, AE_RIM_Z - 1.0), ae_polar(AE_RIM_R + 3.6, a, AE_RIM_Z + 5.0),
            ae_polar(AE_RIM_R + 2.2, a, AE_RIM_Z + 10.5), ae_polar(AE_RIM_R - 3.2, a, AE_RIM_Z + 12.0)]


def ae_fin(a: float) -> tuple[np.ndarray, list[np.ndarray]]:
    """A wing fin off the spire: the root on the shaft and the finger tips, top to bottom."""
    root = ae_polar(12.5, a, 42.0)
    tips = [ae_polar(30.0, a, 54.0), ae_polar(37.0, a, 38.0), ae_polar(35.0, a, 22.0), ae_polar(26.0, a, 9.0)]
    return root, tips


def ae_band_waist(i: int) -> tuple[float, float]:
    z0, z1, r0, r1 = AE_BANDS[i]
    return z0 + (z1 - z0) * 0.45, max(r0, r1) + 1.1


def ae_cradle(a: float) -> tuple[float, float]:
    p = ae_polar(AE_CRADLE_D, a, 0.0)
    return float(p[0]), float(p[1])


def build_aerie(with_pad: bool) -> ra.Mesh:
    global RIB_C
    RIB_C = AE_C
    m = ra.Mesh()
    if with_pad:
        pad(m, AE, AE)
    cx, cy = AE_C
    WOMB.update({"x": cx, "y": cy, "r": AE_WOMB_R})
    # Octagonal plinth, a glow seam, a deck.
    m.cyl((cx, cy, 1.0), (cx, cy, 3.6), 30.0, 29.0, "steel_dark", n=8)
    m.cyl((cx, cy, 3.6), (cx, cy, 4.2), 28.6, 28.6, "glow", n=8, caps=False)
    m.cyl((cx, cy, 4.2), (cx, cy, 7.0), 28.0, 25.0, "steel", n=8, cap_mat="roof")
    # The spire: ribbed shell bands, each with a proud lip, glow seams at the joints.
    for i, (z0, z1, r0, r1) in enumerate(AE_BANDS):
        # Each band bulges a little at its waist, like a segment of an insect's abdomen.
        zm, rm = ae_band_waist(i)
        m.cyl((cx, cy, z0), (cx, cy, zm), r0, rm, "ribbed", n=24, caps=(i == 0))
        m.cyl((cx, cy, zm), (cx, cy, z1), rm, r1, "ribbed", n=24, caps=False)
        m.cyl((cx, cy, z1 - 0.3), (cx, cy, z1 + 0.9), r1 + 0.9, r1 + 0.7, "glow", n=24, caps=False)
    # Exoskeleton ribs up the shaft, hugging each band's bulge, from the plinth to the neck.
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        prof = [(7.0, AE_BANDS[0][2])]
        for i, (z0, z1, r0, r1) in enumerate(AE_BANDS):
            prof += [ae_band_waist(i), (z1, r1 + 0.6)]
        pts = [ae_polar(r + 0.7, a, z) for z, r in prof]
        for p, q in zip(pts, pts[1:]):
            m.cyl(p, q, 1.25, 1.15, "spine", n=6)
    z0, z1, r0, r1 = AE_NECK
    m.cyl((cx, cy, z0), (cx, cy, z1), r0, r1, "steel_dark", n=18)
    for z in (49.5, 51.5):
        m.cyl((cx, cy, z), (cx, cy, z + 0.6), r0 + 0.3, r0 + 0.3, "glow", n=18, caps=False)
    # The cup flares out of the neck: chitin outside, ribs up its flank, a thick lip.
    for z0, z1, r0, r1 in AE_CUP:
        m.cyl((cx, cy, z0), (cx, cy, z1), r0, r1, "chitin_dark", n=28, caps=False)
    for k in range(10):
        a = 2 * math.pi * k / 10 + 0.15
        for z0, z1, r0, r1 in AE_CUP:
            m.cyl(ae_polar(r0 + 0.4, a, z0), ae_polar(r1 + 0.4, a, z1), 0.9, 0.9, "spine", n=5)
    m.cyl((cx, cy, AE_CUP[-1][1]), (cx, cy, AE_RIM_Z), AE_RIM_R, AE_RIM_R, "chitin_dark", n=28, caps=False)
    # Rim top (an annulus) and the inner wall down to the membrane.
    m.new_part()
    n = 28
    for i in range(n):
        a0 = 2 * math.pi * i / n
        a1 = 2 * math.pi * (i + 1) / n
        o0, o1 = m.v(ae_polar(AE_RIM_R, a0, AE_RIM_Z)), m.v(ae_polar(AE_RIM_R, a1, AE_RIM_Z))
        i0, i1 = m.v(ae_polar(AE_RIM_R - 1.8, a0, AE_RIM_Z)), m.v(ae_polar(AE_RIM_R - 1.8, a1, AE_RIM_Z))
        m.quad(o0, o1, i1, i0, "chitin")
    m.cyl((cx, cy, AE_WOMB_Z), (cx, cy, AE_RIM_Z), AE_WOMB_R, AE_RIM_R - 1.8, "steel_dark", n=28, caps=False)
    m.cyl((cx, cy, AE_RIM_Z - 1.4), (cx, cy, AE_RIM_Z - 0.8), AE_RIM_R - 1.75, AE_RIM_R - 1.7, "glow", n=28, caps=False)
    # The membrane the fliers are born through.
    m.new_part()
    rim = [m.v(ae_polar(AE_WOMB_R + 0.1, 2 * math.pi * i / n, AE_WOMB_Z)) for i in range(n)]
    mid = m.v((cx, cy, AE_WOMB_Z - 0.5))
    for i in range(n):
        m.tri(mid, rim[i], rim[(i + 1) % n], "womb")
    # Hooked claws round the rim, a glow collar on each.
    for a in AE_CLAWS:
        pts = ae_claw(a)
        rr = [1.9, 1.5, 1.1, 0.25]
        for k in range(len(pts) - 1):
            m.cyl(pts[k], pts[k + 1], rr[k], rr[k + 1], "spine", n=7)
        collar(m, pts[0], pts[1], 0.5, 1.9, 0.4, "glow")
    # Wing fins either side: finger ribs fanned from a root on the shaft, membrane between them.
    for a in AE_FINS:
        root, tips = ae_fin(a)
        base_pt = ae_polar(17.0, a, 9.0)
        chain = tips + [base_pt]
        m.new_part()
        for k in range(len(chain) - 1):
            p, q = chain[k], chain[k + 1]
            # Scalloped trailing edge: the membrane sags in between two fingers.
            sag = root + (0.5 * (p + q) - root) * 0.82
            m.poly([tuple(root), tuple(p), tuple(sag)], "membrane")
            m.poly([tuple(root), tuple(sag), tuple(q)], "membrane")
        for k, tp in enumerate(tips):
            knee = root + (tp - root) * 0.55 + np.array([0.0, 0.0, 2.5])
            m.cyl(root, knee, 1.5, 1.2, "spine", n=6)
            m.cyl(knee, tp, 1.2, 0.3, "spine", n=6)
            collar(m, root, knee, 0.7, 1.4, 0.35, "glow")
        m.cyl(root, base_pt, 1.6, 1.8, "spine", n=6)
        ball(m, tuple(root), 2.4, "steel_dark", rings=4, n=10)
    # Brood cradles on the pad in front: an open chitin cup, a glowing sac, hooked ribs curled over it.
    for a in AE_CRADLES:
        px, py = ae_cradle(a)
        m.cyl((px, py, 1.0), (px, py, 3.0), AE_CRADLE_R + 1.5, AE_CRADLE_R + 1.0, "steel_dark", n=16)
        m.cyl((px, py, 3.0), (px, py, 6.5), AE_CRADLE_R - 1.0, AE_CRADLE_R + 0.6, "chitin_dark", n=16, caps=False)
        m.cyl((px, py, 6.2), (px, py, 6.8), AE_CRADLE_R + 0.7, AE_CRADLE_R + 0.7, "glow", n=16, caps=False)
        ball(m, (px, py, AE_EGG_Z), 4.6, "egg", rings=6, n=14, squash=1.15)
        for k in range(4):
            b = 2 * math.pi * k / 4 + a + math.pi / 4
            r0 = AE_CRADLE_R + 0.2
            p0 = np.array([px + r0 * math.cos(b), py + r0 * math.sin(b), 5.5])
            p1 = np.array([px + (r0 + 1.0) * math.cos(b), py + (r0 + 1.0) * math.sin(b), 11.0])
            p2 = np.array([px + 2.0 * math.cos(b), py + 2.0 * math.sin(b), 16.0])
            m.cyl(p0, p1, 1.1, 0.9, "spine", n=6)
            m.cyl(p1, p2, 0.9, 0.2, "spine", n=6)
        # Feed vein back into the spire.
        q = ae_polar(21.0, a, 4.8)
        m.cyl((px - (px - cx) * 0.2, py - (py - cy) * 0.2, 3.2), tuple(q), 1.2, 1.2, "pipe", n=8)
        collar(m, (px - (px - cx) * 0.2, py - (py - cy) * 0.2, 3.2), tuple(q), 0.5, 1.7, 0.4, "glow")
    return m


def aerie_spots() -> dict:
    cx, cy = AE_C
    front = math.radians(45.0)
    return {
        "womb": (cx, cy, AE_WOMB_Z),
        "cradles": [(*ae_cradle(a), AE_EGG_Z) for a in AE_CRADLES],
        "seams": [tuple(ae_polar(r1 + 0.9, front, z1 + 0.3)) for _, z1, _, r1 in AE_BANDS[:3]],
        "claws": [tuple(axis_point(ae_claw(a)[0], ae_claw(a)[1], 0.5)) for a in AE_CLAWS],
        "smoke": (cx, cy, AE_WOMB_Z + 2.0),
        "stack": (cx, cy, AE_RIM_Z + 12.0),
    }


# ---------------------------------------------------------------- Conversion Chamber, t(2) x t(2)

CC = 64.0
CC_C = (30.0, 28.0)
CC_DOME_Z = 6.0
CC_DOME_R = 15.5
CC_DOME_H = 17.0
CC_POD_RING = 20.0
# Pod bearings (deg from +x; +y is the door side). None at 90: the door is there.
CC_PODS = (-20.0, 22.0, 140.0, 185.0, 235.0, 285.0)
CC_POD_R = 3.6
CC_POD_Z0, CC_POD_Z1 = 8.0, 22.0
CC_SPIRE_TOP = 58.0
CC_BULB_Z = 38.0
CC_DOOR_Y0 = CC_C[1] + 10.0
CC_DOOR_Y1 = CC_C[1] + 24.5
CC_DOOR_HW, CC_DOOR_HT = 7.5, 11.0
# Pod centres, read by the texture to draw the body inside each one.
PODS: list[tuple[float, float]] = []


def cc_pod(a_deg: float) -> tuple[float, float]:
    a = math.radians(a_deg)
    return CC_C[0] + CC_POD_RING * math.cos(a), CC_C[1] + CC_POD_RING * math.sin(a)


def tex_v3(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
    if mat != "pod":
        return tex_v2(mat, P, n)
    # A conversion pod: the Spawning slurry behind glass, a taken body standing dark inside it.
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    s = _flat(n)
    cl = ra.smooth(0.45, 0.75, ra.fbm(X / 2.0 + Z * 0.3, Y / 2.0 - Z * 0.4, 75, 3))
    c = ra.mix(np.broadcast_to(rgb("#8affd6"), (len(X), 3)).copy(), np.broadcast_to(rgb("#1d7a5c"), (len(X), 3)).copy(), cl * 0.7)
    pts = np.array(PODS)
    k = np.argmin((X[:, None] - pts[None, :, 0]) ** 2 + (Y[:, None] - pts[None, :, 1]) ** 2, axis=1)
    # Across the pod as the camera sees it (the camera looks down the +x+y diagonal).
    u = ((X - pts[k, 0]) - (Y - pts[k, 1])) / math.sqrt(2)
    h = (Z - CC_POD_Z0) / (CC_POD_Z1 - CC_POD_Z0)
    head = np.hypot(u, (h - 0.8) * 9.0) < 1.15
    shoulders = (h > 0.5) & (h < 0.72) & (np.abs(u) < 1.9 - (0.72 - h) * 2.2)
    waist = (h > 0.3) & (h <= 0.5) & (np.abs(u) < 1.15)
    legs = (h > 0.05) & (h <= 0.3) & (np.abs(np.abs(u) - 0.55) < 0.42)
    body = head | shoulders | waist | legs
    c[body] = c[body] * 0.18 + rgb("#0c3529") * 0.82
    # The lit rim at the top and bottom of the glass.
    c[(h > 0.94) | (h < 0.04)] = rgb("#d8fff2")
    return c / s


def build_conversion(with_pad: bool) -> ra.Mesh:
    global RIB_C
    RIB_C = CC_C
    ra.tex = tex_v3
    m = ra.Mesh()
    if with_pad:
        pad(m, CC, CC)
    cx, cy = CC_C
    PODS.clear()
    # Octagonal plinth with a glowing seam, like the Neural Nexus.
    m.cyl((cx, cy, 1.0), (cx, cy, 3.5), 27.5, 26.5, "steel_dark", n=8)
    m.cyl((cx, cy, 3.5), (cx, cy, 4.1), 26.2, 26.2, "glow", n=8, caps=False)
    m.cyl((cx, cy, 4.1), (cx, cy, CC_DOME_Z), 25.8, 24.0, "steel", n=8)
    # The chamber: a low ribbed carapace dome on a dark drum.
    m.cyl((cx, cy, CC_DOME_Z - 0.5), (cx, cy, CC_DOME_Z + 2.0), CC_DOME_R + 1.5, CC_DOME_R + 0.8, "chitin_dark", n=24)
    tops = dome(m, cx, cy, CC_DOME_Z + 2.0, CC_DOME_R, CC_DOME_H, 3, "chitin", "glow")
    dome_top = tops[-1]
    # Ribs over the dome, from the drum up to the spire collar.
    for i in range(8):
        a = 2 * math.pi * (i + 0.5) / 8
        prev = None
        for t in np.linspace(0.0, 0.92, 6):
            r = CC_DOME_R * math.sqrt(max(0.0, 1 - t * t)) + 0.9
            p = np.array([cx + r * math.cos(a), cy + r * math.sin(a), CC_DOME_Z + 2.0 + CC_DOME_H * t])
            if prev is not None:
                m.cyl(prev, p, 1.1, 1.0, "spine", n=6)
            prev = p
    # The door: a short ribbed vestibule out of the dome toward +y, its glowing maw at the front.
    vault_shell(m, cx, CC_DOOR_Y0, CC_DOOR_Y1, CC_DOOR_HW, CC_DOOR_HT, CC_DOOR_HW + 1.0, CC_DOOR_HT + 1.0, CC_DOME_Z, "chitin")
    vault_shell(m, cx, CC_DOOR_Y1 - 1.6, CC_DOOR_Y1, CC_DOOR_HW + 1.6, CC_DOOR_HT + 1.6, CC_DOOR_HW + 2.2, CC_DOOR_HT + 2.2, CC_DOME_Z, "chitin_dark")
    arch_face(m, cx, CC_DOOR_Y1, CC_DOOR_HW * 0.62, CC_DOOR_HT * 0.72, CC_DOOR_HW + 2.2, CC_DOOR_HT + 2.2, CC_DOME_Z, "chitin_dark")
    MAW.update({"x": cx, "z0": CC_DOME_Z, "hw": CC_DOOR_HW * 0.62, "h": CC_DOOR_HT * 0.72})
    m.new_part()
    m.poly([(x, CC_DOOR_Y1 + 0.1, z) for x, z in vault_prof(cx, CC_DOOR_HW * 0.62, CC_DOOR_HT * 0.72, CC_DOME_Z, n=14)], "maw")
    arch_face(m, cx, CC_DOOR_Y1 + 0.3, CC_DOOR_HW * 0.62 + 0.3, CC_DOOR_HT * 0.72 + 0.3, CC_DOOR_HW * 0.62 + 0.9, CC_DOOR_HT * 0.72 + 0.9, CC_DOME_Z, "glow")
    # Apron down to the pad edge, with guide strips.
    m.box((cx - 6.0, CC_DOOR_Y1, 1.0), (cx + 6.0, CC - 2.0, 2.0), "steel", top="roof")
    for y in (CC_DOOR_Y1 + 3.0, CC_DOOR_Y1 + 7.0, CC_DOOR_Y1 + 11.0):
        m.box((cx - 2.5, y, 2.0), (cx + 2.5, y + 1.0, 2.25), "glow")
    # Conversion pods round the dome, each fed into it by a pipe.
    for a_deg in CC_PODS:
        px, py = cc_pod(a_deg)
        PODS.append((px, py))
        m.cyl((px, py, CC_DOME_Z), (px, py, CC_POD_Z0), CC_POD_R + 1.6, CC_POD_R + 1.1, "steel_dark", n=12)
        m.cyl((px, py, CC_POD_Z0), (px, py, CC_POD_Z1), CC_POD_R, CC_POD_R, "pod", n=16, caps=False)
        for k in range(4):
            b = 2 * math.pi * k / 4 + math.radians(a_deg) + math.pi / 4
            qx, qy = px + (CC_POD_R + 0.25) * math.cos(b), py + (CC_POD_R + 0.25) * math.sin(b)
            m.cyl((qx, qy, CC_POD_Z0), (qx, qy, CC_POD_Z1), 0.5, 0.5, "spine", n=5)
        m.cyl((px, py, CC_POD_Z1), (px, py, CC_POD_Z1 + 2.2), CC_POD_R + 0.6, CC_POD_R * 0.45, "steel_dark", n=12)
        m.cyl((px, py, CC_POD_Z1 + 2.2), (px, py, CC_POD_Z1 + 3.4), 1.0, 0.6, "core", n=8)
        a = math.radians(a_deg)
        inner = (cx + (CC_DOME_R - 1.0) * math.cos(a), cy + (CC_DOME_R - 1.0) * math.sin(a), CC_POD_Z1 - 1.0)
        outer = (px - CC_POD_R * math.cos(a), py - CC_POD_R * math.sin(a), CC_POD_Z1 - 3.0)
        m.cyl(outer, inner, 1.0, 1.0, "pipe", n=8)
        collar(m, outer, inner, 0.45, 1.5, 0.35, "glow")
    # The synapse spire: a collar on the crown, a ribbed shaft, a neural bulb, fins, and the beacon.
    m.cyl((cx, cy, dome_top - 2.0), (cx, cy, dome_top + 2.5), 5.5, 4.2, "steel_dark", n=14)
    m.cyl((cx, cy, dome_top + 2.5), (cx, cy, CC_BULB_Z - 3.0), 2.8, 2.2, "ribbed", n=10)
    for z in (dome_top + 5.0, dome_top + 9.0):
        m.cyl((cx, cy, z), (cx, cy, z + 0.7), 3.1, 3.1, "glow", n=10, caps=False)
    ball(m, (cx, cy, CC_BULB_Z), 4.2, "neural", rings=8, n=18, squash=1.2)
    m.cyl((cx, cy, CC_BULB_Z + 4.0), (cx, cy, CC_SPIRE_TOP), 2.0, 0.5, "ribbed", n=10)
    for i in range(3):
        a = 2 * math.pi * i / 3 + math.pi / 4
        root = (cx + 1.5 * math.cos(a), cy + 1.5 * math.sin(a), CC_BULB_Z + 6.0)
        knee = (cx + 6.0 * math.cos(a), cy + 6.0 * math.sin(a), CC_BULB_Z + 10.0)
        tip = (cx + 4.0 * math.cos(a), cy + 4.0 * math.sin(a), CC_BULB_Z + 17.0)
        m.cyl(root, knee, 0.9, 0.7, "spine", n=6)
        m.cyl(knee, tip, 0.7, 0.2, "spine", n=6)
        ball(m, knee, 0.9, "core", rings=4, n=8)
    m.cyl((cx, cy, CC_BULB_Z + 12.0), (cx, cy, CC_BULB_Z + 12.5), 5.5, 5.5, "glow", n=20, caps=False)
    ball(m, (cx, cy, CC_SPIRE_TOP + 0.8), 1.6, "core", rings=4, n=10)
    return m


def conversion_spots() -> dict:
    cx, cy = CC_C
    pods = [cc_pod(a) for a in CC_PODS]
    return {
        "maw": (cx, CC_DOOR_Y1 + 0.1, CC_DOME_Z + CC_DOOR_HT * 0.72 * 0.35),
        "pods": [(px + CC_POD_R * 0.7, py + CC_POD_R * 0.7, (CC_POD_Z0 + CC_POD_Z1) / 2) for px, py in pods],
        "bulb": (cx, cy, CC_BULB_Z),
        "halo": (cx, cy, CC_BULB_Z + 12.2),
        "beacon": (cx, cy, CC_SPIRE_TOP + 0.8),
        "apron": [(cx, CC_DOOR_Y1 + y + 0.5, 2.25) for y in (3.0, 7.0, 11.0)],
        "stack": (cx, cy, CC_SPIRE_TOP + 4.0),
    }


BUILDINGS = {
    "hivecore": (HC, HC, 2.0, build_hivecore, hivecore_spots),
    "conversion": (CC, CC, 3.0, build_conversion, conversion_spots),
    "fusionnode": (FN, FN, 3.0, build_fusionnode, fusionnode_spots),
    "assimilator": (AS, AS, 2.0, build_assimilator, assimilator_spots),
    "forge": (NF, NF, 2.0, build_forge, forge_spots),
    "nexus": (NX, NX, 3.0, build_nexus, nexus_spots),
    "aerie": (AE, AE, 2.0, build_aerie, aerie_spots),
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    ap.add_argument("--only", nargs="*", choices=sorted(BUILDINGS))
    args = ap.parse_args()
    for bid in args.only or list(BUILDINGS):
        W, H, zoom, build, spots = BUILDINGS[bid]
        # Build once so module state (iris frame, pit centre) is set for the spots and the texture.
        build(True)
        render_building(Path(args.out), bid, W, H, zoom, build, spots())


if __name__ == "__main__":
    main()
