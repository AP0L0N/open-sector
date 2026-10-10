#!/usr/bin/env python3
"""Shared parts and checks for the Xenomorph heavy assimilators (Stalker, Behemoth, Ravager).

Same numpy rasterizer, camera, light, and outline as render_procedural.py,
with the Seed's Xenomorph materials and emissive shading (render_seed.py), retuned to
a cold grey-green alloy over dark chitin. Each unit is three passes of one locked
camera (hull / turret / gun), the Apocalypse's layout, so the client composes
them with one transform (composeAligned, TIGER_OPTS) and the turret aims on its
own. The turret and the gun turn on the model origin.

`check()` is the Python twin of the runtime fit: it composes the layers to the
128 px cell (contactY 0.92, padding 4), writes the previews, prints the
manifest numbers (empty / clipped / size_pop), and the model numbers the client
needs for muzzles (cell px per meter, origin lift).
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import render_procedural as rp
import render_seed as rs  # noqa: F401  (Xenomorph materials + emissive shading)
from render_procedural import Mesh
from render_seed import ellipsoid, knob, tube

ROOT = Path(__file__).resolve().parents[2]
UNITS = ROOT / "gridlock/packages/client/src/assets/units"
PREVIEW = Path(__file__).resolve().parent / "preview"

# Cold grey-green alloy, dark chitin, the Seed's glow.
rp.MAT.update(
    {
        "alloy": (rp.hex_rgb("#4c5a51"), 0.16, 1.0),
        "alloy_hi": (rp.hex_rgb("#58675d"), 0.18, 1.0),
        "chitin": (rp.hex_rgb("#252b27"), 0.14, 1.0),
        "limb": (rp.hex_rgb("#37413b"), 0.16, 1.0),
        "claw": (rp.hex_rgb("#1b1f1c"), 0.12, 1.0),
        "barrel": (rp.hex_rgb("#414c45"), 0.22, 1.0),
        "team": (rp.hex_rgb("#7a7a74"), 0.08, 1.0),
        # Sickly green glow: the Seed's seams pushed a little toward green.
        "seam": (rp.hex_rgb("#46e69a"), 0.0, 1.0),
        "core": (rp.hex_rgb("#a4ffbe"), 0.0, 1.0),
        "eye": (rp.hex_rgb("#8cff7a"), 0.0, 1.0),
    }
)

CELL = 128
CONTACT_Y = 0.92
PADDING = 4
NAMES = ["S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE"]


# ---------------------------------------------------------------- shapes


def cylinder_z(m: Mesh, cx: float, cy: float, r: float, z0: float, z1: float, mat: str, n: int = 18) -> None:
    rings = [[np.array([cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n), zz]) for k in range(n)] for zz in (z0, z1)]
    m.loft(rings, mat)


def tube_x(m: Mesh, x0: float, x1: float, y: float, z: float, r: float, mat: str, n: int = 10) -> None:
    rings = [[np.array([xx, y + r * math.cos(2 * math.pi * k / n), z + r * math.sin(2 * math.pi * k / n)]) for k in range(n)] for xx in (x0, x1)]
    m.loft(rings, mat)


def dome(m: Mesh, cx: float, cy: float, z0: float, rx: float, ry: float, h: float, mat, rings: int = 6, seg: int = 18, skirt: float = 0.12) -> None:
    """Half-ellipsoid on a flat base at z0 (a short vertical skirt first). `mat` is a name or fn(ring, seg)."""
    out = [[np.array([cx + rx * math.cos(2 * math.pi * s / seg), cy + ry * math.sin(2 * math.pi * s / seg), z0]) for s in range(seg)]]
    for i in range(rings + 1):
        a = (math.pi / 2) * i / rings
        k = max(math.cos(a), 0.05)
        z = z0 + skirt + h * math.sin(a)
        out.append([np.array([cx + rx * k * math.cos(2 * math.pi * s / seg), cy + ry * k * math.sin(2 * math.pi * s / seg), z]) for s in range(seg)])
    m.loft(out, mat)


def leg(m: Mesh, hip, knee, ankle, foot, r: float = 0.3, plate: bool = True) -> None:
    """Armoured insect leg: thick femur with a chitin plate and a glowing knee, thin shin, claw foot."""
    hip, knee, ankle, foot = (np.asarray(p, float) for p in (hip, knee, ankle, foot))
    tube(m, hip, knee, r, r * 0.75, "limb")
    tube(m, knee, ankle, r * 0.72, r * 0.48, "limb")
    tube(m, ankle, foot, r * 0.48, r * 0.12, "claw", n=6)
    knob(m, hip, r * 1.2, "chitin")
    knob(m, knee, r * 0.95, "alloy")
    knob(m, knee + np.array([0, 0, r * 0.55]), r * 0.42, "seam")
    knob(m, ankle, r * 0.55, "claw")
    if plate:
        # A chitin shin guard on the femur's top face.
        a = hip + (knee - hip) * 0.2 + np.array([0, 0, r * 0.7])
        b = hip + (knee - hip) * 0.85 + np.array([0, 0, r * 0.55])
        tube(m, a, b, r * 0.62, r * 0.42, "chitin", n=6)


WALK_FRAMES = 8


def gait(frame: int, group: int, stride: float, lift: float) -> tuple[float, float]:
    """Foot offset (dx along the nose, dz up) for one leg group on one of WALK_FRAMES.

    Two groups half a cycle apart (spider trot / alternating tripods). Each foot
    swings forward over the first half of its own cycle (arc up and over) and is
    planted for the second half, sliding back under the body at a constant rate
    (it holds still on the ground while the body walks over it). Frame 0 has
    group 0 at the start of its swing and group 1 at the start of its stance:
    every foot is down, so it is the idle stand.
    """
    q = ((frame / WALK_FRAMES) + 0.5 * group) % 1.0
    if q < 0.5:
        u = q / 0.5
        return -stride * math.cos(math.pi * u), lift * math.sin(math.pi * u)
    u = (q - 0.5) / 0.5
    return stride * (1 - 2 * u), 0.0


def solve_knee(hip, knee0, ankle0, ankle) -> np.ndarray:
    """Two-bone IK keeping the authored bone lengths and the authored bend direction."""
    hip, knee0, ankle0, ankle = (np.asarray(p, float) for p in (hip, knee0, ankle0, ankle))
    l1 = float(np.linalg.norm(knee0 - hip))
    l2 = float(np.linalg.norm(ankle0 - knee0))
    d0 = (ankle0 - hip) / np.linalg.norm(ankle0 - hip)
    bend = (knee0 - hip) - d0 * float(np.dot(knee0 - hip, d0))
    d = ankle - hip
    dist = float(np.linalg.norm(d))
    dn = d / dist
    dist = min(max(dist, abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3)
    perp = bend - dn * float(np.dot(bend, dn))
    perp /= np.linalg.norm(perp)
    along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, l1 * l1 - along * along))
    return hip + dn * along + perp * h


def posed_leg(m: Mesh, hip, knee, ankle, foot, dx: float, dz: float, lift: float, r: float = 0.3, plate: bool = True) -> None:
    """leg() with the foot moved by (dx, dz); the knee re-solved, the claw curls back as it rises."""
    hip, knee, ankle, foot = (np.asarray(p, float) for p in (hip, knee, ankle, foot))
    off = np.array([dx, 0.0, dz])
    a2 = ankle + off
    claw = foot - ankle
    k = dz / lift if lift > 0 else 0.0
    curl = np.array([-0.35 * k * np.linalg.norm(claw), 0.0, 0.25 * k * np.linalg.norm(claw)])
    f2 = a2 + claw + curl
    k2 = solve_knee(hip, knee, ankle, a2)
    leg(m, hip, k2, a2, f2, r=r, plate=plate)


def shell(m: Mesh, c, r, plates: int, team: tuple[int, int] | None = None, seg: int = 18, seam: float = 0.04) -> None:
    """Ribbed alloy shell along x: render_seed.plated with the grey-green alloy over a chitin belly."""
    cx, cy, cz = c
    rx, ry, rz = r
    stations: list[tuple[float, float]] = []
    mats: list[str] = []
    t0, t1 = -0.98, 0.98
    span = (t1 - t0) / plates
    for p in range(plates):
        a = t0 + p * span
        b = a + span
        if p == 0:
            stations.append((a, 1.0))
        else:
            stations.append((a + seam * 0.5, 0.9))
            mats.append(f"seam:{p}")
            stations.append((a + seam, 1.0))
            mats.append(f"seam:{p}")
        for q in (0.35, 0.7):
            stations.append((a + span * q, 1.0))
            mats.append(f"plate:{p}")
        stations.append((b - seam * 0.5, 1.05))
        mats.append(f"plate:{p}")
    rings = []
    for t, f in stations:
        k = max(math.sqrt(max(0.0, 1 - t * t)), 0.06) * f
        rings.append([np.array([cx + rx * t, cy + ry * k * math.cos(2 * math.pi * s / seg), cz + rz * k * math.sin(2 * math.pi * s / seg)]) for s in range(seg)])

    def mat(ri: int, s: int) -> str:
        kind, p = mats[min(ri, len(mats) - 1)].split(":")
        if kind == "seam":
            return "seam"
        top = seg // 4
        if team and team[0] <= int(p) <= team[1] and abs(s - top) <= 1:
            return "team"
        if seg * 9 // 16 <= s <= seg * 15 // 16:
            return "chitin"
        if int(p) % 2:
            return "alloy_hi"
        return "alloy"

    m.loft(rings, mat)


def banded_dome_mat(seg: int, seam_rings: tuple[int, ...], team_seg: int | None = None, team_rings: tuple[int, ...] = ()):
    """Material fn for dome(): glow seams on some rings, a gray team plate at one heading."""

    def f(ri: int, s: int) -> str:
        if ri in seam_rings:
            return "seam"
        if team_seg is not None and ri in team_rings and min(abs(s - team_seg), seg - abs(s - team_seg)) <= 1:
            return "team"
        if ri <= 1:
            return "chitin"
        return "alloy" if (s // 3) % 2 == 0 else "alloy_hi"

    return f


# ---------------------------------------------------------------- compose + check


def frames(folder: Path) -> list[Image.Image]:
    return [Image.open(folder / f"{i:04d}.png").convert("RGBA") for i in range(1, 17)]


def bbox(im: Image.Image, a_min: int = 8):
    return im.split()[-1].point(lambda v: 255 if v >= a_min else 0).getbbox()


def fit(layers: list[list[Image.Image]]):
    """composeAligned's numbers: scale, ox, oy for the 128 cell."""
    boxes = []
    hull_bottoms = []
    for i in range(16):
        for li, layer in enumerate(layers):
            b = bbox(layer[i])
            if not b:
                raise SystemExit(f"empty layer {li} frame {i + 1}")
            boxes.append(b)
            if li == 0:
                hull_bottoms.append(b[3])
    x0 = min(b[0] for b in boxes)
    y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes)
    y1 = max(b[3] for b in boxes)
    room = CELL - 2 * PADDING
    scale = min(room / (x1 - x0), room / (y1 - y0), 1)
    cx = layers[0][0].width / 2
    med = sorted(hull_bottoms)[len(hull_bottoms) // 2]
    ox = CELL / 2 - cx * scale
    oy = CELL * CONTACT_Y - med * scale
    lo = PADDING - y0 * scale
    hi = CELL - PADDING - y1 * scale
    oy = (lo + hi) / 2 if hi < lo else min(hi, max(lo, oy))
    return scale, ox, oy, (x0, y0, x1, y1)


def place(layer_img: Image.Image, scale: float, ox: float, oy: float) -> Image.Image:
    c = Image.new("RGBA", (CELL, CELL))
    w = max(1, round(layer_img.width * scale))
    h = max(1, round(layer_img.height * scale))
    small = layer_img.resize((w, h), Image.LANCZOS)
    x, y = round(ox), round(oy)
    sx0, sy0 = max(0, -x), max(0, -y)
    sx1, sy1 = min(w, CELL - x), min(h, CELL - y)
    if sx1 > sx0 and sy1 > sy0:
        c.alpha_composite(small.crop((sx0, sy0, sx1, sy1)), (x + sx0, y + sy0))
    return c


def gun_behind(row: int) -> bool:
    return 5 <= row <= 11


def assemble(cells: dict[str, list[Image.Image]], hull_row: int, turret_row: int) -> Image.Image:
    out = Image.new("RGBA", (CELL, CELL))
    order = ["gun", "hull", "turret"] if gun_behind(turret_row) else ["hull", "turret", "gun"]
    for name in order:
        if name in cells:
            src = cells[name][hull_row if name == "hull" else turret_row]
            out.alpha_composite(src)
    return out


def check(unit: str, out: Path, layers: list[str], scale_frac: float, z_mid: float, cy_frac: float, src_cell: int = 256,
          model: dict | None = None, ref_draw_px_per_m: float = 4.8) -> dict:
    raw = {n: frames(out / n) for n in layers}
    scale, ox, oy, union = fit([raw[n] for n in layers])
    cells = {n: [place(im, scale, ox, oy) for im in raw[n]] for n in layers}

    report: dict = {"unit": unit, "fit_scale": round(scale, 4)}
    empty, clipped = [], []
    heights = []
    for n in layers:
        for i, c in enumerate(cells[n]):
            b = bbox(c)
            if not b:
                empty.append(f"{n}:{NAMES[i]}")
                continue
            if b[0] <= 0 or b[1] <= 0 or b[2] >= CELL or b[3] >= CELL:
                clipped.append(f"{n}:{NAMES[i]}")
            if n == "hull":
                heights.append(b[3] - b[1])
    med_h = sorted(heights)[len(heights) // 2]
    pops = [NAMES[i] for i, h in enumerate(heights) if abs(h - med_h) / med_h > 0.12]
    contacts = [bbox(c)[3] for c in cells["hull"]]
    report.update(empty_dirs=empty, clipped_dirs=clipped, hull_size_pop_dirs=pops, hull_heights=heights, hull_bottoms=contacts)

    # Model numbers: the model origin's ground point in the cell, and cell px per meter.
    src_px_per_m = src_cell * scale_frac
    origin_sy = src_cell * cy_frac - (0 - z_mid) * math.cos(rp.CAM_ELEV) * src_px_per_m
    origin_cell_y = origin_sy * scale + oy
    origin_cell_x = (src_cell / 2) * scale + ox
    cell_per_m = src_px_per_m * scale / CELL
    report.update(
        cellPerMeter=round(cell_per_m, 4),
        originCell=(round(origin_cell_x / CELL, 4), round(origin_cell_y / CELL, 4)),
        originLift=round(CONTACT_Y - origin_cell_y / CELL, 4),
        union_m=(round((union[2] - union[0]) / src_px_per_m, 2), round((union[3] - union[1]) / src_px_per_m, 2)),
    )
    # drawSize so the unit has `ref_draw_px_per_m` on-map px per meter (Tiger-class tanks ~4.8).
    report["drawSize_at_ref"] = round(ref_draw_px_per_m / cell_per_m)
    if model:
        report["model"] = model

    # Previews: 4x4 of the assembled unit (hull and turret on the same row), and a mixed-aim board.
    PREVIEW.mkdir(parents=True, exist_ok=True)
    big = 2
    lab = 14
    board = Image.new("RGB", (4 * CELL * big, 4 * (CELL * big + lab)), (107, 83, 64))
    d = ImageDraw.Draw(board)
    for i in range(16):
        r, c = divmod(i, 4)
        a = assemble(cells, i, i).resize((CELL * big, CELL * big), Image.NEAREST)
        x, y = c * CELL * big, r * (CELL * big + lab)
        board.paste(a.convert("RGB"), (x, y), a)
        d.line((x, y + round(CONTACT_Y * CELL * big), x + CELL * big, y + round(CONTACT_Y * CELL * big)), fill=(160, 40, 40))
        d.text((x + 4, y + CELL * big + 1), f"{i} {NAMES[i]}", fill=(240, 236, 220))
    board.save(PREVIEW / f"{unit}-turntable.png")

    # Layers apart: hull row strip, turret row strip, gun row strip at 1x.
    strip = Image.new("RGBA", (16 * CELL, (len(layers) + 1) * CELL), (64, 58, 50, 255))
    for i in range(16):
        for li, n in enumerate(layers):
            strip.alpha_composite(cells[n][i], (i * CELL, li * CELL))
        strip.alpha_composite(assemble(cells, i, i), (i * CELL, len(layers) * CELL))
    strip.save(PREVIEW / f"{unit}-strip.png")

    # Mixed aim: hull E (row 12) and S (row 0), turret through all 16.
    mix = Image.new("RGBA", (16 * CELL, 2 * CELL), (74, 107, 50, 255))
    for i in range(16):
        mix.alpha_composite(assemble(cells, 12, i), (i * CELL, 0))
        mix.alpha_composite(assemble(cells, 0, i), (i * CELL, CELL))
    mix.save(PREVIEW / f"{unit}-aim.png")

    # Gameplay size strip.
    ds = report["drawSize_at_ref"]
    gp = Image.new("RGBA", (16 * (ds + 4), ds + 4), (74, 107, 50, 255))
    for i in range(16):
        gp.alpha_composite(assemble(cells, i, i).resize((ds, ds), Image.LANCZOS), (i * (ds + 4) + 2, 2))
    gp.save(PREVIEW / f"{unit}-gameplay.png")

    (PREVIEW / f"{unit}-manifest.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k not in ("hull_heights", "hull_bottoms")}, indent=1))
    print("hull heights", heights)
    print("hull bottoms", contacts)
    return report


def cameo(unit: str, out: Path, layers: list[str], face: str = "0014", gain: float = 1.3, lift: float = 0.03) -> None:
    """The Apocalypse's static cameo: the 3/4 front face, all layers, brightened, 128 px, on the bottom edge."""
    img = Image.open(out / layers[0] / f"{face}.png").convert("RGBA")
    for layer in layers[1:]:
        img.alpha_composite(Image.open(out / layer / f"{face}.png").convert("RGBA"))
    crop = img.crop(img.getbbox())
    px = np.asarray(crop).astype(np.float64) / 255
    rgb = px[..., :3]
    dark = rgb.max(axis=-1, keepdims=True) < 0.12
    px[..., :3] = np.where(dark, rgb, np.clip(rgb * gain + lift, 0, 1))
    crop = Image.fromarray((px * 255 + 0.5).astype(np.uint8), "RGBA")
    size, pad = 128, 3
    f = (size - 2 * pad) / max(crop.width, crop.height)
    small = crop.resize((max(1, round(crop.width * f)), max(1, round(crop.height * f))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(small, ((size - small.width) // 2, size - pad - small.height))
    path = out.parent / f"{unit}-cameo.png"
    canvas.save(path)
    print("wrote", path)


# ---------------------------------------------------------------- baked walk sheets


def render_faces(mesh: Mesh, scale_frac: float, z_mid: float, cy_frac: float, faces=range(16), cell: int = 256, ss: int = 4) -> list[Image.Image]:
    """render_procedural.render_turntable's camera and passes, kept in memory (one image per face)."""
    size = cell * ss
    scale = size * scale_frac
    ce, se = math.cos(rp.CAM_ELEV), math.sin(rp.CAM_ELEV)
    out = []
    for k in faces:
        phi = math.pi / 2 + k * math.pi / 8
        yaw = rp.screen_to_ground_yaw(phi)
        cy, sy_ = math.cos(yaw), math.sin(yaw)

        def to_world(p: np.ndarray) -> np.ndarray:
            x, y, z = p[..., 0], p[..., 1], p[..., 2]
            return np.stack([x * cy - y * sy_, x * sy_ + y * cy, z], axis=-1)

        def to_screen(verts: np.ndarray):
            wv = to_world(verts)
            X, Y, Z = wv[:, 0], wv[:, 1], wv[:, 2]
            return size / 2 + X * scale, size * cy_frac - (Y * se + (Z - z_mid) * ce) * scale, -Y * ce + Z * se

        def normal_fn(a, b, c):
            return to_world(a), to_world(b), to_world(c)

        fr = rp.rasterize(mesh, to_screen, (size, size), normal_fn)
        fr = rp.add_outline(fr, max(1, ss))
        out.append(rp.downsample(fr, ss))
    return out


_JOB: dict = {}


def _render_job(task: tuple[int, int]) -> tuple[int, int, Image.Image]:
    f, k = task
    j = _JOB
    img = render_faces(j["meshes"][f], j["scale_frac"], j["z_mid"], j["cy_frac"], faces=[k], ss=j["ss"])[0]
    return f, k, img


def bake(unit: str, out: Path, build_frame, scale_frac: float, z_mid: float, cy_frac: float, ss: int = 4, jobs: int = 8) -> dict:
    """Bake <unit>-legs.png (WALK_FRAMES x 16), <unit>-turret.png and <unit>-gun.png (1 x 16) at CELL.

    The fit (scale, ox, oy) is the runtime's composeAligned over the shipped hull/turret/gun
    turntable folders, so the baked sheets sit exactly where the runtime-composed ones do:
    same on-screen size, same contact line, the turret on the ring. Every walk frame is
    placed with that one transform.
    """
    import multiprocessing as mp

    raw = {n: frames(out / n) for n in ("hull", "turret", "gun")}
    scale, ox, oy, _ = fit([raw["hull"], raw["turret"], raw["gun"]])
    _JOB.update(meshes=[build_frame(f) for f in range(WALK_FRAMES)], scale_frac=scale_frac, z_mid=z_mid, cy_frac=cy_frac, ss=ss)
    tasks = [(f, k) for f in range(WALK_FRAMES) for k in range(16)]
    with mp.get_context("fork").Pool(jobs) as pool:
        done = pool.map(_render_job, tasks, chunksize=1)
    legs_src = {(f, k): img for f, k, img in done}

    legs = Image.new("RGBA", (WALK_FRAMES * CELL, 16 * CELL))
    cells: dict[tuple[int, int], Image.Image] = {}
    for (f, k), img in legs_src.items():
        c = place(img, scale, ox, oy)
        cells[(f, k)] = c
        legs.alpha_composite(c, (f * CELL, k * CELL))
    tur = Image.new("RGBA", (CELL, 16 * CELL))
    gun = Image.new("RGBA", (CELL, 16 * CELL))
    tcells = [place(im, scale, ox, oy) for im in raw["turret"]]
    gcells = [place(im, scale, ox, oy) for im in raw["gun"]]
    for k in range(16):
        tur.alpha_composite(tcells[k], (0, k * CELL))
        gun.alpha_composite(gcells[k], (0, k * CELL))
    legs.save(UNITS / f"{unit}-legs.png")
    tur.save(UNITS / f"{unit}-turret.png")
    gun.save(UNITS / f"{unit}-gun.png")

    # Checks: empty / clipped cells, and the bbox per row across frames (gait only, no scale pop).
    empty, clipped, pops = [], [], []
    h0 = [bbox(cells[(0, k)])[3] - bbox(cells[(0, k)])[1] for k in range(16)]
    med = sorted(h0)[8]
    rows = {}
    for k in range(16):
        hs, bots, ws = [], [], []
        for f in range(WALK_FRAMES):
            b = bbox(cells[(f, k)])
            if not b:
                empty.append(f"{NAMES[k]}:f{f}")
                continue
            if b[0] <= 0 or b[1] <= 0 or b[2] >= CELL or b[3] >= CELL:
                clipped.append(f"{NAMES[k]}:f{f}")
            hs.append(b[3] - b[1])
            ws.append(b[2] - b[0])
            bots.append(b[3])
        rows[NAMES[k]] = {"h": [min(hs), max(hs)], "w": [min(ws), max(ws)], "bottom": [min(bots), max(bots)]}
        if abs(h0[k] - med) / med > 0.12:
            pops.append(NAMES[k])
    for n, cs in (("turret", tcells), ("gun", gcells)):
        for k, c in enumerate(cs):
            b = bbox(c)
            if not b:
                empty.append(f"{n}:{NAMES[k]}")
            elif b[0] <= 0 or b[1] <= 0 or b[2] >= CELL or b[3] >= CELL:
                clipped.append(f"{n}:{NAMES[k]}")

    # Preview: S, E, N, W (+ SE, NW) rows, all frames, legs + turret + gun assembled, 2x, labeled, contact line.
    big, lab = 2, 14
    pick = [("S", 0), ("E", 12), ("N", 8), ("W", 4), ("SE", 14), ("NW", 6)]
    pv = Image.new("RGB", (WALK_FRAMES * CELL * big, len(pick) * (CELL * big + lab)), (107, 83, 64))
    d = ImageDraw.Draw(pv)
    for ri, (name, k) in enumerate(pick):
        for f in range(WALK_FRAMES):
            a = assemble({"hull": [cells[(f, i)] for i in range(16)], "turret": tcells, "gun": gcells}, k, k)
            a = a.resize((CELL * big, CELL * big), Image.NEAREST)
            x, y = f * CELL * big, ri * (CELL * big + lab)
            pv.paste(a.convert("RGB"), (x, y + lab), a)
            cyl = y + lab + round(CONTACT_Y * CELL * big)
            d.line((x, cyl, x + CELL * big, cyl), fill=(160, 40, 40))
            d.text((x + 4, y + 1), f"{name} f{f}", fill=(240, 236, 220))
    pv.save(PREVIEW / f"{unit}-walk.png")
    bg = Image.new("RGBA", legs.size, (107, 83, 64, 255))
    bg.alpha_composite(legs)
    bg.convert("RGB").save(PREVIEW / f"{unit}-legs-sheet.png")

    report = {
        "unit": unit,
        "cell": CELL,
        "frames": WALK_FRAMES,
        "contactY": CONTACT_Y,
        "fit": [round(scale, 4), round(ox, 2), round(oy, 2)],
        "empty": empty,
        "clipped": clipped,
        "size_pop_dirs_f0": pops,
        "rows": rows,
    }
    (PREVIEW / f"{unit}-walk.json").write_text(json.dumps(report, indent=1) + "\n")
    print(json.dumps({k: report[k] for k in ("unit", "fit", "empty", "clipped", "size_pop_dirs_f0")}))
    for n, r in rows.items():
        print(f"  {n:4s} h {r['h']} w {r['w']} bottom {r['bottom']}")
    return report
