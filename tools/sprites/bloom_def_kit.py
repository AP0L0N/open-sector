#!/usr/bin/env python3
"""The Bloom's defence kit: palette-locked materials and organic mesh helpers.

Chained over the WW2 kit (render_ww2_guns -> render_ww2_fort -> render_bunker -> render_airfield),
like render_xeno_base.py chains the Xenomorph materials. Used by render_bloom_defences.py.

Palette lock (gridlock/docs/factions/bloom.md):
  flesh     #5e2f45 dark  #8a4a63 mid  #b7778a light
  chitin    #3a2a2e dark  #8c7a63 mid  #cdbb98 light
  membrane  #24161f
  glow      #e0701a deep  #ffb13b amber  #ffe08a hot
  team      #6e6e68 / #4a4a46  (gray carapace plate the client tints)
  outline   #1a1410  (ra.OUTLINE already)

Textures are read in the gun's own frame (render_ww2_fort.GUN_FRAME), so the mottling stays put on a
head as it turns.
"""

from __future__ import annotations

import math

import numpy as np

import render_ww2_guns as wg  # noqa: E402  (sets up the WW2 kit, ra.ZOOM = 3)

wf = wg.wf
ra = wg.ra
LM = wf.LM
ra.ZOOM = 3.0

FLESH_D, FLESH_M, FLESH_L = "#5e2f45", "#8a4a63", "#b7778a"
BONE_D, BONE_M, BONE_L = "#3a2a2e", "#8c7a63", "#cdbb98"
MEMB = "#24161f"
GLOW_D, GLOW, GLOW_H = "#e0701a", "#ffb13b", "#ffe08a"
TEAM, TEAM_D = "#6e6e68", "#4a4a46"

# The big eye's frame (centre, axis, iris radius), set by the builder that has one.
EYE: dict[str, np.ndarray | float] = {}

_prev_tex = ra.tex


def rgb(h: str) -> np.ndarray:
    return ra.rgb(h)


def _flat(n: np.ndarray) -> float:
    lam = max(0.0, float(np.dot(n, ra.LIGHT)))
    return 0.5 + 0.62 * lam


