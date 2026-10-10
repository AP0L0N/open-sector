#!/usr/bin/env python3
"""Shared parts, materials and the bake for the Bloom beasts (render_bloom_beasts.py)
and the Spore Pod (render_sporepod.py).

The Borg walkers' pipeline (borg_walker.py): same numpy rasterizer, camera, light and
outline (render_procedural.py), the Seed's flat emissive shading for glow, the 128 cell,
contactY 0.92, padding 4, 16 unique yaws (row 0 = south, clockwise 22.5 deg) and an
8-frame leg cycle where every frame is a step. Only the materials change: the Bloom
palette lock (gridlock/docs/factions/bloom.md) - wet flesh, ivory chitin plates, dark
membrane, amber glow, a gray team-tint carapace plate. No metal.

The legs / turret / gun layers are passes of one camera with one origin (the turret
ring centre), placed with one transform (bw.fit, the runtime's composeAligned), so the
client's borgWalker() composes them like the Stalker's.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import render_procedural as rp
import borg_walker as bw  # noqa: F401  (camera helpers, fit/place, the Seed's emissive shade)
from render_procedural import Mesh

ROOT = Path(__file__).resolve().parents[2]
UNITS = ROOT / "gridlock/packages/client/src/assets/units"
PREVIEW = Path(__file__).resolve().parent / "preview"

CELL = bw.CELL
CONTACT_Y = bw.CONTACT_Y
NAMES = bw.NAMES
WALK_FRAMES = bw.WALK_FRAMES
SRC_CELL = 256

# ---------------------------------------------------------------- palette lock
rp.MAT.update(
    {
        # Wet flesh: a little sheen.
        "fl_d": (rp.hex_rgb("#5e2f45"), 0.30, 1.0),
        "fl": (rp.hex_rgb("#8a4a63"), 0.34, 1.0),
        "fl_l": (rp.hex_rgb("#b7778a"), 0.34, 1.0),
        # Bone-ivory chitin.
        "bn_d": (rp.hex_rgb("#3a2a2e"), 0.12, 1.0),
        "bn": (rp.hex_rgb("#8c7a63"), 0.16, 1.0),
        "bn_l": (rp.hex_rgb("#cdbb98"), 0.18, 1.0),
        # Membrane / underbelly.
        "mem": (rp.hex_rgb("#24161f"), 0.20, 1.0),
        # Amber glow (emissive).
        "gl_d": (rp.hex_rgb("#e0701a"), 0.0, 1.0),
        "gl": (rp.hex_rgb("#ffb13b"), 0.0, 1.0),
        "gl_h": (rp.hex_rgb("#ffe08a"), 0.0, 1.0),
        # Team-tint carapace plate (chassis gray, lit to ~#6e6e68).
        "tm": (rp.hex_rgb("#7a7a74"), 0.08, 1.0),
    }
)
BLOOM_EMISSIVE = {"gl_d", "gl", "gl_h"}
_prev_shade = rp._shade


def _shade(mat: str, n_world: np.ndarray, base: np.ndarray) -> np.ndarray:
    if mat in BLOOM_EMISSIVE:
        lam = max(0.0, float(np.dot(n_world, rp.LIGHT)))
        return np.clip(base * (0.9 + 0.2 * lam), 0, 1)
    return _prev_shade(mat, n_world, base)


rp._shade = _shade

# ---------------------------------------------------------------- shapes


def V(*p) -> np.ndarray:
    return np.asarray(p if len(p) > 1 else p[0], float)


def blob(m: Mesh, c, r, mat, rings: int = 10, seg: int = 14, x_cut=(-1.0, 1.0)) -> None:
    """Ellipsoid along x; `mat` a name or fn(ring, seg). seg//4 is straight up."""
    cx, cy, cz = c
    rx, ry, rz = r
    out = []
    for i in range(rings + 1):
        t = x_cut[0] + (x_cut[1] - x_cut[0]) * i / rings
        k = max(math.sqrt(max(0.0, 1 - t * t)), 0.06)
        out.append([np.array([cx + rx * t, cy + ry * k * math.cos(2 * math.pi * s / seg), cz + rz * k * math.sin(2 * math.pi * s / seg)]) for s in range(seg)])
    m.loft(out, mat)


def knob(m: Mesh, c, r: float, mat: str) -> None:
    blob(m, c, (r, r, r), mat, rings=5, seg=8)


