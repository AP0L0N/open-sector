#!/usr/bin/env python3
"""The Bloom beasts (the faction's tanks), on the Xenomorph walker pipeline.

Same camera, rasterizer, light, outline, 128 cell and contactY 0.92 as the Stalker /
Ravager / Behemoth (xeno_walker.py); the Bloom palette lock from
gridlock/docs/factions/bloom.md via bloom_beast_parts.py. 16 unique yaws (row 0 =
south, clockwise 22.5 deg) and an 8-frame cycle on the legs sheet, every frame a step
(the Bile Worm undulates instead). Each beast carries a gray team-tint carapace plate.

  skitter      low six-legged tick, quill pod fixed on its back            legs only
  goretusk     rhino-beetle: head shield, two great tusks, four heavy legs  legs only
  mantis       six-legged abdomen + upright torso with raptor forearms      legs + turret + gun (acid gland)
  bileworm     segmented worm, ring mouth, undulates                        legs only
  sporemaw     toad, huge back sac venting up-forward                      legs only
  matriarch  eight legs, egg-laden abdomen, crown of glowing sacs         legs + turret + gun (sac cannon)

Writes gridlock/packages/client/src/assets/units/<id>-legs.png (8 x 16, 128 cell),
<id>-turret.png / <id>-gun.png (1 x 16) for turreted beasts, <id>-cameo.png (128,
assembled east), previews in tools/sprites/preview/<id>-{walk,turntable,gameplay}.png
and <id>-bloom.json (fit, drawSize for xenoWalker(), checks).

  python3 tools/sprites/render_bloom_beasts.py --only skitter
  python3 tools/sprites/render_bloom_beasts.py --lineup
"""

from __future__ import annotations

import argparse
import json
import math

import numpy as np
from PIL import Image, ImageDraw

import bloom_beast_parts as bp
import xeno_walker as bw
from bloom_beast_parts import V, blob, curve, flesh_leg, horn, knob, posed_leg, ribbed, sac, sweep, team_plate, tube
from render_procedural import Mesh


def add_xform(m: Mesh, sub: Mesh, R: np.ndarray, t) -> None:
    off = len(m.verts)
    t = np.asarray(t, float)
    for v in sub.verts:
        m.verts.append(R @ v + t)
    for a, b, c, mat in sub.tris:
        m.tris.append((a + off, b + off, c + off, mat))


def pitch_up(p: float) -> np.ndarray:
    """Rotation turning model +x up by p radians (toward +z)."""
    c, s = math.cos(p), math.sin(p)
    return np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]])


def legs6(m: Mesh, frame, hips, kdx, fdx, y_hip, y_knee, y_foot, z_hip, z_knee, r, stride, lift, spur=True):
    """Six (or eight) legs, alternating tripods: group = (i + side) % 2."""
    for i, (hx, kx, fx) in enumerate(zip(hips, kdx, fdx)):
        for s in (-1, 1):
            hip = (hx, s * y_hip, z_hip)
            knee = (hx + kx, s * y_knee, z_knee)
            ankle = (hx + fx * 0.9, s * (y_foot - 0.1), z_knee * 0.25)
            foot = (hx + fx, s * y_foot, 0.0)
            posed_leg(m, hip, knee, ankle, foot, frame, (i + (s > 0)) % 2, stride, lift, r=r, spur=spur)


# ================================================================ skitter


