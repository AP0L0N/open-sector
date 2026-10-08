#!/usr/bin/env python3
"""Mammoth: slow armored battle platform that carries infantry. A 16-face walk sheet and a wade sheet.

Same numpy rasterizer, camera, and outline as render_procedural.py (Stuka,
drone) and render_nebelwerfer.py, but its own late-war three-tone camouflage
(dark yellow, olive, red-brown). No turret: the only gun is a twin machine gun
in a ball mount under the cab.

  hull      a four-legged walker after the heavy-walker silhouette: boxy body
            slung between splayed legs on broad foot pads, a cab jutting out over
            the bow with a driver's visor and spare track links, long side pods
            with smoke-tube clusters in the nose and firing slits down the flanks,
            periscope heads with rod antennas, a cupola, and a gray team-tint plate.
  wade      the same walker sunk to the underside of the pods. Legs and belly are
            below the pool. Same camera as the dry faces so the client can share
            one scale and contact.

Row 0 = nose screen-south, then clockwise 22.5° through row 15. No national insignia.

Writes the engine sheets directly (one fit shared by walk and wade, like the
Titan's): mammoth-walk.png (8 walk frames x 16 faces), mammoth-wade.png
(1 x 16), and mammoth-cameo.png.

  python tools/sprites/render_mammoth.py
"""

from __future__ import annotations

import argparse
import math
import os
import tempfile
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image

import render_procedural
from render_procedural import Mesh, ellipse_ring, hex_rgb, render_turntable

# Meters. +x nose, +y left, +z up. Feet on z = 0.
SCALE_FRAC = 0.074  # px per meter / cell px
Z_MID = 2.6
CY_FRAC = 0.6

BELLY_Z = 2.8  # underside of the body
DECK_Z = 4.2  # body roof
HIP_X = 1.95  # leg hips, fore and aft of the middle
HIP_Y = 1.6
HIP_Z = 3.15
POD_Z = 3.3  # underside of the side pods
POD_Y0, POD_Y1 = 1.3, 2.45  # inner / outer face of the side pods

# Late-war three-tone: dark-yellow base under olive and red-brown splinters.
# Only this script's "camo" faces; the shared olive splinter is unchanged.
DUNKELGELB = hex_rgb("#a8915a")
OLIV = hex_rgb("#4f5a36")
ROTBRAUN = hex_rgb("#6e4630")


def ambush_color(p: np.ndarray) -> np.ndarray:
    a = math.floor(p[0] * 0.6 + p[1] * 0.9 + p[2] * 0.35 + 0.3)
    b = math.floor(p[0] * -0.75 + p[1] * 0.5 + p[2] * 0.6 + 0.7)
    if (a + b) % 2 == 0:
        return DUNKELGELB
    return OLIV if a % 2 == 0 else ROTBRAUN


render_procedural.camo_color = ambush_color


def slab(m: Mesh, bottom: list[tuple[float, float]], z0: float, z1: float, top: list[tuple[float, float]], mat: str, top_mat: str | None = None) -> None:
    """Prism from an x/y outline at z0 to a (smaller) outline at z1: sloped armor. Outlines are convex."""
    bot = [m.v((x, y, z0)) for x, y in bottom]
    tp = [m.v((x, y, z1)) for x, y in top]
    n = len(bot)
    for i in range(n):
        j = (i + 1) % n
        m.quad(bot[i], bot[j], tp[j], tp[i], mat)
    for i in range(1, n - 1):
        m.tri(tp[0], tp[i], tp[i + 1], top_mat or mat)
        m.tri(bot[0], bot[i + 1], bot[i], mat)