def _frames(pts: list[np.ndarray]):
    """Tangent / side / up per point of a path (up keeps toward +z)."""
    out = []
    n = len(pts)
    for i in range(n):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        t = b - a
        t = t / max(np.linalg.norm(t), 1e-9)
        ref = np.array([0, 0, 1.0]) if abs(t[2]) < 0.92 else np.array([1.0, 0, 0])
        side = np.cross(ref, t)
        side /= np.linalg.norm(side)
        up = np.cross(t, side)
        out.append((t, side, up))
    return out


def sweep(m: Mesh, pts, radii, mat, n: int = 10, squash: float = 1.0, cap0: bool = True, cap1: bool = True) -> None:
    """Tube along a polyline with a radius per point. `mat` a name or fn(ring, seg); seg n//4 is up."""
    pts = [np.asarray(p, float) for p in pts]
    rings = []
    for p, r, (t, side, up) in zip(pts, radii, _frames(pts)):
        rr = r if isinstance(r, (tuple, list)) else (r, r * squash)
        rings.append([p + rr[0] * math.cos(2 * math.pi * k / n) * side + rr[1] * math.sin(2 * math.pi * k / n) * up for k in range(n)])
    m.loft(rings, mat, cap0=cap0, cap1=cap1)


def tube(m: Mesh, a, b, r0: float, r1: float, mat, n: int = 8) -> None:
    sweep(m, [a, b], [r0, r1], mat, n=n)