def tex(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    lx, ly = wf._gun_local(X, Y)
    nf = ra.vnoise(lx / 1.1 + Z * 0.7, ly / 1.1 - Z * 0.5, 7)
    nm = ra.fbm(lx / 4.5 + Z * 0.21, ly / 4.5 + Z * 0.33, 19, 3)

    def base(h):
        return np.broadcast_to(rgb(h), (len(X), 3)).copy()

    if mat in ("flesh", "flesh_lt", "flesh_dk"):
        lo, hi = {"flesh": (FLESH_D, FLESH_M), "flesh_lt": (FLESH_M, FLESH_L), "flesh_dk": (MEMB, FLESH_D)}[mat]
        c = ra.mix(base(lo), base(hi), ra.smooth(0.3, 0.72, nm))
        # Wet sheen blotches and dark veins.
        sheen = ra.smooth(0.72, 0.86, ra.fbm(lx / 2.2 - Z * 0.4, ly / 2.2 + Z * 0.2, 29, 2))
        c = ra.mix(c, base(FLESH_L), sheen * (0.55 if mat != "flesh_dk" else 0.25))
        w = np.abs(np.sin(ra.fbm(lx / 3.0 + Z * 0.5, ly / 3.0 - Z * 0.3, 31, 3) * 19.0))
        c[w < 0.07] = c[w < 0.07] * 0.55 + rgb(MEMB) * 0.45
        return c * (0.94 + 0.1 * nf[:, None])
    if mat == "bone":
        c = ra.mix(base(BONE_M), base(BONE_L), ra.smooth(0.25, 0.8, nm))
        if abs(n[2]) < 0.8:
            c[np.mod(Z + nm * 0.8, 2.3) < 0.28] *= 0.72  # growth rings
        return c * (0.93 + 0.1 * nf[:, None])
    if mat == "elytra":
        # Wing-case chitin: ivory, darker toward the rim, lengthwise striae and pitting.
        c = ra.mix(base(BONE_L), base(BONE_M), 0.35 + ra.smooth(0.3, 0.85, nm) * 0.55)
        c = ra.mix(c, base(BONE_D), ra.smooth(9.0, 1.0, Z) * 0.55)
        c[np.mod(np.abs(ly) + nm * 0.6, 2.8) < 0.32] *= 0.7
        c[ra.vnoise(lx * 1.3, ly * 1.3, 67) > 0.86] *= 0.75
        return c * (0.94 + 0.08 * nf[:, None])
    if mat == "bone_lt":
        return ra.mix(base(BONE_L), base("#e4d6b6"), nf * 0.5) * 1.0
    if mat == "bone_dk":
        return ra.mix(base(BONE_D), base(BONE_M), ra.smooth(0.55, 0.95, nm) * 0.45) * (0.92 + 0.12 * nf[:, None])
    if mat == "membrane":
        return base(MEMB) * (0.9 + 0.22 * nf[:, None])
    if mat == "team":
        c = base(TEAM) * (0.95 + 0.08 * nf[:, None])
        c[np.mod(Z * 1.3 + lx * 0.4 + ly * 0.4, 3.0) < 0.32] = rgb(TEAM_D)
        return c
    if mat == "creep":
        # The living mat a Bloom structure grows from: membrane and dark flesh, faint amber veins.
        gx, gy = X, Y
        c = ra.mix(base(MEMB), base(FLESH_D), ra.smooth(0.3, 0.8, ra.fbm(gx / 5.0, gy / 5.0, 43, 3)) * 0.85)
        v = np.abs(np.sin(ra.fbm(gx / 6.0, gy / 6.0, 47, 3) * 16.0))
        c = ra.mix(c, base(GLOW_D) * 0.75, ra.smooth(0.09, 0.0, v) * 0.6)
        return c * (0.92 + 0.12 * nf[:, None])
    # ---- emissive: divide out the key light so the glow reads on the shaded side too.
    s = _flat(n)
    if mat == "glow":
        return ra.mix(base(GLOW), base(GLOW_D), ra.smooth(0.4, 0.9, nf) * 0.6) / s
    if mat == "glow_dk":
        return ra.mix(base(GLOW_D), base("#7a3410"), nf * 0.5) / s
    if mat == "hot":
        return base(GLOW_H) / s
    if mat == "acid":
        c = ra.mix(base(GLOW), base(GLOW_H), ra.smooth(0.55, 0.85, ra.fbm(lx / 1.2, ly / 1.2 + Z, 53, 2)))
        c[np.abs(np.sin(nm * 23.0)) < 0.09] = rgb(GLOW_D)
        return c / s
    if mat == "slit":
        # A firing slit: dark membrane, lit from deep inside.
        c = base(MEMB) * 0.8
        t = ra.smooth(0.55, 0.95, nf)
        return ra.mix(c, base(GLOW_D) * 0.9, 0.3 + t * 0.5) / s
    if mat == "iris":
        c0 = EYE["c"]
        ax = EYE["a"]
        u = np.cross(ax, np.array([0.0, 0.0, 1.0]))
        u /= np.linalg.norm(u)
        w = np.cross(ax, u)
        d = P - c0
        front = d @ ax
        pu, pw = d @ u, d @ w
        rad = np.hypot(pu, pw) / EYE["r"]
        ang = np.arctan2(pw, pu)
        # Amber iris with radial striae, a dark ring, a vertical slit pupil; ivory-pink sclera round it.
        stri = 0.5 + 0.5 * np.sin(ang * 22.0 + rad * 4.0)
        iris = ra.mix(base(GLOW_H), base(GLOW), np.clip(rad * 1.2, 0, 1))
        iris = ra.mix(iris, base(GLOW_D), stri * 0.35 * rad[:, None].clip(0, 1)[:, 0])
        scl = ra.mix(base(BONE_L), base(FLESH_L), ra.smooth(0.3, 0.8, nm) * 0.6)
        veins = np.abs(np.sin(ra.fbm(pu / 1.5, pw / 1.5, 61, 3) * 14.0)) < 0.08
        scl[veins] = rgb(FLESH_M)
        c = np.where(((rad < 1.0) & (front > 0))[:, None], iris, scl * s)  # sclera is lit, the iris glows
        c[(rad > 0.92) & (rad < 1.06) & (front > 0)] = rgb(GLOW_D)
        pupil = (np.abs(pu) < 0.16 * EYE["r"] * (1.0 - 0.6 * np.abs(pw) / EYE["r"])) & (np.abs(pw) < 0.78 * EYE["r"]) & (front > 0)
        c[pupil] = rgb("#1a1410") * 1.4
        return c / s
    return _prev_tex(mat, P, n)


ra.tex = tex


# ---------------------------------------------------------------- shapes


def lball(L: LM, c, r: float, mat: str, rings: int = 6, n: int = 14, squash: float = 1.0, part: bool = True) -> None:
    """A sphere in a local frame (z squashed), one part."""
    if part:
        L.m.new_part()
    cx, cy, cz = c
    for i in range(rings):
        a0 = -math.pi / 2 + math.pi * i / rings
        a1 = -math.pi / 2 + math.pi * (i + 1) / rings
        z0, z1 = cz + r * squash * math.sin(a0), cz + r * squash * math.sin(a1)
        r0, r1 = max(r * math.cos(a0), 0.05), max(r * math.cos(a1), 0.05)
        L.cyl((cx, cy, z0), (cx, cy, z1), r0, r1, mat, n=n, caps=False, part=False)


def ltorus(L: LM, c, axis: str, R: float, r: float, mat: str, segs: int = 14, part: bool = True) -> None:
    """A ring of radius R round the local x or z axis through c."""
    if part:
        L.m.new_part()
    cx, cy, cz = c
    pts = []
    for k in range(segs):
        a = 2 * math.pi * k / segs
        if axis == "x":
            pts.append((cx, cy + R * math.cos(a), cz + R * math.sin(a)))
        else:
            pts.append((cx + R * math.cos(a), cy + R * math.sin(a), cz))
    for k in range(segs):
        L.cyl(pts[k], pts[(k + 1) % segs], r, r, mat, n=6, part=False)


def tube(L: LM, pts, radii, mat: str, n: int = 10, part: bool = True, joints: bool = True) -> None:
    """A smooth tapered tube along a polyline (balls at the joints hide the seams)."""
    if part:
        L.m.new_part()
    for i in range(len(pts) - 1):
        L.cyl(pts[i], pts[i + 1], radii[i], radii[i + 1], mat, n=n, caps=False, part=False)
        if joints and 0 < i:
            lball(L, pts[i], radii[i] * 1.0, mat, rings=4, n=n, part=False)
    lball(L, pts[-1], max(radii[-1], 0.08), mat, rings=4, n=n, part=False)


def ell_patch(L: LM, c, abc, th0: float, th1: float, ph0: float, ph1: float, mat: str, nt: int = 16, npf: int = 6, s: float = 1.0, part: bool = True) -> None:
    """A patch of an ellipsoid (semi-axes a, b, h scaled by s), azimuth th0..th1, elevation ph0..ph1."""
    if part:
        L.m.new_part()
    a, b, h = abc
    cx, cy, cz = c
    grid = []
    for j in range(npf + 1):
        ph = ph0 + (ph1 - ph0) * j / npf
        row = []
        for i in range(nt + 1):
            th = th0 + (th1 - th0) * i / nt
            p = (cx + s * a * math.cos(ph) * math.cos(th), cy + s * b * math.cos(ph) * math.sin(th), cz + s * h * math.sin(ph))
            row.append(L.m.v(L.w(p)))
        grid.append(row)
    for j in range(npf):
        for i in range(nt):
            L.m.quad(grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i], mat)