def cyl(m: Mesh, c: tuple[float, float, float], axis: int, r: float, h: float, mat: str, n: int = 12) -> None:
    """Capped cylinder centred on `c`, running `h` along model axis 0 (x), 1 (y) or 2 (z)."""
    u, w = [i for i in range(3) if i != axis]
    rings = []
    for t in (-h / 2, h / 2):
        ring_ = []
        for k in range(n):
            p = np.array(c, dtype=np.float64)
            p[axis] += t
            p[u] += r * math.cos(2 * math.pi * k / n)
            p[w] += r * math.sin(2 * math.pi * k / n)
            ring_.append(p)
        rings.append(ring_)
    m.loft(rings, mat)


def beam(m: Mesh, p0: tuple[float, float, float], p1: tuple[float, float, float], wy: float, wx: float, mat: str) -> None:
    """Box from p0 to p1. `wy` is the width across the body (model y), `wx` the depth fore and aft."""
    a = np.array(p1, dtype=np.float64) - np.array(p0, dtype=np.float64)
    a /= np.linalg.norm(a)
    side = np.array([0.0, 1.0, 0.0]) - a * a[1]
    side /= np.linalg.norm(side)
    fore = np.cross(side, a)
    corners = [side * sy * wy / 2 + fore * sx * wx / 2 for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    m.loft([[np.array(p0) + c for c in corners], [np.array(p1) + c for c in corners]], mat)


# Walk cycle: a slow trot. Diagonal pairs move together; each foot is planted
# for the first half of its cycle (sliding aft under the body) and swings
# forward, lifted, for the second half.
WALK_FRAMES = 8
STRIDE = 1.3  # fore-aft foot travel, m
LIFT = 0.5  # foot height at mid-swing, m
BOB = 0.07  # body dip at mid-stance, m


def ik_knee(hip: np.ndarray, ankle: np.ndarray, l1: float, l2: float, hint: np.ndarray) -> np.ndarray:
    """Two-bone knee: thigh `l1` from the hip, shin `l2` to the ankle, bent toward `hint`."""
    d_vec = ankle - hip
    d = min(float(np.linalg.norm(d_vec)), l1 + l2 - 1e-3)
    u = d_vec / np.linalg.norm(d_vec)
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(0.0, l1 * l1 - a * a))
    p = hint - float(np.dot(hint, u)) * u
    p /= np.linalg.norm(p)
    return hip + u * a + p * h


def leg(m: Mesh, fx: int, sy: int, phase: float | None = None, bob: float = 0.0) -> None:
    """One leg. `fx` +1 fore, -1 aft; `sy` +1 left, -1 right. Hip housing, splayed thigh, louvred shin, broad pad.

    `phase` (radians) places the foot in the walk cycle; None is the planted rest pose.
    """
    hip0 = np.array([fx * HIP_X, sy * HIP_Y, HIP_Z])
    knee0 = np.array([fx * (HIP_X + 0.6), sy * (HIP_Y + 0.9), 1.85])
    ankle0 = np.array([fx * (HIP_X + 0.3), sy * (HIP_Y + 0.9), 0.5])
    l1 = float(np.linalg.norm(knee0 - hip0))
    l2 = float(np.linalg.norm(ankle0 - knee0))
    axis0 = (ankle0 - hip0) / np.linalg.norm(ankle0 - hip0)
    hint = (knee0 - hip0) - float(np.dot(knee0 - hip0, axis0)) * axis0
    dx, lift = 0.0, 0.0
    if phase is not None:
        dx = STRIDE / 2 * math.cos(phase)
        lift = LIFT * max(0.0, -math.sin(phase))
    hip = hip0 + np.array([0.0, 0.0, bob])
    ankle = ankle0 + np.array([dx, 0.0, lift])
    knee = ik_knee(hip, ankle, l1, l2, hint)
    cyl(m, tuple(hip), 1, 0.48, 0.7, "metal")
    beam(m, tuple(hip), tuple(knee), 0.72, 0.95, "camo")
    # Armored knee cap over the joint, then the shin with cooling louvres down its outer face.
    cyl(m, tuple(knee), 1, 0.4, 0.95, "metal")
    beam(m, (knee[0], knee[1], knee[2] + 0.15), tuple(ankle), 0.78, 0.82, "camo")
    for f in (0.3, 0.45, 0.6):
        c = ankle + (knee - ankle) * f
        face = c[1] + sy * 0.4
        m.box((c[0] - 0.25, min(face, face + sy * 0.03), c[2]), (c[0] + 0.25, max(face, face + sy * 0.03), c[2] + 0.09), "tire")
    # Foot pad with a sloped toe and heel, wider than the shin so the stance reads planted.
    ax, ay, az = ankle[0], ankle[1], lift
    slab(m, [(ax - 0.75, ay - 0.62), (ax + 0.95, ay - 0.62), (ax + 0.95, ay + 0.62), (ax - 0.75, ay + 0.62)], az, az + 0.5,
         [(ax - 0.45, ay - 0.48), (ax + 0.55, ay - 0.48), (ax + 0.55, ay + 0.48), (ax - 0.45, ay + 0.48)], "frame")
    m.box((ax - 0.3, ay - 0.42, az + 0.5), (ax + 0.3, ay + 0.42, az + 0.62), "metal")