def skitter_legs(frame=None) -> Mesh:
    m = Mesh()
    # Abdomen: three plated bands, team scute on the rear.
    ribbed(m, (-0.55, 0, 0.95), (1.25, 0.95, 0.52), 3, seg=16)
    team_plate(m, (-1.15, 0, 1.38), (0.38, 0.4, 0.12))
    # Head: low wedge, eye cluster, hooked mandibles.
    blob(m, (0.95, 0, 0.82), (0.5, 0.52, 0.34), bp.body_mat(14, plate_w=2), rings=8, seg=14)
    for s in (-1, 1):
        knob(m, (1.32, s * 0.18, 0.98), 0.11, "gl")
        knob(m, (1.2, s * 0.33, 1.05), 0.08, "gl")
        horn(m, (1.35, s * 0.25, 0.66), (1.8, s * 0.35, 0.6), (1.95, s * 0.08, 0.42), 0.1, "bn_l", steps=5, n=6)
    knob(m, (1.38, 0, 1.06), 0.07, "gl_h")
    # Quill pod fixed on the back: fleshy bulb, ivory collar, a bundle of quills aimed forward-up,
    # a fan of spare quills behind, amber pore at the front.
    blob(m, (-0.35, 0, 1.62), (0.62, 0.5, 0.42), bp.body_mat(14, plate_w=1), rings=8, seg=14)
    sweep(m, [V(-0.35, 0, 1.25), V(-0.35, 0, 1.4)], [0.62, 0.55], "bn", n=12)
    for dy, dz in ((0, 0.18), (-0.16, 0.06), (0.16, 0.06), (-0.09, -0.08), (0.09, -0.08)):
        tube(m, (-0.1, dy, 1.7 + dz), (0.75, dy * 0.8, 2.05 + dz), 0.075, 0.03, "bn_l", n=6)
    knob(m, (0.24, 0, 1.78), 0.13, "gl")
    for a in (-0.9, -0.45, 0.0, 0.45, 0.9):
        base = V(-0.7, 0.3 * math.sin(a), 1.75 + 0.15 * math.cos(a))
        horn(m, base, base + V(-0.25, 0.3 * math.sin(a), 0.35), base + V(-0.65, 0.55 * math.sin(a), 0.6), 0.07, "bn_l", steps=4, n=5)
    legs6(m, frame, (0.55, 0.0, -0.6), (0.4, 0.05, -0.35), (1.0, 0.1, -0.9), 0.7, 1.4, 1.95, 0.75, 1.2, 0.17, 0.42, 0.32, spur=False)
    return m


# ================================================================ goretusk


def goretusk_legs(frame=None) -> Mesh:
    m = Mesh()
    ribbed(m, (-0.4, 0, 1.6), (2.05, 1.35, 0.92), 4, seg=18, plate_w=2)
    team_plate(m, (-0.9, 0, 2.48), (0.55, 0.55, 0.14))
    # Short spines along the back plates.
    for x in (-1.9, -0.05, 0.75):
        horn(m, (x, 0, 2.38), (x - 0.1, 0, 2.62), (x - 0.35, 0, 2.8), 0.12, "bn_l", steps=4, n=6)
    # Head under a great plated shield; eyes under its rim; a brow horn.
    blob(m, (1.85, 0, 1.25), (0.8, 0.78, 0.6), bp.body_mat(14, plate_w=2), rings=8, seg=14)
    sh = Mesh()
    blob(sh, (0, 0, 0), (1.05, 1.4, 0.24), lambda ri, s: "bn" if math.sin(2 * math.pi * (s + 0.5) / 16) > 0.25 else ("bn_d" if ri in (0, 8) else "bn_l"), rings=8, seg=16)
    add_xform(m, sh, pitch_up(math.radians(62)), (1.72, 0, 2.15))
    horn(m, (2.0, 0, 2.6), (2.45, 0, 3.0), (2.6, 0, 3.55), 0.24, "bn_l", steps=5, n=8)
    for s in (-1, 1):
        knob(m, (2.5, s * 0.42, 1.38), 0.13, "gl")
        # Two great tusks out of the lower jaw: forward, out, up.
        horn(m, (2.35, s * 0.42, 0.95), (3.5, s * 1.0, 0.55), (4.15, s * 0.75, 1.5), 0.24, "bn_l", steps=7, n=8)
        knob(m, (2.35, s * 0.42, 0.95), 0.26, "fl_d")
    blob(m, (2.45, 0, 0.92), (0.35, 0.4, 0.22), "mem", rings=5, seg=10)
    # Four heavy legs: a trot, diagonal pairs together.
    for i, hx in enumerate((1.0, -1.3)):
        for s in (-1, 1):
            hip = (hx, s * 1.05, 1.4)
            knee = (hx + 0.35, s * 1.95, 1.7)
            ankle = (hx + 0.1, s * 2.05, 0.42)
            foot = (hx + 0.4, s * 2.12, 0.0)
            posed_leg(m, hip, knee, ankle, foot, frame, (i + (s > 0)) % 2, 0.6, 0.5, r=0.38)
    return m


# ================================================================ mantis

M_RING_Z = 1.75
M_GUN_Z = 2.35