def creep_pad(L: LM, r: float, seed: int, z1: float = 0.7, n: int = 22) -> None:
    """A low irregular disc of creep the structure grows out of, bevelled at the rim."""
    rng = np.random.default_rng(seed)
    jit = 1.0 + 0.09 * np.sin(np.arange(n) * 2.0 + seed) + rng.uniform(-0.05, 0.05, n)
    lo = [(r * j * math.cos(2 * math.pi * k / n), r * j * math.sin(2 * math.pi * k / n)) for k, j in enumerate(jit)]
    hi = [(x * 0.86, y * 0.86) for x, y in lo]
    L.ring(lo, hi, 0.0, z1, "creep")


def knot_root(L: LM, a: float, r0: float, z0: float, r2: float, rad: float, seed: int, mat: str = "flesh_dk") -> None:
    """A thick knotted root arching out from the trunk at (r0, z0) and diving into the pad at r2."""
    rng = np.random.default_rng(seed)
    c, s = math.cos(a), math.sin(a)
    px, py = -s, c
    pts, radii = [], []
    steps = 5
    for i in range(steps + 1):
        t = i / steps
        rr = r0 + (r2 - r0) * t
        z = z0 * (1 - t) ** 1.4 + 1.6 * math.sin(math.pi * t) * (1 - t) + 0.3
        wob = rng.uniform(-0.6, 0.6) * math.sin(math.pi * t)
        pts.append((rr * c + wob * px, rr * s + wob * py, z))
        radii.append(rad * (1.0 - 0.7 * t) + 0.15)
    tube(L, pts, radii, mat, n=8)
    # Knots: swellings along the root.
    for i in (1, 3):
        lball(L, pts[i], radii[i] * 1.35, mat, rings=4, n=8, part=False)


def amber_beads(L: LM, pts, r: float) -> None:
    """Small glowing nodules (one part)."""
    L.m.new_part()
    for p in pts:
        lball(L, p, r, "glow", rings=3, n=8, part=False)
