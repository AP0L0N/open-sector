#!/usr/bin/env python3
"""Shared Bloom materials, organic shapes, and the runtime-fit check for the Bloom sea and air sheets.

Imported by render_bloom_naval.py and render_bloom_air.py. Same numpy rasterizer,
camera, light, and outline as render_procedural.py (and the Xenomorph naval / air forks),
with the Bloom palette lock from gridlock/docs/factions/bloom.md:

  flesh     #5e2f45 dark  #8a4a63 mid  #b7778a light
  chitin    #3a2a2e dark  #8c7a63 mid  #cdbb98 light
  membrane  #24161f
  glow      #e0701a deep  #ffb13b amber  #ffe08a hot
  team      #6e6e68 / #4a4a46 (a gray carapace plate on every unit)
  outline   #1a1410 (render_procedural.OUTLINE)

Material names are Bloom-only (`flesh`, `bone`, `glow`, ...), so the Xenomorph tables
that xeno_walker loads into the shared MAT are left alone.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import render_procedural as rp
from render_procedural import Mesh

import xeno_walker as bw  # fit / place / frames / bbox / NAMES (the runtime composeAligned twin)
import render_seed as rs  # emissive shading hook
from render_seed import ellipsoid, knob, tube

ROOT = Path(__file__).resolve().parents[2]
UNITS = ROOT / "gridlock/packages/client/src/assets/units"
PREVIEW = Path(__file__).resolve().parent / "preview"
NAMES = bw.NAMES

H = rp.hex_rgb
rp.MAT.update(
    {
        # Wet flesh: a little specular so it reads wet.
        "flesh": (H("#8a4a63"), 0.30, 1.0),
        "flesh_d": (H("#5e2f45"), 0.26, 1.0),
        "flesh_l": (H("#b7778a"), 0.32, 1.0),
        # Ivory chitin / bone.
        "bone": (H("#8c7a63"), 0.14, 1.0),
        "bone_d": (H("#3a2a2e"), 0.10, 1.0),
        "bone_l": (H("#cdbb98"), 0.16, 1.0),
        # Dark membrane / underbelly, opaque and see-through.
        "memb": (H("#24161f"), 0.10, 1.0),
        "wingm": (H("#5e2f45"), 0.04, 0.72),
        "jelly": (H("#b7778a"), 0.30, 0.44),
        "jelly_d": (H("#8a4a63"), 0.20, 0.55),
        # Amber glow.
        "glow": (H("#ffb13b"), 0.0, 1.0),
        "glow_d": (H("#e0701a"), 0.0, 1.0),
        "glow_h": (H("#ffe08a"), 0.0, 1.0),
        # Gray team plate.
        "bteam": (H("#6e6e68"), 0.10, 1.0),
        "bteam_d": (H("#4a4a46"), 0.08, 1.0),
        # Water underlay bits: amber glow in the water, dark tentacles under the surface.
        "uamber": (H("#e0701a"), 0.0, 0.55),
        "uink": (H("#24161f"), 0.0, 0.5),
    }
)
rs.EMISSIVE.update({"glow", "glow_d", "glow_h", "uamber"})


# ---------------------------------------------------------------- shapes


def loft_body(m: Mesh, stations, mat, seg: int = 18) -> None:
    """Organic body lofted along x. stations: (x, cy, cz, ry, rz). `mat` is a name or fn(ring, seg)."""
    rings = []
    for x, cy, cz, ry, rz in stations:
        rings.append([np.array([x, cy + ry * math.cos(2 * math.pi * s / seg), cz + rz * math.sin(2 * math.pi * s / seg)]) for s in range(seg)])
    m.loft(rings, mat)


def ribbed_mat(seg: int, n_rings: int, bands: int, plate_every: int = 2, team_band: int | None = None,
               plate_width: int = 2, side_mat=("flesh", "flesh_l"), belly: str = "memb", plate_mat: str = "bone_l"):
    """Material fn for loft_body: flesh bands, ivory chitin plates on the back, dark membrane belly, a gray team plate."""
    top = seg // 4

    def f(ri: int, s: int) -> str:
        band = min(bands - 1, ri * bands // max(1, n_rings - 1))
        d = min(abs(s - top), seg - abs(s - top))
        if team_band is not None and band == team_band and d <= plate_width:
            return "bteam" if d < plate_width else "bteam_d"
        if band % plate_every == 0 and d <= plate_width:
            return plate_mat if d < plate_width else "bone"
        if seg * 9 // 16 <= s <= seg * 15 // 16:
            return belly
        return side_mat[band % 2]

    return f


def ribbed_stations(x0: float, x1: float, bands: int, prof, cz=0.0, cy=0.0, ry: float = 1.0, rz: float = 1.0, per: int = 3,
                    groove: float = 0.9):
    """Stations for a ribbed body: `prof(t)` (t in 0..1 tail to nose) gives the radius factor; a groove between bands."""
    st = []
    n = bands * per
    for i in range(n + 1):
        t = i / n
        k = max(prof(t), 0.04)
        if i % per == 0 and 0 < i < n:
            k *= groove
        z = cz(t) if callable(cz) else cz
        st.append((x0 + (x1 - x0) * t, cy, z, ry * k, rz * k))
    return st


def chain(m: Mesh, pts, r0: float, r1: float, mats, n: int = 6, joints: bool = True) -> None:
    """A tapered tube along a polyline (tentacle, neck, tail). `mats` is a name or a list cycled per segment."""
    pts = [np.asarray(p, float) for p in pts]
    k = len(pts) - 1
    for i in range(k):
        ra = r0 + (r1 - r0) * i / k
        rb = r0 + (r1 - r0) * (i + 1) / k
        mt = mats if isinstance(mats, str) else mats[i % len(mats)]
        tube(m, pts[i], pts[i + 1], ra, rb, mt, n=n)
        if joints and 0 < i:
            knob(m, pts[i], ra * 1.02, mt)


def wavy(p0, p1, amp: float, waves: float, n: int = 10, axis=(0.0, 1.0, 0.0), phase: float = 0.0, z_fn=None):
    """Points from p0 to p1 with a sine wiggle along `axis`."""
    p0 = np.asarray(p0, float)
    p1 = np.asarray(p1, float)
    ax = np.asarray(axis, float)
    out = []
    for i in range(n + 1):
        t = i / n
        p = p0 + (p1 - p0) * t + ax * amp * math.sin(2 * math.pi * waves * t + phase) * min(1.0, t * 3)
        if z_fn:
            p[2] = z_fn(t)
        out.append(p)
    return out


def strip_surface(m: Mesh, lead, trail, mat) -> None:
    """A thin sheet between two polylines (wing, fin). `mat` is a name or fn(i)."""
    ids_l = [m.v(p) for p in lead]
    ids_t = [m.v(p) for p in trail]
    for i in range(len(lead) - 1):
        mt = mat(i) if callable(mat) else mat
        m.quad(ids_l[i], ids_l[i + 1], ids_t[i + 1], ids_t[i], mt)


def disc(m: Mesh, c, rx: float, ry: float, mat: str, z_fn=None, n: int = 20) -> None:
    """Flat ellipse in the xy plane; z_fn(x, y) lays it on a sloped sheet."""
    cx, cy, cz = c
    zf = z_fn or (lambda x, y: cz)
    ctr = m.v((cx, cy, zf(cx, cy)))
    rim = []
    for k in range(n):
        x = cx + rx * math.cos(2 * math.pi * k / n)
        y = cy + ry * math.sin(2 * math.pi * k / n)
        rim.append(m.v((x, y, zf(x, y))))
    for k in range(n):
        m.tri(ctr, rim[k], rim[(k + 1) % n], mat)


def dome_z(m: Mesh, cx: float, cy: float, z0: float, rx: float, ry: float, h: float, mat, rings: int = 7, seg: int = 20,
           skirt: float = 0.0, k_min: float = 0.05) -> None:
    """Half-ellipsoid on a base at z0. `mat` is a name or fn(ring, seg)."""
    out = [[np.array([cx + rx * math.cos(2 * math.pi * s / seg), cy + ry * math.sin(2 * math.pi * s / seg), z0]) for s in range(seg)]]
    for i in range(rings + 1):
        a = (math.pi / 2) * i / rings
        k = max(math.cos(a), k_min)
        z = z0 + skirt + h * math.sin(a)
        out.append([np.array([cx + rx * k * math.cos(2 * math.pi * s / seg), cy + ry * k * math.sin(2 * math.pi * s / seg), z]) for s in range(seg)])
    m.loft(out, mat)


def paddle(m: Mesh, root, tip, w0: float, w1: float, t0: float, t1: float, mat, n_st: int = 7, seg: int = 12,
           up=(0.0, 0.0, 1.0), round_tip: bool = True) -> None:
    """A flattened lofted limb (flipper, fin, fluke): width w across, thickness t up, along root -> tip.

    `mat` is a name or fn(ring, seg). The tip closes in over its last stations when round_tip.
    """
    root = np.asarray(root, float)
    tip = np.asarray(tip, float)
    ax = tip - root
    ax /= np.linalg.norm(ax)
    upv = np.asarray(up, float)
    u = np.cross(upv, ax)
    if np.linalg.norm(u) < 1e-6:
        u = np.array([1.0, 0.0, 0.0])
    u /= np.linalg.norm(u)
    w = np.cross(ax, u)
    rings = []
    for i in range(n_st + 1):
        t = i / n_st
        p = root + (tip - root) * t
        ww = w0 + (w1 - w0) * t
        tt = t0 + (t1 - t0) * t
        if round_tip and t > 0.6:
            k = math.sqrt(max(0.0, 1 - ((t - 0.6) / 0.4) ** 2))
            ww *= max(k, 0.08)
            tt *= max(k, 0.3)
        rings.append([p + u * ww * math.cos(2 * math.pi * s / seg) + w * tt * math.sin(2 * math.pi * s / seg) for s in range(seg)])
    m.loft(rings, mat)


def eye(m: Mesh, c, r: float) -> None:
    """Amber eye with a hot centre."""
    c = np.asarray(c, float)
    knob(m, c, r, "glow")
    knob(m, c + np.array([0.0, 0.0, r * 0.35]), r * 0.5, "glow_h")


def quills(m: Mesh, base, n_rows: int, n_cols: int, dx: float, dy: float, length: float, pitch_deg: float,
           r: float = 0.07, splay: float = 0.08) -> None:
    """A battery of bone quills: a grid of tapered spines leaning forward (+x) by `pitch_deg` above level."""
    bx, by, bz = base
    p = math.radians(pitch_deg)
    for i in range(n_rows):
        for j in range(n_cols):
            y = by + (j - (n_cols - 1) / 2) * dy
            x = bx - i * dx
            z = bz + i * 0.06
            d = np.array([math.cos(p), (j - (n_cols - 1) / 2) * splay, math.sin(p)])
            d /= np.linalg.norm(d)
            a = np.array([x, y, z])
            knob(m, a, r * 1.5, "glow_d")
            tube(m, a, a + d * length, r, r * 0.15, "bone_l", n=5)


# ---------------------------------------------------------------- check (runtime fit) + previews


def check(unit: str, folder: Path, contact_y: float, padding: int, ref: str | None, ref_draw: float | None,
          ref_note: str = "", scale_mul: float = 1.0, bg=(44, 74, 98)) -> dict:
    """composeAligned in Python: empty / clipped / size_pop, previews, drawSize at the ref's px per meter.

    scale_mul: this unit's meters -> source px over the ref's (both on a 256 source cell).
    """
    bw.CONTACT_Y = contact_y
    bw.PADDING = padding
    raw = bw.frames(folder)
    scale, ox, oy, _ = bw.fit([raw])
    cells = [bw.place(im, scale, ox, oy) for im in raw]
    empty, clipped, heights, bottoms = [], [], [], []
    for i, c in enumerate(cells):
        b = bw.bbox(c)
        if not b:
            empty.append(NAMES[i])
            heights.append(0)
            bottoms.append(0)
            continue
        if b[0] <= 0 or b[1] <= 0 or b[2] >= bw.CELL or b[3] >= bw.CELL:
            clipped.append(NAMES[i])
        heights.append(b[3] - b[1])
        bottoms.append(b[3])
    # Source clip: anything touching the 256 source edge was cut by the render.
    src_clip = []
    for i, im in enumerate(raw):
        b = bw.bbox(im)
        if b and (b[0] <= 0 or b[1] <= 0 or b[2] >= im.width or b[3] >= im.height):
            src_clip.append(NAMES[i])
    med = sorted(heights)[len(heights) // 2]
    pops = [NAMES[i] for i, h in enumerate(heights) if med and abs(h - med) / med > 0.12]
    rep = {"unit": unit, "fit_scale": round(scale, 4), "empty_dirs": empty, "clipped_dirs": clipped,
           "source_clipped_dirs": src_clip, "size_pop_dirs": pops, "heights": heights, "bottoms": bottoms,
           "contactY": contact_y}
    if ref:
        ref_raw = bw.frames(UNITS / ref / "hull")
        rscale, *_ = bw.fit([ref_raw])
        rep["ref"] = ref
        rep["ref_fit_scale"] = round(rscale, 4)
        rep["drawSize_base"] = round(ref_draw * rscale / (scale * scale_mul), 1)
        rep["ref_note"] = ref_note
    PREVIEW.mkdir(parents=True, exist_ok=True)
    big, lab = 2, 14
    C = bw.CELL
    board = Image.new("RGB", (4 * C * big, 4 * (C * big + lab)), bg)
    d = ImageDraw.Draw(board)
    for i in range(16):
        r, c = divmod(i, 4)
        a = cells[i].resize((C * big, C * big), Image.NEAREST)
        x, y = c * C * big, r * (C * big + lab)
        board.paste(a.convert("RGB"), (x, y), a)
        yy = y + round(contact_y * C * big)
        d.line((x, yy, x + C * big, yy), fill=(160, 40, 40))
        d.text((x + 4, y + C * big + 1), f"{i} {NAMES[i]}", fill=(240, 236, 220))
    board.save(PREVIEW / f"{unit}-turntable.png")
    strip = Image.new("RGBA", (16 * C, C + lab), bg + (255,))
    ds = ImageDraw.Draw(strip)
    for i in range(16):
        strip.alpha_composite(cells[i], (i * C, 0))
        ds.text((i * C + 4, C + 1), f"{i} {NAMES[i]}", fill=(240, 236, 220, 255))
    strip.save(PREVIEW / f"{unit}-strip.png")
    if ref_draw:
        gsz = round(rep["drawSize_base"] * 1.25)
        gp = Image.new("RGBA", (16 * (gsz + 4), gsz + 4), bg + (255,))
        for i in range(16):
            gp.alpha_composite(cells[i].resize((gsz, gsz), Image.LANCZOS), (i * (gsz + 4) + 2, 2))
        gp.save(PREVIEW / f"{unit}-gameplay.png")
    (PREVIEW / f"{unit}-manifest.json").write_text(json.dumps(rep, indent=2) + "\n")
    print(json.dumps({k: v for k, v in rep.items() if k not in ("heights", "bottoms")}, indent=1))
    print("heights", heights)
    print("bottoms", bottoms)
    return rep


def cameo72(faces: Path, path: Path, face: str = "0015", gain: float = 1.2, lift: float = 0.03) -> None:
    """72 px static cameo from the south-east face, brightened like the Xenomorph cameos."""
    im = Image.open(faces / f"{face}.png").convert("RGBA")
    crop = im.crop(bw.bbox(im))
    px = np.asarray(crop).astype(np.float64) / 255
    rgb = px[..., :3]
    dark = rgb.max(axis=-1, keepdims=True) < 0.12
    px[..., :3] = np.where(dark, rgb, np.clip(rgb * gain + lift, 0, 1))
    crop = Image.fromarray((px * 255 + 0.5).astype(np.uint8), "RGBA")
    f = min(66 / crop.width, 66 / crop.height)
    small = crop.resize((max(1, round(crop.width * f)), max(1, round(crop.height * f))), Image.Resampling.LANCZOS)
    cam = Image.new("RGBA", (72, 72), (0, 0, 0, 0))
    cam.alpha_composite(small, ((72 - small.width) // 2, (72 - small.height) // 2))
    cam.save(path)
    print("wrote", path)
