#!/usr/bin/env python3
"""Procedural 3D turntable renders for units with no Blender source.

A small numpy rasterizer stands in for Blender: one mesh, one locked
camera, the subject yaws in place. It writes the same drop-in files the
Blender path does, so the engine and compose tools treat them alike.

  stuka     16 unique faces, 0001 = nose screen-south, clockwise 22.5°.
            gridlock/packages/client/src/assets/units/stuka/hull/0001.png … 0016.png

The Airfield structure has its own renderer: tools/sprites/render_airfield.py.

Camera: orthographic, 30° down, so the ground foreshortens 2:1 like the map.
Each face yaws the model so its nose lands on the exact on-screen bearing of
that sheet row (engineRowFromScreen), not a raw 22.5° ground step.

No national insignia. The rear-fuselage band and the spinner stay neutral gray
so the game can tint them.

  python tools/sprites/render_procedural.py stuka \\
      --out gridlock/packages/client/src/assets/units/stuka/hull
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

OUTLINE = np.array([0x1A, 0x14, 0x10], dtype=np.float64) / 255
CAM_ELEV = math.radians(30.0)
LIGHT = np.array([-0.55, 0.45, 0.85])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


def hex_rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float64) / 255


# Materials: name -> (base rgb, specular, alpha)
MAT = {
    "camo": (hex_rgb("#4a5a38"), 0.10, 1.0),
    "under": (hex_rgb("#8ea3ae"), 0.08, 1.0),
    "glass": (hex_rgb("#8fb0b8"), 0.45, 1.0),
    "frame": (hex_rgb("#34402c"), 0.05, 1.0),
    "metal": (hex_rgb("#3a3a36"), 0.20, 1.0),
    "tire": (hex_rgb("#1f1d1a"), 0.02, 1.0),
    "team": (hex_rgb("#7a7a74"), 0.10, 1.0),
    "bomb": (hex_rgb("#4b4f3e"), 0.18, 1.0),
    "prop": (hex_rgb("#b8b4a8"), 0.00, 0.22),
    "grass": (hex_rgb("#4a6b32"), 0.0, 1.0),
    "strip": (hex_rgb("#6f8a45"), 0.0, 1.0),
    "dirt": (hex_rgb("#8a6e52"), 0.0, 1.0),
    "concrete": (hex_rgb("#7a7a74"), 0.03, 1.0),
    "roof": (hex_rgb("#5a6b3d"), 0.06, 1.0),
    "wall": (hex_rgb("#6b5340"), 0.02, 1.0),
    "door": (hex_rgb("#2e2a24"), 0.0, 1.0),
    "rust": (hex_rgb("#8b3a2a"), 0.05, 1.0),
    "sock": (hex_rgb("#c45a12"), 0.0, 1.0),
    "white": (hex_rgb("#d8d4c4"), 0.0, 1.0),
}
CAMO_B = hex_rgb("#35432c")


@dataclass
class Mesh:
    verts: list[np.ndarray] = field(default_factory=list)
    tris: list[tuple[int, int, int, str]] = field(default_factory=list)

    def v(self, p) -> int:
        self.verts.append(np.asarray(p, dtype=np.float64))
        return len(self.verts) - 1

    def tri(self, a: int, b: int, c: int, mat: str) -> None:
        self.tris.append((a, b, c, mat))

    def quad(self, a: int, b: int, c: int, d: int, mat: str) -> None:
        self.tri(a, b, c, mat)
        self.tri(a, c, d, mat)

    def box(self, lo, hi, mat: str, top_mat: str | None = None) -> None:
        x0, y0, z0 = lo
        x1, y1, z1 = hi
        p = [self.v((x, y, z)) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
        # 0..3 bottom (x0y0,x1y0,x0y1,x1y1), 4..7 top
        self.quad(p[4], p[5], p[7], p[6], top_mat or mat)
        self.quad(p[0], p[2], p[3], p[1], mat)
        self.quad(p[0], p[1], p[5], p[4], mat)
        self.quad(p[2], p[6], p[7], p[3], mat)
        self.quad(p[0], p[4], p[6], p[2], mat)
        self.quad(p[1], p[3], p[7], p[5], mat)

    def loft(self, rings: list[list[np.ndarray]], mat, cap0: bool = True, cap1: bool = True) -> None:
        """Rings of equal length along the body. `mat` is a name or fn(ring_index, seg_index)."""
        ids = [[self.v(p) for p in ring] for ring in rings]
        n = len(rings[0])
        for r in range(len(ids) - 1):
            for s in range(n):
                a, b = ids[r][s], ids[r][(s + 1) % n]
                c, d = ids[r + 1][(s + 1) % n], ids[r + 1][s]
                m = mat(r, s) if callable(mat) else mat
                self.quad(a, b, c, d, m)
        for cap, ring in ((cap0, ids[0]), (cap1, ids[-1])):
            if not cap:
                continue
            ctr = self.v(np.mean([self.verts[i] for i in ring], axis=0))
            m = mat(0, 0) if callable(mat) else mat
            for s in range(n):
                self.tri(ctr, ring[s], ring[(s + 1) % n], m)


def ellipse_ring(x: float, cy: float, cz: float, hw: float, hh: float, n: int = 18) -> list[np.ndarray]:
    return [
        np.array([x, cy + hw * math.cos(2 * math.pi * k / n), cz + hh * math.sin(2 * math.pi * k / n)])
        for k in range(n)
    ]


def wing_panel(m: Mesh, root, tip, mat_top: str, mat_bot: str, thick_root: float, thick_tip: float) -> None:
    """root/tip: (x_lead, x_trail, y, z). A thin wedge airfoil panel."""
    (xl0, xt0, y0, z0), (xl1, xt1, y1, z1) = root, tip
    t0, t1 = thick_root / 2, thick_tip / 2
    rl_top = m.v((xl0, y0, z0 + t0 * 0.6))
    rt_top = m.v((xt0, y0, z0 + t0 * 0.2))
    tl_top = m.v((xl1, y1, z1 + t1 * 0.6))
    tt_top = m.v((xt1, y1, z1 + t1 * 0.2))
    rl_bot = m.v((xl0, y0, z0 - t0))
    rt_bot = m.v((xt0, y0, z0 - t0 * 0.2))
    tl_bot = m.v((xl1, y1, z1 - t1))
    tt_bot = m.v((xt1, y1, z1 - t1 * 0.2))
    rle = m.v((xl0 + 0.12, y0, z0))
    tle = m.v((xl1 + 0.08, y1, z1))
    m.quad(rl_top, rt_top, tt_top, tl_top, mat_top)
    m.quad(rl_bot, tl_bot, tt_bot, rt_bot, mat_bot)
    m.quad(rle, rl_top, tl_top, tle, mat_top)
    m.quad(rle, tle, tl_bot, rl_bot, mat_bot)
    m.quad(rt_top, rt_bot, tt_bot, tt_top, mat_bot)
    m.quad(tl_top, tt_top, tt_bot, tl_bot, mat_top)
    m.tri(tle, tl_top, tl_bot, mat_top)
    m.tri(rle, rl_bot, rl_top, mat_top)


def build_stuka() -> Mesh:
    """Ju 87 B in meters. +x nose, +y left wing, +z up. Wheels at z=0."""
    m = Mesh()
    zc = 2.35  # fuselage centerline height over the wheels
    # Fuselage loft: (x, half-width, half-height, center z offset)
    stations = [
        (5.05, 0.30, 0.34, 0.02),
        (4.70, 0.52, 0.62, 0.00),
        (3.60, 0.58, 0.74, -0.02),
        (2.30, 0.60, 0.78, 0.00),
        (0.60, 0.60, 0.80, 0.02),
        (-1.20, 0.54, 0.72, 0.06),
        (-3.00, 0.40, 0.56, 0.14),
        (-4.80, 0.22, 0.38, 0.24),
        (-6.00, 0.08, 0.20, 0.34),
    ]
    rings = [ellipse_ring(x, 0.0, zc + oz, hw, hh) for x, hw, hh, oz in stations]

    n_ring = len(rings[0])

    def fus_mat(r: int, s: int) -> str:
        if r == 6:
            return "team"  # neutral band ahead of the tail
        if r == 0:
            return "metal"
        # Lower third of the ring is the pale underside.
        if math.sin(2 * math.pi * (s + 0.5) / n_ring) < -0.45:
            return "under"
        return "camo"

    m.loft(rings, fus_mat)
    # Chin radiator
    m.box((3.1, -0.36, zc - 1.05), (4.4, 0.36, zc - 0.55), "metal")
    # Canopy greenhouse
    can = [
        (2.30, 0.20, 0.10),
        (1.90, 0.38, 0.38),
        (0.60, 0.42, 0.46),
        (-0.60, 0.40, 0.42),
        (-1.50, 0.26, 0.22),
    ]
    can_rings = [ellipse_ring(x, 0.0, zc + 0.55, hw, hh, 14) for x, hw, hh in can]

    def can_mat(r: int, s: int) -> str:
        return "frame" if s % 4 == 0 or r == 1 else "glass"

    m.loft(can_rings, can_mat)
    # Inverted gull wing: inner panels droop, outer panels rise.
    wz = zc - 0.55
    kink_y, kink_z = 2.45, zc - 1.25
    tip_y, tip_z = 6.9, zc - 0.55
    for side in (1, -1):
        wing_panel(
            m,
            (1.25, -1.35, 0.45 * side, wz),
            (1.05, -1.25, kink_y * side, kink_z),
            "camo",
            "under",
            0.42,
            0.34,
        )
        wing_panel(
            m,
            (1.05, -1.25, kink_y * side, kink_z),
            (0.55, -0.55, tip_y * side, tip_z),
            "camo",
            "under",
            0.34,
            0.14,
        )
        # Neutral panel near the wing tip for team tint.
        wing_panel(
            m,
            (0.62, -0.62, (tip_y - 1.1) * side, tip_z - 0.05 + 0.02),
            (0.56, -0.56, (tip_y - 0.3) * side, tip_z + 0.02),
            "team",
            "under",
            0.2,
            0.16,
        )
        # Trousered undercarriage from the kink down to the wheel spat.
        gy = kink_y * side
        leg = [
            ellipse_ring(0.25, gy, kink_z - 0.05, 0.22, 0.34, 10),
            ellipse_ring(0.25, gy, 0.95, 0.20, 0.30, 10),
        ]
        leg_rings = [[p + np.array([0.0, 0.0, 0.0]) for p in ring] for ring in leg]
        # Rotate the leg ring to be horizontal slices (loft goes down in z).
        leg_rings = [
            [np.array([0.25 + 0.45 * math.cos(2 * math.pi * k / 10), gy + 0.2 * math.sin(2 * math.pi * k / 10), z]) for k in range(10)]
            for z in (kink_z - 0.1, 0.9)
        ]
        m.loft(leg_rings, "camo")
        spat = [
            ellipse_ring(x, gy, 0.55, hw, hh, 10)
            for x, hw, hh in ((1.05, 0.06, 0.10), (0.75, 0.22, 0.42), (0.1, 0.24, 0.50), (-0.55, 0.12, 0.28))
        ]
        m.loft(spat, "camo")
        m.box((-0.05, gy - 0.07, 0.0), (0.55, gy + 0.07, 0.18), "tire")
    # Tailplane and fin
    for side in (1, -1):
        wing_panel(m, (-4.70, -5.85, 0.2 * side, zc + 0.40), (-5.05, -5.85, 2.75 * side, zc + 0.46), "camo", "under", 0.16, 0.08)
    m.box((-5.95, -0.06, zc + 0.35), (-4.95, 0.06, zc + 1.85), "camo")
    m.box((-6.05, -0.05, zc + 0.9), (-5.6, 0.05, zc + 1.9), "camo")
    # SC 250 under the belly on the crutch
    bomb = [ellipse_ring(x, 0.0, zc - 1.05, r, r, 12) for x, r in ((1.55, 0.05), (1.25, 0.24), (0.1, 0.25), (-0.75, 0.12))]
    m.loft(bomb, "bomb")
    for side in (1, -1):
        m.box((-1.05, 0.02 * side - 0.03, zc - 1.35), (-0.75, 0.02 * side + 0.03, zc - 0.75), "bomb")
    # Spinner (neutral) and a translucent prop disc
    spin = [ellipse_ring(x, 0.0, zc + 0.02, r, r, 12) for x, r in ((5.0, 0.26), (5.35, 0.18), (5.62, 0.02))]
    m.loft(spin, "team")
    ctr = m.v((5.18, 0.0, zc + 0.02))
    n = 28
    rim = [m.v((5.18, 1.7 * math.cos(2 * math.pi * k / n), zc + 0.02 + 1.7 * math.sin(2 * math.pi * k / n))) for k in range(n)]
    for k in range(n):
        m.tri(ctr, rim[k], rim[(k + 1) % n], "prop")
    return m


def camo_color(p: np.ndarray) -> np.ndarray:
    """Straight-edged splinter pattern in model space."""
    a = math.floor(p[0] * 0.55 + p[1] * 0.95 + 0.3)
    b = math.floor(p[0] * -0.8 + p[1] * 0.45 + 0.7)
    return MAT["camo"][0] if (a + b) % 2 == 0 else CAMO_B


@dataclass
class Frame:
    color: np.ndarray
    alpha: np.ndarray


def rasterize(
    mesh: Mesh,
    to_screen,
    size: tuple[int, int],
    model_normal_fn=None,
) -> Frame:
    """to_screen(pts[N,3] world) -> (sx, sy, depth) arrays; bigger depth is closer."""
    w, h = size
    verts = np.array(mesh.verts)
    sx, sy, dep = to_screen(verts)
    zbuf = np.full((h, w), -np.inf)
    col = np.zeros((h, w, 3))
    alpha = np.zeros((h, w))
    translucent: list[int] = []
    for ti, (a, b, c, mat) in enumerate(mesh.tris):
        if MAT[mat][2] < 1:
            translucent.append(ti)
            continue
        _draw_tri(mesh, verts, sx, sy, dep, a, b, c, mat, zbuf, col, alpha, model_normal_fn, blend=False)
    for ti in translucent:
        a, b, c, mat = mesh.tris[ti]
        _draw_tri(mesh, verts, sx, sy, dep, a, b, c, mat, zbuf, col, alpha, model_normal_fn, blend=True)
    return Frame(col, alpha)


def _shade(mat: str, n_world: np.ndarray, base: np.ndarray) -> np.ndarray:
    spec = MAT[mat][1]
    lam = max(0.0, float(np.dot(n_world, LIGHT)))
    view = np.array([0.0, -math.cos(CAM_ELEV), math.sin(CAM_ELEV)])
    half = LIGHT + view
    half /= np.linalg.norm(half)
    s = max(0.0, float(np.dot(n_world, half))) ** 24 * spec * 1.6
    rim = 0.0
    return np.clip(base * (0.42 + 0.72 * lam) + s + rim, 0, 1)


def _draw_tri(mesh, verts, sx, sy, dep, a, b, c, mat, zbuf, col, alpha, model_normal_fn, blend):
    h, w = zbuf.shape
    x0, y0, x1, y1, x2, y2 = sx[a], sy[a], sx[b], sy[b], sx[c], sy[c]
    area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if abs(area) < 1e-9:
        return
    minx = max(0, int(math.floor(min(x0, x1, x2))))
    maxx = min(w - 1, int(math.ceil(max(x0, x1, x2))))
    miny = max(0, int(math.floor(min(y0, y1, y2))))
    maxy = min(h - 1, int(math.ceil(max(y0, y1, y2))))
    if minx > maxx or miny > maxy:
        return
    xs, ys = np.meshgrid(np.arange(minx, maxx + 1) + 0.5, np.arange(miny, maxy + 1) + 0.5)
    w0 = ((x1 - xs) * (y2 - ys) - (x2 - xs) * (y1 - ys)) / area
    w1 = ((x2 - xs) * (y0 - ys) - (x0 - xs) * (y2 - ys)) / area
    w2 = 1 - w0 - w1
    inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
    if not inside.any():
        return
    d = w0 * dep[a] + w1 * dep[b] + w2 * dep[c]
    zb = zbuf[miny : maxy + 1, minx : maxx + 1]
    vis = inside & (d > zb + (1e-6 if not blend else -1e-3))
    if not vis.any():
        return
    # World-space normal, oriented toward the camera.
    pa, pb, pc = model_normal_fn(verts[a], verts[b], verts[c]) if model_normal_fn else (verts[a], verts[b], verts[c])
    n = np.cross(pb - pa, pc - pa)
    ln = np.linalg.norm(n)
    if ln < 1e-12:
        return
    n /= ln
    view = np.array([0.0, -math.cos(CAM_ELEV), math.sin(CAM_ELEV)])
    if np.dot(n, view) < 0:
        n = -n
    base, _, a_mat = MAT[mat]
    if mat == "camo":
        base = camo_color((mesh.verts[a] + mesh.verts[b] + mesh.verts[c]) / 3)
    shaded = _shade(mat, n, base)
    region_c = col[miny : maxy + 1, minx : maxx + 1]
    region_a = alpha[miny : maxy + 1, minx : maxx + 1]
    if blend:
        region_c[vis] = region_c[vis] * (1 - a_mat) + shaded * a_mat
        region_a[vis] = region_a[vis] + (1 - region_a[vis]) * a_mat
        return
    zb[vis] = d[vis]
    region_c[vis] = shaded
    region_a[vis] = 1.0


def add_outline(frame: Frame, px: int) -> Frame:
    a = frame.alpha > 0.5
    grown = a.copy()
    for dy in range(-px, px + 1):
        for dx in range(-px, px + 1):
            if dx * dx + dy * dy > px * px:
                continue
            grown |= np.roll(np.roll(a, dy, axis=0), dx, axis=1)
    ring = grown & ~a
    col = frame.color.copy()
    alpha = frame.alpha.copy()
    col[ring] = OUTLINE
    alpha[ring] = 1.0
    # Soft parts (prop disc) keep their own alpha over the outline.
    return Frame(col, alpha)


def downsample(frame: Frame, k: int) -> Image.Image:
    h, w = frame.alpha.shape
    a = frame.alpha.reshape(h // k, k, w // k, k).mean(axis=(1, 3))
    premul = (frame.color * frame.alpha[..., None]).reshape(h // k, k, w // k, k, 3).mean(axis=(1, 3))
    c = np.where(a[..., None] > 1e-6, premul / np.maximum(a[..., None], 1e-6), 0)
    rgba = np.dstack([np.clip(c, 0, 1), np.clip(a, 0, 1)])
    return Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA")


def screen_to_ground_yaw(phi: float) -> float:
    """Ground yaw whose 30° projection points the nose at screen angle phi (y down)."""
    return math.atan2(-math.sin(phi) / math.sin(CAM_ELEV), math.cos(phi))


def render_stuka(out: Path, cell: int = 256, ss: int = 4) -> None:
    mesh = build_stuka()
    out.mkdir(parents=True, exist_ok=True)
    size = cell * ss
    # Meters -> supersampled px. Wingspan 13.8 m fits the cell with room for the outline.
    scale = size * 0.062
    ce, se = math.cos(CAM_ELEV), math.sin(CAM_ELEV)
    manifest = {"id": "stuka_hull", "cell": cell, "rows": 16, "facing": 16, "order": [], "files": []}
    names = ["S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE"]
    for k in range(16):
        phi = math.pi / 2 + k * math.pi / 8  # screen angle: row 0 down, then clockwise on screen
        yaw = screen_to_ground_yaw(phi)
        cy, sy_ = math.cos(yaw), math.sin(yaw)

        def to_world(p: np.ndarray) -> np.ndarray:
            x, y, z = p[..., 0], p[..., 1], p[..., 2]
            # model +x (nose) -> ground (cos yaw, sin yaw); model +y (left wing) -> 90° counter-clockwise
            gx = x * cy - y * sy_
            gy = x * sy_ + y * cy
            return np.stack([gx, gy, z], axis=-1)

        def to_screen(verts: np.ndarray):
            wv = to_world(verts)
            X, Y, Z = wv[:, 0], wv[:, 1], wv[:, 2]
            sx = size / 2 + X * scale
            syy = size * 0.58 - (Y * se + (Z - 1.2) * ce) * scale
            depth = -Y * ce + Z * se
            return sx, syy, depth

        def normal_fn(a, b, c):
            return to_world(a), to_world(b), to_world(c)

        fr = rasterize(mesh, to_screen, (size, size), normal_fn)
        fr = add_outline(fr, max(1, ss * 1))
        img = downsample(fr, ss)
        name = f"{k + 1:04d}.png"
        img.save(out / name)
        manifest["order"].append(names[k])
        manifest["files"].append(name)
        print("wrote", out / name, img.getbbox())
    (out.parent / "stuka-hull.json").write_text(json.dumps(manifest, indent=2) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["stuka"])
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    render_stuka(Path(args.out))


if __name__ == "__main__":
    main()