def pod(m: Mesh, sy: int) -> None:
    """Side pod over the hips: bevelled armor box, smoke tubes in the nose, firing slits, a periscope head aft."""
    y0, y1 = sy * POD_Y0, sy * POD_Y1
    lo, hi = min(y0, y1), max(y0, y1)
    x0, x1 = -2.7, 2.55
    m.box((x0, lo, POD_Z), (x1, hi, POD_Z + 0.75), "camo")
    # Rounded-off top: the outer edge is bevelled down.
    yb = sy * (POD_Y1 - 0.35)
    slab(m, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], POD_Z + 0.75, POD_Z + 1.1,
         [(x0 + 0.1, y0), (x1 - 0.15, y0), (x1 - 0.15, yb), (x0 + 0.1, yb)], "camo")
    # Nose: a dark recess and a two-by-two block of smoke-discharger tubes.
    m.box((x1, lo + 0.12, POD_Z + 0.1), (x1 + 0.04, hi - 0.12, POD_Z + 0.9), "tire")
    for dy in (-0.25, 0.25):
        for dz in (-0.2, 0.2):
            cyl(m, (x1 + 0.12, sy * (POD_Y0 + POD_Y1) / 2 + dy, POD_Z + 0.5 + dz), 0, 0.14, 0.22, "metal", 10)
    # Garrison firing slits on the outer face, three a side.
    for i in range(3):
        x = -1.7 + i * 1.3
        m.box((x - 0.3, hi - 0.02 if sy > 0 else lo - 0.02, POD_Z + 0.35), (x + 0.3, hi + 0.02 if sy > 0 else lo + 0.02, POD_Z + 0.47), "tire")
    # Drive hub on the outer face, aft.
    cyl(m, (-2.15, sy * (POD_Y1 + 0.04), POD_Z + 0.4), 1, 0.24, 0.1, "metal", 10)
    # Periscope head on a short mast, two lenses forward, and a rod antenna.
    hx, hy = -2.1, sy * (POD_Y0 + POD_Y1) / 2
    m.box((hx - 0.15, hy - 0.15, POD_Z + 1.1), (hx + 0.15, hy + 0.15, POD_Z + 1.55), "metal")
    m.box((hx - 0.42, hy - 0.42, POD_Z + 1.55), (hx + 0.38, hy + 0.42, POD_Z + 2.0), "frame")
    for dy in (-0.18, 0.18):
        m.box((hx + 0.38, hy + dy - 0.1, POD_Z + 1.67), (hx + 0.46, hy + dy + 0.1, POD_Z + 1.85), "glass")
    m.box((hx - 0.3, hy - 0.04, POD_Z + 2.0), (hx - 0.22, hy + 0.04, POD_Z + 2.9), "metal")


