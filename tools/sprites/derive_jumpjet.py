#!/usr/bin/env python3
"""Jump Jet sheets, derived from the Rifleman's shipped sheets.

The Jump Jet is the same soldier as the Rifleman (trooper-*.png): same cell
(96), same frames, same scale, same contact line, same camera and outline. He
is re-kitted on each engine cell, frame by frame:

  - a jetpack on his back: a dark frame plate with two upright grey fuel
    tanks (hazard-yellow collar, team-tint-friendly neutral grey), each with a
    flared nozzle at its base. Placed off the helmet (tracked per frame, so it
    rides the walk bob), behind him along the row's facing. Facing the camera
    it paints only on empty pixels (hidden behind the body, peeking out);
    facing away / side-on it paints over his back (never over the helmet).
    Prone it lies along his back; on the corpse it is under him.
  - an olive helmet with a goggle strap and amber lenses (distinct accent)
  - the shoulder patch on the fire sheet turns hazard yellow
  - a curved box magazine under the rifle's receiver (assault rifle read),
    annotated per unique row on frame 0 and carried with the helmet
  - fly: NEW sheet. The standing fire pose with the muzzle flash removed, legs
    trailing back (sheared from the hip), rifle at the ready along the
    facing, two exhaust plumes out of the nozzles. Only the plumes animate
    (4 frames). Feet sit on the walk contact line (0.90); no ground shadow.

Only the nine unique rows are derived; the seven W-side rows are horizontal
flips (same as compose_unit_sheet.py), so the sheet stays one miniature.

  python tools/sprites/derive_jumpjet.py     # writes all jumpjet-*.png + previews
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
from compose_unit_sheet import ENGINE_ORDER, MIRROR_OF, UNIQUE_ORDER, diagnostics, preview_strip, preview_turntable  # noqa: E402

UNITS = ROOT / "gridlock/packages/client/src/assets/units"
PREVIEW = ROOT / "tools/sprites/preview"
CELL = 96
SV = math.sin(math.radians(38))  # ground depth foreshortening of the infantry camera

C = lambda *v: np.array(v, float)  # noqa: E731
OUTLINE = C(0x1A, 0x14, 0x10)
PACK = {
    "tank": [C(0x4A, 0x4A, 0x46), C(0x6E, 0x6E, 0x68), C(0x92, 0x92, 0x8A)],
    "plate": [C(0x2E, 0x2E, 0x2A), C(0x3A, 0x3A, 0x36), C(0x4A, 0x4A, 0x46)],
    "collar": [C(0xA8, 0x7E, 0x10), C(0xD4, 0xA0, 0x17), C(0xE8, 0xC0, 0x40)],
    "nozzle": [C(0x22, 0x22, 0x20), C(0x2C, 0x2E, 0x2A), C(0x44, 0x47, 0x42)],
    "mag": [C(0x2C, 0x2E, 0x2A), C(0x44, 0x47, 0x42), C(0x66, 0x6A, 0x62)],
}
OLIVE = C(0x5A, 0x6B, 0x3D)
LENS = C(0xD4, 0xA0, 0x17)
LENS_HI = C(0xF2, 0xE0, 0x9A)
STRAP = C(0x2A, 0x24, 0x18)
PATCH = C(0xD4, 0xA0, 0x17)
FLAME = [C(0xC4, 0x5A, 0x12), C(0xE8, 0x9A, 0x20), C(0xFF, 0xF0, 0xB0)]

# sheet id -> (trooper source, frames, pose, contactY, fps, drawSize expression)
SHEETS = {
    "walk": ("trooper-walk.png", 8, "stand", 0.90, 12, "UNIT_SPRITE_DRAW_SIZE"),
    "crouch": ("trooper-crouch.png", 8, "crouch", 0.88, 8, "UNIT_SPRITE_DRAW_SIZE"),
    "crawl": ("trooper-crawl.png", 8, "crawl", 0.72, 10, "Math.round(28 * INFANTRY_VISUAL_SCALE)"),
    "die": ("trooper-die.png", 4, "die", 0.82, 8, "UNIT_SPRITE_DRAW_SIZE"),
    "fire": ("trooper-rifle-fire.png", 4, "fire", 0.90, 12, "UNIT_SPRITE_DRAW_SIZE"),
    "fly": ("trooper-rifle-fire.png", 4, "fly", 0.90, 12, "UNIT_SPRITE_DRAW_SIZE"),
}

# Upright pack placement, cell px from the helmet centre: tank top / bottom below it, back offset along -facing.
PACK_LAYOUT = {
    "stand": dict(top=10.0, bot=31.0, back=16.0, side=3.7, r=3.2),
    "crouch": dict(top=10.0, bot=29.0, back=16.0, side=3.7, r=3.2),
    "fire": dict(top=10.0, bot=31.0, back=16.0, side=3.7, r=3.2),
    "fly": dict(top=10.0, bot=31.0, back=16.0, side=3.7, r=3.2),
}

# Magazine root under the receiver on frame 0 of each unique row (cell px); None = rifle hidden.
MAG = {
    "stand": {"S": (42, 55), "SSE": (42, 50), "SE": (40, 54), "ESE": (40, 53), "E": (44, 51),
              "ENE": (50, 45), "NE": (55, 42), "NNE": (55, 33), "N": None},
    "crouch": {"S": (40, 51), "SSE": (38, 53), "SE": (40, 50), "ESE": (40, 50), "E": (47, 51),
               "ENE": (56, 44), "NE": (52, 46), "NNE": (52, 49), "N": None},
    "fire": {"S": None, "SSE": (38, 47), "SE": (36, 46), "ESE": (34, 47), "E": (40, 44),
             "ENE": (40, 39), "NE": (47, 37), "NNE": (55, 26), "N": None},
}
MAG["fly"] = MAG["fire"]


def screen_deg(name: str) -> float:
    return 90.0 + 22.5 * ENGINE_ORDER.index(name)


def facing(name: str) -> tuple[np.ndarray, np.ndarray]:
    """Facing and lateral on the ground, as screen vectors (y already foreshortened)."""
    phi = math.radians(screen_deg(name))
    g = np.array([math.cos(phi), math.sin(phi) / SV])
    g /= np.linalg.norm(g)
    lat = np.array([-g[1], g[0]])
    return np.array([g[0], g[1] * SV]), np.array([lat[0], lat[1] * SV])


def faces_camera(name: str) -> bool:
    """Back turned away from the camera: the pack is behind the body."""
    return math.sin(math.radians(screen_deg(name))) > 0.5


# ---------------------------------------------------------------- masks


def grow(m: np.ndarray, k: int = 1) -> np.ndarray:
    for _ in range(k):
        g = m.copy()
        g[1:] |= m[:-1]
        g[:-1] |= m[1:]
        g[:, 1:] |= m[:, :-1]
        g[:, :-1] |= m[:, 1:]
        m = g
    return m


def components(m: np.ndarray) -> list[np.ndarray]:
    """4-connected components as boolean masks."""
    lab = np.zeros(m.shape, np.int32)
    out = []
    ys, xs = np.nonzero(m)
    for y0, x0 in zip(ys, xs):
        if lab[y0, x0]:
            continue
        idx = len(out) + 1
        stack = [(y0, x0)]
        lab[y0, x0] = idx
        comp = np.zeros(m.shape, bool)
        while stack:
            y, x = stack.pop()
            comp[y, x] = True
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < m.shape[0] and 0 <= xx < m.shape[1] and m[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = idx
                    stack.append((yy, xx))
        out.append(comp)
    return out


def helmet_masks(a: np.ndarray) -> list[np.ndarray]:
    """Steel-grey (bluish neutral) blobs: the helmet(s). Largest first."""
    rgb = a[..., :3].astype(np.int32)
    op = a[..., 3] > 128
    mx, mn = rgb.max(-1), rgb.min(-1)
    mean = rgb.mean(-1)
    grey = op & (mx - mn <= 24) & (rgb[..., 2] >= rgb[..., 0]) & (mean > 30) & (mean < 150)
    comps = [c for c in components(grey) if c.sum() >= 25]
    comps.sort(key=lambda c: -int(c.sum()))
    return comps


def shrink(m: np.ndarray, k: int = 1) -> np.ndarray:
    return ~grow(~m, k)


def is_compact(m: np.ndarray) -> bool:
    """A helmet dome, not a gun barrel: a squat, filled blob."""
    ys, xs = np.nonzero(m)
    w, h = int(np.ptp(xs)) + 1, int(np.ptp(ys)) + 1
    return max(w, h) / min(w, h) < 2.2 and m.sum() / (w * h) > 0.45


def find_free_spot(a: np.ndarray, G: np.ndarray, axis: np.ndarray, side: np.ndarray | None = None) -> np.ndarray:
    """Where a dropped pack beside the corpse overlaps the body least, inside the cell and above its contact line."""
    op = a[..., 3] > 100
    ys, xs = np.nonzero(op)
    bottom = ys.max()
    x0, x1, top = xs.min() - 2, xs.max() + 2, ys.min() - 2
    u = axis / np.linalg.norm(axis)
    n = np.array([-u[1], u[0]])
    P = Painter(a, op)
    best, best_score = G, None
    for rad in range(10, 31, 2):
        for k in range(24):
            ang = math.radians(k * 15)
            if side is not None:
                ref = math.atan2(side[1], side[0])
                dd = (ang - ref + math.pi) % (2 * math.pi) - math.pi
                if abs(dd) > math.radians(60):
                    continue
            c = G + np.array([math.cos(ang), math.sin(ang)]) * rad
            foot, _, _ = P.capsule(c - u * 8, c + u * 8, 5.0)
            fy, fx = np.nonzero(foot)
            if fx.min() < max(4, x0) or fx.max() > min(CELL - 5, x1) or fy.min() < max(4, top) or fy.max() > bottom:
                continue
            over = int((foot & op).sum())
            score = over + rad * 0.5
            if best_score is None or score < best_score:
                best, best_score = c, score
    return best


def centroid(m: np.ndarray) -> np.ndarray:
    ys, xs = np.nonzero(m)
    return np.array([xs.mean(), ys.mean()])


# ---------------------------------------------------------------- painting


class Painter:
    """Paints parts into one cell. `allow` limits where paint may land."""

    def __init__(self, a: np.ndarray, allow: np.ndarray):
        self.a = a
        self.allow = allow
        h, w = a.shape[:2]
        self.ys, self.xs = np.mgrid[0:h, 0:w]
        self.xs = self.xs + 0.5
        self.ys = self.ys + 0.5

    def part(self, inside: np.ndarray, tone: np.ndarray, pal: list[np.ndarray], outline: bool = True) -> None:
        if outline:
            ring = grow(inside, 1) & ~inside & self.allow
            self.a[ring, :3] = OUTLINE
            self.a[ring, 3] = 255
        m = inside & self.allow
        cols = np.stack(pal)[np.clip(tone, 0, 2)]
        self.a[m, :3] = cols[m]
        self.a[m, 3] = 255

    def capsule(self, p0, p1, r: float, k: float = 1.0):
        """Screen capsule p0->p1 of half-width r (end caps squashed by k). Returns (inside, across, along)."""
        p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
        d = p1 - p0
        L = max(1e-6, float(np.linalg.norm(d)))
        u = d / L
        n = np.array([-u[1], u[0]])
        px, py = self.xs - p0[0], self.ys - p0[1]
        t = px * u[0] + py * u[1]
        s = px * n[0] + py * n[1]
        tc = np.clip(t, 0, L)
        dt = (t - tc) / max(k, 0.25)
        inside = (s**2 + dt**2) <= r * r
        return inside, s / r, t / L


def tone_from(across: np.ndarray, light_left: bool = True) -> np.ndarray:
    q = across if light_left else -across
    return np.where(q < -0.4, 2, np.where(q > 0.45, 0, 1))


def draw_upright_pack(a, H, name, lay, allow, flame_frame=None, flame_allow=None):
    fs, ls = facing(name)
    P = Painter(a, allow)
    Cc = H + np.array([0.0, (lay["top"] + lay["bot"]) / 2]) - fs * lay["back"]
    top, bot = H[1] + lay["top"], H[1] + lay["bot"]
    # Frame plate between (and behind) the tanks.
    half = ls * (lay["side"] + 0.5)
    inside, s, _ = P.capsule((Cc[0], top + 2), (Cc[0], bot - 1), 1.0)
    plate = np.zeros(inside.shape, bool)
    for t in np.linspace(-1, 1, 9):
        c = Cc + half * t
        m, _, _ = P.capsule((c[0], top + 2 + half[1] * t * 0), (c[0], bot - 1), 1.6)
        plate |= m
    P.part(plate, np.ones(plate.shape, int), PACK["plate"])
    tanks = []
    for sgn in (-1, 1):
        off = ls * lay["side"] * sgn
        tanks.append((off[1], Cc[0] + off[0], off[1]))
    tanks.sort(key=lambda z: z[0])  # far (higher on screen) first
    nozzles = []
    for _, x, dy in tanks:
        r = lay["r"]
        y0, y1 = top + dy, bot + dy
        inside, s, t = P.capsule((x, y0 + r * 0.5), (x, y1 - r * 0.5), r, k=0.5)
        tone = tone_from(s)
        collar = (P.ys > y0 + 1.5) & (P.ys < y0 + 3.5)
        P.part(inside, tone, PACK["tank"])
        m = inside & collar & allow
        a[m, :3] = np.stack(PACK["collar"])[tone][m]
        # Nozzle: short flared bell under the tank.
        nz, ns, _ = P.capsule((x, y1 - 0.5), (x, y1 + 1.8), r * 0.75, k=0.3)
        nz &= P.ys > y1 - 1.0
        P.part(nz, tone_from(ns), PACK["nozzle"])
        nozzles.append((x, y1 + 2.2))
    if flame_frame is not None:
        draw_flames(a, nozzles, flame_frame, flame_allow if flame_allow is not None else allow)
    return nozzles


def draw_flames(a, nozzles, frame, allow):
    P = Painter(a, allow)
    lens = [[22.0, 16.0], [16.0, 23.0], [25.0, 19.0], [18.0, 21.0]][frame]
    wid = [[2.8, 2.3], [2.3, 3.0], [3.0, 2.5], [2.5, 2.7]][frame]
    wob = [[0.0, 0.4], [0.5, -0.3], [-0.4, 0.0], [0.3, 0.5]][frame]
    for i, (x, y) in enumerate(nozzles):
        L, w, dx = lens[i % 2], wid[i % 2], wob[i % 2]
        for layer, (lf, wf) in enumerate(((1.0, 1.0), (0.68, 0.66), (0.34, 0.4))):
            ll, ww = L * lf, w * wf
            t = (P.ys - y) / max(ll, 1e-6)
            cx = x + dx * np.clip(t, 0, 1)
            width = ww * np.clip(1.0 - t, 0, 1) ** 0.75 + 0.35 * (t < 1)
            m = (t >= 0) & (t <= 1) & (np.abs(P.xs - cx) <= width) & (P.ys < CELL - 1)
            P.part(m, np.full(m.shape, layer), FLAME, outline=False)


def draw_lying_pack(a, Cc, axis, allow, length=14.0):
    """Two tanks lying along `axis` (unit screen vector, towards his feet) centred at Cc."""
    P = Painter(a, allow)
    u = axis / max(1e-6, np.linalg.norm(axis))
    n = np.array([-u[1], u[0]])
    plate, _, _ = P.capsule(Cc - u * (length / 2 - 1), Cc + u * (length / 2 - 1), 4.2)
    P.part(plate, np.ones(plate.shape, int), PACK["plate"])
    offs = sorted((n * 3.0 * s for s in (-1, 1)), key=lambda o: o[1])
    for off in offs:
        c = Cc + off
        p0, p1 = c - u * length / 2, c + u * length / 2
        inside, s, t = P.capsule(p0 + u * 1.5, p1 - u * 1.5, 2.6)
        tone = tone_from(s, light_left=n[1] < 0)
        P.part(inside, tone, PACK["tank"])
        collar = inside & (t > 0.05) & (t < 0.2) & allow
        a[collar, :3] = np.stack(PACK["collar"])[tone][collar]
        nz, ns, _ = P.capsule(p1 - u * 1.2, p1 + u * 1.2, 2.0)
        P.part(nz, tone_from(ns), PACK["nozzle"])


def draw_mag(a, root, fwd_x: float, allow):
    """Curved box magazine hanging from the receiver, curving forward."""
    P = Painter(a, allow)
    pts = [np.array(root, float) + np.array([fwd_x * 2.6 * t * t, 7.0 * t]) for t in np.linspace(0, 1, 8)]
    inside = np.zeros(a.shape[:2], bool)
    for p0, p1 in zip(pts, pts[1:]):
        m, _, _ = P.capsule(p0, p1, 1.5)
        inside |= m
    P.part(inside, np.where(P.xs < root[0] + fwd_x * 1.0, 2, 1).astype(int), PACK["mag"])


def recolor_helmet(a, m, name, draw_goggles=True):
    rgb = a[..., :3].astype(float)
    lum = rgb.mean(-1)
    new = np.clip(OLIVE[None, None, :] * (lum[..., None] / 72.0), 0, 255)
    a[m, :3] = new[m]
    if not draw_goggles:
        return
    ys, xs = np.nonzero(m)
    H = np.array([xs.mean(), ys.mean()])
    fs, ls = facing(name)
    # Strap: a band across the lower dome.
    yb = int(round(ys.max() - (ys.max() - ys.min()) * 0.38))
    band = m & (np.abs(np.arange(a.shape[0])[:, None] - yb) < 1)
    a[band, :3] = STRAP
    if fs[1] < -0.3:
        return  # looking away: only the strap shows
    for sgn in (-1, 1):
        c = H + np.array([fs[0] * 4.0, 0]) + ls * 2.4 * sgn
        x, y = int(round(c[0])), yb
        for dx in (0, 1 if sgn > 0 else -1):
            xx = x + dx
            if 0 <= xx < a.shape[1] and m[y, xx]:
                a[y, xx, :3] = LENS if dx else LENS_HI


def recolor_patch(a):
    """The red-and-white sleeve patch becomes a plain hazard-yellow tab."""
    rgb = a[..., :3].astype(np.int32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    op = a[..., 3] > 60
    core = op & (r > 125) & (r - g > 62) & (g < 75) & (b < 60)
    # Only red that sits next to the patch's white field (never skin).
    white = op & (rgb.min(-1) > 140) & (rgb.max(-1) - rgb.min(-1) < 50)
    core &= grow(white, 3)
    if not core.any():
        return
    near = grow(core, 2) & op
    pale = (rgb.min(-1) > 95) & (rgb.max(-1) - rgb.min(-1) < 90)
    m = near & (core | (pale & grow(core, 2)) | ((r - g > 40) & (g < 80)))
    lum = rgb.mean(-1)
    a[m, :3] = np.clip(PATCH[None, None, :] * (0.7 + lum[..., None] / 400.0), 0, 255)[m]
    a[m, 3] = 255


def remove_flash(a):
    """Key out the muzzle smoke. Where it lay over the body, fill from the body around it."""
    rgb = a[..., :3].astype(np.int32)
    pale = (a[..., 3] > 20) & (rgb.min(-1) > 125) & (rgb[..., 2] >= rgb[..., 0] - 12)
    m = grow(pale, 1) & (a[..., 3] > 0) & ((rgb.min(-1) > 95) | (a[..., 3] < 200)) & (rgb[..., 2] >= rgb[..., 0] - 20)
    body = (a[..., 3] > 128) & ~m
    h, w = body.shape
    # Inside the body: opaque on both sides along the row, within a short reach.
    inside = np.zeros_like(m)
    for y, x in zip(*np.nonzero(m)):
        lft = body[y, max(0, x - 7) : x].any()
        rgt = body[y, x + 1 : x + 8].any()
        up = body[max(0, y - 7) : y, x].any()
        dn = body[y + 1 : y + 8, x].any()
        inside[y, x] = (lft and rgt) or (up and dn)
    a[m & ~inside] = 0
    hole = inside.copy()
    known = body.copy()
    f = a.astype(float)
    for _ in range(40):
        if not hole.any():
            break
        acc = np.zeros(f.shape)
        cnt = np.zeros((h, w))
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            k = np.roll(np.roll(known, dy, 0), dx, 1)
            acc += np.roll(np.roll(f, dy, 0), dx, 1) * k[..., None]
            cnt += k
        fill = hole & (cnt > 0)
        f[fill] = acc[fill] / cnt[fill][:, None]
        known |= fill
        hole &= ~fill
    a[:] = np.clip(f + 0.5, 0, 255).astype(np.uint8)
    # Close pin-holes left where the smoke sat between two body parts.
    for _ in range(3):
        op = a[..., 3] > 128
        nb = np.zeros((h, w), int)
        acc = np.zeros((h, w, 4))
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            k = np.roll(np.roll(op, dy, 0), dx, 1)
            nb += k
            acc += np.roll(np.roll(a.astype(float), dy, 0), dx, 1) * k[..., None]
        pin = m & ~op & (nb >= 3)
        if not pin.any():
            break
        a[pin] = np.clip(acc[pin] / nb[pin][:, None] + 0.5, 0, 255).astype(np.uint8)


def trail_legs(a, H, name):
    """Hovering: legs below the hip swing back against the facing (row shear)."""
    fs, _ = facing(name)
    hip = int(H[1] + 42)
    out = a.copy()
    for y in range(hip, a.shape[0]):
        sh = -fs[0] * (y - hip) * 0.28
        k = int(round(sh))
        if k == 0:
            continue
        row = a[y].copy()
        out[y] = 0
        if k > 0:
            out[y, k:] = row[:-k]
        else:
            out[y, :k] = row[-k:]
    a[:] = out


# ---------------------------------------------------------------- per cell


def derive_cell(a: np.ndarray, sheet: str, pose: str, name: str, frame: int, ref_H: np.ndarray | None):
    a = a.copy()
    helms = helmet_masks(a)
    if not helms:
        return a, None
    if pose == "die":
        for m in helms[:3]:
            if is_compact(m):
                recolor_helmet(a, m, name, draw_goggles=False)
        body = shrink(a[..., 3] > 128, 2)
        G = centroid(body)
        ys, xs = np.nonzero(body)
        X = np.stack([xs - G[0], ys - G[1]], 1)
        w, v = np.linalg.eigh(X.T @ X)
        axis = v[:, -1]
        if axis[1] < 0:
            axis = -axis
        _fs, ls = facing(name)
        Cc = find_free_spot(a, G, axis, side=-ls / np.linalg.norm(ls))
        draw_lying_pack(a, Cc, axis, a[..., 3] < 100, length=15.0)
        return a, None
    helm = helms[0]
    if pose == "stand" or pose in ("fire", "fly", "crouch"):
        # The helmet is the top-most steel blob.
        helm = min(helms[:2], key=lambda m: centroid(m)[1])
    H = centroid(helm)
    if pose in ("fire", "fly"):
        recolor_patch(a)
    if pose == "fly":
        remove_flash(a)
        trail_legs(a, H, name)
    keep = grow(helm, 1)
    if pose == "crawl":
        recolor_helmet(a, helm, name, draw_goggles=False)
        body = shrink((a[..., 3] > 128) & ~grow(helm, 2), 2)  # drops the thin rifle
        G = centroid(body)
        ys, xs = np.nonzero(body)
        X = np.stack([xs - G[0], ys - G[1]], 1)
        _w, v = np.linalg.eigh(X.T @ X)
        d = v[:, -1]  # long axis of the prone body
        if np.dot(d, G - H) < 0:
            d = -d  # head -> feet
        # Blend with head->centre so a foreshortened (head-on) body still points the right way.
        hg = (G - H) / max(1e-6, np.linalg.norm(G - H))
        d = d * abs(float(np.dot(d, hg))) + hg * (1 - abs(float(np.dot(d, hg))))
        d /= max(1e-6, np.linalg.norm(d))
        # The pack rides the top of his back: nudge it up the screen (towards the camera-facing ridge).
        Cc = H + d * 13.0 + np.array([0.0, -2.5]) * abs(d[0])
        draw_lying_pack(a, Cc, d, ~keep, length=14.0)
        return a, H
    lay = PACK_LAYOUT[pose]
    under = faces_camera(name)
    empty = a[..., 3] < 100
    allow = empty if under else ~keep
    ff = frame if pose == "fly" else None
    # Mag first when the pack is on top (pack over the back, rifle in front); after the pack otherwise.
    mag_root = MAG.get(pose, {}).get(name)
    if mag_root is not None and ref_H is not None:
        root = np.array(mag_root, float) + (H - ref_H)
    else:
        root = None
    fs, _ = facing(name)
    fwd_x = 1.0 if fs[0] >= 0 else -1.0
    if root is not None and not under:
        draw_mag(a, root, fwd_x, ~keep)
    draw_upright_pack(a, H, name, lay, allow, flame_frame=ff, flame_allow=empty if under else ~keep)
    if root is not None and under:
        draw_mag(a, root, fwd_x, ~keep)
    recolor_helmet(a, helm, name)
    return a, H


def derive_sheet(sheet: str) -> tuple[Image.Image, dict]:
    src, frames, pose, cy, fps, draw = SHEETS[sheet]
    im = np.asarray(Image.open(UNITS / src).convert("RGBA")).copy()
    out = np.zeros((16 * CELL, frames * CELL, 4), np.uint8)
    cells: dict[str, list[np.ndarray]] = {}
    for name in UNIQUE_ORDER:
        r = ENGINE_ORDER.index(name)
        ref_H = None
        per = []
        for c in range(frames):
            fc = 0 if pose == "fly" else c  # fly: one body, only the plumes move
            a = im[r * CELL : (r + 1) * CELL, fc * CELL : (fc + 1) * CELL]
            if c == 0:
                hs = helmet_masks(a)
                if hs:
                    hm = min(hs[:2], key=lambda m: centroid(m)[1]) if pose != "crawl" else hs[0]
                    ref_H = centroid(hm)
            cell, _ = derive_cell(a, sheet, pose, name, c, ref_H)
            per.append(cell)
        cells[name] = per
    for dest, srcn in MIRROR_OF.items():
        cells[dest] = [c[:, ::-1].copy() for c in cells[srcn]]
    for r, name in enumerate(ENGINE_ORDER):
        for c in range(frames):
            out[r * CELL : (r + 1) * CELL, c * CELL : (c + 1) * CELL] = cells[name][c]
    return Image.fromarray(out, "RGBA"), {"frames": frames, "contactY": cy, "fps": fps, "drawSize": draw, "pose": pose}


def body_bbox(a: np.ndarray) -> tuple[int, int, int, int] | None:
    """Opaque bbox without the exhaust plume (flame colours)."""
    rgb = a[..., :3].astype(np.int32)
    flame = (rgb[..., 0] > 180) & (rgb[..., 0] - rgb[..., 2] > 60) & (rgb[..., 1] > 80)
    m = (a[..., 3] > 12) & ~flame
    ys, xs = np.nonzero(m)
    if len(ys) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def write_previews(sheet: str, img: Image.Image, meta: dict, ref_sheet: str) -> dict:
    frames = meta["frames"]
    stem = f"jumpjet-{sheet}"
    placed = {n: img.crop((0, r * CELL, CELL, (r + 1) * CELL)) for r, n in enumerate(ENGINE_ORDER)}
    PREVIEW.mkdir(parents=True, exist_ok=True)
    preview_turntable(placed, CELL).save(PREVIEW / f"{stem}-turntable.png")
    preview_strip(img, CELL, frames, 20).save(PREVIEW / f"{stem}-strip.png")
    # Big labelled strip of every frame, for eyeballing.
    big = Image.new("RGBA", (frames * CELL * 2, 16 * CELL * 2), (255, 0, 255, 255))
    big.alpha_composite(img.resize((frames * CELL * 2, 16 * CELL * 2), Image.Resampling.NEAREST))
    big.save(PREVIEW / f"{stem}-sheet-x2.png")
    diag = diagnostics(placed, CELL)
    # Contact / size lock vs the trooper counterpart, every row, every frame.
    ref = np.asarray(Image.open(UNITS / ref_sheet).convert("RGBA"))
    arr = np.asarray(img)
    contact_drift, height_drift = [], []
    for r, n in enumerate(ENGINE_ORDER):
        for c in range(frames):
            rc = 0 if meta["pose"] == "fly" else c
            b = body_bbox(arr[r * CELL : (r + 1) * CELL, c * CELL : (c + 1) * CELL])
            rb = body_bbox(ref[r * CELL : (r + 1) * CELL, rc * CELL : (rc + 1) * CELL])
            if b and rb:
                if abs(b[3] - rb[3]) > 1:
                    contact_drift.append(f"{n}#{c}:{rb[3]}->{b[3]}")
                if abs((b[3] - b[1]) - (rb[3] - rb[1])) > max(3, 0.12 * (rb[3] - rb[1])):
                    height_drift.append(f"{n}#{c}:{rb[3]-rb[1]}->{b[3]-b[1]}")
    def cell(r: int, c: int) -> np.ndarray:
        return arr[r * CELL : (r + 1) * CELL, c * CELL : (c + 1) * CELL]

    mirror_ok = all(
        np.array_equal(cell(ENGINE_ORDER.index(d), c), cell(ENGINE_ORDER.index(s), c)[:, ::-1])
        for d, s in MIRROR_OF.items()
        for c in range(frames)
    )
    man = {
        "id": stem,
        "cell": CELL,
        "cols": frames,
        "rows": 16,
        "facing": 16,
        "order": ENGINE_ORDER,
        "unique": UNIQUE_ORDER,
        "mirror": MIRROR_OF,
        "contactY": meta["contactY"],
        "fps": meta["fps"],
        "drawSize": meta["drawSize"],
        "derived_from": ref_sheet,
        "out": f"gridlock/packages/client/src/assets/units/{stem}.png",
        "size_pop_dirs": [d["dir"] for d in diag if d.get("pop")],
        "empty_dirs": [d["dir"] for d in diag if d.get("empty")],
        "contact_drift_vs_trooper": contact_drift,
        "height_drift_vs_trooper": height_drift,
        "mirrors_exact": mirror_ok,
        "diag": diag,
    }
    (PREVIEW / f"{stem}-manifest.json").write_text(json.dumps(man, indent=2))
    print(
        f"{stem}: {img.size} pop={man['size_pop_dirs']} empty={man['empty_dirs']} "
        f"contact_drift={contact_drift[:6]}{'...' if len(contact_drift) > 6 else ''} height_drift={height_drift[:6]} mirrors={mirror_ok}"
    )
    return man


def cameo(walk: Image.Image) -> None:
    """72x72, same framing as trooper-cameo.png: east stand, width-fit, feet near the bottom."""
    e = walk.crop((0, ENGINE_ORDER.index("E") * CELL, CELL, (ENGINE_ORDER.index("E") + 1) * CELL))
    crop = e.crop(e.getbbox())
    fit = min(68 / crop.width, 68 / crop.height)
    small = crop.resize((max(1, round(crop.width * fit)), max(1, round(crop.height * fit))), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (72, 72), (0, 0, 0, 0))
    out.alpha_composite(small, ((72 - small.width) // 2, 70 - small.height))
    out.save(UNITS / "jumpjet-cameo.png")
    print("cameo", (UNITS / "jumpjet-cameo.png").relative_to(ROOT))


def main() -> None:
    summary = {}
    walk = None
    for sheet, (src, *_rest) in SHEETS.items():
        img, meta = derive_sheet(sheet)
        img.save(UNITS / f"jumpjet-{sheet}.png")
        man = write_previews(sheet, img, meta, src)
        summary[sheet] = {k: man[k] for k in ("cols", "contactY", "fps", "drawSize", "size_pop_dirs", "empty_dirs")}
        if sheet == "walk":
            walk = img
    cameo(walk)
    (PREVIEW / "jumpjet-summary.json").write_text(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