def mantis_legs(frame=None) -> Mesh:
    m = Mesh()
    # Long segmented abdomen behind the torso socket.
    ribbed(m, (-2.25, 0, 1.45), (1.95, 1.05, 0.62), 5, seg=16, plate_w=2)
    team_plate(m, (-2.55, 0, 2.02), (0.42, 0.42, 0.12))
    # Thorax under the socket.
    blob(m, (0.05, 0, 1.35), (0.85, 0.8, 0.5), bp.body_mat(14, plate_w=2), rings=8, seg=14)
    # Empty socket for the torso: a fleshy collar with an amber seam.
    bw.cylinder_z(m, 0.0, 0.0, 0.72, M_RING_Z - 0.12, M_RING_Z - 0.04, "gl_d", 20)
    bw.cylinder_z(m, 0.0, 0.0, 0.66, M_RING_Z - 0.1, M_RING_Z + 0.04, "fl_d", 20)
    # Tail tip glow sac.
    knob(m, (-4.25, 0, 1.4), 0.2, "gl")
    legs6(m, frame, (0.55, 0.0, -0.75), (0.5, 0.05, -0.45), (1.15, 0.1, -1.05), 0.7, 1.7, 2.3, 1.2, 1.85, 0.24, 0.55, 0.5)
    return m


def mantis_turret() -> Mesh:
    m = Mesh()
    # Upright segmented trunk leaning forward.
    pts = [V(-0.05, 0, M_RING_Z), V(0.12, 0, 2.3), V(0.35, 0, 2.85), V(0.55, 0, 3.3)]
    sweep(m, pts, [0.72, 0.64, 0.54, 0.44], lambda ri, s: "gl_d" if ri == 1 and s % 2 == 0 else ("bn_l" if s in (5, 6, 7) else "fl"), n=12)
    for z, x, r in ((2.05, 0.05, 0.6), (2.6, 0.25, 0.52)):
        sweep(m, [V(x - 0.05, 0, z - 0.06), V(x + 0.05, 0, z + 0.06)], [r, r * 0.9], "bn", n=12)
    team_plate(m, (-0.18, 0, 2.6), (0.3, 0.36, 0.1))
    # Triangular head, huge amber eyes, mandibles, antennae.
    blob(m, (0.75, 0, 3.6), (0.45, 0.74, 0.36), "fl", rings=8, seg=12)
    for s in (-1, 1):
        knob(m, (0.85, s * 0.6, 3.72), 0.25, "gl")
        knob(m, (0.98, s * 0.6, 3.78), 0.1, "gl_h")
        horn(m, (1.0, s * 0.15, 3.38), (1.2, s * 0.15, 3.2), (1.12, s * 0.02, 3.08), 0.07, "bn_l", steps=4, n=5)
        horn(m, (0.85, s * 0.2, 3.82), (0.9, s * 0.6, 4.4), (1.45, s * 0.85, 4.6), 0.04, "bn_d", steps=5, n=5)
    # Raptor forearms folded forward either side of the gland.
    for s in (-1, 1):
        sh = V(0.45, s * 0.62, 3.05)
        el = V(1.1, s * 0.95, 2.45)
        wr = V(2.05, s * 0.92, 3.45)
        tip = V(1.55, s * 0.8, 2.4)
        knob(m, sh, 0.34, "fl_d")
        tube(m, sh, el, 0.28, 0.24, "fl")
        knob(m, el, 0.27, "fl_l")
        tube(m, el, wr, 0.28, 0.2, "bn_l")
        for u in (0.3, 0.55, 0.8):
            p = el + (wr - el) * u
            horn(m, p, p + V(0.0, -s * 0.12, -0.15), p + V(-0.05, -s * 0.18, -0.32), 0.07, "bn_l", steps=3, n=5)
        knob(m, wr, 0.2, "bn_d")
        horn(m, wr, wr + V(0.15, 0, -0.6), tip, 0.18, "bn_l", steps=5, n=6)
    return m


def mantis_gun() -> Mesh:
    m = Mesh()
    z = M_GUN_Z
    sac(m, (1.0, 0, z), (0.55, 0.42, 0.42), ribs=3)
    sweep(m, [V(1.45, 0, z), V(2.2, 0, z + 0.04), V(2.85, 0, z + 0.08)], [0.28, 0.21, 0.17], "fl", n=10)
    for x in (1.75, 2.25, 2.65):
        sweep(m, [V(x - 0.05, 0, z + 0.03), V(x + 0.05, 0, z + 0.04)], [0.27, 0.25], "bn_l", n=10)
    sweep(m, [V(2.8, 0, z + 0.08), V(3.0, 0, z + 0.09)], [0.24, 0.2], "fl_l", n=10)
    knob(m, (3.02, 0, z + 0.09), 0.14, "gl_h")
    return m