def mine_launcher(m: Mesh) -> None:
    """Mine launcher on the rear deck, starboard of the cupola: a turntable, a cradle, and a dark
    six-tube box raised toward the bow with a yellow band behind the dark muzzles."""
    bx, by = -1.55, -0.52
    z0 = DECK_Z + 0.25
    cyl(m, (bx, by, z0 + 0.07), 2, 0.42, 0.14, "metal", 16)
    m.box((bx - 0.28, by - 0.3, z0 + 0.14), (bx + 0.22, by + 0.3, z0 + 0.42), "frame")
    p0 = np.array([bx - 0.45, by, z0 + 0.55])
    p1 = np.array([bx + 0.5, by, z0 + 1.15])
    a = (p1 - p0) / np.linalg.norm(p1 - p0)
    # Cradle struts from the turntable up under the tube box.
    for dy in (-0.24, 0.24):
        beam(m, (bx - 0.1, by + dy, z0 + 0.2), (bx + 0.05, by + dy, z0 + 0.82), 0.08, 0.14, "metal")
    beam(m, tuple(p0), tuple(p1), 0.74, 0.5, "frame")
    beam(m, tuple(p1 - a * 0.24), tuple(p1 - a * 0.1), 0.78, 0.54, "hazard")
    side = np.array([0.0, 1.0, 0.0])
    up = np.cross(a, side)
    for dy in (-0.22, 0.0, 0.22):
        for du in (-0.11, 0.11):
            c = p1 + side * dy + up * du
            beam(m, tuple(c - a * 0.02), tuple(c + a * 0.05), 0.15, 0.15, "tire")


def sink(m: Mesh, dz: float) -> None:
    m.verts = [np.asarray(v, dtype=np.float64) + np.array([0.0, 0.0, dz]) for v in m.verts]


def ellipse(m: Mesh, z: float, cx: float, cy: float, rx: float, ry: float, mat: str, n: int = 40) -> list[int]:
    """Flat disc facing up. Returns the rim vertex ids."""
    center = m.v((cx, cy, z))
    rim = [m.v((cx + rx * math.cos(2 * math.pi * k / n), cy + ry * math.sin(2 * math.pi * k / n), z)) for k in range(n)]
    for k in range(n):
        m.tri(center, rim[k], rim[(k + 1) % n], mat)
    return rim


def ring(m: Mesh, z: float, cx: float, cy: float, rx0: float, ry0: float, rx1: float, ry1: float, mat: str, n: int = 40) -> None:
    inner = [m.v((cx + rx0 * math.cos(2 * math.pi * k / n), cy + ry0 * math.sin(2 * math.pi * k / n), z)) for k in range(n)]
    outer = [m.v((cx + rx1 * math.cos(2 * math.pi * k / n), cy + ry1 * math.sin(2 * math.pi * k / n), z)) for k in range(n)]
    for k in range(n):
        j = (k + 1) % n
        m.quad(inner[k], outer[k], outer[j], inner[j], mat)


# Waist deep. The cut runs just under the side pods: the legs and the belly
# stay in the pool; the pods, the cab, and the deck are what look out.
WADE_Z = POD_Z + 0.1


def build_pool() -> Mesh:
    """Pool on the contact plane, a little wider than the stance, with one foam lip."""
    m = Mesh()
    cx, cy = 0.15, 0.0
    rx, ry = 4.3, 3.1
    ellipse(m, 0.03, cx, cy, rx, ry, "water")
    ring(m, 0.08, cx, cy, rx * 0.78, ry * 0.78, rx * 0.92, ry * 0.92, "foam")
    return m


