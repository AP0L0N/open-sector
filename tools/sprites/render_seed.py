#!/usr/bin/env python3
"""Seed: the Xenite carrier that unpacks into a Hive Core. One 16-face hull.

The Xenite answer to the Rig (render_rig.py), under the Rig's lock: same numpy
rasterizer (render_procedural), camera, light, outline, model scale, cell 192,
contactY 0.9, one frame, 16 faces, 72 px cameo from the ESE face.

A segmented pod-crawler on six insect legs: wedge head with mandibles and
sensor eyes, a ribbed thorax, and a swollen abdomen pod whose armour ribs
arch over a glowing core sac. Dark gunmetal carapace, cyan-green emissive
seams between the plates, gray team plates on the back.

0001 = nose screen-south, then clockwise 22.5° through 0016.

  python tools/sprites/render_seed.py \\
      --out gridlock/packages/client/src/assets/units/seed
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import render_procedural as rp
from render_procedural import Mesh, render_turntable

# Same scale, height, and centring as the Rig, so the two carriers match in the sheet.
SCALE_FRAC = 0.086
Z_MID = 1.5
CY_FRAC = 0.64

CELL = 192
CONTACT_Y = 0.9
PADDING = 6
CAMEO_FACE = "0014"  # ESE, as the Rig
CAMEO_SIZE = 72
CAMEO_GAIN = 1.45
CAMEO_LIFT = 0.04

ENGINE_ORDER = [
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
]

# Xenite materials, added to the shared table: (base rgb, specular, alpha).
rp.MAT.update(
    {
        "carapace": (rp.hex_rgb("#474e55"), 0.30, 1.0),
        "plate": (rp.hex_rgb("#525a62"), 0.32, 1.0),
        "under_b": (rp.hex_rgb("#26292c"), 0.10, 1.0),
        "limb": (rp.hex_rgb("#3b4045"), 0.28, 1.0),
        "claw": (rp.hex_rgb("#1d1f21"), 0.20, 1.0),
        "seam": (rp.hex_rgb("#33e6b8"), 0.0, 1.0),
        "core": (rp.hex_rgb("#7affd6"), 0.0, 1.0),
        "eye": (rp.hex_rgb("#5ff6ff"), 0.0, 1.0),
    }
)
EMISSIVE = {"seam", "core", "eye"}

_shade_base = rp._shade


def _shade(mat: str, n_world: np.ndarray, base: np.ndarray) -> np.ndarray:
    """Seams, eyes, and the core glow: lit almost flat, so they read on the dark side too."""
    if mat in EMISSIVE:
        lam = max(0.0, float(np.dot(n_world, rp.LIGHT)))
        return np.clip(base * (0.9 + 0.2 * lam), 0, 1)
    return _shade_base(mat, n_world, base)


rp._shade = _shade


# ---------------------------------------------------------------- shapes


def ellipsoid(m: Mesh, c, r, mat, rings: int = 12, seg: int = 14, x_cut: tuple[float, float] = (-1.0, 1.0)) -> None:
    """Ellipsoid lofted along x. `mat` is a name or fn(ring, seg). x_cut trims the ends (fractions of rx)."""
    cx, cy, cz = c
    rx, ry, rz = r
    out = []
    for i in range(rings + 1):
        t = x_cut[0] + (x_cut[1] - x_cut[0]) * i / rings
        k = math.sqrt(max(0.0, 1 - t * t))
        k = max(k, 0.06)
        ring = [
            np.array([cx + rx * t, cy + ry * k * math.cos(2 * math.pi * s / seg), cz + rz * k * math.sin(2 * math.pi * s / seg)])
            for s in range(seg)
        ]
        out.append(ring)
    m.loft(out, mat)


def tube(m: Mesh, a, b, r0: float, r1: float, mat: str, n: int = 7) -> None:
    a = np.asarray(a, float)
    b = np.asarray(b, float)
    ax = b - a
    ax /= np.linalg.norm(ax)
    ref = np.array([0, 0, 1.0]) if abs(ax[2]) < 0.9 else np.array([1.0, 0, 0])
    u = np.cross(ax, ref)
    u /= np.linalg.norm(u)
    w = np.cross(ax, u)
    r_a = [a + r0 * (math.cos(2 * math.pi * k / n) * u + math.sin(2 * math.pi * k / n) * w) for k in range(n)]
    r_b = [b + r1 * (math.cos(2 * math.pi * k / n) * u + math.sin(2 * math.pi * k / n) * w) for k in range(n)]
    m.loft([r_a, r_b], mat)


def knob(m: Mesh, c, r: float, mat: str) -> None:
    ellipsoid(m, c, (r, r, r), mat, rings=5, seg=8)


def arch(m: Mesh, x: float, cy: float, cz: float, ry: float, rz: float, half_w: float, thick: float, mat: str, n: int = 9) -> None:
    """A flat armour rib arching over the back, from flank to flank, at station x."""
    inner = []
    outer = []
    for k in range(n + 1):
        a = math.pi * (0.06 + 0.88 * k / n)
        inner.append((cy + ry * math.cos(a), cz + rz * math.sin(a)))
        outer.append((cy + (ry + thick) * math.cos(a), cz + (rz + thick) * math.sin(a)))
    for k in range(n):
        q = [
            [m.v((x + dx, *p)) for p in (inner[k], inner[k + 1], outer[k + 1], outer[k])]
            for dx in (-half_w, half_w)
        ]
        lo, hi = q
        for i in range(4):
            j = (i + 1) % 4
            m.quad(lo[i], lo[j], hi[j], hi[i], mat)
        m.quad(lo[0], lo[1], lo[2], lo[3], mat)
        m.quad(hi[0], hi[1], hi[2], hi[3], mat)


# ---------------------------------------------------------------- model
# Meters. +x nose, +y left, +z up. Feet on z = 0.

ABD = (-1.75, 0.0, 1.62)
ABD_R = (2.0, 1.38, 1.02)
THX = (0.6, 0.0, 1.6)
THX_R = (1.12, 1.02, 0.8)
HEAD = (2.3, 0.0, 1.42)
HEAD_R = (0.9, 0.74, 0.58)
SAC = (-1.9, 0.0, 2.5)
SAC_R = (1.15, 0.8, 0.66)

# Legs: hip station on the body, knee out and up, foot out and down.
LEGS = [
    # (hip x, knee dx, foot dx)
    (1.15, 0.7, 1.45),
    (0.15, 0.05, 0.1),
    (-0.85, -0.55, -1.35),
]


def plated(m: Mesh, c, r, plates: int, seam: float = 0.035, team: tuple[int, int] | None = None,
           x_cut: tuple[float, float] = (-0.98, 0.98), seg: int = 16) -> None:
    """Ribbed shell along x: `plates` armour bands, each with a proud rear lip, and a thin
    glowing seam sunk between neighbours. Plates in `team` carry a gray spine plate."""
    cx, cy, cz = c
    rx, ry, rz = r
    stations: list[tuple[float, float]] = []  # (t, radius factor)
    mats: list[str] = []  # material of the band that ends at this station
    t0, t1 = x_cut
    span = (t1 - t0) / plates
    for p in range(plates):
        a = t0 + p * span
        b = a + span
        if p == 0:
            stations.append((a, 1.0))
        else:
            stations.append((a + seam * 0.5, 0.9))  # seam floor
            mats.append(f"seam:{p}")
            stations.append((a + seam, 1.0))
            mats.append(f"seam:{p}")
        for q in (0.35, 0.7):
            stations.append((a + span * q, 1.0))
            mats.append(f"plate:{p}")
        stations.append((b - seam * 0.5, 1.05))  # lip
        mats.append(f"plate:{p}")
    rings = []
    for t, f in stations:
        k = max(math.sqrt(max(0.0, 1 - t * t)), 0.06) * f
        rings.append(
            [
                np.array([cx + rx * t, cy + ry * k * math.cos(2 * math.pi * s / seg), cz + rz * k * math.sin(2 * math.pi * s / seg)])
                for s in range(seg)
            ]
        )

    def mat(ri: int, s: int) -> str:
        kind, p = mats[min(ri, len(mats) - 1)].split(":")
        if kind == "seam":
            return "seam"
        top = seg // 4  # straight up
        if team and team[0] <= int(p) <= team[1] and abs(s - top) <= 1:
            return "plate"
        if seg * 9 // 16 <= s <= seg * 15 // 16:  # belly
            return "under_b"
        return "carapace"

    m.loft(rings, mat)


def leg(m: Mesh, side: int, hip_x: float, knee_dx: float, foot_dx: float) -> None:
    hip = np.array([hip_x, side * 0.85, 1.42])
    knee = np.array([hip_x + knee_dx, side * 2.0, 2.42])
    ankle = np.array([hip_x + foot_dx * 0.92, side * 2.4, 0.6])
    foot = np.array([hip_x + foot_dx, side * 2.46, 0.0])
    tube(m, hip, knee, 0.32, 0.22, "limb")
    tube(m, knee, ankle, 0.22, 0.14, "limb")
    tube(m, ankle, foot, 0.14, 0.04, "claw", n=6)
    knob(m, hip, 0.36, "carapace")
    knob(m, knee, 0.25, "carapace")
    knob(m, knee + np.array([0, side * 0.05, 0.08]), 0.13, "seam")
    knob(m, ankle, 0.16, "claw")
    # A spur on the femur.
    mid = (hip + knee) / 2
    tube(m, mid + np.array([0, 0, 0.15]), mid + np.array([-0.1, side * 0.1, 0.62]), 0.1, 0.02, "claw", n=5)


def build_hull() -> Mesh:
    m = Mesh()
    # Abdomen pod: ribbed shell, team plates along the spine.
    plated(m, ABD, ABD_R, 5, team=(1, 3))
    # The core sac bulging out of the back, and the armour ribs arched over it.
    ellipsoid(m, SAC, SAC_R, "core", rings=10, seg=14)
    for ax in (-2.45, -1.35):
        k = math.sqrt(max(0.0, 1 - ((ax - SAC[0]) / SAC_R[0]) ** 2))
        arch(m, ax, 0.0, SAC[2] - 0.1, SAC_R[1] * k + 0.04, SAC_R[2] * k + 0.04, 0.12, 0.13, "plate")
    # Spinneret at the tail.
    tail = ABD[0] - ABD_R[0]
    tube(m, (tail + 0.2, 0, ABD[2] - 0.15), (tail - 0.4, 0, ABD[2] - 0.45), 0.4, 0.18, "carapace")
    knob(m, (tail - 0.42, 0, ABD[2] - 0.46), 0.17, "seam")

    # Waist joint, thorax.
    tube(m, (ABD[0] + ABD_R[0] - 0.25, 0, 1.62), (THX[0] - THX_R[0] + 0.2, 0, 1.6), 0.55, 0.5, "under_b", n=10)
    knob(m, (ABD[0] + ABD_R[0] + 0.02, 0, 2.08), 0.12, "seam")
    plated(m, THX, THX_R, 3, team=(0, 2))
    # Dorsal sensor fin on the thorax.
    m.box((THX[0] - 0.55, -0.09, THX[2] + 0.62), (THX[0] + 0.35, 0.09, THX[2] + 1.1), "carapace")
    m.box((THX[0] - 0.5, -0.1, THX[2] + 0.98), (THX[0] + 0.25, 0.1, THX[2] + 1.06), "seam")

    # Neck, head, eyes, mandibles.
    tube(m, (THX[0] + THX_R[0] - 0.25, 0, 1.55), (HEAD[0] - HEAD_R[0] + 0.2, 0, 1.45), 0.42, 0.38, "under_b", n=10)
    plated(m, HEAD, HEAD_R, 2, seg=14)
    for s in (-1, 1):
        knob(m, (HEAD[0] + 0.55, s * 0.38, HEAD[2] + 0.28), 0.16, "eye")
        knob(m, (HEAD[0] + 0.25, s * 0.5, HEAD[2] + 0.36), 0.12, "eye")
        base = np.array([HEAD[0] + 0.7, s * 0.4, HEAD[2] - 0.25])
        tip = np.array([HEAD[0] + 1.45, s * 0.12, HEAD[2] - 0.5])
        tube(m, base, tip, 0.14, 0.03, "claw", n=6)

    for hip_x, kdx, fdx in LEGS:
        for s in (-1, 1):
            leg(m, s, hip_x, kdx, fdx)
    return m


# ---------------------------------------------------------------- compose (the Rig's)


def opaque_bbox(im: Image.Image, alpha_min: int = 8):
    return im.split()[-1].point(lambda v: 255 if v >= alpha_min else 0).getbbox()


def compose_sheet(src: Path, sheet_path: Path, cameo_path: Path, preview: Path) -> None:
    """One scale and one contact for all 16 faces, into the engine sheet (render_rig.compose_sheet)."""
    frames = [Image.open(src / f"{i:04d}.png").convert("RGBA") for i in range(1, 17)]
    boxes = []
    bottoms = []
    for im in frames:
        bb = opaque_bbox(im)
        if not bb:
            raise SystemExit(f"empty seed frame in {src}")
        boxes.append(bb)
        bottoms.append(bb[3])
    union = (
        min(b[0] for b in boxes),
        min(b[1] for b in boxes),
        max(b[2] for b in boxes),
        max(b[3] for b in boxes),
    )
    uw, uh = union[2] - union[0], union[3] - union[1]
    scale = min((CELL - 2 * PADDING) / uw, (CELL - 2 * PADDING) / uh)
    cx = frames[0].size[0] / 2
    med_bottom = sorted(bottoms)[len(bottoms) // 2]
    ox = CELL / 2 - cx * scale
    oy = CELL * CONTACT_Y - med_bottom * scale
    min_oy = PADDING - union[1] * scale
    max_oy = CELL - PADDING - union[3] * scale
    if max_oy < min_oy:
        oy = (min_oy + max_oy) / 2
    else:
        oy = min(max_oy, max(min_oy, oy))

    cells: list[Image.Image] = []
    for im in frames:
        cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        nw, nh = max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale))
        cell.alpha_composite(im.resize((nw, nh), Image.Resampling.LANCZOS), (round(ox), round(oy)))
        cells.append(cell)

    sheet = Image.new("RGBA", (CELL, 16 * CELL), (0, 0, 0, 0))
    for i, cell in enumerate(cells):
        sheet.alpha_composite(cell, (0, i * CELL))
    sheet_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(sheet_path)

    placed = cells[int(CAMEO_FACE) - 1]
    bb = opaque_bbox(placed)
    if not bb:
        raise SystemExit("cameo empty")
    crop = placed.crop(bb)
    px = np.asarray(crop).astype(np.float64) / 255
    rgb = px[..., :3]
    dark = rgb.max(axis=-1, keepdims=True) < 0.12
    px[..., :3] = np.where(dark, rgb, np.clip(rgb * CAMEO_GAIN + CAMEO_LIFT, 0, 1))
    crop = Image.fromarray((px * 255 + 0.5).astype(np.uint8), "RGBA")
    pad = 3
    fit = (CAMEO_SIZE - 2 * pad) / max(crop.width, crop.height)
    small = crop.resize((max(1, round(crop.width * fit)), max(1, round(crop.height * fit))), Image.Resampling.LANCZOS)
    cameo = Image.new("RGBA", (CAMEO_SIZE, CAMEO_SIZE), (0, 0, 0, 0))
    cameo.alpha_composite(small, ((CAMEO_SIZE - small.width) // 2, CAMEO_SIZE - pad - small.height))
    cameo.save(cameo_path)

    preview.mkdir(parents=True, exist_ok=True)
    label_h = 16
    board = Image.new("RGB", (4 * CELL, 4 * (CELL + label_h)), (28, 26, 24))
    draw = ImageDraw.Draw(board)
    for i, name in enumerate(ENGINE_ORDER):
        r, c = divmod(i, 4)
        x, y = c * CELL, r * (CELL + label_h)
        board.paste(cells[i].convert("RGB"), (x, y), cells[i])
        draw.text((x + 4, y + CELL + 2), f"{i} {name}", fill=(220, 214, 200))
    board.save(preview / "seed-turntable.png")
    draw_px = 80
    strip = Image.new("RGBA", (16 * draw_px, draw_px), (40, 36, 32, 255))
    for i, cell in enumerate(cells):
        strip.alpha_composite(cell.resize((draw_px, draw_px), Image.Resampling.LANCZOS), (i * draw_px, 0))
    strip.save(preview / "seed-strip.png")

    contacts = []
    heights = []
    clips = []
    for i, name in enumerate(ENGINE_ORDER):
        bb = opaque_bbox(cells[i])
        if not bb:
            continue
        contacts.append(round(bb[3] / CELL, 3))
        heights.append(bb[3] - bb[1])
        if bb[0] <= 1 or bb[1] <= 1 or bb[2] >= CELL - 1 or bb[3] >= CELL - 1:
            clips.append(name)
    med_h = sorted(heights)[len(heights) // 2]
    pops = [ENGINE_ORDER[i] for i, h in enumerate(heights) if abs(h - med_h) / med_h > 0.12]
    print("sheet", sheet_path, "scale", round(scale, 3), "contact", contacts)
    print("size_pop_dirs", pops, "heights", heights)
    print("cameo", cameo_path)
    if clips:
        print("CLIPPED", clips)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ inside it and the sheet beside it")
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--compose-only", action="store_true")
    args = ap.parse_args()
    out = Path(args.out)
    if not args.compose_only:
        render_turntable(
            build_hull(),
            out / "hull",
            "seed_hull",
            "seed-hull.json",
            scale_frac=SCALE_FRAC,
            z_mid=Z_MID,
            cy_frac=CY_FRAC,
            ss=args.ss,
        )
    root = out.parent
    preview = Path(__file__).resolve().parent / "preview"
    compose_sheet(out / "hull", root / "seed-move.png", root / "seed-cameo.png", preview)


if __name__ == "__main__":
    main()
