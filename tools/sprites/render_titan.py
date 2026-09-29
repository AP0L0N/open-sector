#!/usr/bin/env python3
"""
Titan (heavy assault walker) — 16-dir engine sheets from a small 3D model.

No Blender in this pipeline: the mech is built from boxes / prisms and
rendered with a locked orthographic camera (the subject yaws, the camera does
not). Every layer shares one camera, one scale, and one ground origin, so the
torso-turret and gun composite on the legs at any aim, like the Tiger.

Rows are south-first, clockwise (engine order). Row k is solved so the nose
projects to screen angle south + k·22.5° — `engineRowFromScreen` picks rows by
screen angle, so this keeps the drawn nose on the path the unit walks.

Outputs (gridlock/packages/client/src/assets/units/):
  titan-legs.png          8 walk frames × 16 dirs (hull sheet)
  titan-torso.png         1 × 16 (turret sheet)
  titan-gun.png           1 × 16 (recoiling barrel)
  titan-braced-legs.png   1 × 16 (deployed: stance wide, outriggers down)
  titan-braced-torso.png  1 × 16 (torso lowered onto the braced hips)
  titan-braced-gun.png    1 × 16
  titan-cameo.png         128 × 128
Previews (tools/sprites/preview/): titan-strip.png (labeled 16 rows, legs +
torso + gun), titan-walk.png (E walk frames), titan-braced-strip.png,
titan.json manifest.

  python tools/sprites/render_titan.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "gridlock/packages/client/src/assets/units"
PREVIEW = ROOT / "tools/sprites/preview"

CELL = 192
CONTACT_Y = 0.84  # feet and outrigger pads reach ~20 px toward the camera
PADDING = 4
SCALE = 1.9  # px per model unit at CELL
ELEV = math.radians(40.0)  # camera pitch, same high 3/4 as the Walker
DIRS = 16
WALK_FRAMES = 8
ENGINE_ORDER = ["S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE"]

OUTLINE = (0x1A, 0x14, 0x10)


def hexc(s: str) -> tuple[int, int, int]:
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


# Flat ramps, dark → light. Olive armor, dark steel, team-tint gray, accents.
RAMPS: dict[str, list[tuple[int, int, int]]] = {
    # Locked to the Walker sheet (walker-move.png): brown-olive plate, dark steel.
    "armor": [hexc(c) for c in ("#242418", "#3c3c24", "#545430", "#66613a", "#7a7249")],
    "steel": [hexc(c) for c in ("#181818", "#2a2a28", "#3c3c3c", "#56564f")],
    "team": [hexc(c) for c in ("#4a4a46", "#6e6e68", "#8a8a83")],
    "visor": [hexc(c) for c in ("#8b3a2a", "#c45a12", "#e07a2a")],
    "hazard": [hexc(c) for c in ("#6b5212", "#a37c14", "#d4a017")],
}

LIGHT = np.array([-0.45, -0.55, 0.70])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


# ---------------------------------------------------------------- geometry

class Mesh:
    def __init__(self) -> None:
        self.tris: list[tuple[np.ndarray, str]] = []  # (3×3 verts, material)

    def quad(self, a, b, c, d, mat: str) -> None:
        self.tris.append((np.array([a, b, c]), mat))
        self.tris.append((np.array([a, c, d]), mat))

    def hexa(self, p: list, mat: str) -> None:
        """8 corners: bottom 0-3 then top 4-7, each ring CCW seen from above."""
        p = [np.asarray(v, float) for v in p]
        self.quad(p[3], p[2], p[1], p[0], mat)  # bottom
        self.quad(p[4], p[5], p[6], p[7], mat)  # top
        for i in range(4):
            j = (i + 1) % 4
            self.quad(p[i], p[j], p[4 + j], p[4 + i], mat)

    def box(self, x0, x1, y0, y1, z0, z1, mat: str) -> None:
        self.hexa(
            [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)],
            mat,
        )

    def taper(self, bot: tuple, top: tuple, z0: float, z1: float, mat: str) -> None:
        """bot/top = (x0, x1, y0, y1) rectangles at z0 / z1."""
        bx0, bx1, by0, by1 = bot
        tx0, tx1, ty0, ty1 = top
        self.hexa(
            [(bx0, by0, z0), (bx1, by0, z0), (bx1, by1, z0), (bx0, by1, z0),
             (tx0, ty0, z1), (tx1, ty0, z1), (tx1, ty1, z1), (tx0, ty1, z1)],
            mat,
        )

    def beam(self, a, b, half_w: float, half_d: float, mat: str, side=(0.0, 1.0, 0.0)) -> None:
        """Box from a to b. half_w along `side`, half_d along the third axis."""
        a = np.asarray(a, float)
        b = np.asarray(b, float)
        u = b - a
        u /= np.linalg.norm(u)
        s = np.asarray(side, float)
        s = s - u * np.dot(s, u)
        s /= np.linalg.norm(s)
        w = np.cross(u, s)
        c = []
        for base in (a, b):
            for sx, wx in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                c.append(base + s * sx * half_w + w * wx * half_d)
        # ring order: along u = bottom/top
        self.hexa([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]], mat)

    def prism_x(self, x0, x1, cy, cz, r, mat: str, sides: int = 8) -> None:
        """Cylinder along +x."""
        ring = [(cy + r * math.cos(2 * math.pi * i / sides + math.pi / sides),
                 cz + r * math.sin(2 * math.pi * i / sides + math.pi / sides)) for i in range(sides)]
        for i in range(sides):
            j = (i + 1) % sides
            y0, z0 = ring[i]
            y1, z1 = ring[j]
            self.quad((x0, y0, z0), (x0, y1, z1), (x1, y1, z1), (x1, y0, z0), mat)
        cap0 = [(x0, y, z) for y, z in ring]
        cap1 = [(x1, y, z) for y, z in ring]
        for i in range(1, sides - 1):
            self.tris.append((np.array([cap0[0], cap0[i + 1], cap0[i]]), mat))
            self.tris.append((np.array([cap1[0], cap1[i], cap1[i + 1]]), mat))

    def prism_z(self, cx, cy, z0, z1, r, mat: str, sides: int = 8) -> None:
        ring = [(cx + r * math.cos(2 * math.pi * i / sides + math.pi / sides),
                 cy + r * math.sin(2 * math.pi * i / sides + math.pi / sides)) for i in range(sides)]
        for i in range(sides):
            j = (i + 1) % sides
            x0, y0 = ring[i]
            x1, y1 = ring[j]
            self.quad((x0, y0, z0), (x1, y1, z0), (x1, y1, z1), (x0, y0, z1), mat)
        for i in range(1, sides - 1):
            self.tris.append((np.array([(ring[0][0], ring[0][1], z1), (ring[i][0], ring[i][1], z1), (ring[i + 1][0], ring[i + 1][1], z1)]), mat))
            self.tris.append((np.array([(ring[0][0], ring[0][1], z0), (ring[i + 1][0], ring[i + 1][1], z0), (ring[i][0], ring[i][1], z0)]), mat))


# Model axes: +x forward (nose), +y left, +z up. Ground contact at the origin.

HIP_Z = 27.0
THIGH = 15.0
SHIN = 15.0
ANKLE_Z = 4.0
LEG_Y = 9.5
STRIDE = 7.0
LIFT = 4.5


def knee_of(hip: np.ndarray, ankle: np.ndarray) -> np.ndarray:
    d = ankle - hip
    dist = min(np.linalg.norm(d), THIGH + SHIN - 0.2)
    dn = d / np.linalg.norm(d)
    along = (THIGH ** 2 - SHIN ** 2 + dist ** 2) / (2 * dist)
    h = math.sqrt(max(0.0, THIGH ** 2 - along ** 2))
    # perpendicular in the leg's x-z plane, toward +x (forward knee)
    perp = np.array([-dn[2], 0.0, dn[0]])
    if perp[0] < 0:
        perp = -perp
    return hip + dn * along + perp * h


def add_leg(m: Mesh, y: float, foot_x: float, lift: float, hip_z: float, foot_y: float | None = None) -> None:
    fy = y if foot_y is None else foot_y
    hip = np.array([0.0, y, hip_z])
    ankle = np.array([foot_x, fy, ANKLE_Z + lift])
    knee = knee_of(hip, ankle)
    side = (0.0, 1.0, 0.0)
    m.prism_x(-3.5, 3.5, y, hip_z, 4.0, "steel")  # hip actuator (along x reads as a drum)
    m.beam(hip, knee, 3.4, 4.2, "armor", side)  # thigh
    m.beam(knee + np.array([0.8, 0, 1.2]), knee - np.array([-0.8, 0, 1.6]), 3.8, 3.8, "steel", side)  # knee joint
    m.beam(knee, ankle, 3.0, 3.6, "armor", side)  # shin
    # shin guard, a plate on the front of the shin
    mid = (knee + ankle) / 2
    m.beam(knee + np.array([2.5, 0, -1.0]), mid + np.array([2.8, 0, 0]), 3.3, 1.3, "armor", side)
    # foot: flat block with a sloped toe, heel spur
    fx, fz = ankle[0], ankle[2] - ANKLE_Z
    m.taper((fx - 5.5, fx + 6.5, fy - 4.5, fy + 4.5), (fx - 4.5, fx + 3.5, fy - 4.0, fy + 4.0), fz, fz + 3.6, "steel")
    m.taper((fx + 6.5, fx + 9.0, fy - 4.0, fy + 4.0), (fx + 6.0, fx + 6.5, fy - 3.5, fy + 3.5), fz, fz + 2.0, "steel")
    m.prism_x(fx - 2.0, fx + 2.0, fy, ankle[2], 2.4, "steel")  # ankle


def legs_mesh(phase: float) -> Mesh:
    m = Mesh()
    m.box(-7, 7, -8, 8, HIP_Z - 3, HIP_Z + 4, "steel")  # pelvis
    for sign, ph in ((1, phase), (-1, phase + math.pi)):
        fx = STRIDE * math.sin(ph)
        lift = LIFT * max(0.0, math.cos(ph)) ** 1.5
        add_leg(m, sign * LEG_Y, fx, lift, HIP_Z)
    return m


BRACE_DROP = 8.0


def braced_legs_mesh() -> Mesh:
    m = Mesh()
    hz = HIP_Z - BRACE_DROP
    m.box(-7, 7, -8, 8, hz - 3, hz + 4, "steel")
    for sign in (1, -1):
        add_leg(m, sign * LEG_Y, 2.5, 0.0, hz, foot_y=sign * 15.0)
    # four outriggers, pelvis corners to planted pads
    for sx in (1, -1):
        for sy in (1, -1):
            a = (sx * 6.0, sy * 6.5, hz)
            b = (sx * 15.5, sy * 14.0, 1.6)
            m.beam(a, b, 1.6, 1.6, "steel", side=(0.0, 0.0, 1.0))
            m.box(b[0] - 2.4, b[0] + 2.4, b[1] - 2.4, b[1] + 2.4, 0.0, 1.8, "hazard")
    return m


def torso_mesh(dz: float = 0.0) -> Mesh:
    m = Mesh()
    z = lambda v: v + dz  # noqa: E731
    m.prism_z(0, 0, z(HIP_Z + 3), z(HIP_Z + 7), 7.0, "steel")  # waist ring
    # hull: sloped glacis front, flat back
    m.taper((-11, 12, -12, 12), (-11, 5, -10, 10), z(34), z(52), "armor")
    m.taper((-11, 12, -12, 12), (-10, 11, -11.5, 11.5), z(HIP_Z + 6), z(34), "armor")
    # cockpit + visor slit
    m.taper((-3, 8, -6.5, 6.5), (-2, 5.5, -5.5, 5.5), z(52), z(58), "armor")
    m.box(6.2, 7.6, -4.5, 4.5, z(54.2), z(55.8), "visor")
    # mantlet on the chest (barrel lives on the gun sheet)
    m.box(10.5, 16, -5.5, 5.5, z(36.5), z(45.5), "steel")
    # shoulder pods with team panels on the outer face
    for sign in (1, -1):
        y0, y1 = sorted((sign * 11.0, sign * 17.5))
        m.taper((-8, 8, y0, y1), (-6, 5, y0 + (0.8 if sign < 0 else 0), y1 - (0.8 if sign > 0 else 0)), z(40), z(51), "armor")
        py0, py1 = (sign * 17.5, sign * 18.2) if sign > 0 else (sign * 18.2, sign * 17.5)
        m.box(-5, 4, py0, py1, z(42.5), z(48.5), "team")
    # backpack power unit + exhaust stacks
    m.box(-19.5, -10.5, -9, 9, z(35), z(50.5), "armor")
    m.box(-20.2, -19.5, -6, 6, z(38), z(47), "steel")
    for yy in (-5.0, 5.0):
        m.prism_z(-16.0, yy, z(50.5), z(57.5), 1.9, "steel", sides=6)
    return m


GUN_Z = 41.0
MUZZLE_X = 43.0


def gun_mesh(dz: float = 0.0) -> Mesh:
    m = Mesh()
    zc = GUN_Z + dz
    m.prism_x(15.5, 23.0, 0.0, zc, 2.8, "steel")  # recoil sleeve
    m.prism_x(23.0, MUZZLE_X - 3.5, 0.0, zc, 1.8, "steel")  # long barrel
    m.box(MUZZLE_X - 4.0, MUZZLE_X, -3.0, 3.0, zc - 2.2, zc + 2.2, "steel")  # muzzle brake
    return m


# ---------------------------------------------------------------- render

def yaw_for_row(row: int) -> float:
    """Ground yaw (0 = screen east, CCW seen from above) whose nose projects to row's screen angle."""
    theta = math.radians(90.0 + 22.5 * row)  # y-down screen angle; 90° = south, then clockwise
    return math.atan2(-math.sin(theta) / math.sin(ELEV), math.cos(theta))