# ================================================================ bileworm

W_N = 36


def worm_path(frame):
    ph = 0.0 if frame is None else 2 * math.pi * frame / bw.WALK_FRAMES
    pts, radii = [], []
    for i in range(W_N):
        u = i / (W_N - 1)  # 0 tail -> 1 head
        x = -4.3 + 7.5 * u
        amp = 0.62 * (1 - u) ** 0.8
        y = amp * math.sin(2 * math.pi * 1.35 * (1 - u) + ph)
        r = 0.24 + 0.7 * min(1.0, (u / 0.55)) ** 0.7
        r *= 1.0 + 0.07 * math.sin(2 * math.pi * 3.0 * (1 - u) + 2 * ph)  # peristalsis
        pts.append(V(x, y, r * 0.86))
        radii.append((r, r * 0.86))
    return pts, radii


def bileworm_legs(frame=None) -> Mesh:
    m = Mesh()
    pts, radii = worm_path(frame)
    n = 14
    team_i = {23, 24}

    def mat(ri, s):
        top = n // 4
        d = min(abs(s - top), n - abs(s - top))
        belly = math.sin(2 * math.pi * (s + 0.5) / n) < -0.35
        if ri % 3 == 2:
            return "mem" if belly else "fl_d"
        if belly:
            return "mem"
        if ri in team_i and d <= 1:
            return "tm"
        if d <= 2:
            return "bn_l" if d <= 1 else "bn"
        return "fl" if d <= 4 else "fl_d"

    # Segments: alternate the ring radius so the grooves sink.
    rr = [(a * (0.9 if i % 3 == 2 else 1.0), b * (0.9 if i % 3 == 2 else 1.0)) for i, (a, b) in enumerate(radii)]
    sweep(m, pts, rr, mat, n=n)
    # Dorsal spines on some segments.
    for i in range(4, W_N - 4, 3):
        p, (r, rz) = pts[i], radii[i]
        base = p + V(0, 0, rz * 0.92)
        horn(m, base, base + V(-0.15, 0, 0.25), base + V(-0.4, 0, 0.35), 0.09 + 0.06 * r, "bn_l", steps=4, n=5)
    # Amber spiracles along both flanks.
    for i in range(3, W_N - 5, 3):
        p, (r, rz) = pts[i], radii[i]
        for s in (-1, 1):
            knob(m, p + V(0, s * r * 0.97, rz * 0.1), 0.06 + 0.07 * r, "gl")
    # Team scute riding the segment.
    p, (r, rz) = pts[24], radii[24]
    team_plate(m, p + V(0, 0, rz * 0.95), (0.32, 0.36, 0.1))
    # Acid sacs on the neck.
    p, (r, rz) = pts[W_N - 4], radii[W_N - 4]
    for s in (-1, 1):
        knob(m, p + V(0, s * r * 0.95, rz * 0.25), 0.2, "gl")
    # Ring mouth facing forward: fleshy lip torus, teeth pointing in, amber throat.
    head, (hr, hrz) = pts[-1], radii[-1]
    cx, cz = head[0] + 0.1, head[2]
    ring_r = hr * 0.8
    ang = np.linspace(0, 2 * math.pi, 17)
    loop = [V(cx, ring_r * math.cos(a), cz + ring_r * 0.86 * math.sin(a)) for a in ang]
    lip = Mesh()
    sweep(lip, loop, [0.2] * len(loop), "fl_l", n=8, cap0=False, cap1=False)
    m.verts += lip.verts
    off = len(m.verts) - len(lip.verts)
    m.tris += [(a + off, b + off, c + off, mt) for a, b, c, mt in lip.tris]
    blob(m, (cx - 0.05, head[1], cz), (0.08, ring_r * 0.95, ring_r * 0.82), "gl", rings=4, seg=14)
    knob(m, (cx - 0.02, head[1], cz), 0.18, "gl_h")
    for a in ang[:-1:2]:
        p = V(cx + 0.05, ring_r * math.cos(a), cz + ring_r * 0.86 * math.sin(a))
        q = V(cx + 0.3, ring_r * 0.45 * math.cos(a), cz + ring_r * 0.4 * math.sin(a))
        horn(m, p, (p + q) / 2 + V(0.08, 0, 0), q, 0.07, "bn_l", steps=3, n=5)
    return m