def curve(p0, p1, p2, steps: int = 6) -> list[np.ndarray]:
    """Quadratic Bezier points p0 -> p2 bowed toward p1."""
    p0, p1, p2 = (np.asarray(p, float) for p in (p0, p1, p2))
    return [(1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2 for t in np.linspace(0, 1, steps)]


def horn(m: Mesh, base, mid, tip, r: float, mat: str = "bn_l", steps: int = 6, n: int = 8) -> None:
    """A curved tapering spine / tusk."""
    pts = curve(base, mid, tip, steps)
    radii = [r * (1 - 0.92 * i / (steps - 1)) for i in range(steps)]
    sweep(m, pts, radii, mat, n=n)


def body_mat(seg: int, plate_rings: set[int] | None = None, team_rings: set[int] = frozenset(), groove_rings: set[int] = frozenset(),
             plate_w: int | None = None, glow_groove: bool = False):
    """Material fn for an x-lofted body: bone plates on the back, flesh flanks, membrane belly."""
    top = seg // 4
    pw = plate_w if plate_w is not None else max(1, seg // 6)

    def f(ri: int, s: int) -> str:
        d = min(abs(s - top), seg - abs(s - top))
        belly = math.sin(2 * math.pi * (s + 0.5) / seg) < -0.35
        if ri in groove_rings:
            return "gl_d" if (glow_groove and not belly) else "fl_d"
        if belly:
            return "mem"
        if ri in team_rings and d <= 1:
            return "tm"
        if (plate_rings is None or ri in plate_rings) and d <= pw:
            return "bn_l" if d <= pw // 2 else "bn"
        return "fl" if d <= pw + 2 else "fl_d"

    return f


def ribbed(m: Mesh, c, r, bands: int, seg: int = 16, team_band: int | None = None, groove: float = 0.05, glow_groove: bool = True,
           plate_w: int | None = None) -> None:
    """Segmented flesh body along x: `bands` chitin-plated rings with sunken grooves between them."""
    cx, cy, cz = c
    rx, ry, rz = r
    st: list[tuple[float, float, str]] = []  # (t, factor, kind)
    t0, t1 = -0.98, 0.98
    span = (t1 - t0) / bands
    for p in range(bands):
        a = t0 + p * span
        if p == 0:
            st.append((a, 1.0, f"p{p}"))
        else:
            st.append((a + groove * 0.5, 0.88, "g"))
            st.append((a + groove, 1.0, f"p{p}"))
        st.append((a + span * 0.45, 1.04, f"p{p}"))
        st.append((a + span - groove * 0.5, 1.0, f"p{p}"))
    rings = []
    kinds = []
    for t, fct, kind in st:
        k = max(math.sqrt(max(0.0, 1 - t * t)), 0.06) * fct
        rings.append([np.array([cx + rx * t, cy + ry * k * math.cos(2 * math.pi * s / seg), cz + rz * k * math.sin(2 * math.pi * s / seg)]) for s in range(seg)])
        kinds.append(kind)
    team_rings = {i for i, k in enumerate(kinds) if team_band is not None and k == f"p{team_band}"}
    grooves = {i for i, k in enumerate(kinds) if k == "g"}
    m.loft(rings, body_mat(seg, None, team_rings, grooves, plate_w=plate_w, glow_groove=glow_groove))


def flesh_leg(m: Mesh, hip, knee, ankle, foot, r: float = 0.3, spur: bool = True) -> None:
    """Organic leg: fleshy thigh under a chitin plate, bony shin, ivory claw tip."""
    hip, knee, ankle, foot = (np.asarray(p, float) for p in (hip, knee, ankle, foot))
    tube(m, hip, knee, r, r * 0.72, "fl")
    tube(m, knee, ankle, r * 0.66, r * 0.4, "bn")
    tube(m, ankle, foot, r * 0.42, r * 0.08, "bn_l", n=6)
    knob(m, hip, r * 1.15, "fl_d")
    knob(m, knee, r * 0.85, "fl_l")
    knob(m, ankle, r * 0.5, "bn_d")
    # Chitin guard on the top of the thigh.
    a = hip + (knee - hip) * 0.15 + np.array([0, 0, r * 0.62])
    b = hip + (knee - hip) * 0.9 + np.array([0, 0, r * 0.5])
    tube(m, a, b, r * 0.6, r * 0.38, "bn_l", n=6)
    if spur:
        mid = knee + np.array([0, 0, r * 0.4])
        horn(m, mid, mid + (knee - hip) * 0.15 + np.array([0, 0, r * 1.0]), mid + (knee - hip) * 0.35 + np.array([0, 0, r * 1.8]), r * 0.35, "bn_l", steps=4, n=6)


def posed_leg(m: Mesh, hip, knee, ankle, foot, frame: int | None, group: int, stride: float, lift: float, r: float = 0.3, spur: bool = True) -> None:
    """flesh_leg with the bw.gait foot offset; the knee re-solved, the claw curling as it rises."""
    hip, knee, ankle, foot = (np.asarray(p, float) for p in (hip, knee, ankle, foot))
    if frame is None:
        flesh_leg(m, hip, knee, ankle, foot, r, spur)
        return
    dx, dz = bw.gait(frame, group, stride, lift)
    off = np.array([dx, 0.0, dz])
    a2 = ankle + off
    claw = foot - ankle
    k = dz / lift if lift > 0 else 0.0
    curl = np.array([-0.35 * k * np.linalg.norm(claw), 0.0, 0.25 * k * np.linalg.norm(claw)])
    k2 = bw.solve_knee(hip, knee, ankle, a2)
    flesh_leg(m, hip, k2, a2, a2 + claw + curl, r, spur)


def team_plate(m: Mesh, c, r) -> None:
    """A gray carapace scute (team tint) with an ivory rim, sitting on a back."""
    cx, cy, cz = c
    blob(m, (cx, cy, cz - 0.02), (r[0] * 1.12, r[1] * 1.12, r[2] * 0.8), "bn_d", rings=6, seg=12, x_cut=(-1, 1))
    blob(m, c, r, "tm", rings=6, seg=12)


def sac(m: Mesh, c, r, ribs: int = 0) -> None:
    """A glowing amber sac with dark flesh veins (ribs) across it."""
    if isinstance(r, (int, float)):
        r = (r, r, r)
    blob(m, c, r, lambda ri, s: "gl_h" if (ri in (4, 5) and 2 <= s <= 5) else "gl", rings=8, seg=12)
    for i in range(ribs):
        a = -0.6 + 1.2 * (i + 0.5) / ribs
        x = c[0] + r[0] * a
        k = math.sqrt(max(0.0, 1 - a * a))
        pts = [np.array([x, c[1] + r[1] * k * 1.04 * math.cos(t), c[2] + r[2] * k * 1.04 * math.sin(t)]) for t in np.linspace(0.15, math.pi - 0.15, 6)]
        sweep(m, pts, [0.05 + 0.02 * r[2]] * 6, "fl_d", n=5)


# ---------------------------------------------------------------- bake

_JOB: dict = {}


def _render_job(task):
    key, k = task
    img = bw.render_faces(_JOB["meshes"][key], _JOB["scale_frac"], _JOB["z_mid"], _JOB["cy_frac"], faces=[k], cell=SRC_CELL, ss=_JOB["ss"])[0]
    return key, k, img


def _edge_hits(img: Image.Image) -> bool:
    b = bw.bbox(img, 1)
    return bool(b) and (b[0] <= 0 or b[1] <= 0 or b[2] >= img.width or b[3] >= img.height)


def assemble(cells: dict, row: int, frame: int = 0) -> Image.Image:
    out = Image.new("RGBA", (CELL, CELL))
    order = ["gun", "legs", "turret"] if bw.gun_behind(row) else ["legs", "turret", "gun"]
    for n in order:
        if n == "legs":
            out.alpha_composite(cells["legs"][frame][row])
        elif n in cells:
            out.alpha_composite(cells[n][row])
    return out


def bake(unit: str, build_legs, build_turret, build_gun, scale_frac: float, z_mid: float, cy_frac: float,
         ref_ppm: float = 3.85, fps: int = 10, ss: int = 4, jobs: int = 8, draft: bool = False) -> dict:
    """Write <unit>-legs.png (8 x 16) [+ <unit>-turret.png, <unit>-gun.png (1 x 16)] + <unit>-cameo.png."""
    import multiprocessing as mp

    if draft:
        ss = 2
    meshes = {("legs", f): build_legs(f) for f in range(WALK_FRAMES)}
    has_turret = build_turret is not None
    if has_turret:
        meshes[("turret", 0)] = build_turret()
        meshes[("gun", 0)] = build_gun() if build_gun is not None else None
    meshes = {k: v for k, v in meshes.items() if v is not None and len(v.tris)}
    _JOB.update(meshes=meshes, scale_frac=scale_frac, z_mid=z_mid, cy_frac=cy_frac, ss=ss)
    tasks = [(key, k) for key in meshes for k in range(16)]
    print(f"{unit}: rendering {len(tasks)} faces, tris", {f"{a}{b}": len(v.tris) for (a, b), v in meshes.items()})
    with mp.get_context("fork").Pool(jobs) as pool:
        done = pool.map(_render_job, tasks, chunksize=1)
    raw: dict = {}
    for key, k, img in done:
        raw.setdefault(key, [None] * 16)[k] = img
    src_clip = [f"{a}{b}:{NAMES[k]}" for (a, b), imgs in raw.items() for k, im in enumerate(imgs) if _edge_hits(im)]
    if src_clip:
        print("SOURCE CLIPPED (raise SCALE_FRAC margin / cy):", src_clip[:12])

    layers = [raw[("legs", f)] for f in range(WALK_FRAMES)]
    if ("turret", 0) in raw:
        layers.append(raw[("turret", 0)])
    if ("gun", 0) in raw:
        layers.append(raw[("gun", 0)])
    scale, ox, oy, union = bw.fit(layers)

    cells = {"legs": [[bw.place(raw[("legs", f)][k], scale, ox, oy) for k in range(16)] for f in range(WALK_FRAMES)]}
    legs = Image.new("RGBA", (WALK_FRAMES * CELL, 16 * CELL))
    for f in range(WALK_FRAMES):
        for k in range(16):
            legs.alpha_composite(cells["legs"][f][k], (f * CELL, k * CELL))
    legs.save(UNITS / f"{unit}-legs.png")
    written = [f"{unit}-legs.png"]
    if has_turret:
        for n in ("turret", "gun"):
            sheet = Image.new("RGBA", (CELL, 16 * CELL))
            if (n, 0) in raw:
                cells[n] = [bw.place(im, scale, ox, oy) for im in raw[(n, 0)]]
                for k in range(16):
                    sheet.alpha_composite(cells[n][k], (0, k * CELL))
            sheet.save(UNITS / f"{unit}-{n}.png")
            written.append(f"{unit}-{n}.png")

    # Checks.
    empty, clipped, pops = [], [], []
    h0 = []
    rows = {}
    for k in range(16):
        hs, bots = [], []
        for f in range(WALK_FRAMES):
            b = bw.bbox(cells["legs"][f][k])
            if not b:
                empty.append(f"{NAMES[k]}:f{f}")
                continue
            if b[0] <= 0 or b[1] <= 0 or b[2] >= CELL or b[3] >= CELL:
                clipped.append(f"{NAMES[k]}:f{f}")
            hs.append(b[3] - b[1])
            bots.append(b[3])
        a = assemble(cells, k, 0)
        ab = bw.bbox(a)
        h0.append(ab[3] - ab[1] if ab else 0)
        rows[NAMES[k]] = {"h": [min(hs), max(hs)] if hs else None, "bottom": [min(bots), max(bots)] if bots else None}
    med = sorted(h0)[8]
    pops = [NAMES[k] for k in range(16) if abs(h0[k] - med) / med > 0.12]
    for n in ("turret", "gun"):
        for k, c in enumerate(cells.get(n, [])):
            b = bw.bbox(c)
            if not b:
                empty.append(f"{n}:{NAMES[k]}")
            elif b[0] <= 0 or b[1] <= 0 or b[2] >= CELL or b[3] >= CELL:
                clipped.append(f"{n}:{NAMES[k]}")

    src_ppm = SRC_CELL * scale_frac
    cell_per_m = src_ppm * scale / CELL
    draw = round(ref_ppm / cell_per_m)

    # Previews.
    PREVIEW.mkdir(parents=True, exist_ok=True)
    big, lab = 2, 14
    pick = [("S", 0), ("SE", 14), ("E", 12), ("NE", 10), ("N", 8), ("W", 4)]
    pv = Image.new("RGB", (WALK_FRAMES * CELL * big, len(pick) * (CELL * big + lab)), (107, 83, 64))
    d = ImageDraw.Draw(pv)
    for ri, (name, k) in enumerate(pick):
        for f in range(WALK_FRAMES):
            a = assemble(cells, k, f).resize((CELL * big, CELL * big), Image.NEAREST)
            x, y = f * CELL * big, ri * (CELL * big + lab)
            pv.paste(a.convert("RGB"), (x, y + lab), a)
            cyl = y + lab + round(CONTACT_Y * CELL * big)
            d.line((x, cyl, x + CELL * big, cyl), fill=(160, 40, 40))
            d.text((x + 4, y + 1), f"{name} f{f}", fill=(240, 236, 220))
    pv.save(PREVIEW / f"{unit}-walk.png")

    board = Image.new("RGB", (4 * CELL * big, 4 * (CELL * big + lab)), (74, 107, 50))
    d = ImageDraw.Draw(board)
    for i in range(16):
        r, c = divmod(i, 4)
        a = assemble(cells, i, 0).resize((CELL * big, CELL * big), Image.NEAREST)
        x, y = c * CELL * big, r * (CELL * big + lab)
        board.paste(a.convert("RGB"), (x, y), a)
        d.line((x, y + round(CONTACT_Y * CELL * big), x + CELL * big, y + round(CONTACT_Y * CELL * big)), fill=(160, 40, 40))
        d.text((x + 4, y + CELL * big + 1), f"{i} {NAMES[i]}", fill=(240, 236, 220))
    board.save(PREVIEW / f"{unit}-turntable.png")

    gp = Image.new("RGBA", (16 * (draw + 4), draw + 4), (74, 107, 50, 255))
    for i in range(16):
        gp.alpha_composite(assemble(cells, i, 0).resize((draw, draw), Image.LANCZOS), (i * (draw + 4) + 2, 2))
    gp.save(PREVIEW / f"{unit}-gameplay.png")

    # Cameo: assembled east (row 12), frame 0, from the source renders; brightened like the walkers.
    img = raw[("legs", 0)][12].copy()
    for n in ("turret", "gun"):
        if (n, 0) in raw:
            img.alpha_composite(raw[(n, 0)][12])
    crop = img.crop(img.getbbox())
    px = np.asarray(crop).astype(np.float64) / 255
    rgb = px[..., :3]
    dark = rgb.max(axis=-1, keepdims=True) < 0.12
    px[..., :3] = np.where(dark, rgb, np.clip(rgb * 1.3 + 0.03, 0, 1))
    crop = Image.fromarray((px * 255 + 0.5).astype(np.uint8), "RGBA")
    size, pad = 128, 3
    fct = (size - 2 * pad) / max(crop.width, crop.height)
    small = crop.resize((max(1, round(crop.width * fct)), max(1, round(crop.height * fct))), Image.LANCZOS)
    cam = Image.new("RGBA", (size, size))
    cam.alpha_composite(small, ((size - small.width) // 2, size - pad - small.height))
    cam.save(UNITS / f"{unit}-cameo.png")
    written.append(f"{unit}-cameo.png")

    report = {
        "unit": unit,
        "cell": CELL,
        "frames": WALK_FRAMES,
        "contactY": CONTACT_Y,
        "fit": [round(scale, 4), round(ox, 2), round(oy, 2)],
        "cellPerMeter": round(cell_per_m, 4),
        "drawSize": draw,
        "fps": fps,
        "ref_px_per_m": ref_ppm,
        "union_m": [round((union[2] - union[0]) / src_ppm, 2), round((union[3] - union[1]) / src_ppm, 2)],
        "turret": has_turret,
        "empty": empty,
        "clipped": clipped,
        "source_clipped": src_clip,
        "size_pop_dirs_f0": pops,
        "assembled_h_f0": h0,
        "rows": rows,
        "written": written,
    }
    (PREVIEW / f"{unit}-bloom.json").write_text(json.dumps(report, indent=1) + "\n")
    print(json.dumps({k: report[k] for k in ("unit", "fit", "cellPerMeter", "drawSize", "union_m", "empty", "clipped", "source_clipped", "size_pop_dirs_f0", "written")}))
    print("assembled heights f0", h0)
    return report