def project(v: np.ndarray, yaw: float, scale: float, ox: float, oy: float):
    """Model verts (N×3) → screen x, y (y down) and depth (bigger = nearer)."""
    c, s = math.cos(yaw), math.sin(yaw)
    X = v[:, 0] * c - v[:, 1] * s
    Y = v[:, 0] * s + v[:, 1] * c
    Z = v[:, 2]
    sx = ox + X * scale
    sy = oy - (Y * math.sin(ELEV) + Z * math.cos(ELEV)) * scale
    depth = -Y * math.cos(ELEV) + Z * math.sin(ELEV)
    return sx, sy, depth


def world_normal(n: np.ndarray, yaw: float) -> np.ndarray:
    c, s = math.cos(yaw), math.sin(yaw)
    return np.array([n[0] * c - n[1] * s, n[0] * s + n[1] * c, n[2]])


VIEW = np.array([0.0, -math.cos(ELEV), math.sin(ELEV)])


def render(mesh: Mesh, yaw: float, size: int = CELL, scale: float = SCALE, contact_y: float = CONTACT_Y,
           origin: tuple[float, float] | None = None) -> np.ndarray:
    ox, oy = origin if origin else (size / 2.0, size * contact_y)
    zbuf = np.full((size, size), -1e9)
    col = np.zeros((size, size, 3), np.uint8)
    alpha = np.zeros((size, size), bool)
    ys, xs = np.mgrid[0:size, 0:size]
    px = xs + 0.5
    py = ys + 0.5
    for tri, mat in mesh.tris:
        n = np.cross(tri[1] - tri[0], tri[2] - tri[0])
        ln = np.linalg.norm(n)
        if ln < 1e-9:
            continue
        nw = world_normal(n / ln, yaw)
        if np.dot(nw, VIEW) <= 1e-6:
            continue
        sx, sy, dp = project(tri, yaw, scale, ox, oy)
        x0 = max(0, int(math.floor(sx.min())))
        x1 = min(size - 1, int(math.ceil(sx.max())))
        y0 = max(0, int(math.floor(sy.min())))
        y1 = min(size - 1, int(math.ceil(sy.max())))
        if x0 > x1 or y0 > y1:
            continue
        area = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (sy[1] - sy[0])
        if abs(area) < 1e-9:
            continue
        qx = px[y0:y1 + 1, x0:x1 + 1]
        qy = py[y0:y1 + 1, x0:x1 + 1]
        w0 = ((sx[1] - qx) * (sy[2] - qy) - (sx[2] - qx) * (sy[1] - qy)) / area
        w1 = ((sx[2] - qx) * (sy[0] - qy) - (sx[0] - qx) * (sy[2] - qy)) / area
        w2 = 1 - w0 - w1
        inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        if not inside.any():
            continue
        d = w0 * dp[0] + w1 * dp[1] + w2 * dp[2]
        zb = zbuf[y0:y1 + 1, x0:x1 + 1]
        win = inside & (d > zb)
        if not win.any():
            continue
        ramp = RAMPS[mat]
        lam = max(0.0, float(np.dot(nw, LIGHT)))
        val = 0.12 + 0.88 * lam
        tone = ramp[min(len(ramp) - 1, int(val * len(ramp)))]
        zb[win] = d[win]
        col[y0:y1 + 1, x0:x1 + 1][win] = tone
        alpha[y0:y1 + 1, x0:x1 + 1][win] = True
    return outline(col, alpha, zbuf)