def build_hull(frame: int | None = None) -> Mesh:
    """Whole walker. `frame` 0..WALK_FRAMES-1 is a walk-cycle pose; None is the planted rest pose."""
    m = Mesh()
    # Body slung between the hips: sloped side plates, a belly plate underneath.
    slab(m, [(-2.55, -1.45), (2.3, -1.45), (2.3, 1.45), (-2.55, 1.45)], BELLY_Z, DECK_Z,
         [(-2.4, -1.35), (2.1, -1.35), (2.1, 1.35), (-2.4, 1.35)], "camo")
    m.box((-2.0, -1.0, BELLY_Z - 0.2), (1.8, 1.0, BELLY_Z), "metal")
    # Roof deck, and a raised centre plate whose top is the gray team-tint panel.
    m.box((-2.75, -1.3, DECK_Z), (1.95, 1.3, DECK_Z + 0.25), "camo")
    slab(m, [(-1.2, -0.95), (1.75, -0.95), (1.75, 0.95), (-1.2, 0.95)], DECK_Z + 0.25, DECK_Z + 0.5,
         [(-1.1, -0.85), (1.35, -0.85), (1.35, 0.85), (-1.1, 0.85)], "camo")
    m.box((-0.75, -0.5, DECK_Z + 0.5), (0.75, 0.5, DECK_Z + 0.55), "team")
    for x in (0.95, 1.15):
        m.box((x, -0.7, DECK_Z + 0.5), (x + 0.1, 0.7, DECK_Z + 0.56), "frame")
    # Tiger-style commander's cupola: drum, vision blocks round it, gray hatch on top.
    cx, cy = -1.75, 0.45
    cyl(m, (cx, cy, DECK_Z + 0.42), 2, 0.42, 0.34, "camo", 16)
    for k in range(6):
        a = 2 * math.pi * k / 6
        m.box((cx + 0.4 * math.cos(a) - 0.07, cy + 0.4 * math.sin(a) - 0.07, DECK_Z + 0.45), (cx + 0.4 * math.cos(a) + 0.07, cy + 0.4 * math.sin(a) + 0.07, DECK_Z + 0.55), "tire")
    cyl(m, (cx, cy, DECK_Z + 0.62), 2, 0.34, 0.06, "team", 16)
    # Cab jutting out over the bow: boxy, with a sloped hood back to the deck.
    m.box((1.9, -1.05, 1.75), (3.5, 1.05, 3.5), "camo")
    slab(m, [(1.9, -1.05), (3.5, -1.05), (3.5, 1.05), (1.9, 1.05)], 3.5, DECK_Z,
         [(1.9, -0.95), (2.6, -0.95), (2.6, 0.95), (1.9, 0.95)], "camo")
    # Bevelled chin under the cab.
    slab(m, [(1.9, -1.05), (3.5, -1.05), (3.5, 1.05), (1.9, 1.05)], 1.75, 1.45,
         [(1.9, -0.8), (3.1, -0.8), (3.1, 0.8), (1.9, 0.8)], "camo")
    # Driver's visor block on the cab face: two thick-glass slits under an armored brow.
    m.box((3.5, -0.75, 2.45), (3.62, 0.75, 3.2), "frame")
    for z in (2.58, 2.92):
        m.box((3.62, -0.6, z), (3.65, 0.6, z + 0.14), "glass")
    m.box((3.5, -0.85, 3.2), (3.78, 0.85, 3.3), "frame")
    # Spare track links bolted on both cab cheeks.
    for s in (-1, 1):
        for i in range(4):
            x = 2.2 + i * 0.32
            m.box((x, s * 1.05 - 0.04, 2.15), (x + 0.26, s * 1.05 + 0.04, 3.2), "tire")
    # Blackout lamps on the cab corners so the nose reads at any yaw.
    for s in (-1, 1):
        m.box((3.5, s * 0.9 - 0.1, 1.85), (3.65, s * 0.9 + 0.1, 2.02), "hazard")
    # Chin ball mount with twin machine guns.
    ball = [ellipse_ring(3.0 + 0.3 * math.sin(math.pi * i / 6), 0.0, 1.35, 0.32 * math.cos(math.pi * (i / 6 - 0.5)) + 0.02, 0.32 * math.cos(math.pi * (i / 6 - 0.5)) + 0.02, 12) for i in range(7)]
    m.loft(ball, "metal")
    for s in (-1, 1):
        cyl(m, (3.5, s * 0.13, 1.35), 0, 0.08, 0.5, "metal", 8)
        cyl(m, (3.95, s * 0.13, 1.35), 0, 0.04, 0.6, "tire", 6)
    # Stern: engine grilles on the deck, twin exhausts with flame guards, jerry cans.
    for i in range(3):
        m.box((-2.65 + i * 0.32, -1.0, DECK_Z + 0.25), (-2.45 + i * 0.32, 1.0, DECK_Z + 0.3), "frame")
    for s in (-1, 1):
        cyl(m, (-2.75, s * 0.75, DECK_Z - 0.35), 2, 0.17, 0.9, "metal", 10)
        m.box((-2.98, s * 0.75 - 0.22, DECK_Z - 0.2), (-2.88, s * 0.75 + 0.22, DECK_Z + 0.25), "frame")
    for y in (-0.25, 0.1):
        m.box((-2.85, y, 3.1), (-2.55, y + 0.3, 3.7), "frame")
    mine_launcher(m)
    for s in (-1, 1):
        pod(m, s)
    t = None if frame is None else 2 * math.pi * frame / WALK_FRAMES
    # The body dips while a diagonal pair is mid-stance and rides up as the pairs swap.
    bob = 0.0 if t is None else -BOB * math.sin(2 * t) ** 2
    body = len(m.verts)
    for i in range(body):
        m.verts[i] = m.verts[i] + np.array([0.0, 0.0, bob])
    for fx in (-1, 1):
        for s in (-1, 1):
            # Fore-left with aft-right, fore-right with aft-left.
            ph = None if t is None else t + (0.0 if fx * s > 0 else math.pi)
            leg(m, fx, s, ph, bob)
    return m


