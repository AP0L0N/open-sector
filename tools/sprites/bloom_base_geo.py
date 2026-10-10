#!/usr/bin/env python3
"""Shared geometry, materials and the render step for the Bloom buildings.

Forked from render_borg_base.py: the same inked structure pipeline of
render_airfield.py (mesh, raster, ink, silhouette, key light, cast shadow), the
same camera, canvas and pad metrics, but grown, not built: swept tubes, lumpy
ellipsoids and lathed bodies instead of boxes, and the Bloom palette lock from
gridlock/docs/factions/bloom.md (wet flesh, ivory chitin, dark membrane, amber
glow, a chassis-gray team plate on every building).

Imported by render_bloom_base.py and render_bloom_harbour.py.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_borg_base as rbb

ra = rbb.ra
SS = ra.SS
PREVIEW = Path(__file__).resolve().parent / "preview"

# ---------------------------------------------------------------- palette lock (bloom.md)

FLESH_D, FLESH_M, FLESH_L = "#5e2f45", "#8a4a63", "#b7778a"
BONE_D, BONE_M, BONE_L = "#3a2a2e", "#8c7a63", "#cdbb98"
MEMBRANE = "#24161f"
GLOW_D, GLOW, HOT = "#e0701a", "#ffb13b", "#ffe08a"
PLATE, PLATE_D = "#6e6e68", "#4a4a46"


def rgb(h: str) -> np.ndarray:
    return ra.rgb(h)


# ---------------------------------------------------------------- texture frames set by the builders

SACS: list[tuple[np.ndarray, float]] = []   # (centre, radius) of translucent sacs with a shape inside
POOLS: list[dict] = []                      # {"x","y","r"} amber pools / pits
SLITS: list[dict] = []                      # {"x","y","z0","hw","h"} birthing slits on a +y face
LILIES: list[tuple[float, float, float]] = []  # lily-pad centres for radial veins
HEARTS: list[dict] = []                     # {"c","r","win":[(dir, ang_radius)]} hearts with glowing windows
BULBS: list[tuple[np.ndarray, float]] = []  # (centre, radius) of glowing bulbs


def reset_frames() -> None:
    HEARTS.clear()
    BULBS.clear()
    SACS.clear()
    POOLS.clear()
    SLITS.clear()
    LILIES.clear()


_prev_tex = ra.tex
_H = ra.LIGHT + ra.VIEW
_H = _H / np.linalg.norm(_H)


def _flat(n: np.ndarray) -> float:
    lam = max(0.0, float(np.dot(n, ra.LIGHT)))
    return 0.5 + 0.62 * lam


def _glint(X, Y, Z, n, amt: float) -> np.ndarray:
    """Wet glints: small bright flecks on faces that catch the key light."""
    face = float(np.clip(np.dot(n, _H) * 1.6 - 0.75, 0, 1))
    if face <= 0:
        return np.zeros(len(X))
    g = ra.smooth(0.66, 0.82, ra.fbm(X / 1.3 + Z * 0.4, Y / 1.3 - Z * 0.3, 131, 2))
    return g * face * amt


def bloom_tex(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    if not mat.startswith("bl_"):
        return _prev_tex(mat, P, n)
    N = len(X)
    nf = ra.vnoise(X / 1.1 + Z * 0.7, Y / 1.1 - Z * 0.5, 7)
    nm = ra.fbm(X / 6 + Z * 0.2, Y / 6 + Z * 0.3, 9, 3)

    def base(h):
        return np.broadcast_to(rgb(h), (N, 3)).copy()

    if mat in ("bl_flesh", "bl_flesh_d"):
        lo, hi = (FLESH_D, FLESH_M) if mat == "bl_flesh_d" else (FLESH_M, FLESH_L)
        c = ra.mix(base(lo), base(hi), ra.smooth(0.3, 0.75, nm))
        c *= (0.92 + 0.12 * nf[:, None])
        # A dark vein net under the skin.
        v = np.abs(np.sin(ra.fbm(X / 7 + Z * 0.3, Y / 7 - Z * 0.2, 61, 3) * 18.0))
        c = ra.mix(c, base(FLESH_D) * 0.8, ra.smooth(0.16, 0.0, v) * 0.7)
        c += _glint(X, Y, Z, n, 0.55)[:, None] * (rgb("#f0cdd6") - c)
        return c
    if mat == "bl_creep":
        # The grown pad: membrane and dark flesh, a faint amber vein web.
        c = ra.mix(base(MEMBRANE), base(FLESH_D), ra.smooth(0.25, 0.85, nm) * 0.85)
        c *= (0.9 + 0.16 * nf[:, None])
        v = np.abs(np.sin(ra.fbm(X / 14, Y / 14, 47, 3) * 24.0))
        vm = ra.smooth(0.1, 0.0, v) * ra.smooth(0.35, 0.6, ra.fbm(X / 22 + 4, Y / 22, 53))
        c = ra.mix(c, base(GLOW_D) * 0.9, vm * 0.7)
        bump = ra.smooth(0.6, 0.8, ra.fbm(X / 2.5, Y / 2.5, 59, 2))
        c = ra.mix(c, base(FLESH_M), bump * 0.35)
        return c
    if mat in ("bl_bone", "bl_bone_d"):
        if mat == "bl_bone":
            c = ra.mix(base(BONE_M), base(BONE_L), ra.smooth(0.25, 0.7, nm))
        else:
            c = ra.mix(base(BONE_D), base(BONE_M), ra.smooth(0.3, 0.8, nm) * 0.7)
        c *= (0.93 + 0.1 * nf[:, None])
        band = np.mod(Z * 0.9 + X * 0.15 + Y * 0.15 + nm * 2.0, 3.0) < 0.35
        c[band] *= 0.8
        c += _glint(X, Y, Z, n, 0.4)[:, None] * (rgb("#fff4dc") - c)
        return c
    if mat == "bl_membrane":
        c = ra.mix(base(MEMBRANE), base(FLESH_D), ra.smooth(0.5, 0.9, nm) * 0.5)
        return c * (0.92 + 0.12 * nf[:, None])
    if mat == "bl_plate":
        # The team plate: chassis gray carapace with darker growth grooves and a dark rim.
        c = base(PLATE) * (0.92 + 0.1 * nm[:, None]) * (0.96 + 0.06 * nf[:, None])
        groove = np.mod(X * 0.7 - Y * 0.7 + Z * 0.5 + nm * 1.5, 3.4) < 0.45
        c[groove] = rgb(PLATE_D)
        c += _glint(X, Y, Z, n, 0.3)[:, None] * (rgb("#d8d8d0") - c)
        return c
    if mat == "bl_plate_d":
        return base(PLATE_D) * (0.92 + 0.1 * nm[:, None])
    if mat == "bl_egg":
        # Leathery egg-sac: crinkled skin with a faint amber life inside.
        c = ra.mix(base(FLESH_M), base(FLESH_L), ra.smooth(0.35, 0.8, nm))
        crk = np.abs(np.sin(ra.fbm(X / 2.2, Y / 2.2 + Z * 0.5, 67, 2) * 14.0))
        c = ra.mix(c, base(FLESH_D), ra.smooth(0.18, 0.0, crk) * 0.6)
        c = ra.mix(c, base(GLOW_D), 0.12 + 0.1 * nf)
        c += _glint(X, Y, Z, n, 0.5)[:, None] * (rgb("#f0cdd6") - c)
        return c
    if mat == "bl_lily":
        c = ra.mix(base(FLESH_M), base(FLESH_L), ra.smooth(0.3, 0.85, nm))
        if LILIES:
            L = np.array(LILIES)
            d = (X[:, None] - L[None, :, 0]) ** 2 + (Y[:, None] - L[None, :, 1]) ** 2
            k = np.argmin(d, axis=1)
            lx, ly, lr = L[k, 0], L[k, 1], L[k, 2]
            a = np.arctan2(Y - ly, X - lx)
            r = np.hypot(X - lx, Y - ly) / lr
            vein = np.abs(np.sin(a * 7.0 + r * 1.5)) < 0.12
            c[vein] = (c[vein] * 0.5 + rgb(GLOW_D) * 0.45)
            c = ra.mix(c, base(FLESH_L), ra.smooth(0.7, 1.0, r) * 0.4)
        c += _glint(X, Y, Z, n, 0.6)[:, None] * (rgb("#f0cdd6") - c)
        return c
    if mat == "bl_coral":
        # Brain coral: meandering ivory-pink ridges, dark grooves, amber deep in the folds.
        warp = ra.fbm(X / 7.0 + Z * 0.05, Y / 7.0 - Z * 0.07, 73, 3) * 22.0 + ra.fbm(X / 3.0, Y / 3.0 + Z * 0.2, 77, 2) * 4.0
        w = np.sin((X * 0.55 + Y * 0.25 + Z * 0.85) * 2.2 + warp)
        c = ra.mix(base(FLESH_L), base(BONE_L), ra.smooth(-0.1, 0.8, w))
        c *= (0.93 + 0.1 * nf[:, None])
        groove = np.abs(w) < 0.24
        c[groove] = rgb(FLESH_D)
        deep = np.abs(w) < 0.09
        c[deep] = rgb(GLOW_D) / _flat(n)
        c += _glint(X, Y, Z, n, 0.35)[:, None] * (rgb("#fff0e0") - c)
        return c
    if mat == "bl_heart":
        # Heart muscle: striated flesh; windows where the ventricle glows through, a dark rim round each.
        stri = np.sin((X * 0.6 - Y * 0.4 + Z * 0.9) * 1.3 + nm * 4.0)
        c = ra.mix(base(FLESH_M), base(FLESH_L), ra.smooth(0.05, 0.65, nm))
        c *= (0.9 + 0.08 * stri[:, None]) * (0.94 + 0.1 * nf[:, None])
        v = np.abs(np.sin(ra.fbm(X / 7 + Z * 0.3, Y / 7 - Z * 0.2, 61, 3) * 18.0))
        c = ra.mix(c, base(FLESH_D) * 0.8, ra.smooth(0.16, 0.0, v) * 0.7)
        c += _glint(X, Y, Z, n, 0.55)[:, None] * (rgb("#f0cdd6") - c)
        if HEARTS:
            hz = [np.linalg.norm((P - h["c"]) / np.array(h["r"]), axis=1) for h in HEARTS]
            k = np.argmin(np.abs(np.stack(hz, axis=1) - 1.0), axis=1)
            glow = np.zeros(N)
            for hi, h in enumerate(HEARTS):
                sel = k == hi
                if not sel.any():
                    continue
                d = (P[sel] - h["c"]) / np.array(h["r"])
                d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
                for wd, wr in h["win"]:
                    w = np.asarray(wd, float) / np.array(h["r"])
                    w /= np.linalg.norm(w)
                    ang = np.arccos(np.clip(d @ w, -1, 1))
                    wob = 1.0 + 0.18 * np.sin(np.arctan2(d[:, 2], d[:, 0] - d[:, 1]) * 5.0)
                    glow[sel] = np.maximum(glow[sel], 1.0 - ang / (wr * wob))
            rim = (glow > -0.18) & (glow <= 0.0)
            c[rim] = c[rim] * 0.45 + rgb(MEMBRANE) * 0.4
            win = glow > 0.0
            if win.any():
                s0 = _flat(n)
                gw = ra.mix(np.broadcast_to(rgb(GLOW_D), (win.sum(), 3)), np.broadcast_to(rgb(HOT), (win.sum(), 3)),
                            np.clip(glow[win] * 1.6, 0, 1))
                band = (np.mod(stri[win] * 2.0 + nf[win], 1.4) < 0.3)
                gw[band] *= 0.72
                c[win] = gw / s0
        return c
    # ---- emissive: divide out the key light so the glow reads on the shaded side too.
    s = _flat(n)
    facing = max(0.0, float(np.dot(n, ra.VIEW)))
    if mat == "bl_glow":
        return base(GLOW) * (0.92 + 0.12 * nf[:, None]) / s
    if mat == "bl_glow_d":
        return base(GLOW_D) * (0.9 + 0.14 * nf[:, None]) / s
    if mat == "bl_hot":
        return base(HOT) / s
    if mat == "bl_bulb":
        # Translucent bulb: a hot heart seen through it, amber body, a deep rim, dark veins in the skin.
        if BULBS:
            C = np.array([b_[0] for b_ in BULBS])
            Rr = np.array([b_[1] for b_ in BULBS])
            d = np.linalg.norm(P[:, None, :] - C[None], axis=2) / Rr[None]
            k = np.argmin(np.abs(d - 1.0), axis=1)
            off = P - C[k]
            rr = Rr[k]
            su = (off[:, 0] - off[:, 1]) / (rr * 1.41)
            sv = ((off[:, 0] + off[:, 1]) * 0.5 - off[:, 2]) / (rr * 1.15)
            q = np.clip(np.hypot(su + 0.12, sv + 0.18), 0, 1.2)
            c = ra.mix(base("#fffbe6"), base(HOT), ra.smooth(0.05, 0.4, q))
            c = ra.mix(c, base(GLOW), ra.smooth(0.4, 0.75, q))
            c = ra.mix(c, base(GLOW_D), ra.smooth(0.75, 0.93, q))
            c = ra.mix(c, base("#7a2e10"), ra.smooth(0.9, 1.05, q) * 0.85)
            # The stalk seen through the skin, rising into the heart of the bulb.
            stalk = (np.abs(su) < 0.07 + 0.05 * sv) & (sv > 0.1)
            c[stalk] = c[stalk] * 0.7 + rgb(GLOW_D) * 0.3
        else:
            c = ra.mix(base(GLOW_D), base(HOT), np.clip(facing ** 1.6 * (0.85 + 0.2 * nm), 0, 1))
        v = np.abs(np.sin(ra.fbm(X / 2.6 + Z * 0.6, Y / 2.6 - Z * 0.4, 83, 2) * 11.0))
        c = ra.mix(c, base("#6a2a14"), ra.smooth(0.12, 0.0, v) * 0.55)
        # A wet highlight fleck up-left.
        c += _glint(X, Y, Z, n, 0.5)[:, None] * (rgb("#fffbe8") - c)
        return c / s
    if mat == "bl_sac":
        # A big translucent womb sac, a curled shape dark inside it.
        c = ra.mix(base("#c66a4a"), base(GLOW), np.clip(facing ** 1.3 * (0.8 + 0.25 * nm), 0, 1))
        v = np.abs(np.sin(ra.fbm(X / 4.0 + Z * 0.5, Y / 4.0 - Z * 0.5, 87, 2) * 10.0))
        c = ra.mix(c, base(FLESH_D), ra.smooth(0.12, 0.0, v) * 0.55)
        if SACS:
            C = np.array([s_[0] for s_ in SACS])
            Rr = np.array([s_[1] for s_ in SACS])
            d = np.linalg.norm(P[:, None, :] - C[None], axis=2) / Rr[None]
            k = np.argmin(np.abs(d - 1.0), axis=1)
            off = P - C[k]
            rr = Rr[k]
            su = (off[:, 0] - off[:, 1]) / (rr * 1.4)
            sv = ((off[:, 0] + off[:, 1]) * 0.5 - off[:, 2]) / (rr * 1.1)
            # Curled body: an arc of a circle, thicker toward the head, plus the head and limbs.
            # A soft curled body (a shadow seen through the sac), head up-left, tucked legs, blurred edges.
            su = su + 0.05 * (nm - 0.5)
            sv = sv + 0.05 * (nf - 0.5)
            ang = np.arctan2(sv, su)
            rad = np.hypot(su, sv)
            t = np.clip((ang + 2.9) / 5.4, 0, 1)
            thick = 0.1 + 0.16 * np.sin(t * math.pi) ** 0.7
            arc = (ang > -2.9) & (ang < 2.5)
            body = ra.smooth(thick + 0.08, thick - 0.02, np.abs(rad - 0.34)) * arc
            hx, hy = 0.32 * math.cos(2.5) + 0.04, 0.32 * math.sin(2.5) - 0.06
            head = ra.smooth(0.3, 0.17, np.hypot(su - hx, sv - hy))
            limbs = np.zeros(N)
            for la, ln_ in ((-0.9, 0.3), (-0.1, 0.32), (0.8, 0.28)):
                px_, py_ = 0.34 * math.cos(la), 0.34 * math.sin(la)
                dx, dy = -math.cos(la + 0.9) * ln_, -math.sin(la + 0.9) * ln_
                tt = np.clip(((su - px_) * dx + (sv - py_) * dy) / (ln_ * ln_), 0, 1)
                limbs = np.maximum(limbs, ra.smooth(0.08, 0.03, np.hypot(su - px_ - tt * dx, sv - py_ - tt * dy)))
            shape = np.clip(np.maximum(np.maximum(body, head), limbs), 0, 1) * 0.72
            c = ra.mix(c, base("#3a1a20"), shape)
        return c / s
    if mat == "bl_pool":
        if not POOLS:
            return base(GLOW) / s
        pl = POOLS[0]
        r = np.hypot(X - pl["x"], Y - pl["y"]) / pl["r"]
        a = np.arctan2(Y - pl["y"], X - pl["x"])
        swirl = 0.5 + 0.5 * np.sin(a * 3 + r * 9)
        c = ra.mix(base(GLOW_D), base(HOT), np.clip((1 - r) * 0.85 + swirl * 0.22, 0, 1))
        chunk = ra.smooth(0.63, 0.71, ra.fbm(X / 2.4, Y / 2.4, 41)) * ra.smooth(0.3, 0.6, r)
        c = ra.mix(c, base(pl.get("chunk", "#3a2018")), chunk * pl.get("chunk_amt", 0.85))
        return c / s
    if mat == "bl_gullet":
        # Inside a throat: dark membrane up top, lit amber further down.
        if POOLS:
            depth = np.clip((POOLS[0].get("rim", 4.0) - Z) / POOLS[0].get("depth", 4.0), 0, 1)
        else:
            depth = np.zeros(N)
        c = ra.mix(base(MEMBRANE), base(GLOW_D), depth ** 1.5)
        fold = np.abs(np.sin(np.arctan2(Y - POOLS[0]["y"], X - POOLS[0]["x"]) * 14.0)) < 0.25 if POOLS else np.zeros(N, bool)
        c[fold] *= 0.6
        return c / s
    if mat == "bl_slit":
        sl = SLITS[0]
        dx = np.abs(X - sl["x"]) / sl["hw"]
        dz = (Z - sl["z0"]) / sl["h"]
        lens = dx / np.maximum(np.sin(np.clip(dz, 0, 1) * math.pi), 0.05)
        c = ra.mix(base(HOT), base(GLOW_D), np.clip(lens, 0, 1) ** 0.7)
        c[np.mod(X - sl["x"] + 40.0, 2.4) < 0.4] *= 0.75
        return c / s
    return base("#ff00ff")


ra.tex = bloom_tex


# ---------------------------------------------------------------- shapes


def v3(*a) -> np.ndarray:
    return np.array(a if len(a) == 3 else a[0], dtype=float)


def catmull(pts, sub: int) -> list[np.ndarray]:
    P = [np.asarray(p, float) for p in pts]
    if sub <= 1 or len(P) < 3:
        if len(P) == 2 and sub > 1:
            return [P[0] + (P[1] - P[0]) * (k / sub) for k in range(sub + 1)]
        return P
    ext = [2 * P[0] - P[1]] + P + [2 * P[-1] - P[-2]]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for k in range(sub):
            t = k / sub
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-1])
    return out


def tube(m: ra.Mesh, pts, radii, mat: str, n: int = 8, sub: int = 4, caps: bool = True, cap_mat: str | None = None,
         flat: float = 1.0) -> list[np.ndarray]:
    """A smooth swept tube through control points, one part. `flat` < 1 squashes it into a strap."""
    P = catmull(pts, sub)
    radii = list(radii) if hasattr(radii, "__len__") else [radii, radii]
    R = np.interp(np.linspace(0, len(radii) - 1, len(P)), np.arange(len(radii)), radii)
    m.new_part()
    T = []
    for i in range(len(P)):
        a = P[max(i - 1, 0)]
        b = P[min(i + 1, len(P) - 1)]
        t = b - a
        T.append(t / max(np.linalg.norm(t), 1e-9))
    ref = np.array([0.0, 0.0, 1.0]) if abs(T[0][2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    u = np.cross(T[0], ref)
    u /= np.linalg.norm(u)
    rings = []
    angs = np.linspace(0, 2 * math.pi, n, endpoint=False)
    for i, p in enumerate(P):
        u = u - np.dot(u, T[i]) * T[i]
        u /= max(np.linalg.norm(u), 1e-9)
        w = np.cross(T[i], u)
        r = max(float(R[i]), 0.04)
        rings.append([m.v(p + r * (math.cos(t) * u * flat + math.sin(t) * w)) for t in angs])
    for i in range(len(rings) - 1):
        for j in range(n):
            k = (j + 1) % n
            m.quad(rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j], mat)
    if caps:
        for ring, p in ((rings[0], P[0]), (rings[-1], P[-1])):
            c = m.v(p)
            for j in range(n):
                m.tri(c, ring[j], ring[(j + 1) % n], cap_mat or mat)
    return P


def _wobble(th, ph, seed: float) -> float:
    return (0.5 * math.sin(3 * th + seed) * math.cos(2 * ph + seed * 0.7)
            + 0.3 * math.sin(5 * th - 2 * seed + 3 * ph) + 0.2 * math.sin(2 * th + 1.3 * seed))


def frame(axis) -> np.ndarray:
    """Rotation whose third column is `axis` (local z)."""
    w = np.asarray(axis, float)
    w = w / np.linalg.norm(w)
    ref = np.array([0.0, 0.0, 1.0]) if abs(w[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    u = np.cross(ref, w)
    u /= np.linalg.norm(u)
    v = np.cross(w, u)
    return np.stack([u, v, w], axis=1)


def ellip(m: ra.Mesh, c, radii, mat, rings: int = 10, seg: int = 20, wob: float = 0.0, seed: float = 0.0,
          R: np.ndarray | None = None, zmin: float | None = None, th=(0.0, 2 * math.pi), ph=(-math.pi / 2, math.pi / 2),
          part: bool = True) -> None:
    """A lumpy ellipsoid (or a patch of one), one part. `mat` may be a function (theta, phi) -> material."""
    if mat == "bl_bulb":
        BULBS.append((np.asarray(c, float), float(max(radii))))
    if part:
        m.new_part()
    c = np.asarray(c, float)
    rx, ry, rz = radii
    full = abs((th[1] - th[0]) - 2 * math.pi) < 1e-6
    ns = seg if full else seg + 1
    ids = []
    for i in range(rings + 1):
        p_ = ph[0] + (ph[1] - ph[0]) * i / rings
        row = []
        for j in range(ns):
            t_ = th[0] + (th[1] - th[0]) * j / seg
            f = 1.0 + wob * _wobble(t_, p_, seed)
            loc = np.array([math.cos(p_) * math.cos(t_) * rx, math.cos(p_) * math.sin(t_) * ry, math.sin(p_) * rz]) * f
            q = c + (R @ loc if R is not None else loc)
            if zmin is not None and q[2] < zmin:
                q[2] = zmin
            row.append(m.v(q))
        ids.append(row)
    for i in range(rings):
        for j in range(seg):
            k = (j + 1) % ns if full else j + 1
            mt = mat(th[0] + (th[1] - th[0]) * (j + 0.5) / seg, ph[0] + (ph[1] - ph[0]) * (i + 0.5) / rings) if callable(mat) else mat
            m.quad(ids[i][j], ids[i][k], ids[i + 1][k], ids[i + 1][j], mt)


def ellip_surface(c, radii, d) -> tuple[np.ndarray, np.ndarray]:
    """Point and outward normal where direction d from c meets the axis-aligned ellipsoid."""
    c = np.asarray(c, float)
    d = np.asarray(d, float)
    d = d / np.linalg.norm(d)
    rx, ry, rz = radii
    t = 1.0 / math.sqrt((d[0] / rx) ** 2 + (d[1] / ry) ** 2 + (d[2] / rz) ** 2)
    p = c + d * t
    nrm = np.array([(p[0] - c[0]) / rx ** 2, (p[1] - c[1]) / ry ** 2, (p[2] - c[2]) / rz ** 2])
    return p, nrm / np.linalg.norm(nrm)


def lathe(m: ra.Mesh, c, prof, mat, seg: int = 24, wob: float = 0.0, seed: float = 0.0, cap: bool = True,
          th=(0.0, 2 * math.pi), part: bool = True) -> None:
    """A body of revolution about the vertical through c from (r, z) pairs, lumpy if wob > 0."""
    if mat == "bl_bulb":
        zs = [z for _, z in prof]
        BULBS.append((np.array([c[0], c[1], (min(zs) + max(zs)) / 2]), float(max(max(r for r, _ in prof), (max(zs) - min(zs)) / 2))))
    if part:
        m.new_part()
    cx, cy = c[0], c[1]
    full = abs((th[1] - th[0]) - 2 * math.pi) < 1e-6
    ns = seg if full else seg + 1
    ids = []
    for i, (r, z) in enumerate(prof):
        row = []
        for j in range(ns):
            t_ = th[0] + (th[1] - th[0]) * j / seg
            f = 1.0 + wob * _wobble(t_, z * 0.15, seed)
            row.append(m.v((cx + r * f * math.cos(t_), cy + r * f * math.sin(t_), z)))
        ids.append(row)
    for i in range(len(prof) - 1):
        mt = mat(i) if callable(mat) else mat
        for j in range(seg):
            k = (j + 1) % ns if full else j + 1
            m.quad(ids[i][j], ids[i][k], ids[i + 1][k], ids[i + 1][j], mt)
    if cap and full and prof[-1][0] > 0.05:
        ctr = m.v((cx, cy, prof[-1][1]))
        mt = mat(len(prof) - 2) if callable(mat) else mat
        for j in range(seg):
            m.tri(ctr, ids[-1][j], ids[-1][(j + 1) % ns], mt)


def creep_pad(m: ra.Mesh, W: float, H: float, seed: float = 3.0, h: float = 1.0, inset: float = 0.7) -> None:
    """The grown pad over the footprint: a rounded, wavy-edged mat of creep, never a straight edge."""
    m.new_part()
    cx, cy = W / 2, H / 2
    ax, ay = W / 2 - inset, H / 2 - inset
    N = 96
    outer, top = [], []
    for k in range(N):
        t = 2 * math.pi * k / N
        ct, st = math.cos(t), math.sin(t)
        e = 2.0 / 4.5
        x = math.copysign(abs(ct) ** e, ct) * ax
        y = math.copysign(abs(st) ** e, st) * ay
        wv = 1.0 - 0.035 * (0.5 + 0.5 * math.sin(7 * t + seed)) - 0.02 * (0.5 + 0.5 * math.sin(13 * t + 2 * seed))
        outer.append((cx + x * wv, cy + y * wv))
    lo = [m.v((x, y, 0.0)) for x, y in outer]
    mid = [m.v((cx + (x - cx) * 0.995, cy + (y - cy) * 0.995, h * 0.65)) for x, y in outer]
    hi = [m.v((cx + (x - cx) * 0.975, cy + (y - cy) * 0.975, h)) for x, y in outer]
    for k in range(N):
        j = (k + 1) % N
        m.quad(lo[k], lo[j], mid[j], mid[k], "bl_flesh_d")
        m.quad(mid[k], mid[j], hi[j], hi[k], "bl_flesh_d")
    m.new_part()
    hi2 = [m.v((cx + (x - cx) * 0.975, cy + (y - cy) * 0.975, h)) for x, y in outer]
    ctr = m.v((cx, cy, h))
    for k in range(N):
        m.tri(ctr, hi2[k], hi2[(k + 1) % N], "bl_creep")


def root(m: ra.Mesh, a, b, r0: float, r1: float, mat: str = "bl_flesh_d", seed: float = 0.0, lift: float = 1.6,
         wig: float = 3.0, n: int = 7) -> None:
    """A root or vein snaking over the ground from a to b, humped where it rises."""
    a = np.asarray(a, float)
    b = np.asarray(b, float)
    d = b - a
    side = np.array([-d[1], d[0], 0.0])
    side /= max(np.linalg.norm(side), 1e-9)
    pts = []
    for k in range(5):
        t = k / 4
        p = a + d * t + side * wig * math.sin(t * math.pi * 1.6 + seed)
        p[2] = a[2] + (b[2] - a[2]) * t + lift * math.sin(t * math.pi) * (0.6 + 0.4 * math.cos(seed + 3 * t))
        pts.append(p)
    tube(m, pts, [r0, (r0 + r1) / 2, r1], mat, n=n, sub=3)


def spike(m: ra.Mesh, base, tip, r: float, mat: str = "bl_bone", bend=(0.0, 0.0, 0.0), n: int = 6) -> None:
    """A curved horn/tooth from base to tip."""
    base = np.asarray(base, float)
    tip = np.asarray(tip, float)
    mid = (base + tip) / 2 + np.asarray(bend, float)
    tube(m, [base, mid, tip], [r, r * 0.6, 0.08], mat, n=n, sub=3, caps=True)


def plate(m: ra.Mesh, p, nrm, ru: float, rv: float, thick: float = 1.2, spin: float = 0.0, seed: float = 1.0) -> None:
    """A chassis-gray team plate: a thin lumpy carapace shield seated on a surface at p with normal nrm."""
    nrm = np.asarray(nrm, float)
    nrm = nrm / np.linalg.norm(nrm)
    R = frame(nrm)
    if spin:
        cs, sn = math.cos(spin), math.sin(spin)
        R = R @ np.array([[cs, -sn, 0], [sn, cs, 0], [0, 0, 1.0]])
    p = np.asarray(p, float)
    # Three overlapping scutes along the plate's long axis, the middle one proudest, and a low ridge.
    u = R[:, 0]
    for k, (f, s_) in enumerate(((-0.62, 0.62), (0.62, 0.62), (0.0, 1.0))):
        c = p + u * ru * f * 0.75 + nrm * (0.3 * s_)
        ellip(m, c, (ru * 0.62 * (0.8 + 0.2 * s_), rv * (0.8 + 0.2 * s_), thick * (0.7 + 0.3 * s_)), "bl_plate", rings=6, seg=16,
              wob=0.06, seed=seed + k, R=R)
    tube(m, [p - u * ru * 0.8 + nrm * thick * 0.7, p + nrm * thick * 1.25, p + u * ru * 0.8 + nrm * thick * 0.7], [0.5, 0.8, 0.5],
         "bl_plate_d", n=6, sub=3)


# ---------------------------------------------------------------- render


def screen(cv: ra.Canvas, x: float, y: float, z: float) -> list[float]:
    return rbb.screen(cv, x, y, z)


def glowing_mask(c: np.ndarray) -> np.ndarray:
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    return (r > 0.75) & (r > b * 1.9) & (g > 0.3)


def render_building(out_dir: Path, bid: str, W: float, H: float, zoom: float, build, spots, bg=(74, 107, 50)) -> dict:
    """render_borg_base.render_building with the amber glow test; also a preview on grass (or water)."""
    ra.ZOOM = zoom
    props = build(False)
    full = build(True)
    cv = rbb.make_canvas(full, W, H)
    print(bid, "canvas", cv.w // SS, "x", cv.h // SS, "tris", len(full.tris))

    sh = ra.shadow_mask(props, cv)
    ao = ra.contact_ao(props, cv)
    fr = ra.rasterize(full, cv)
    ra.ink(fr, SS)
    ra.silhouette(fr, SS)
    ys, xs = np.mgrid[0: cv.h, 0: cv.w].astype(np.float64) + 0.5
    gx, gy = cv.to_world_ground(xs, ys)
    near = (gx > -3) & (gx < W + 3) & (gy > -3) & (gy < H + 3)
    shadow = np.clip(sh * 0.42 + ao * 0.12, 0, 0.6) * near
    solid = fr.alpha > 0.5
    up = solid & (fr.normal[..., 2] > 0.7) & ~glowing_mask(fr.color)
    # World height of each pixel from its screen position and depth (depth = X + Y + Z): the pad and
    # anything lying on it take the full cast shadow; raised tops take a third of it, so flat flesh
    # (lily-pads, lips, mounds) does not go black under its own footprint.
    k = ra.ZOOM * SS
    b = (ys - cv.oy) / k
    d0 = np.where(np.isfinite(fr.depth), fr.depth, 0.0)
    pz = np.where(solid, d0 - (d0 + b) / 1.5, 0.0)
    weight = np.where(pz <= 1.4, 1.0, 0.35)
    color = fr.color.copy()
    color[up] *= (1 - shadow[up] * weight[up])[:, None]
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
    print("wrote", out_dir / f"{bid}.png", {k: info[k] for k in ("padWidth", "padSouthX", "padSouthY", "stackX", "stackY", "size")})
    cameo(img, out_dir / f"{bid}-cameo.png")
    PREVIEW.mkdir(exist_ok=True)
    pv = Image.new("RGBA", img.size, bg + (255,))
    pv.alpha_composite(img)
    pv.save(PREVIEW / f"bloom-{bid}.png")
    return info


def cameo(img: Image.Image, path: Path) -> None:
    cam = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    bb = img.getbbox()
    if bb:
        crop = img.crop(bb)
        f = min(92 / crop.width, 92 / crop.height)
        crop = crop.resize((max(1, round(crop.width * f)), max(1, round(crop.height * f))), Image.Resampling.LANCZOS)
        cam.alpha_composite(crop, ((96 - crop.width) // 2, (96 - crop.height) // 2))
    cam.save(path)