def shift(a: np.ndarray, dy: int, dx: int, fill) -> np.ndarray:
    """Neighbor lookup without wrap-around (np.roll would bleed the feet onto the top row)."""
    out = np.full_like(a, fill)
    h, w = a.shape
    out[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = a[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)]
    return out


def outline(col: np.ndarray, alpha: np.ndarray, zbuf: np.ndarray, crease: float = 2.2) -> np.ndarray:
    h, w = alpha.shape
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., :3] = col
    rgba[..., 3] = np.where(alpha, 255, 0)
    # inner creases: the farther pixel of a depth step turns to outline
    inner = np.zeros_like(alpha)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        nb_a = shift(alpha, dy, dx, False)
        nb_z = shift(zbuf, dy, dx, -1e9)
        inner |= alpha & nb_a & (nb_z - zbuf > crease)
    rgba[inner, :3] = OUTLINE
    # outer 1 px ring
    grow = np.zeros_like(alpha)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        grow |= shift(alpha, dy, dx, False)
    ring = grow & ~alpha
    rgba[ring, :3] = OUTLINE
    rgba[ring, 3] = 255
    return rgba


# ---------------------------------------------------------------- sheets

def sheet(meshes_by_frame: list[Mesh]) -> tuple[Image.Image, list[dict]]:
    frames = len(meshes_by_frame)
    img = np.zeros((DIRS * CELL, frames * CELL, 4), np.uint8)
    stats = []
    for row in range(DIRS):
        yaw = yaw_for_row(row)
        for f, mesh in enumerate(meshes_by_frame):
            cell = render(mesh, yaw)
            img[row * CELL:(row + 1) * CELL, f * CELL:(f + 1) * CELL] = cell
            if f == 0:
                a = cell[..., 3] > 0
                ys, xs = np.nonzero(a)
                stats.append({
                    "dir": ENGINE_ORDER[row],
                    "bbox": [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1] if len(xs) else None,
                    "edge_clip": bool(len(xs) and (xs.min() < 1 or ys.min() < 1 or xs.max() >= CELL - 1 or ys.max() >= CELL - 1)),
                })
    return Image.fromarray(img, "RGBA"), stats


