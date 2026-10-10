#!/usr/bin/env python3
"""
Shared parts for The Bloom's procedural sprites (render_bloom_*.py).

Registers the Bloom palette lock (gridlock/docs/factions/bloom.md) on the
Cyborg rasterizer (render_cyborg.py) in this process only, and carries the
organic primitives every Bloom creature is built from: tapering curves, hooked
claws, eye clusters, glowing sacs, the gray team-tint carapace plate, and the
amber spit flash. Same camera, cell, outline, and contact pins as the Cyborg.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
import render_cyborg as R  # noqa: E402
from derive_swim import WL_Y, bob_of  # noqa: E402

CELL = R.CELL
Cloud = R.Cloud
ellipsoid, capsule, cylinder, box = R.ellipsoid, R.capsule, R.cylinder, R.box
rot_x, rot_y, rot_z = R.rot_x, R.rot_y, R.rot_z

# ---------------------------------------------------------------- palette lock


def _hex(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


BLOOM_MATS = {
    # Wet flesh: dark / mid / light.
    "b_flesh": (_hex("5e2f45"), _hex("8a4a63"), _hex("b7778a")),
    # Bone-ivory chitin: dark / mid / light.
    "b_bone": (_hex("3a2a2e"), _hex("8c7a63"), _hex("cdbb98")),
    # Dark membrane / underbelly (one colour, lifted a touch on the lit side).
    "b_membrane": (_hex("24161f"), _hex("24161f"), (52, 33, 45)),
    # Team-tint carapace plate: the chassis gray pair.
    "b_plate": (_hex("4a4a46"), _hex("6e6e68"), (138, 138, 130)),
    # Translucent pale flesh (Mender): the flesh ramp shifted up a step.
    "b_pale": (_hex("8a4a63"), _hex("b7778a"), (220, 178, 186)),
    # Glowing sac: the glow ramp as shading (deep / amber / hot).
    "b_sac": (_hex("e0701a"), _hex("ffb13b"), _hex("ffe08a")),
    # Emissive glow (eyes, seams, threads).
    "b_amber": _hex("ffb13b"),
    "b_hot": _hex("ffe08a"),
    "b_deep": _hex("e0701a"),
    # Dead glow (corpses): a dark, cold sac.
    "b_dead": ((40, 26, 30), (60, 40, 42), (82, 58, 54)),
}
for _name, _spec in BLOOM_MATS.items():
    R.MATERIALS[_name] = _spec
    if _name not in R.MAT_IDS:
        R.MAT_IDS[_name] = len(R.MAT_IDS)
for _name in ("b_amber", "b_hot", "b_deep"):
    R.EMISSIVE.add(_name)
# The un-outlined FX pair: an amber spit flash with a hot core.
R.MATERIALS["flash"] = _hex("ffb13b")
R.MATERIALS["flash_core"] = _hex("ffe08a")

GLOW = {"b_sac", "b_amber", "b_hot", "b_deep"}


def g(name: str, lit: bool) -> str:
    """A glow material, or the dark corpse tone when the creature is dead."""
    return name if lit or name not in GLOW else "b_dead"


# ---------------------------------------------------------------- helpers


def along(fwd) -> np.ndarray:
    """Rotation taking +x onto `fwd`."""
    fwd = np.asarray(fwd, float)
    fwd = fwd / np.linalg.norm(fwd)
    yaw = math.atan2(fwd[1], fwd[0])
    pitch = -math.asin(max(-1.0, min(1.0, fwd[2])))
    return rot_z(yaw) @ rot_y(pitch)


def bez(a, ctrl, b, n: int = 8) -> list[np.ndarray]:
    a, ctrl, b = (np.asarray(v, float) for v in (a, ctrl, b))
    return [(1 - t) ** 2 * a + 2 * (1 - t) * t * ctrl + t**2 * b for t in np.linspace(0, 1, n + 1)]


def bez3(a, c1, c2, b, n: int = 10) -> list[np.ndarray]:
    a, c1, c2, b = (np.asarray(v, float) for v in (a, c1, c2, b))
    return [(1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t**2 * c2 + t**3 * b for t in np.linspace(0, 1, n + 1)]


def chain(c: Cloud, pts, r0: float, r1: float, mat: str) -> None:
    """Capsules through `pts`, the radius tapering from r0 to r1."""
    n = len(pts) - 1
    for i, (p0, p1) in enumerate(zip(pts[:-1], pts[1:])):
        ra = r0 + (r1 - r0) * i / n
        rb = r0 + (r1 - r0) * (i + 1) / n
        capsule(c, p0, p1, ra, rb, mat)


def ik(hip, foot, l1: float, l2: float, bend=(1.0, 0.0, 0.0)) -> np.ndarray:
    """Knee of a two-bone limb, bending toward `bend`."""
    hip = np.asarray(hip, float)
    foot = np.asarray(foot, float)
    d = foot - hip
    dist = min(float(np.linalg.norm(d)), l1 + l2 - 1e-3)
    dirv = d / max(1e-6, np.linalg.norm(d))
    a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, l1 * l1 - a * a))
    bend = np.asarray(bend, float)
    perp = bend - dirv * float(bend @ dirv)
    perp = perp / max(1e-6, np.linalg.norm(perp))
    return hip + dirv * a + perp * h


def hook(c: Cloud, base, fwd, curl, length: float, r: float, mat: str = "b_bone", n: int = 7, bend: float = 1.6) -> np.ndarray:
    """A curved hooked claw from `base` along `fwd`, curling toward `curl`. Returns the tip."""
    base = np.asarray(base, float)
    f = np.asarray(fwd, float)
    f = f / np.linalg.norm(f)
    u = np.asarray(curl, float)
    u = u - f * float(u @ f)
    u = u / max(1e-6, np.linalg.norm(u))
    seg = length / n
    pts = [base]
    for i in range(n):
        a = bend * (i + 0.5) / n
        d = f * math.cos(a) + u * math.sin(a)
        pts.append(pts[-1] + d * seg)
    chain(c, pts, r, r * 0.22, mat)
    return pts[-1]


def eyes(c: Cloud, at, Rm, offsets, r: float, lit: bool, hot_every: int = 3) -> None:
    """A cluster of small glowing eyes at `at + Rm @ offset`."""
    at = np.asarray(at, float)
    for k, o in enumerate(offsets):
        mat = "b_hot" if k % hot_every == 0 else "b_amber"
        ellipsoid(c, at + Rm @ np.asarray(o, float), (r, r, r), g(mat, lit))


def plate(c: Cloud, at, out, radii, roll: float = 0.0, ridge: bool = True) -> None:
    """The team-tint carapace plate: a domed gray shell facing `out`, a bone rim
    under it and a ridge down its middle. `radii` = (thickness, width, length)."""
    at = np.asarray(at, float)
    out = np.asarray(out, float)
    out = out / np.linalg.norm(out)
    Rm = along(-out) @ rot_x(roll)  # local -x is the outward normal
    radii = np.asarray(radii, float)
    ellipsoid(c, at - out * 0.3, radii * np.array([1.0, 1.08, 1.08]), "b_bone", rot=Rm, keep=lambda p, a=at, o=out: (p - a) @ o <= 0.2)
    ellipsoid(c, at, radii, "b_plate", rot=Rm, keep=lambda p, a=at, o=out: (p - a) @ o >= -0.4 * radii[0])
    if ridge:
        top = Rm @ np.array([-radii[0] * 0.95, 0, 0])
        capsule(c, at + top + Rm @ np.array([0, 0, -radii[2] * 0.7]), at + top + Rm @ np.array([0, 0, radii[2] * 0.7]), 0.55, mat="b_plate")


def sac(c: Cloud, at, radii, lit: bool, Rm=None, veins: int = 3) -> None:
    """A glowing translucent sac with dark veins over it."""
    at = np.asarray(at, float)
    radii = np.asarray(radii, float)
    ellipsoid(c, at, radii, g("b_sac", lit), rot=Rm)
    Rm = np.eye(3) if Rm is None else Rm
    for k in range(veins):
        a = k * 2 * math.pi / max(1, veins) + 0.4
        p0 = at + Rm @ (radii * np.array([math.cos(a) * 0.55, math.sin(a) * 0.55, 0.84]))
        p1 = at + Rm @ (radii * np.array([math.cos(a + 0.5) * 0.98, math.sin(a + 0.5) * 0.98, 0.05]))
        capsule(c, p0, p1, 0.35, mat="b_membrane")


def glob(c: Cloud, at, r: float) -> None:
    """A spat glob of acid in flight: amber with a hot core, a short drip trail."""
    at = np.asarray(at, float)
    ellipsoid(c, at, (r, r, r), "b_sac")
    ellipsoid(c, at + np.array([0.3 * r, 0, 0.3 * r]), (0.5 * r, 0.5 * r, 0.5 * r), "b_hot")


def flash_star(c: Cloud, at, fwd, s: float, spin: float = 0.0) -> None:
    """Amber burst along `fwd` (un-outlined FX), scaled by `s`."""
    at = np.asarray(at, float)
    Rm = along(fwd)
    f = Rm @ np.array([1.0, 0, 0])
    ellipsoid(c, at + f * 3.0 * s, (3.8 * s, 1.3 * s, 1.3 * s), "flash", rot=Rm)
    for k in range(5):
        rk = Rm @ rot_x(k * 2 * math.pi / 5 + spin)
        d = rk @ np.array([0.0, 1.0, 0.0])
        ellipsoid(c, at + f * 1.0 * s + d * 1.8 * s, (0.9 * s, 2.0 * s, 0.8 * s), "flash", rot=rk)
    ellipsoid(c, at + f * 1.2 * s, (1.8 * s, 1.6 * s, 1.6 * s), "flash_core", rot=Rm)


def sink(c: Cloud, water_z: float, scale: float, frame: int) -> Cloud:
    """Sink a stand cloud to the swim plane (z = 0 is the water); drop what is under."""
    dz = -water_z + bob_of(frame) / (scale * R.COS_P)
    out = Cloud()
    for p, n, m, k in zip(c.pts, c.nrm, c.mat, c.part):
        p = p + np.array([0.0, 0.0, dz])
        keep = p[:, 2] >= 0.0
        if keep.any():
            out.pts.append(p[keep])
            out.nrm.append(n[keep])
            out.mat.append(m[keep])
            out.part.append(k[keep])
    return out


__all__ = [
    "R",
    "CELL",
    "WL_Y",
    "Cloud",
    "ellipsoid",
    "capsule",
    "cylinder",
    "box",
    "rot_x",
    "rot_y",
    "rot_z",
    "g",
    "along",
    "bez",
    "bez3",
    "chain",
    "ik",
    "hook",
    "eyes",
    "plate",
    "sac",
    "glob",
    "flash_star",
    "sink",
]