# ================================================================ sporemaw


def sporemaw_legs(frame=None) -> Mesh:
    m = Mesh()
    ribbed(m, (-0.2, 0, 1.15), (1.75, 1.45, 0.85), 3, seg=18, plate_w=2)
    # Wide head, mouth line, eye bumps, team scute behind the eyes.
    blob(m, (1.45, 0, 1.05), (0.85, 1.2, 0.6), bp.body_mat(16, plate_w=2), rings=8, seg=16)
    blob(m, (1.98, 0, 0.88), (0.32, 1.0, 0.12), "mem", rings=5, seg=10)
    for s in (-1, 1):
        knob(m, (1.6, s * 0.62, 1.55), 0.28, "fl_l")
        knob(m, (1.72, s * 0.64, 1.66), 0.17, "gl")
    team_plate(m, (1.05, 0, 1.6), (0.32, 0.45, 0.1))
    team_plate(m, (-1.55, 0, 1.62), (0.36, 0.45, 0.1))
    # Back sac: a fleshy collar on the back, the huge glowing sac aimed up-forward, a puckered vent.
    blob(m, (-0.45, 0, 1.88), (1.0, 0.95, 0.34), "fl_d", rings=6, seg=14)
    sub = Mesh()
    blob(sub, (0, 0, 0), (1.25, 0.95, 0.95), lambda ri, s: "gl" if s % 3 == 0 and 1 <= ri <= 8 else ("gl_h" if s % 3 == 0 else ("fl_l" if s % 3 == 1 else "fl")), rings=10, seg=15)
    R = pitch_up(math.radians(55))
    c = V(-0.35, 0, 2.75)
    add_xform(m, sub, R, c)
    tip = c + R @ V(1.22, 0, 0)
    vent = Mesh()
    sweep(vent, [V(0, 0, 0), V(0.18, 0, 0), V(0.3, 0, 0)], [0.42, 0.36, 0.2], "fl_l", n=10)
    knob(vent, (0.3, 0, 0), 0.17, "gl_h")
    for a in np.linspace(0, 2 * math.pi, 7)[:-1]:
        horn(vent, (0.1, 0.38 * math.cos(a), 0.38 * math.sin(a)), (0.32, 0.42 * math.cos(a), 0.42 * math.sin(a)), (0.45, 0.3 * math.cos(a), 0.3 * math.sin(a)), 0.08, "bn_l", steps=3, n=5)
    add_xform(m, vent, R, tip - R @ V(0.12, 0, 0))
    # Legs: short toad arms, big folded haunches. Trot.
    for i, (hip, knee, ankle, foot, r) in enumerate((
        ((0.95, 1.0, 1.0), (1.25, 1.62, 1.15), (1.4, 1.72, 0.35), (1.8, 1.78, 0.0), 0.3),
        ((-1.0, 1.2, 1.1), (-0.15, 1.95, 1.35), (-1.25, 2.0, 0.38), (-0.55, 2.05, 0.0), 0.42),
    )):
        for s in (-1, 1):
            sy = lambda p: (p[0], s * p[1], p[2])
            if i == 1:
                blob(m, sy((-0.85, 1.35, 1.25)), (0.75, 0.42, 0.5), "fl", rings=6, seg=12)
            posed_leg(m, sy(hip), sy(knee), sy(ankle), sy(foot), frame, (i + (s > 0)) % 2, 0.5, 0.42, r=r, spur=False)
    return m


# ================================================================ matriarch

B_RING_Z = 3.15
B_GUN_Z = 3.8