def composite_rows(layers: list[Image.Image], frame: int = 0) -> list[Image.Image]:
    """Engine layer order for a turret facing its hull: gun behind when aiming up-screen."""
    out = []
    for row in range(DIRS):
        theta = math.radians(90.0 + 22.5 * row)
        gun_behind = math.sin(theta) < -1e-6
        cells = [l.crop((frame * CELL if l.width > CELL else 0, row * CELL,
                         (frame + 1) * CELL if l.width > CELL else CELL, (row + 1) * CELL)) for l in layers]
        hull, torso, gun = cells
        c = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        if gun_behind:
            c.alpha_composite(gun)
        c.alpha_composite(hull)
        c.alpha_composite(torso)
        if not gun_behind:
            c.alpha_composite(gun)
        out.append(c)
    return out


def labeled_strip(cells: list[Image.Image], labels: list[str], bg=(74, 107, 50, 255)) -> Image.Image:
    n = len(cells)
    strip = Image.new("RGBA", (CELL * 8, (CELL + 14) * ((n + 7) // 8)), bg)
    d = ImageDraw.Draw(strip)
    for i, (c, lab) in enumerate(zip(cells, labels)):
        x = (i % 8) * CELL
        y = (i // 8) * (CELL + 14)
        strip.alpha_composite(c, (x, y + 14))
        d.text((x + 4, y + 1), lab, fill=(255, 255, 255, 255))
        cy = y + 14 + int(CELL * CONTACT_Y)
        d.line([(x + CELL / 2 - 6, cy), (x + CELL / 2 + 6, cy)], fill=(0, 255, 255, 255))
    return strip


def cameo(layers_meshes: tuple[Mesh, Mesh, Mesh], size: int = 128) -> Image.Image:
    yaw = yaw_for_row(13)  # ESE, a 3/4 front
    big = 4
    s = size * big
    hull, torso, gun = (render(m, yaw, size=s, scale=SCALE * big * 1.05, origin=(s * 0.46, s * 0.93)) for m in layers_meshes)
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    for layer in (hull, torso, gun):
        img.alpha_composite(Image.fromarray(layer, "RGBA"))
    bbox = img.getbbox()
    img = img.crop(bbox)
    k = (size - 8) / max(img.width, img.height)
    img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.NEAREST)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.alpha_composite(img, ((size - img.width) // 2, size - 4 - img.height))
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(parents=True, exist_ok=True)
    walk = [legs_mesh(math.pi / 2 + 2 * math.pi * f / WALK_FRAMES) for f in range(WALK_FRAMES)]
    legs, legs_stats = sheet(walk)
    torso, torso_stats = sheet([torso_mesh()])
    gun, gun_stats = sheet([gun_mesh()])
    blegs, blegs_stats = sheet([braced_legs_mesh()])
    btorso, _ = sheet([torso_mesh(-BRACE_DROP)])
    bgun, _ = sheet([gun_mesh(-BRACE_DROP)])

    legs.save(OUT / "titan-legs.png")
    torso.save(OUT / "titan-torso.png")
    gun.save(OUT / "titan-gun.png")
    blegs.save(OUT / "titan-braced-legs.png")
    btorso.save(OUT / "titan-braced-torso.png")
    bgun.save(OUT / "titan-braced-gun.png")
    cameo((walk[0], torso_mesh(), gun_mesh())).save(OUT / "titan-cameo.png")

    labeled_strip(composite_rows([legs, torso, gun]), ENGINE_ORDER).save(PREVIEW / "titan-strip.png")
    labeled_strip(composite_rows([blegs, btorso, bgun]), ENGINE_ORDER).save(PREVIEW / "titan-braced-strip.png")
    e_row = ENGINE_ORDER.index("E")
    walk_cells = [legs.crop((f * CELL, e_row * CELL, (f + 1) * CELL, (e_row + 1) * CELL)) for f in range(WALK_FRAMES)]
    labeled_strip(walk_cells, [f"E f{f}" for f in range(WALK_FRAMES)]).save(PREVIEW / "titan-walk.png")

    heights = [s["bbox"][3] - s["bbox"][1] for s in legs_stats if s["bbox"]]
    med = float(np.median(heights))
    manifest = {
        "id": "titan",
        "cell": CELL,
        "contact_y": CONTACT_Y,
        "facing": DIRS,
        "order": ENGINE_ORDER,
        "sheets": {
            "titan-legs.png": {"cols": WALK_FRAMES, "rows": DIRS},
            "titan-torso.png": {"cols": 1, "rows": DIRS},
            "titan-gun.png": {"cols": 1, "rows": DIRS},
            "titan-braced-legs.png": {"cols": 1, "rows": DIRS},
            "titan-braced-torso.png": {"cols": 1, "rows": DIRS},
            "titan-braced-gun.png": {"cols": 1, "rows": DIRS},
        },
        "empty_dirs": [s["dir"] for s in legs_stats + torso_stats + gun_stats + blegs_stats if s["bbox"] is None],
        "size_pop_dirs": [s["dir"] for s in legs_stats if s["bbox"] and abs((s["bbox"][3] - s["bbox"][1]) - med) / med > 0.12],
        "edge_clip_dirs": [s["dir"] for s in legs_stats + torso_stats + gun_stats + blegs_stats if s["edge_clip"]],
    }
    (PREVIEW / "titan.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps({k: manifest[k] for k in ("empty_dirs", "size_pop_dirs", "edge_clip_dirs")}))


if __name__ == "__main__":
    main()