# A 3/4 front view reads the bow, one track, and the slitted casemate.
# A 3/4 front view reads the cab, two legs, and the slitted pod.
CAMEO_FACE = "0014"
CAMEO_GAIN = 1.55
CAMEO_LIFT = 0.04

# Engine sheet: 128 cells, columns = walk frames, rows = the 16 faces (south first).
CELL = 128
CONTACT_Y = 0.92
PADDING = 4
ROOT = Path(__file__).resolve().parents[2]
UNITS = ROOT / "gridlock/packages/client/src/assets/units"


def cameo(face_png: Path, path: Path) -> None:
    """Static cameo, brightened for the dark sidebar and filling the 128 frame, like the Nebelwerfer's."""
    hull = Image.open(face_png).convert("RGBA")
    crop = hull.crop(hull.getbbox())
    px = np.asarray(crop).astype(np.float64) / 255
    rgb = px[..., :3]
    dark = rgb.max(axis=-1, keepdims=True) < 0.12
    lifted = np.clip(rgb * CAMEO_GAIN + CAMEO_LIFT, 0, 1)
    px[..., :3] = np.where(dark, rgb, lifted)
    crop = Image.fromarray((px * 255 + 0.5).astype(np.uint8), "RGBA")
    size, pad = 128, 3
    fit = (size - 2 * pad) / max(crop.width, crop.height)
    small = crop.resize((max(1, round(crop.width * fit)), max(1, round(crop.height * fit))), Image.Resampling.LANCZOS)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.alpha_composite(small, ((size - small.width) // 2, size - pad - small.height))
    img.save(path)
    print("wrote", path)


def _render_frame(job: tuple[Path, int, int]) -> None:
    work, frame, ss = job
    render_turntable(build_hull(frame), work / f"walk{frame}", "mammoth_walk", f"walk{frame}.json",
                     scale_frac=SCALE_FRAC, z_mid=Z_MID, cy_frac=CY_FRAC, ss=ss)


def _render_wade(job: tuple[Path, int]) -> None:
    """Same camera as the dry walker. The mesh is dropped so the pods sit on the waterline; the legs are under."""
    work, ss = job
    hull = build_hull()
    sink(hull, -WADE_Z)
    render_turntable(hull, work / "wade", "mammoth_wade", "wade.json", scale_frac=SCALE_FRAC, z_mid=Z_MID,
                     cy_frac=CY_FRAC, ss=ss, clip_z=0.0, underlay=build_pool())


def compose(work: Path, walk_out: Path, wade_out: Path) -> None:
    """One fit for every walk frame and the wade faces: the union box of the walk fits the cell,
    and the rest pose's median foot line sits on CONTACT_Y. Same rule as composeLocked in turntable-sheet.ts."""
    walk = [[Image.open(work / f"walk{f}" / f"{d + 1:04d}.png").convert("RGBA") for d in range(16)] for f in range(WALK_FRAMES)]
    wade = [Image.open(work / "wade" / f"{d + 1:04d}.png").convert("RGBA") for d in range(16)]
    boxes = [im.getbbox() for row in walk for im in row]
    if any(b is None for b in boxes) or any(im.getbbox() is None for im in wade):
        raise SystemExit("empty face")
    x0 = min(b[0] for b in boxes)
    y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes)
    y1 = max(b[3] for b in boxes)
    src = walk[0][0].width
    scale = min((CELL - 2 * PADDING) / (x1 - x0), (CELL - 2 * PADDING) / (y1 - y0), 1.0)
    bottoms = sorted(im.getbbox()[3] for im in walk[0])
    med = bottoms[len(bottoms) // 2]
    ox = CELL / 2 - src / 2 * scale
    oy = CELL * CONTACT_Y - med * scale
    lo, hi = PADDING - y0 * scale, CELL - PADDING - y1 * scale
    oy = (lo + hi) / 2 if hi < lo else min(hi, max(lo, oy))
    size = round(src * scale)

    def place(sheet: Image.Image, im: Image.Image, col: int, row: int) -> None:
        small = im.resize((size, size), Image.Resampling.LANCZOS)
        cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        cell.paste(small, (round(ox), round(oy)), small)
        sheet.alpha_composite(cell, (col * CELL, row * CELL))

    sheet = Image.new("RGBA", (WALK_FRAMES * CELL, 16 * CELL), (0, 0, 0, 0))
    for f in range(WALK_FRAMES):
        for d in range(16):
            place(sheet, walk[f][d], f, d)
    sheet.save(walk_out)
    print("wrote", walk_out, sheet.size, "scale", round(scale, 3))
    wsheet = Image.new("RGBA", (CELL, 16 * CELL), (0, 0, 0, 0))
    for d in range(16):
        place(wsheet, wade[d], 0, d)
    wsheet.save(wade_out)
    print("wrote", wade_out, wsheet.size)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--frames-dir", help="keep the 256 px faces here instead of a temp dir")
    ap.add_argument("--jobs", type=int, default=min(9, os.cpu_count() or 1))
    args = ap.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(args.frames_dir or tmp)
        work.mkdir(parents=True, exist_ok=True)
        with Pool(args.jobs) as pool:
            pool.map(_render_frame, [(work, f, args.ss) for f in range(WALK_FRAMES)] , chunksize=1)
            pool.map(_render_wade, [(work, args.ss)])
        compose(work, UNITS / "mammoth-walk.png", UNITS / "mammoth-wade.png")
        rest = work / "rest"
        render_turntable(build_hull(), rest, "mammoth_rest", "rest.json", scale_frac=SCALE_FRAC, z_mid=Z_MID, cy_frac=CY_FRAC, ss=args.ss)
        cameo(rest / f"{CAMEO_FACE}.png", UNITS / "mammoth-cameo.png")


if __name__ == "__main__":
    main()
