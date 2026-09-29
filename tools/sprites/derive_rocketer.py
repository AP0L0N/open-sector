#!/usr/bin/env python3
"""Rocketer stills and sheets, derived from the AT Infantry's accepted unique yaws.

The Rocketer is the same soldier as the AT Infantry (same turntable, camera,
scale, outline, palette, contact line), re-armed: the long PTRD becomes one
thick shoulder-fired rocket tube.

  - the rifle's barrel beyond the new tube is erased (free space goes back to
    the magenta key, anything over the body is inpainted from the body around it)
    and the silhouette outline is re-traced where the barrel used to cross it
  - a rocket tube is laid along the rifle's own axis (butt on the right
    shoulder, through both hands): flared rear bell behind the shoulder, olive
    tube with dark clamp bands, khaki warhead bulb in front
  - the hands are put back on top of the tube, so he still grips it
  - rear-facing yaws hide the part of the tube behind the head, front-facing
    yaws hide the bell behind the shoulders (drawn under the body)
  - fire = the stand still plus backblast / launch flash (frame 0), then an
    empty tube with backblast smoke (frames 1-3)
  - die: the dropped rifle beside the corpse becomes the dropped tube

The tube is a solid of revolution drawn from a radius profile along the rifle
axis (one profile for every yaw, in fractions of the rifle's on-screen length),
so the nine yaws show one object turned and foreshortened the same way the
rifle was. W-side yaws are mirrors (compose logic of compose_unit_sheet.py).

Placement is the AT Infantry's: each derived still is scaled by the AT lock
scale and positioned with the same source->cell transform the AT still used, so
feet, contact line and body sit on exactly the same pixels as atinfantry-*.png.

  python tools/sprites/derive_rocketer.py            # writes tools/sprites/src/rocketer-*/
  python tools/sprites/derive_rocketer.py --compose  # also writes the engine sheets, cameo, previews
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tools/sprites/src"
UNITS = ROOT / "gridlock/packages/client/src/assets/units"
PREVIEW = ROOT / "tools/sprites/preview"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from compose_unit_sheet import (  # noqa: E402
    ENGINE_ORDER,
    MIRROR_OF,
    UNIQUE_ORDER,
    diagnostics,
    key_magenta,
    opaque_bbox,
    preview_strip,
    preview_turntable,
)

NAMES = ["E", "ESE", "SE", "SSE", "S", "N", "NNE", "NE", "ENE"]
SCREEN_DEG = {"E": 0, "ESE": 22.5, "SE": 45, "SSE": 67.5, "S": 90, "N": -90, "NNE": -67.5, "NE": -45, "ENE": -22.5}
SV = math.sin(math.radians(38))
CV = math.cos(math.radians(38))

MAG = np.array([255, 0, 255], float)
OUTLINE = np.array([0x1A, 0x14, 0x10], float)
# Tube: field olive, three tones. Warhead: khaki (the pack's family), three tones.
OLIVE = [np.array(c, float) for c in ((0x3E, 0x42, 0x2E), (0x5A, 0x60, 0x40), (0x7C, 0x83, 0x5A))]
BAND = np.array([0x26, 0x27, 0x1E], float)
WAR = [np.array(c, float) for c in ((0x6A, 0x5B, 0x3C), (0x94, 0x82, 0x58), (0xB8, 0xA6, 0x78))]
NOSE = [np.array(c, float) for c in ((0x30, 0x30, 0x2C), (0x46, 0x46, 0x40), (0x5E, 0x5E, 0x56))]
BORE = np.array([0x12, 0x10, 0x0C], float)
FLASH = [np.array(c, float) for c in ((0xFF, 0xF4, 0xB0), (0xFF, 0xD0, 0x5A), (0xF0, 0x8A, 0x2A))]
SMOKE = [np.array(c, float) for c in ((0x6E, 0x6C, 0x66), (0x92, 0x90, 0x88), (0xB4, 0xB2, 0xAA))]

# ---------------------------------------------------------------- annotation
# Rifle butt (on the right shoulder / at the stock) and muzzle of every unique
# still, in 544 px source coords. Yaws where the rifle is hidden (N, crouch NNE,
# crawl N) get the butt on the right shoulder and a short foreshortened axis
# pointing away from the camera, like the rifle would.
AXIS = {
    "stand": {
        "E": ((200, 218), (522, 360)), "ESE": ((216, 205), (471, 415)), "SE": ((222, 205), (402, 440)),
        "SSE": ((225, 195), (310, 455)), "S": ((222, 190), (220, 462)), "N": ((330, 205), (300, 150)),
        "NNE": ((250, 215), (408, 200)), "NE": ((231, 215), (496, 250)), "ENE": ((222, 215), (537, 315)),
    },
    "crouch": {
        "E": ((232, 212), (524, 352)), "ESE": ((221, 215), (481, 375)), "SE": ((217, 210), (427, 385)),
        "SSE": ((220, 215), (360, 398)), "S": ((221, 205), (316, 390)), "N": ((325, 205), (300, 150)),
        "NNE": ((290, 200), (360, 170)), "NE": ((256, 210), (394, 245)), "ENE": ((242, 215), (480, 275)),
    },
    "crawl": {
        "E": ((285, 285), (530, 430)), "ESE": ((266, 295), (456, 460)), "SE": ((247, 305), (364, 482)),
        "SSE": ((228, 295), (268, 492)), "S": ((221, 290), (221, 490)), "N": ((318, 240), (318, 100)),
        "NNE": ((310, 262), (380, 152)), "NE": ((326, 270), (501, 185)), "ENE": ((312, 275), (544, 238)),
    },
    "die": {
        "E": ((40, 310), (448, 520)), "ESE": ((34, 272), (346, 538)), "SE": ((47, 240), (257, 538)),
        "SSE": ((90, 205), (152, 528)), "S": ((111, 190), (106, 515)), "N": ((362, 425), (544, 185)),
        "NNE": ((285, 430), (544, 270)), "NE": ((201, 430), (544, 335)), "ENE": ((127, 410), (544, 390)),
    },
}
# Yaws whose muzzle end is in open air: past the tube mouth the barrel is never "inside" the body.
FREE_FRONT = {"E", "ESE", "NE", "ENE", "NNE"}
# Barrel runs in front of a leg: body on one side is enough to rebuild the leg under it.
ONE_SIDE = {("stand", "SSE")}
HIDDEN = {("stand", "N"), ("crouch", "N"), ("crouch", "NNE"), ("crawl", "N")}
# Extra rifle bits to erase that are off the annotated axis: (x0, y0, x1, y1) boxes.
ERASE_BOX = {("crouch", "N"): [(150, 225, 192, 290)]}
# Parts of the tube (t range along the axis) that sit behind the body: drawn under it.
UNDER = {
    "stand": {"S": (-9, -0.04), "SSE": (-9, -0.06), "N": (0.04, 9)},
    "crouch": {"S": (-9, -0.04), "SSE": (-9, -0.06), "N": (0.04, 9), "NNE": (0.06, 9)},
    "crawl": {"S": (-9, -0.03), "SSE": (-9, -0.03), "N": (0.05, 9)},
    "die": {},
}
# Screen length of the tube axis at which the tube lies across the view (caps edge-on).
LREF = {"stand": 380.0, "crouch": 330.0, "crawl": 290.0, "die": 440.0}

R0 = 16.0  # tube radius in source px


def profile(pose: str) -> list[tuple[float, float, str]]:
    """(t, radius, material) knots along the axis; t in fractions of the rifle length."""
    if pose == "die":
        rear, lf = 0.04, 0.80  # lying tube: from the butt end, 0.80 of the rifle
    elif pose == "crawl":
        rear, lf = -0.17, 0.82
    else:
        rear, lf = -0.24, 0.86
    f = lambda x: rear + x * lf  # noqa: E731  (x in 0..1 along the tube)
    return [
        (f(0.00), 1.55 * R0, "tube"),
        (f(0.07), 1.10 * R0, "tube"),
        (f(0.085), 1.0 * R0, "band"),
        (f(0.105), 1.0 * R0, "tube"),
        (f(0.40), 1.0 * R0, "band"),
        (f(0.425), 1.0 * R0, "tube"),
        (f(0.66), 1.0 * R0, "band"),
        (f(0.70), 1.08 * R0, "tube"),
        (f(0.715), 0.95 * R0, "war"),
        (f(0.79), 1.42 * R0, "war"),
        (f(0.87), 1.42 * R0, "war"),
        (f(0.95), 0.80 * R0, "nose"),
        (f(1.00), 0.35 * R0, "nose"),
    ]


def radius_at(knots, t: float) -> tuple[float, str]:
    for (t0, r0, m0), (t1, r1, _m1) in zip(knots, knots[1:]):
        if t0 <= t <= t1:
            k = (t - t0) / max(t1 - t0, 1e-9)
            return r0 + (r1 - r0) * k, m0
    return 0.0, "tube"


# ---------------------------------------------------------------- masks


def bg_mask(a: np.ndarray) -> np.ndarray:
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return ((r > 150) & (b > 130) & (g < 120)) | ((g < np.minimum(r, b) - 25) & (r > 30))


def skin_mask(a: np.ndarray) -> np.ndarray:
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (r >= 118) & (r - g >= 14) & (r - g <= 55) & (g - b >= 4) & (g - b <= 40) & (r - b >= 30)


def grow(m: np.ndarray, k: int = 1) -> np.ndarray:
    for i in range(k):
        g = m.copy()
        g[1:] |= m[:-1]
        g[:-1] |= m[1:]
        g[:, 1:] |= m[:, :-1]
        g[:, :-1] |= m[:, 1:]
        if i % 2:
            g[1:, 1:] |= m[:-1, :-1]
            g[:-1, :-1] |= m[1:, 1:]
            g[1:, :-1] |= m[:-1, 1:]
            g[:-1, 1:] |= m[1:, :-1]
        m = g
    return m


def inpaint(a: np.ndarray, hole: np.ndarray, avoid: np.ndarray) -> np.ndarray:
    """Fill `hole` from its neighbours, onion-peel, never sampling `avoid`."""
    a = a.astype(np.float64).copy()
    known = ~hole & ~avoid
    hole = hole.copy()
    for _ in range(300):
        if not hole.any():
            break
        acc = np.zeros_like(a)
        cnt = np.zeros(a.shape[:2])
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)):
            sh = np.roll(np.roll(known, dy, 0), dx, 1)
            sa = np.roll(np.roll(a, dy, 0), dx, 1)
            acc += sa * sh[..., None]
            cnt += sh
        fill = hole & (cnt > 0)
        if not fill.any():
            break
        a[fill] = acc[fill] / cnt[fill][:, None]
        known |= fill
        hole &= ~fill
    return a


class Axis:
    def __init__(self, b, m):
        self.b = np.array(b, float)
        self.m = np.array(m, float)
        d = self.m - self.b
        self.L = float(np.hypot(*d))
        self.u = d / self.L
        n = np.array([-self.u[1], self.u[0]])
        # n_up: the perpendicular that points up the screen (light from the top-left)
        if n[1] > 0 or (abs(n[1]) < 1e-6 and n[0] > 0):
            n = -n
        self.n = n

    def coords(self, shape):
        ys, xs = np.mgrid[0 : shape[0], 0 : shape[1]]
        px, py = xs - self.b[0], ys - self.b[1]
        t = (px * self.u[0] + py * self.u[1]) / self.L
        s = px * self.n[0] + py * self.n[1]
        return t, s

    def at(self, t: float) -> np.ndarray:
        return self.b + self.u * (t * self.L)


def refine_axis(a: np.ndarray, ax: Axis) -> Axis:
    """Snap the annotated line onto the visible barrel (angle +-4 deg, offset +-8 px)."""
    body = ~bg_mask(a)
    h, w = body.shape
    best = (-1, ax)
    for dth in np.linspace(-4, 4, 17):
        th = math.radians(dth)
        c, s = math.cos(th), math.sin(th)
        u = np.array([ax.u[0] * c - ax.u[1] * s, ax.u[0] * s + ax.u[1] * c])
        n = np.array([-u[1], u[0]])
        for off in range(-8, 9, 2):
            cnt = 0
            for t in np.linspace(0.55, 1.0, 40):
                for e in (-3, 0, 3):
                    p = ax.b + n * (off + e) + u * (t * ax.L)
                    x, y = int(round(p[0])), int(round(p[1]))
                    if 0 <= x < w and 0 <= y < h and body[y, x]:
                        cnt += 1
            if cnt > best[0]:
                best = (cnt, (ax.b + n * off, u))
    b, u = best[1]
    # Muzzle: farthest body pixel along the refined line (band +-5 px).
    tm = 0.0
    for step in range(0, int(ax.L * 1.2)):
        hit = False
        for e in (-5, -2, 0, 2, 5):
            p = b + u * step + np.array([-u[1], u[0]]) * e
            x, y = int(round(p[0])), int(round(p[1]))
            if 0 <= x < w and 0 <= y < h and body[y, x]:
                hit = True
        if hit:
            tm = step
        elif step > ax.L * 0.9 and step - tm > 12:
            break
    return Axis(tuple(b), tuple(b + u * max(tm, ax.L * 0.8)))


# ---------------------------------------------------------------- rifle removal


def erase_rifle(
    a: np.ndarray, ax: Axis, t0: float, rad: float, extra=(), need_sides: int = 2, free_after: float = 9.0
) -> tuple[np.ndarray, np.ndarray]:
    """Remove the rifle from t0 to the muzzle. Returns (image, zone touched)."""
    bg = bg_mask(a)
    skin = skin_mask(a)
    t, s = ax.coords(bg.shape)
    r = np.where(t > 0.86, rad + 9, rad)
    cap = (t >= t0) & (t <= 1.0 + 40 / ax.L) & (np.abs(s) <= r)
    rifle = cap & ~bg & ~skin
    forced = np.zeros_like(bg)
    for x0, y0, x1, y1 in extra:
        forced[y0:y1, x0:x1] = True
    forced &= ~bg
    rifle |= forced
    body = ~bg & ~rifle
    # Inside the body = body on both sides of the barrel, just past its edge.
    h, w = bg.shape
    ys, xs = np.nonzero(rifle & ~forced)
    inside = np.zeros_like(bg)
    for y, x in zip(ys, xs):
        rr = r[y, x]
        foot = np.array([x, y], float) - ax.n * s[y, x]
        sides = 0
        for sg in (1, -1):
            for d in range(int(rr) + 2, int(rr) + 18, 3):
                p = foot + ax.n * (sg * d)
                px, py = int(round(p[0])), int(round(p[1]))
                if 0 <= px < w and 0 <= py < h and body[py, px]:
                    sides += 1
                    break
        inside[y, x] = sides >= need_sides and t[y, x] <= free_after
    out = a.astype(np.float64).copy()
    out = inpaint(out, rifle & inside, bg | (rifle & ~inside))
    out[rifle & ~inside] = MAG
    newbg = bg | (rifle & ~inside)
    # Re-trace the silhouette where the barrel left it.
    zone = grow(rifle, 8)
    # The barrel's anti-aliased key fringe goes back to pure key.
    out[grow(rifle, 4) & bg] = MAG
    edge = grow(newbg, 5) & ~newbg & zone & (out.mean(-1) > 45)
    out[edge] = OUTLINE
    # Thin leftovers of the barrel's own outline beyond the tube: open them away.
    solid = ~bg_mask(np.clip(out, 0, 255).astype(np.int32))
    far = grow(cap, 14) & (t > (t0 if t0 < 0 else min(max(t0 + 0.12, 0.5), free_after)))
    opened = grow(~grow(~solid, 5), 5)
    out[far & solid & ~opened] = MAG
    solid = ~bg_mask(np.clip(out, 0, 255).astype(np.int32))
    for comp in components(solid & grow(far, 4)):
        if len(comp) < 900:
            ys_, xs_ = comp[:, 1], comp[:, 0]
            # only drop it if it is detached from the main silhouette
            test = np.zeros_like(solid)
            test[ys_, xs_] = True
            if not (grow(test, 2) & solid & ~test & ~far).any():
                out[ys_, xs_] = MAG
    return out, zone


def components(m: np.ndarray) -> list[np.ndarray]:
    from collections import deque

    lab = np.zeros(m.shape, bool)
    out = []
    h, w = m.shape
    for y, x in zip(*np.nonzero(m)):
        if lab[y, x]:
            continue
        q = deque([(y, x)])
        lab[y, x] = True
        pts = []
        while q:
            cy, cx = q.popleft()
            pts.append((cx, cy))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                yy, xx = cy + dy, cx + dx
                if 0 <= yy < h and 0 <= xx < w and m[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = True
                    q.append((yy, xx))
        out.append(np.array(pts, int))
    return out


# ---------------------------------------------------------------- tube


def tube_layer(shape, ax: Axis, knots, k: float, front_visible: bool, warhead: bool = True):
    """RGB, alpha mask and t-map of the tube (and outline) on a canvas of `shape`."""
    h, w = shape
    col = np.zeros((h, w, 3))
    sil = np.zeros((h, w), bool)
    tmap = np.full((h, w), np.nan)
    t_lo, t_hi = knots[0][0], knots[-1][0]
    if not warhead:
        t_hi = next(t for t, _r, m in knots if m == "war")
    n_steps = max(2, int((t_hi - t_lo) * ax.L))
    ts = np.linspace(t_lo, t_hi, n_steps + 1)
    if not front_visible:
        ts = ts[::-1]
    ys, xs = np.mgrid[0:h, 0:w]
    for t in ts:
        r, mat = radius_at(knots, t)
        if r <= 0.5:
            continue
        c = ax.at(t)
        x0, x1 = int(max(0, c[0] - r - 2)), int(min(w, c[0] + r + 3))
        y0, y1 = int(max(0, c[1] - r - 2)), int(min(h, c[1] + r + 3))
        if x0 >= x1 or y0 >= y1:
            continue
        px = xs[y0:y1, x0:x1] - c[0]
        py = ys[y0:y1, x0:x1] - c[1]
        su = px * ax.u[0] + py * ax.u[1]
        sn = px * ax.n[0] + py * ax.n[1]
        inside = (sn / r) ** 2 + (su / max(r * k, 0.6)) ** 2 <= 1.0
        if not inside.any():
            continue
        q = sn / r
        pal = {"tube": OLIVE, "band": [BAND, BAND, BAND], "war": WAR, "nose": NOSE}[mat]
        tone = np.where(q > 0.38, 2, np.where(q < -0.42, 0, 1))
        c_rgb = np.stack([pal[0], pal[1], pal[2]])[tone]
        sub = col[y0:y1, x0:x1]
        sub[inside] = c_rgb[inside]
        sil[y0:y1, x0:x1] |= inside
        tmap[y0:y1, x0:x1][inside] = t
    # End openings: rear bell bore (rear toward the camera), or the empty muzzle.
    def bore(t, frac):
        r, _ = radius_at(knots, t)
        c = ax.at(t)
        px, py = xs - c[0], ys - c[1]
        su = px * ax.u[0] + py * ax.u[1]
        sn = px * ax.n[0] + py * ax.n[1]
        m = (sn / (r * frac)) ** 2 + (su / max(r * frac * k, 0.6)) ** 2 <= 1.0
        col[m & sil] = BORE

    if not front_visible:
        bore(t_lo, 0.72)
    elif not warhead:
        bore(t_hi, 0.72)
    ring = grow(sil, 4) & ~sil
    col[ring] = OUTLINE
    tt, _ = ax.coords((h, w))
    tmap[ring] = tt[ring]
    return col, sil | ring, tmap


def cap_ratio(ax: Axis, pose: str) -> float:
    return float(np.clip(math.sqrt(max(0.0, 1 - (ax.L / LREF[pose]) ** 2)), 0.28, 1.0))


def front_visible(pose: str, name: str, ax: Axis) -> bool:
    if pose == "die":
        return ax.m[1] >= ax.b[1]
    phi = math.radians(SCREEN_DEG[name])
    fy = math.sin(phi) / SV
    fx = math.cos(phi)
    fy /= math.hypot(fx, fy)
    th = 0.0 if pose == "crawl" else math.radians(32)
    return math.cos(th) * fy * CV - math.sin(th) * SV + (0.35 if pose == "crawl" else 0.0) >= -0.05


def put_layer(a: np.ndarray, base_bg: np.ndarray, col, alpha, tmap, under) -> np.ndarray:
    out = a.copy()
    if under is None:
        top = alpha
    else:
        lo, hi = under
        behind = alpha & (tmap >= lo) & (tmap <= hi)
        top = alpha & ~behind
        out[behind & base_bg] = col[behind & base_bg]
    out[top] = col[top]
    return out


def restore_hands(out: np.ndarray, orig: np.ndarray, ax: Axis, alpha: np.ndarray, t_rng=(0.03, 0.55)) -> np.ndarray:
    skin = skin_mask(orig.astype(np.int32)) & ~bg_mask(orig.astype(np.int32))
    t, _ = ax.coords(skin.shape)
    hand = skin & alpha & (t >= t_rng[0]) & (t <= t_rng[1])
    # Drop specks (a lone skin-coloured pixel on the old rifle is not a hand).
    core = hand & ~grow(~hand, 1)
    hand = grow(core, 1) & skin
    if not hand.any():
        return out
    out = out.copy()
    out[hand] = orig[hand]
    rim = grow(hand, 3) & ~hand & alpha & ~grow(skin & ~alpha, 2)
    out[rim] = OUTLINE
    return out


# ---------------------------------------------------------------- fire FX


def blob(shape, c, rx, ry, u, n):
    ys, xs = np.mgrid[0 : shape[0], 0 : shape[1]]
    px, py = xs - c[0], ys - c[1]
    su = px * u[0] + py * u[1]
    sn = px * n[0] + py * n[1]
    return (su / rx) ** 2 + (sn / ry) ** 2 <= 1.0


def fire_fx(shape, ax: Axis, knots, frame: int):
    """Backblast behind the bell, launch flash at the muzzle, then smoke."""
    h, w = shape
    col = np.zeros((h, w, 3))
    alpha = np.zeros((h, w), bool)
    tmap = np.full((h, w), np.nan)
    t_rear, r_rear = knots[0][0], knots[0][1]
    t_front = next(t for t, _r, m in knots if m == "war")
    rear = ax.at(t_rear)
    front = ax.at(t_front)
    u, n = ax.u, ax.n
    rng = np.random.default_rng(7 + frame)

    def paint(m, c, t):
        col[m] = c
        alpha[m] = True
        tmap[m] = t

    if frame == 0:
        # Backblast: a hot cone out of the bell, smoke fringe; muzzle flash in front.
        for i, (L, rad, c) in enumerate(((60, 26, SMOKE[1]), (52, 21, FLASH[2]), (38, 15, FLASH[1]), (22, 9, FLASH[0]))):
            m = blob(shape, rear - u * (L * 0.55), L * 0.6, rad, u, n)
            paint(m, c, t_rear - 0.1)
        for L, rad, c in ((40, 26, FLASH[2]), (30, 18, FLASH[1]), (16, 10, FLASH[0])):
            m = blob(shape, front + u * (L * 0.45), L * 0.6, rad, u, n)
            paint(m, c, t_front + 0.1)
    else:
        grow_k = {1: 0.85, 2: 0.95, 3: 1.05}[frame]
        shade = {1: (0, 1), 2: (1, 2), 3: (1, 2)}[frame]
        count = {1: 4, 2: 4, 3: 3}[frame]
        for i in range(count):
            d = 22 + i * 17 * grow_k + rng.uniform(-4, 4)
            off = rng.uniform(-10, 10) * grow_k
            c = rear - u * (d * 0.8) + np.array([0.0, -1.0]) * (d * 0.45) + n * off  # smoke drifts up
            rr = (14 + i * 3) * grow_k * (0.7 if frame == 3 else 1.0)
            outer = blob(shape, c, rr, rr * 0.85, u, n)
            inner = blob(shape, c - n * (-rr * 0.2), rr * 0.7, rr * 0.55, u, n)
            paint(outer, SMOKE[shade[0]], t_rear - 0.1)
            paint(inner, SMOKE[shade[1]], t_rear - 0.1)
        if frame == 1:
            for L, rad, c in ((22, 14, FLASH[2]), (12, 8, FLASH[1])):
                m = blob(shape, front + u * (L * 0.5), L * 0.6, rad, u, n)
                paint(m, c, t_front + 0.1)
            m = blob(shape, front + u * 34, 16, 12, u, n)
            inner = blob(shape, front + u * 34, 10, 7, u, n)
            paint(m & ~alpha, SMOKE[1], t_front + 0.1)
            paint(inner, SMOKE[2], t_front + 0.1)
    # Keep inside the canvas and away from the key colour.
    return col, alpha, tmap


# ---------------------------------------------------------------- derive


def load(pose: str, name: str) -> np.ndarray:
    return np.asarray(Image.open(SRC / f"atinfantry-{pose}/{name}.png").convert("RGB")).astype(np.float64)


def derive_one(pose: str, name: str, frames_fire: bool = False):
    a0 = load(pose, name)
    ai = a0.astype(np.int32)
    ax = Axis(*AXIS[pose][name])
    if (pose, name) not in HIDDEN:
        ax = refine_axis(ai, ax)
    knots = profile(pose)
    extra = ERASE_BOX.get((pose, name), ())
    if pose == "die":
        a, _ = erase_rifle(ai, ax, -0.10, 30.0, extra)
    elif (pose, name) in HIDDEN:
        a = a0.copy()
        if extra:
            a, _ = erase_rifle(ai, Axis((0, 0), (1, 0)), 99.0, 1.0, extra)
    else:
        t_war = next(t for t, _r, m in knots if m == "war")
        free = t_war - 0.01 if name in FREE_FRONT else 9.0
        a, _ = erase_rifle(ai, ax, 0.30, 19.0, extra, 1 if (pose, name) in ONE_SIDE else 2, free)
    base_bg = bg_mask(np.clip(a, 0, 255).astype(np.int32))
    k = 0.45 if pose == "die" else cap_ratio(ax, pose)
    fv = front_visible(pose, name, ax)
    under = UNDER[pose].get(name)
    outs = []
    variants = [(True, None)] if not frames_fire else [(False, 0), (False, 1), (False, 2), (False, 3)]
    for warhead, fx in variants:
        col, alpha, tmap = tube_layer(a.shape[:2], ax, knots, k, fv, warhead)
        img = put_layer(a, base_bg, col, alpha, tmap, under)
        if pose not in ("die",):
            img = restore_hands(img, a0, ax, alpha & ~np.isnan(tmap) & (tmap > 0.0))
        if fx is not None:
            fcol, falpha, ftmap = fire_fx(a.shape[:2], ax, knots, fx)
            now_bg = bg_mask(np.clip(img, 0, 255).astype(np.int32))
            img = put_layer(img, now_bg, fcol, falpha, ftmap, under)
        outs.append(img)
    return outs


def clean_orphans(a: np.ndarray) -> np.ndarray:
    """Key fringe no longer next to an outline, and small detached bits, go to pure key."""
    a = a.copy()
    ai = np.clip(a, 0, 255).astype(np.int32)
    bg = bg_mask(ai)
    solid = ~bg
    pure = (ai[..., 0] == 255) & (ai[..., 1] == 0) & (ai[..., 2] == 255)
    a[bg & ~pure & ~grow(solid, 3)] = MAG
    comps = components(solid)
    if comps:
        big = max(len(c) for c in comps)
        for c in comps:
            if len(c) < min(1500, big // 4):
                a[c[:, 1], c[:, 0]] = MAG
    ai = np.clip(a, 0, 255).astype(np.int32)
    bg = bg_mask(ai)
    pure = (ai[..., 0] == 255) & (ai[..., 1] == 0) & (ai[..., 2] == 255)
    a[bg & ~pure & ~grow(~bg, 3)] = MAG
    return a


def save_rgb(a: np.ndarray, path: Path) -> None:
    a = clean_orphans(a)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), "RGB").save(path)


def derive(pose: str) -> None:
    for n in NAMES:
        if pose == "fire":
            outs = derive_one("stand", n, frames_fire=True)
            strip = np.concatenate(outs, axis=1)
            save_rgb(strip, SRC / f"rocketer-fire-strips/{n}.png")
        else:
            (img,) = derive_one(pose, n)
            save_rgb(img, SRC / f"rocketer-{pose}/{n}.png")
    print("wrote", pose)


# ---------------------------------------------------------------- compose

# AT Infantry locks (tools/sprites/preview/atinfantry-*-manifest.json): same cell, contact, scale.
POSES = {
    #          sheet     base     frames contactY scale   draw
    "stand": ("walk", "stand", 8, 0.90, 0.1883, 20),
    "crouch": ("crouch", "crouch", 8, 0.88, 0.1883, 20),
    "crawl": ("crawl", "crawl", 8, 0.72, 0.166, 25),
    "fire": ("fire", "stand", 4, 0.90, 0.1883, 20),
    "die": ("die", "die", 4, 0.82, 0.1732, 20),
}


def place_like(new: Image.Image, ref: Image.Image, cell: int, scale: float, contact_y: float) -> tuple[Image.Image, bool]:
    """Scale `new` and put it where compose_unit_sheet put `ref` (same source->cell map)."""
    out = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    rb = opaque_bbox(ref)
    nb = opaque_bbox(new)
    if not nb or not rb:
        return out, False
    rw = round((rb[2] - rb[0]) * scale)
    rh = round((rb[3] - rb[1]) * scale)
    rx = round((cell - rw) / 2)
    ry = round(cell * contact_y - rh)
    crop = new.crop(nb)
    nw = max(1, round(crop.size[0] * scale))
    nh = max(1, round(crop.size[1] * scale))
    scaled = crop.resize((nw, nh), Image.Resampling.LANCZOS)
    x = round(rx + (nb[0] - rb[0]) * scale)
    y = round(ry + (nb[1] - rb[1]) * scale)
    clipped = x < 0 or y < 0 or x + nw > cell or y + nh > cell
    out.alpha_composite(scaled, (x, y)) if not clipped else out.paste(scaled, (x, y), scaled)
    return out, clipped


def compose(pose: str) -> dict:
    sheet_name, base, frames, cy, scale, draw = POSES[pose]
    cell = 96
    placed_frames: list[dict[str, Image.Image]] = []
    clipped_dirs = []
    for fi in range(frames if pose == "fire" else 1):
        placed: dict[str, Image.Image] = {}
        for n in UNIQUE_ORDER:
            ref = key_magenta(Image.open(SRC / f"atinfantry-{base}/{n}.png"))
            if pose == "fire":
                strip = Image.open(SRC / f"rocketer-fire-strips/{n}.png")
                w = strip.width // frames
                new = key_magenta(strip.crop((fi * w, 0, (fi + 1) * w, strip.height)))
            else:
                new = key_magenta(Image.open(SRC / f"rocketer-{pose}/{n}.png"))
            placed[n], clipped = place_like(new, ref, cell, scale, cy)
            if clipped:
                clipped_dirs.append(f"{n}#{fi}")
        for dest, src_name in MIRROR_OF.items():
            placed[dest] = placed[src_name].transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        placed_frames.append(placed)
    sheet = Image.new("RGBA", (frames * cell, 16 * cell), (0, 0, 0, 0))
    for r, d in enumerate(ENGINE_ORDER):
        for c in range(frames):
            src = placed_frames[c % len(placed_frames)][d]
            sheet.alpha_composite(src, (c * cell, r * cell))
    dest = UNITS / f"rocketer-{sheet_name}.png"
    sheet.save(dest)
    stem = f"rocketer-{sheet_name}"
    diag = diagnostics(placed_frames[0], cell)
    pops = [d["dir"] for d in diag if d.get("pop")]
    empties = [d["dir"] for d in diag if d.get("empty")]
    PREVIEW.mkdir(parents=True, exist_ok=True)
    preview_turntable(placed_frames[0], cell).save(PREVIEW / f"{stem}-turntable.png")
    preview_strip(sheet, cell, frames, draw).save(PREVIEW / f"{stem}-strip.png")
    man = {
        "id": stem,
        "cell": cell,
        "cols": frames,
        "rows": 16,
        "facing": 16,
        "order": ENGINE_ORDER,
        "unique": UNIQUE_ORDER,
        "mirror": MIRROR_OF,
        "contactY": cy,
        "scale": scale,
        "pivot": "none",
        "placement": f"atinfantry-{base} source->cell transform",
        "out": str(dest.relative_to(ROOT)),
        "size_pop_dirs": pops,
        "empty_dirs": empties,
        "clipped": clipped_dirs,
        "diag": diag,
    }
    (PREVIEW / f"{stem}-manifest.json").write_text(json.dumps(man, indent=2))
    print("sheet", dest.name, sheet.size, "pop", pops, "empty", empties, "clipped", clipped_dirs)
    return man


def cameo() -> None:
    """Same framing as atinfantry-cameo.png: 72x72, width-fit, feet on y=70."""
    rgba = key_magenta(Image.open(SRC / "rocketer-stand/E.png"))
    crop = rgba.crop(opaque_bbox(rgba))
    fit = min(72 / crop.width, 63 / crop.height)
    small = crop.resize((max(1, round(crop.width * fit)), max(1, round(crop.height * fit))), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (72, 72), (0, 0, 0, 0))
    out.alpha_composite(small, ((72 - small.width) // 2, 70 - small.height))
    out.save(UNITS / "rocketer-cameo.png")
    print("cameo", UNITS / "rocketer-cameo.png")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--compose", action="store_true")
    ap.add_argument("--poses", default="stand,crouch,crawl,fire,die")
    args = ap.parse_args()
    poses = args.poses.split(",")
    for p in poses:
        derive(p)
    if (SRC / "rocketer-stand/E.png").exists():
        Image.open(SRC / "rocketer-stand/E.png").save(SRC / "rocketer-east.png")
    if args.compose:
        for p in poses:
            compose(p)
        cameo()


if __name__ == "__main__":
    main()