def broodmother_legs(frame=None) -> Mesh:
    m = Mesh()
    # Sagging egg-laden abdomen.
    ribbed(m, (-2.9, 0, 2.55), (2.5, 1.95, 1.4), 4, seg=20, plate_w=2)
    team_plate(m, (-2.2, 0, 3.92), (0.62, 0.64, 0.15))
    blob(m, (-3.3, 0, 1.55), (2.25, 2.0, 1.1), "fl_d", rings=8, seg=16)
    rng = np.random.default_rng(7)
    for k in range(40):
        a = rng.uniform(0.6, 2 * math.pi - 0.6) if k % 2 else rng.uniform(-math.pi, math.pi)
        x = -3.3 + rng.uniform(-1.8, 1.7)
        t = (x + 3.3) / 2.25
        kk = math.sqrt(max(0.05, 1 - t * t))
        ang = rng.uniform(-math.pi * 0.6, math.pi * 0.05) * (1 if k % 2 else -1) + (0 if k % 2 else math.pi)
        p = V(x, 2.0 * kk * math.cos(ang) * 1.0, 1.55 + 1.1 * kk * math.sin(ang) * 1.0)
        if p[2] < 0.55:
            p[2] = 0.55
        knob(m, p, rng.uniform(0.26, 0.4), "gl" if k % 3 == 0 else "fl_l")
    tube(m, (-5.4, 0, 2.1), (-5.9, 0, 1.75), 0.38, 0.16, "fl_d")
    knob(m, (-5.92, 0, 1.73), 0.17, "gl")
    # Cephalothorax and the empty turret socket.
    ribbed(m, (0.55, 0, 2.3), (1.65, 1.45, 0.88), 2, seg=18)
    bw.cylinder_z(m, 0.0, 0.0, 0.98, B_RING_Z - 0.16, B_RING_Z - 0.06, "gl_d", 22)
    bw.cylinder_z(m, 0.0, 0.0, 0.92, B_RING_Z - 0.14, B_RING_Z + 0.04, "fl_d", 22)
    # Head, fangs, eye cluster, the crown of glowing sacs on stalks.
    blob(m, (2.3, 0, 2.05), (0.8, 0.95, 0.62), bp.body_mat(14, plate_w=2), rings=8, seg=14)
    for s in (-1, 1):
        horn(m, (2.85, s * 0.35, 1.7), (3.25, s * 0.42, 1.2), (3.05, s * 0.18, 0.85), 0.2, "bn_l", steps=5, n=7)
        knob(m, (3.0, s * 0.2, 2.25), 0.12, "gl")
        knob(m, (2.88, s * 0.42, 2.38), 0.1, "gl")
    for k in range(7):
        a = math.radians(-80 + 160 * k / 6)
        base = V(2.1 + 0.55 * math.cos(a) * 0.6, 0.72 * math.sin(a), 2.5)
        top = base + V(0.1 * math.cos(a), 0.3 * math.sin(a), 0.55 + 0.12 * (k % 2))
        tube(m, base, top, 0.11, 0.08, "fl")
        knob(m, top + V(0, 0, 0.12), 0.32 + 0.05 * (k % 2), "gl")
        knob(m, top + V(0.05, 0, 0.22), 0.12, "gl_h")
    # Eight long legs, alternating tetrapods.
    legs6(m, frame, (1.55, 0.75, -0.05, -0.85), (0.9, 0.3, -0.3, -0.9), (2.0, 0.6, -0.7, -1.9), 1.2, 3.0, 3.7, 2.2, 3.9, 0.42, 0.65, 0.75, spur=False)
    return m


def broodmother_turret() -> Mesh:
    m = Mesh()
    seg = 18

    def f(ri, s):
        if ri <= 1:
            return "fl_d"
        if ri == 3:
            return "gl_d" if s % 3 == 0 else "fl"
        return "bn_l" if (s // 3) % 2 == 0 else "fl"

    bw.dome(m, -0.15, 0.0, B_RING_Z + 0.02, 1.2, 1.05, 0.85, f, rings=6, seg=seg)
    team_plate(m, (-0.65, 0, B_RING_Z + 0.78), (0.42, 0.45, 0.12))
    for a in (0.8, 2.3, 4.0, 5.2):
        knob(m, (-0.15 + 0.85 * math.cos(a), 0.75 * math.sin(a), B_RING_Z + 0.45), 0.14, "gl")
    # Socket where the sac-cannon roots.
    blob(m, (0.55, 0, B_GUN_Z - 0.05), (0.55, 0.62, 0.5), "fl_d", rings=6, seg=12)
    return m


def broodmother_gun() -> Mesh:
    m = Mesh()
    z = B_GUN_Z
    sac(m, (0.75, 0, z + 0.05), (0.85, 0.68, 0.68), ribs=4)
    sweep(m, [V(1.4, 0, z), V(2.5, 0, z + 0.04), V(3.5, 0, z + 0.08)], [0.46, 0.38, 0.32], "fl", n=12)
    for x in (1.8, 2.4, 3.0):
        sweep(m, [V(x - 0.06, 0, z + 0.03), V(x + 0.06, 0, z + 0.05)], [0.46, 0.43], "bn_l", n=12)
    sweep(m, [V(3.45, 0, z + 0.08), V(3.75, 0, z + 0.09)], [0.42, 0.34], "fl_l", n=12)
    knob(m, (3.76, 0, z + 0.09), 0.22, "gl_h")
    return m


# ================================================================ registry

# id: (legs, turret, gun, scale_frac, z_mid, cy_frac, ref px/m, fps). ref px/m sets drawSize: the Stalker
# draws ~3.9 map px per metre and the Behemoth 4.8; the beasts sit a little fuller so their bodies
# match the Stalker's hull (its union is stretched by the long barrel).
def grown(fn, k: float):
    """The same model built k times bigger (gait included)."""

    def f(*a):
        m = fn(*a)
        m.verts = [v * k for v in m.verts]
        return m

    return f


UNITS = {
    "skitter": (skitter_legs, None, None, 0.13, 1.0, 0.6, 4.2, 13),
    "goretusk": (goretusk_legs, None, None, 0.078, 1.5, 0.6, 4.8, 9),
    "mantis": (mantis_legs, mantis_turret, mantis_gun, 0.078, 1.8, 0.6, 4.6, 10),
    "bileworm": (bileworm_legs, None, None, 0.095, 0.9, 0.6, 4.2, 9),
    "sporemaw": (grown(sporemaw_legs, 1.3), None, None, 0.068, 2.1, 0.62, 4.6, 9),
    "matriarch": (broodmother_legs, broodmother_turret, broodmother_gun, 0.064, 2.4, 0.6, 5.4, 7),
}


def lineup() -> None:
    """All six east-facing at their draw size beside the Stalker (49), on one contact line, 3x."""
    entries = []

    def east(prefix: str, has_turret: bool) -> Image.Image:
        legs = Image.open(bp.UNITS / f"{prefix}-legs.png").convert("RGBA").crop((0, 12 * 128, 128, 13 * 128))
        if has_turret:
            for n in ("turret", "gun"):
                legs.alpha_composite(Image.open(bp.UNITS / f"{prefix}-{n}.png").convert("RGBA").crop((0, 12 * 128, 128, 13 * 128)))
        return legs

    entries.append(("stalker", east("stalker", True), 49))
    for uid in UNITS:
        rep = json.loads((bp.PREVIEW / f"{uid}-bloom.json").read_text())
        entries.append((uid, east(uid, rep["turret"]), rep["drawSize"]))
    k = 3
    gap = 8
    width = sum(ds for _, _, ds in entries) * k + gap * (len(entries) + 1)
    hmax = max(ds for _, _, ds in entries) * k
    base = hmax + 10
    img = Image.new("RGBA", (width, base + 40), (107, 83, 64, 255))
    d = ImageDraw.Draw(img)
    x = gap
    for uid, cell, ds in entries:
        s = cell.resize((ds, ds), Image.LANCZOS).resize((ds * k, ds * k), Image.NEAREST)
        y = base - round(0.92 * ds * k)
        img.alpha_composite(s, (x, y))
        d.text((x + 2, base + 8), f"{uid} {ds}", fill=(240, 236, 220))
        x += ds * k + gap
    d.line((0, base, width, base), fill=(160, 40, 40))
    out = bp.PREVIEW / "bloom-beasts-lineup.png"
    img.save(out)
    print("wrote", out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=list(UNITS), action="append")
    ap.add_argument("--draft", action="store_true", help="ss 2 (fast look)")
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--lineup", action="store_true", help="only rebuild preview/bloom-beasts-lineup.png")
    args = ap.parse_args()
    if args.lineup:
        lineup()
        return
    for uid in args.only or list(UNITS):
        legs, tur, gun, sf, zm, cy, ppm, fps = UNITS[uid]
        bp.bake(uid, legs, tur, gun, sf, zm, cy, ref_ppm=ppm, fps=fps, ss=args.ss, jobs=args.jobs, draft=args.draft)


if __name__ == "__main__":
    main()
