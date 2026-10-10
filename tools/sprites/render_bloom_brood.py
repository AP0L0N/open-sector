#!/usr/bin/env python3
"""
The Bloom's brood (infantry) — six organic mutants on the Cyborg / Thrall lock.

A fork of render_thrall.py: the Cyborg's camera (high three-quarter, 33 deg),
96 cell, contact pins (stand 0.88, die 0.72, swim WL_Y / 96), south-first row
order, #1a1410 outline, and the Thrall's standing scale, so the client reuses
CYBORG_SPRITE / CYBORG_FIRE_SPRITE / CYBORG_DIE_SPRITE / swimSprite with only
the file names changed. Recoloured to the Bloom palette lock
(gridlock/docs/factions/bloom.md, registered by bloom_parts.py): wet flesh,
bone-ivory chitin, dark membrane, glowing amber sacs and eyes, one gray
team-tint carapace plate on each. No metal, no visors, no guns.

  spawnling  dog-sized hunched biped, all mouth and two hooked claws, amber
             eye cluster. Drawn at 0.75 of the Thrall's scale inside the same
             cell, so the client keeps the Cyborg draw size.
             fire = claw slash left / recover / slash right / recover.
  gobber     lanky (the Gobber), a long craning neck, a throat sac. fire = the sac swells,
             swells more, spits a glowing glob (flash at the mouth), glob away.
  quillback  squat and broad, back a bed of quills, a launcher hump on the
             right shoulder. fire = hump flexes, quills leave (big/small/big/tiny).
  bloater    bloated and waddling, glowing acid sacs in a bone cradle on its
             back. fire = reach back for a sac, cock it overhead, release, follow.
  longspine  gaunt, ~1.1 of the Thrall's height, many small eyes, the right arm
             a long bone spine launcher. fire = braced level, amber flash at
             the tip (big / small / none / none).
  mender     delicate pale translucent flesh, a dome head, four long feelers
             trailing amber threads, no weapon. fire = feelers reach forward
             glowing (used while healing).

Sheets per unit: walk (8, every frame a step), fire (4), die (4; knees go,
falls forward; frame 3 is the corpse with its glow dark), swim (8, chest-deep
in the shared pool), cameo (72x72 from the east walk frame 0). 16 unique yaws,
no mirroring. Writes gridlock/packages/client/src/assets/units/<id>-*.png and
previews / manifests / east locks in tools/sprites/preview/. Exits 2 if a row
is empty or clipped.

  python3 tools/sprites/render_bloom_brood.py --only gobber         # one unit, every sheet
  python3 tools/sprites/render_bloom_brood.py --only gobber walk    # some sheets
  python3 tools/sprites/render_bloom_brood.py --only gobber --quick # S/E/N/W draft grid
  python3 tools/sprites/render_bloom_brood.py --lineup               # east lineup next to the Thrall
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
from bloom_parts import (  # noqa: E402
    CELL,
    WL_Y,
    Cloud,
    R,
    along,
    bez,
    bez3,
    capsule,
    chain,
    ellipsoid,
    eyes,
    flash_star,
    g,
    glob,
    hook,
    ik,
    plate,
    rot_x,
    rot_y,
    rot_z,
    sac,
    sink,
)
from compose_unit_sheet import ENGINE_ORDER, compose_sheet, diagnostics, opaque_bbox, preview_strip, preview_turntable  # noqa: E402

UNITS = R.UNITS
PREVIEW = R.PREVIEW
ROOT = R.ROOT

STAND = 1.2 * 0.96  # the Thrall's standing scale


def T_of(hip0, Rt):
    hip0 = np.asarray(hip0, float)
    return lambda *v: hip0 + Rt @ np.array(v, float)


# Die: knees buckle, falls forward, face down (hip share of standing height,
# torso lean, knee x, foot x, head tilt, arm reach). Frame 3 lies at lie_z.
DIE = {
    0: (0.57, 0.55, 2.0, -12.0, -0.35, 0.0),
    1: (0.43, 1.05, 0.5, -14.0, -0.55, 0.5),
    2: (0.31, 1.38, -3.0, -18.0, -0.30, 0.9),
    3: (0.0, math.pi / 2, -8.0, -24.0, -1.25, 1.0),
}


class Creature:
    uid = ""
    scale = STAND
    hip_x = -0.6
    hip_z = 30.0
    hip_w = 5.6
    foot_w = 5.8
    thigh = 15.0
    shin = 14.6
    stride = 8.0
    lift = 5.0
    bob = 1.2
    walk_lean = 0.3
    fight_lean = 0.15
    swim_lean = 0.0
    water_z = 38.0
    lie_z = 6.0
    sway = 0.10
    roll = 0.0
    ua = 10.0
    fa = 9.0
    arm_swing = 0.8
    fa_bend = 1.1
    neck_r = 2.0
    neck_level = 0.85
    die_leg = 1.0  # share of the leg length the corpse lies out (tall bodies fold)

    # -- parts every creature fills in
    def leg(self, c, hip, foot, knee=None, lit=True):
        raise NotImplementedError

    def torso(self, c, hip0, Rt, lit, mode, t) -> dict:
        raise NotImplementedError

    def head(self, c, at, Rm, lit, mode, t):
        raise NotImplementedError

    def arm(self, c, sh, el, wr, side, Rt, lit, mode, t):
        raise NotImplementedError

    def extra(self, c, a, lit, mode, t):
        pass

    def fire_body(self, frame):
        """(twist, extra lean) of the torso on a fire frame."""
        return 0.0, 0.0

    def head_tilt(self, mode, t, lean):
        return -lean * self.neck_level

    # -- arm poses (body space)
    def arm_pose(self, a, side, key, mode, t):
        sh = a[key]
        s = side
        if mode == "walk":
            w = 2 * math.pi * t
            k = math.cos(w) if s > 0 else -math.cos(w)
            th = self.arm_swing * k
            el = sh + np.array([self.ua * math.sin(th) + 1.0, s * 1.4, -self.ua * math.cos(th) + 1.0])
            fa = th + self.fa_bend
            wr = el + np.array([self.fa * math.sin(fa), -s * 1.2, -self.fa * math.cos(fa)])
            return el, wr
        if mode == "swim":
            el = sh + np.array([3.0, s * 2.0, -0.83 * self.ua])
            wr = el + np.array([0.8 * self.fa, -s * 1.4, 1.6])
            return el, wr
        if mode == "die":
            ku, kf = self.ua / 10.4, self.fa / 9.0
            reach = DIE[t][5]
            if t == 3:
                if s > 0:
                    el = sh + np.array([6.0, 4.0, 0.0]) * ku
                    wr = el + np.array([8.4, -1.0, 0.0]) * kf
                else:
                    el = sh + np.array([-7.6, -3.6, 0.0]) * ku
                    wr = el + np.array([-8.0, 1.2, 0.0]) * kf
                el[2] = 2.6
                wr[2] = 2.0
            else:
                el = sh + np.array([2.0 + 4.0 * reach, s * 1.6, -9.4 + 2.0 * reach]) * ku
                wr = el + np.array([1.0 + 7.0 * reach, s * 0.4, -8.0 + 3.0 * reach]) * kf
                wr[2] = max(wr[2], 2.2)
            return el, wr
        return self.fire_arm(a, side, key, t)

    def fire_arm(self, a, side, key, frame):
        return self.arm_pose(a, side, key, "swim", 0)

    # -- assembly
    def assemble(self, c, hz, Rt, feet, mode, t, lit=True, knees=None, lean=0.0, tilt=None):
        for i, s in enumerate((1, -1)):
            hip = np.array([self.hip_x, s * self.hip_w, hz])
            self.leg(c, hip, feet[i], None if knees is None else knees[i], lit)
        a = self.torso(c, np.array([self.hip_x, 0.0, hz]), Rt, lit, mode, t)
        a["R"] = Rt
        if "neck0" in a:
            capsule(c, a["neck0"], a["neck1"], self.neck_r, self.neck_r * 0.85, self.neck_mat)
        tl = self.head_tilt(mode, t, lean) if tilt is None else tilt
        self.head(c, a["head"], Rt @ rot_y(tl), lit, mode, t)
        poses = {}
        for s, key in ((-1, "sh_r"), (1, "sh_l")):
            poses[key] = self.arm_pose(a, s, key, mode, t)
            a["_" + key] = poses[key]
        for s, key in ((1, "sh_l"), (-1, "sh_r")):
            el, wr = poses[key]
            self.arm(c, a[key], el, wr, s, Rt, lit, mode, t)
        self.extra(c, a, lit, mode, t)
        return a

    neck_mat = "b_flesh"

    def walk(self, phase: float) -> Cloud:
        c = Cloud()
        w = 2 * math.pi * phase
        hz = self.hip_z - self.bob * 0.6 + self.bob * 0.8 * abs(math.sin(w))
        feet = []
        for s, off in ((1, 0.0), (-1, 0.5)):
            p = 2 * math.pi * ((phase + off) % 1.0)
            fx = -self.stride * math.cos(p) - 0.4
            lift = self.lift * max(0.0, math.sin(p))
            feet.append(np.array([fx, s * self.foot_w, lift]))
        Rt = rot_z(self.sway * math.cos(w)) @ rot_x(self.roll * math.sin(w)) @ rot_y(self.walk_lean)
        self.assemble(c, hz, Rt, feet, "walk", phase, lean=self.walk_lean)
        return c

    def fire(self, frame: int) -> Cloud:
        c = Cloud()
        hz = self.hip_z * (1.0 - 1.6 / 30.0)
        k = self.stride / 8.0
        feet = [np.array([4.6 * k + 1.0, self.foot_w + 1.2, 0.0]), np.array([-5.6 * k, -self.foot_w - 1.2, 0.0])]
        twist, dl = self.fire_body(frame)
        lean = self.fight_lean + dl
        Rt = rot_z(twist) @ rot_y(lean)
        self.assemble(c, hz, Rt, feet, "fire", frame, lean=lean)
        return c

    def swim(self, frame: int) -> Cloud:
        c = Cloud()
        feet = [np.array([0.0, self.foot_w, 0.0]), np.array([0.0, -self.foot_w, 0.0])]
        Rt = rot_y(self.swim_lean)
        self.assemble(c, self.hip_z, Rt, feet, "swim", frame, lean=self.swim_lean)
        return sink(c, self.water_z, self.scale, frame)

    def die_raw(self, frame: int) -> Cloud:
        c = Cloud()
        frac, lean, kx, fx, tilt, _ = DIE[frame]
        L = (self.thigh + self.shin) / 29.6 * self.die_leg
        hz = self.lie_z if frame == 3 else self.hip_z * frac
        feet, knees = [], []
        for s in (1, -1):
            hip = np.array([self.hip_x, s * self.hip_w, hz])
            foot = np.array([fx * L, s * (self.foot_w + 1.2 + 1.0 * frame), 0.0])
            knee = np.array([kx * L, s * (self.hip_w + 0.8), 3.0])
            feet.append(foot)
            knees.append(knee if frame < 3 else (hip + foot) / 2 + np.array([0, 0, 0.6]))
        if frame < 3:
            lean = max(lean, self.walk_lean + 0.12 * (frame + 1))  # a hunched body never straightens to fall
        Rt = rot_y(lean)
        self.assemble(c, hz, Rt, feet, "die", frame, lit=frame < 3, knees=knees, lean=lean, tilt=tilt)
        return c

    def die(self, frame: int) -> Cloud:
        if not hasattr(self, "_die_off"):
            allp = np.concatenate(self.die_raw(3).pts)
            self._die_off = np.array([(allp[:, 0].min() + allp[:, 0].max()) / 2, (allp[:, 1].min() + allp[:, 1].max()) / 2, 0.0])
        c = self.die_raw(frame)
        for p in c.pts:
            p[:, 2] = np.maximum(p[:, 2], 0.35)
        c.pts = [p - self._die_off for p in c.pts]
        return c


# ================================================================ spawnling


class Spawnling(Creature):
    """Dog-sized, hunched: a horizontal barrel body on digitigrade legs, a head
    that is mostly jaws, an amber eye cluster on the crown, two hooked claws."""

    uid = "spawnling"
    scale = STAND * 0.75
    hip_x = -6.0
    hip_z = 21.0
    hip_w = 4.6
    foot_w = 5.2
    thigh, shin = 10.0, 10.5
    stride = 7.0
    lift = 5.0
    bob = 1.6
    walk_lean = 0.42
    fight_lean = 0.4
    swim_lean = 0.36
    water_z = 21.0
    lie_z = 7.0
    sway = 0.12
    ua, fa = 7.0, 6.6
    neck_r = 3.4

    def leg(self, c, hip, foot, knee=None, lit=True):
        hip, foot = np.asarray(hip, float), np.asarray(foot, float)
        hock = foot + np.array([-3.2, 0, 6.0])
        knee = ik(hip, hock, self.thigh, self.shin) if knee is None else np.asarray(knee, float)
        capsule(c, hip, knee, 3.8, 2.6, "b_flesh")
        ellipsoid(c, knee + np.array([0.9, 0, 0]), (1.8, 1.8, 1.8), "b_bone")
        capsule(c, knee, hock, 2.0, 1.4, "b_flesh")
        capsule(c, hock, hock + np.array([-2.4, 0, 1.0]), 0.8, 0.2, "b_bone")  # spur
        capsule(c, hock, foot + np.array([0.8, 0, 1.0]), 1.4, 1.1, "b_bone")
        for k in (-1, 0, 1):
            hook(c, foot + np.array([1.2, k * 1.0, 1.0]), (1.0, k * 0.35, 0.0), (0, 0, -1), 3.0, 0.7, bend=1.3)

    def torso(self, c, hip0, Rt, lit, mode, t):
        T = T_of(hip0, Rt)
        ellipsoid(c, T(-0.6, 0, 3.0), (5.8, 6.4, 6.4), "b_flesh", rot=Rt)  # haunch
        ellipsoid(c, T(0.6, 0, 11.0), (7.0, 7.6, 8.0), "b_flesh", rot=Rt)  # barrel
        ellipsoid(c, T(3.6, 0, 10.0), (4.2, 5.6, 7.2), "b_membrane", rot=Rt)  # belly
        ellipsoid(c, T(0.8, 0, 17.0), (6.6, 8.2, 5.8), "b_flesh", rot=Rt)  # shoulders
        for k in range(6):
            ellipsoid(c, T(-6.6 - 0.2 * (k % 2), 0, 0.6 + k * 3.4), (1.6, 1.3, 1.6), "b_bone", rot=Rt)  # spine knobs
        plate(c, T(-6.6, 0, 11.0), Rt @ np.array([-1.0, 0, 0]), (1.8, 5.2, 5.4))
        # Bone spines over the shoulders, swept up and back.
        for k, (z, ln) in enumerate(((14.0, 9.0), (17.5, 13.0), (21.0, 10.0))):
            b = T(-5.0 + 0.8 * k, 0, z)
            hook(c, b, Rt @ np.array([-0.9, 0, 0.55]), np.array([0, 0, 1.0]), ln, 1.3, bend=0.5)
        for s in (1, -1):
            # Glowing gill seams down the flanks.
            capsule(c, T(1.2, s * 7.4, 8.0), T(2.4, s * 7.2, 13.6), 0.5, mat=g("b_deep", lit))
        return {
            "sh_l": T(3.0, 7.6, 16.0),
            "sh_r": T(3.0, -7.6, 16.0),
            "neck0": T(1.6, 0, 19.0),
            "neck1": T(4.2, 0, 23.4),
            "head": T(5.6, 0, 26.6),
        }

    def head_tilt(self, mode, t, lean):
        if mode == "die":
            return DIE[t][4] - (0.3 if t < 3 else 0.0)
        return -lean - 0.12

    def gape(self, mode, t):
        if mode == "walk":
            return 0.9 + 0.12 * math.sin(2 * math.pi * t)
        if mode == "fire":
            return {0: 0.75, 1: 0.45, 2: 0.75, 3: 0.45}[t]
        if mode == "die":
            return {0: 0.6, 1: 0.7, 2: 0.5, 3: 0.3}[t]
        return 0.35

    def head(self, c, at, Rm, lit, mode, t):
        P = lambda *v: at + Rm @ np.array(v, float)  # noqa: E731
        gp = self.gape(mode, t)
        Rm = Rm * 1.2  # a big head: mostly jaws
        ellipsoid(c, P(-0.6, 0, 1.4), (4.8, 5.6, 4.4), "b_flesh", rot=Rm)  # skull
        # Upper jaw: a broad wedge with a bone lip and a row of teeth.
        Ru = Rm @ rot_y(-gp * 0.25)
        J = lambda *v: at + Rm @ np.array([1.0, 0, 0.4]) + Ru @ np.array(v, float)  # noqa: E731
        ellipsoid(c, J(4.4, 0, 0.4), (5.4, 4.8, 2.4), "b_flesh", rot=Ru)
        capsule(c, J(1.0, 4.6, -0.8), J(8.6, 1.6, -0.9), 0.8, 0.6, "b_bone")
        capsule(c, J(1.0, -4.6, -0.8), J(8.6, -1.6, -0.9), 0.8, 0.6, "b_bone")
        for k in range(5):
            u = k / 4
            for s in (1, -1):
                p = J(1.6 + 6.4 * u, s * (4.4 - 2.6 * u), -1.2)
                capsule(c, p, p + Ru @ np.array([0.2, -s * 0.3, -2.0]), 0.55, 0.15, "b_bone")
        # Lower jaw, dropped by the gape, the dark throat between.
        Rj = Rm @ rot_y(gp)
        Lw = lambda *v: at + Rm @ np.array([0.6, 0, -1.6]) + Rj @ np.array(v, float)  # noqa: E731
        ellipsoid(c, P(3.0, 0, -1.6), (4.2, 3.9, 1.6 + 2.0 * gp), "b_membrane", rot=Rm)
        ellipsoid(c, P(2.6, 0, -1.8), (2.4, 2.2, 0.8 + 1.4 * gp), g("b_deep", lit), rot=Rm)  # throat glow
        ellipsoid(c, Lw(4.0, 0, -0.6), (5.0, 4.2, 1.8), "b_flesh", rot=Rj)
        for k in range(4):
            u = k / 3
            for s in (1, -1):
                p = Lw(1.8 + 5.6 * u, s * (3.6 - 2.0 * u), 0.8)
                capsule(c, p, p + Rj @ np.array([0.2, -s * 0.3, 1.8]), 0.5, 0.15, "b_bone")
        capsule(c, P(-0.6, -4.0, 4.0), P(-0.6, 4.0, 4.0), 1.0, mat="b_bone")  # brow ridge
        eyes(c, at, Rm, [(0.6, 0, 5.4), (1.4, 1.8, 4.8), (1.4, -1.8, 4.8), (2.4, 0.9, 4.2), (2.4, -0.9, 4.2), (-0.4, 2.6, 4.6), (-0.4, -2.6, 4.6)], 0.85, lit)

    def claw_dir(self, el, wr):
        d = wr - el
        return d / max(1e-6, np.linalg.norm(d))

    def arm(self, c, sh, el, wr, side, Rt, lit, mode, t):
        ellipsoid(c, sh, (3.0, 3.0, 3.0), "b_flesh")
        capsule(c, sh, el, 2.6, 1.9, "b_flesh")
        capsule(c, el, el + np.array([-2.4, side * 0.4, 1.2]), 0.9, 0.2, "b_bone")  # elbow spur
        capsule(c, el, wr, 1.9, 1.6, "b_flesh")
        f = self.claw_dir(el, wr)
        if mode in ("walk", "swim") or (mode == "fire" and t in (1, 3)):
            f = np.array([0.1, side * 0.15, 1.0])  # raised sickles, curling forward and down
        curl = np.array([1.0, 0, -1.0]) if mode != "die" or t < 3 else np.array([0, -side * 1.0, 0])
        ellipsoid(c, wr, (2.0, 2.0, 2.0), "b_bone")
        hook(c, wr, f, curl, 13.0, 1.9, bend=1.9 if mode in ("fire", "die") else 1.05)
        hook(c, wr + np.array([0, side * 0.9, -0.6]), f + np.array([0, side * 0.3, -0.2]), curl, 6.0, 0.9, bend=1.8)

    def arm_pose(self, a, side, key, mode, t):
        sh = a[key]
        s = side
        if mode == "walk":
            k = math.cos(2 * math.pi * t) * (1 if s > 0 else -1)
            el = sh + np.array([-0.6 + 1.0 * k, s * 3.0, 1.0])
            wr = el + np.array([0.4 + 0.6 * k, s * 1.4, 9.0])
            return el, wr
        if mode == "swim":
            el = sh + np.array([-0.6, s * 3.0, 1.0])
            wr = el + np.array([0.4, s * 1.4, 9.0])
            return el, wr
        return super().arm_pose(a, side, key, mode, t)

    def fire_body(self, frame):
        return {0: -0.40, 1: -0.08, 2: 0.40, 3: 0.08}[frame], 0.0

    def fire_arm(self, a, side, key, frame):
        sh = a[key]
        s = side
        lead = {0: 1, 2: -1}.get(frame, 0)
        if s == lead:
            # The slash: the claw swept out and across the front, low.
            el = sh + np.array([6.2, s * 2.2, -1.6])
            wr = el + np.array([6.0, -s * 5.8, -2.4])
            return el, wr
        el = sh + np.array([1.8, s * 1.2, -5.2])
        wr = el + np.array([4.8, -s * 0.6, 4.6])
        if lead:
            el = el + np.array([-1.6, s * 0.6, 0.6])
            wr = wr + np.array([-2.0, s * 0.4, 0.8])
        return el, wr


# ================================================================ gobber


class Gobber(Creature):
    """Lanky: long thin legs, a gaunt ribcage, a long craning neck, a throat
    sac under the jaw that swells before each spit."""

    uid = "gobber"
    hip_x = -3.6
    hip_z = 33.0
    hip_w = 4.4
    foot_w = 4.8
    thigh, shin = 17.0, 16.6
    stride = 8.6
    lift = 5.6
    walk_lean = 0.2
    fight_lean = 0.12
    water_z = 40.0
    lie_z = 5.0
    ua, fa = 12.0, 11.0
    arm_swing = 0.45
    fa_bend = 0.45
    neck_r = 2.0

    def leg(self, c, hip, foot, knee=None, lit=True):
        hip, foot = np.asarray(hip, float), np.asarray(foot, float)
        ankle = foot + np.array([0, 0, 2.6])
        knee = ik(hip, ankle, self.thigh, self.shin) if knee is None else np.asarray(knee, float)
        capsule(c, hip, knee, 2.7, 1.8, "b_flesh")
        ellipsoid(c, knee + np.array([0.8, 0, 0.2]), (1.8, 1.8, 2.0), "b_bone")
        capsule(c, knee, ankle, 1.5, 1.1, "b_flesh")
        capsule(c, knee + np.array([0.7, 0, -1.4]), ankle + np.array([0.6, 0, 2.6]), 0.8, 0.5, "b_bone")
        capsule(c, ankle, ankle + np.array([-2.6, 0, -1.6]), 0.8, 0.25, "b_bone")
        for k in (-1, 0, 1):
            hook(c, ankle, (1.0, k * 0.4, -0.45), (0, 0, -1), 5.0, 0.75, bend=0.7)

    def swell(self, mode, t):
        if mode == "walk":
            return 1.0 + 0.1 * math.sin(2 * math.pi * t)
        if mode == "fire":
            return {0: 1.45, 1: 1.8, 2: 0.85, 3: 0.75}[t]
        if mode == "die":
            return {0: 1.1, 1: 0.95, 2: 0.85, 3: 0.75}[t]
        return 1.0

    def torso(self, c, hip0, Rt, lit, mode, t):
        T = T_of(hip0, Rt)
        ellipsoid(c, T(0, 0, 1.4), (3.4, 4.8, 3.2), "b_flesh", rot=Rt)  # pelvis
        chain(c, [T(-1.8, 0, 1.0), T(-2.4, 0, 8.0), T(-2.0, 0, 13.0)], 1.5, 1.3, "b_bone")  # spine
        ellipsoid(c, T(0.4, 0, 7.0), (2.6, 3.4, 4.2), "b_membrane", rot=Rt)  # thin belly
        ellipsoid(c, T(0.2, 0, 16.0), (4.6, 5.8, 7.2), "b_flesh", rot=Rt)  # ribcage
        for k in range(4):
            z = 11.6 + k * 2.4
            for s in (1, -1):
                chain(c, bez(T(-3.0, s * 3.4, z + 1.0), T(3.6, s * 6.6, z), T(4.6, s * 1.0, z - 1.4), 5), 0.55, 0.45, "b_bone")
        plate(c, T(-4.4, 0, 17.0), Rt @ np.array([-1.0, 0, 0.1]), (1.6, 4.6, 6.0))
        ellipsoid(c, T(0.4, 0, 22.4), (3.4, 6.8, 2.6), "b_flesh", rot=Rt)  # collar
        for s in (1, -1):
            ellipsoid(c, T(0.4, s * 6.6, 22.6), (2.4, 2.2, 2.4), "b_bone", rot=Rt)
        return {
            "sh_l": T(0.4, 6.8, 22.0),
            "sh_r": T(0.4, -6.8, 22.0),
            "neck0": T(1.4, 0, 23.0),
            "neck1": T(4.8, 0, 29.6),
            "head": T(7.0, 0, 32.0),
        }

    def head_tilt(self, mode, t, lean):
        if mode == "fire":
            return {0: -0.05, 1: 0.18, 2: -0.38, 3: -0.22}[t] - lean
        if mode == "die":
            return DIE[t][4]
        return -lean * 0.95 - 0.1

    def head(self, c, at, Rm, lit, mode, t):
        P = lambda *v: at + Rm @ np.array(v, float)  # noqa: E731
        gp = 0.75 if mode == "fire" and t == 2 else 0.4 if mode == "fire" and t == 3 else 0.12
        ellipsoid(c, P(0, 0, 0.4), (4.4, 3.2, 3.0), "b_flesh", rot=Rm)  # skull
        ellipsoid(c, P(4.0, 0, -0.4), (3.2, 2.2, 1.8), "b_flesh", rot=Rm)  # snout
        chain(c, [P(-1.6, 0, 2.8), P(-4.8, 0, 3.8), P(-7.2, 0, 2.6)], 1.1, 0.3, "b_bone")  # crest
        for s in (1, -1):
            capsule(c, P(2.0, s * 2.6, 0.4), P(-2.2, s * 2.8, 1.8), 0.7, 0.4, "b_bone")  # cheek bones
        Rj = Rm @ rot_y(gp)
        ellipsoid(c, P(0.6, 0, -1.6) + Rj @ np.array([3.2, 0, -0.6]), (3.4, 2.0, 0.9), "b_flesh", rot=Rj)
        if gp > 0.3:
            ellipsoid(c, P(3.6, 0, -1.6 - gp), (2.4, 1.6, 0.6 + gp * 1.6), g("b_deep", lit), rot=Rm)
        eyes(c, at, Rm, [(2.8, 2.1, 1.2), (2.8, -2.1, 1.2), (3.8, 1.3, 1.6), (3.8, -1.3, 1.6)], 0.7, lit, hot_every=2)
        sw = self.swell(mode, t)
        sac(c, P(0.4, 0, -2.2 - 2.0 * sw), np.array([2.8, 2.6, 2.4]) * sw, lit, Rm=Rm)

    def arm(self, c, sh, el, wr, side, Rt, lit, mode, t):
        capsule(c, sh, el, 1.8, 1.3, "b_flesh")
        ellipsoid(c, el, (1.4, 1.4, 1.4), "b_bone")
        capsule(c, el, wr, 1.3, 1.0, "b_flesh")
        d = wr - el
        d = d / max(1e-6, np.linalg.norm(d))
        side_v = np.cross(np.array([0, 0, 1.0]), d)
        side_v = side_v / max(1e-6, np.linalg.norm(side_v))
        for k in (-1, 0, 1):
            hook(c, wr + side_v * k * 0.6, d + side_v * k * 0.25, np.array([0, 0, -1.0]) - d * 0.3, 4.2, 0.55, bend=1.0)

    def fire_body(self, frame):
        return 0.0, {0: -0.02, 1: -0.10, 2: 0.16, 3: 0.08}[frame]

    def fire_arm(self, a, side, key, frame):
        sh = a[key]
        s = side
        back = {0: 0.4, 1: 0.8, 2: 1.0, 3: 0.6}[frame]
        el = sh + np.array([-1.6 - 2.0 * back, s * (2.6 + 1.4 * back), -10.6])
        wr = el + np.array([2.6 - 1.6 * back, s * (1.6 + 1.0 * back), -9.6])
        return el, wr

    def extra(self, c, a, lit, mode, t):
        if mode != "fire" or t < 2:
            return
        Rm = a["R"] @ rot_y(self.head_tilt(mode, t, self.fight_lean + self.fire_body(t)[1]))
        mouth = a["head"] + Rm @ np.array([7.2, 0, -1.2])
        f = Rm @ np.array([1.0, 0, 0])
        if t == 2:
            flash_star(c, mouth, f, 0.95, spin=0.3)
            glob(c, mouth + f * 5.0, 1.8)
        else:
            flash_star(c, mouth, f, 0.35, spin=1.1)
            glob(c, mouth + f * 12.0 + np.array([0, 0, -0.6]), 1.6)


# ================================================================ quillback


class Quillback(Creature):
    """Squat and broad: thick short legs, a wide body whose back is a dense bed
    of quills, a low wide head, a launcher hump on the right shoulder."""

    uid = "quillback"
    hip_z = 17.5
    hip_w = 7.4
    foot_w = 8.2
    thigh, shin = 9.6, 9.2
    stride = 6.0
    lift = 3.8
    bob = 1.0
    walk_lean = 0.42
    fight_lean = 0.36
    water_z = 21.0
    lie_z = 9.0
    sway = 0.14
    ua, fa = 9.0, 8.0
    arm_swing = 0.5

    def leg(self, c, hip, foot, knee=None, lit=True):
        hip, foot = np.asarray(hip, float), np.asarray(foot, float)
        ankle = foot + np.array([0, 0, 3.0])
        knee = ik(hip, ankle, self.thigh, self.shin) if knee is None else np.asarray(knee, float)
        capsule(c, hip, knee, 4.8, 3.6, "b_flesh")
        ellipsoid(c, knee + np.array([1.4, 0, 0.4]), (2.8, 3.2, 3.0), "b_bone")
        capsule(c, knee, ankle, 3.2, 2.6, "b_flesh")
        capsule(c, knee + np.array([1.0, 0, -1.6]), ankle + np.array([1.4, 0, 2.0]), 2.0, 1.6, "b_bone")
        ellipsoid(c, foot + np.array([1.2, 0, 1.7]), (4.0, 3.2, 1.8), "b_flesh")
        for k in (-1, 0, 1):
            hook(c, foot + np.array([3.8, k * 1.4, 1.5]), (1.0, k * 0.2, 0.0), (0, 0, -1), 2.8, 0.9, bend=1.1)

    def flex(self, mode, t):
        if mode == "fire":
            return {0: 1.14, 1: 0.9, 2: 1.12, 3: 0.95}[t]
        if mode == "walk":
            return 1.0 + 0.03 * math.sin(2 * math.pi * t)
        return 1.0

    def torso(self, c, hip0, Rt, lit, mode, t):
        T = T_of(hip0, Rt)
        ellipsoid(c, T(0, 0, 2.0), (5.8, 8.0, 4.6), "b_flesh", rot=Rt)  # pelvis
        ctr = T(0, 0, 12.0)
        rad = np.array([9.0, 12.6, 9.6])
        ellipsoid(c, ctr, rad, "b_flesh", rot=Rt)  # body
        ellipsoid(c, T(3.8, 0, 9.0), (5.6, 8.6, 7.4), "b_membrane", rot=Rt)  # belly
        ellipsoid(c, T(7.6, 0, 13.0), (1.6, 7.0, 5.6), "b_bone", rot=Rt @ rot_y(-0.2))  # chest plate
        plate(c, T(4.4, 0, 20.6), Rt @ np.array([0.45, 0, 1.0]), (1.6, 6.8, 4.0))
        # The quill bed: a dense fan over the back, swept back and up.
        rng = np.random.default_rng(11)
        for i, th in enumerate(np.linspace(-0.05, 1.75, 9)):
            for j, ph in enumerate(np.linspace(-1.05, 1.05, 9)):
                ph2 = ph + (0.06 if i % 2 else -0.06)
                d = np.array([-math.sin(th) * math.cos(ph2), math.sin(ph2), math.cos(th) * math.cos(ph2)])
                d = d / np.linalg.norm(d)
                base = ctr + Rt @ (d * rad * 0.9)
                q = Rt @ (d + np.array([-0.55, 0, 0.3]))
                q = q / np.linalg.norm(q)
                ln = 8.0 + 4.0 * rng.random() - 2.0 * abs(ph)
                ellipsoid(c, base, (1.0, 1.0, 1.0), "b_membrane")
                capsule(c, base, base + q * ln, 0.62, 0.14, "b_bone")
        # The launcher hump on the right shoulder, flexing when it fires.
        k = self.flex(mode, t)
        hp = T(1.4, -9.4, 21.0)
        ellipsoid(c, hp, np.array([5.4, 4.8, 5.4]) * k, "b_flesh", rot=Rt)
        ellipsoid(c, hp + Rt @ np.array([-1.0, -2.0, 2.2]) * k, np.array([3.4, 2.6, 3.0]) * k, "b_flesh", rot=Rt)
        for q in range(5):
            b = hp + Rt @ (np.array([-2.6 + q * 0.9, -1.0 - 0.6 * q, 4.6]) * k)
            capsule(c, b, b + Rt @ np.array([-2.8, -0.6, 3.2]), 0.5, 0.12, "b_bone")
        fdir = np.array([1.0, 0, 0.06])
        mouth = hp + Rt @ np.array([5.0 * k, 0, 1.0])
        Rm = along(fdir)
        ellipsoid(c, mouth, (1.0, 2.6, 2.6), "b_bone", rot=Rm)
        ellipsoid(c, mouth + fdir * 0.6, (0.7, 1.8, 1.8), g("b_sac", lit), rot=Rm)
        for dy, dz in ((0.8, 0.6), (-0.8, 0.2), (0.0, -0.8)):
            p = mouth + np.array([0.0, dy, dz])
            capsule(c, p, p + fdir * 1.8, 0.35, 0.1, "b_bone")
        return {
            "sh_l": T(2.6, 10.4, 15.0),
            "sh_r": T(2.6, -10.4, 15.0),
            "head": T(9.0, 0, 15.4),
            "mouth": mouth,
            "fdir": fdir,
        }

    def head_tilt(self, mode, t, lean):
        if mode == "die":
            return DIE[t][4]
        return -lean * 0.9

    def head(self, c, at, Rm, lit, mode, t):
        P = lambda *v: at + Rm @ np.array(v, float)  # noqa: E731
        ellipsoid(c, P(0, 0, 0), (4.0, 4.8, 3.4), "b_flesh", rot=Rm)
        ellipsoid(c, P(1.6, 0, 2.0), (2.6, 4.4, 1.2), "b_bone", rot=Rm)  # brow plate
        ellipsoid(c, P(2.8, 0, -1.6), (2.0, 3.0, 1.0), "b_membrane", rot=Rm)  # mouth
        for s in (1, -1):
            hook(c, P(3.0, s * 2.4, -1.4), Rm @ np.array([1.0, -s * 0.2, -0.2]), Rm @ np.array([0, -s * 1.0, 0]), 4.2, 0.8, bend=1.4)
        eyes(c, at, Rm, [(3.4, 1.8, 0.8), (3.4, -1.8, 0.8), (3.0, 3.0, 1.2), (3.0, -3.0, 1.2)], 0.7, lit, hot_every=2)

    def arm(self, c, sh, el, wr, side, Rt, lit, mode, t):
        ellipsoid(c, sh, (3.4, 3.4, 3.4), "b_flesh")
        capsule(c, sh, el, 3.2, 2.7, "b_flesh")
        ellipsoid(c, el, (2.6, 2.6, 2.6), "b_bone")
        capsule(c, el, wr, 2.7, 3.0, "b_flesh")
        d = wr - el
        d = d / max(1e-6, np.linalg.norm(d))
        sv = np.cross(np.array([0, 0, 1.0]), d)
        sv = sv / max(1e-6, np.linalg.norm(sv))
        for k in (-1, 0, 1):
            hook(c, wr + d * 1.4 + sv * k * 1.4, d + sv * k * 0.2, np.array([0, 0, -1.0]), 3.0, 0.9, bend=1.2)

    def fire_body(self, frame):
        return {0: 0.06, 1: 0.0, 2: 0.06, 3: 0.0}[frame], {0: -0.04, 1: 0.02, 2: -0.04, 3: 0.02}[frame]

    def fire_arm(self, a, side, key, frame):
        sh = a[key]
        s = side
        el = sh + np.array([3.4, s * 1.6, -7.6])
        wr = el + np.array([6.4, -s * 0.8, -2.6])
        return el, wr

    def extra(self, c, a, lit, mode, t):
        if mode != "fire":
            return
        f = a["fdir"] / np.linalg.norm(a["fdir"])
        s = {0: 1.0, 1: 0.55, 2: 0.95, 3: 0.3}[t]
        flash_star(c, a["mouth"] + f * 1.2, f, s, spin=t * 0.7)
        # Quills in flight ahead of the hump.
        n = {0: 3, 1: 2, 2: 3, 3: 1}[t]
        for q in range(n):
            off = 6.0 + q * 4.6 + (1.6 if t % 2 else 0.0)
            p = a["mouth"] + f * (off + 4.0 * s) + np.array([0, (q - 1) * 1.2, (q % 2) * 0.9])
            capsule(c, p, p + f * 3.0, 0.4, 0.12, "b_bone")


# ================================================================ bloater


class Bloater(Creature):
    """Bloated and waddling: a huge belly on stumpy legs, a small head low on
    the front, glowing acid sacs in a bone cradle on its back."""

    uid = "bloater"
    hip_z = 15.5
    hip_w = 7.6
    foot_w = 8.6
    thigh, shin = 8.6, 8.2
    stride = 4.8
    lift = 3.2
    bob = 0.8
    walk_lean = 0.12
    fight_lean = 0.06
    water_z = 24.0
    lie_z = 11.0
    sway = 0.06
    roll = 0.13
    ua, fa = 8.6, 8.0
    arm_swing = 0.45

    def leg(self, c, hip, foot, knee=None, lit=True):
        hip, foot = np.asarray(hip, float), np.asarray(foot, float)
        ankle = foot + np.array([0, 0, 3.0])
        knee = ik(hip, ankle, self.thigh, self.shin) if knee is None else np.asarray(knee, float)
        capsule(c, hip, knee, 5.0, 4.0, "b_flesh")
        capsule(c, knee, ankle, 3.6, 3.0, "b_flesh")
        ellipsoid(c, knee + np.array([1.6, 0, 0.2]), (2.4, 3.0, 2.6), "b_bone")
        ellipsoid(c, foot + np.array([1.0, 0, 1.8]), (4.2, 3.6, 2.0), "b_flesh")
        for k in (-1, 0, 1):
            hook(c, foot + np.array([3.8, k * 1.6, 1.4]), (1.0, k * 0.25, 0.0), (0, 0, -1), 2.4, 0.9, bend=1.0)

    def carried(self, mode, t):
        """Is the top sac in the hand (fire frames 0-2) rather than on the back?"""
        return mode == "fire" and t in (0, 1, 2)

    def torso(self, c, hip0, Rt, lit, mode, t):
        T = T_of(hip0, Rt)
        ellipsoid(c, T(0, 0, 2.0), (6.0, 8.4, 4.6), "b_flesh", rot=Rt)  # pelvis
        ellipsoid(c, T(1.8, 0, 12.4), (12.4, 13.4, 12.0), "b_flesh", rot=Rt)  # belly
        ellipsoid(c, T(6.2, 0, 7.0), (6.6, 9.4, 6.6), "b_membrane", rot=Rt)  # stretched underbelly
        for s in (1, -1):
            # Glowing veins on the stretched skin.
            chain(c, bez(T(9.6, s * 2.0, 18.0), T(12.6, s * 6.6, 12.0), T(10.0, s * 9.4, 4.0), 6), 0.45, 0.35, g("b_deep", lit))
        ellipsoid(c, T(2.8, 0, 22.4), (6.6, 9.4, 5.4), "b_flesh", rot=Rt)  # shoulders
        plate(c, T(2.6, 0, 27.0), Rt @ np.array([0.15, 0, 1.0]), (1.5, 7.0, 4.4))
        # Bone cradle arching over the back.
        for y in (-7.0, 0.0, 7.0):
            chain(c, bez(T(-6.0, y, 4.0), T(-18.0, y * 1.1, 16.0), T(-4.0, y * 0.8, 30.0), 8), 1.0, 0.8, "b_bone")
        sac(c, T(-12.2, -5.8, 13.6), (4.6, 4.4, 5.0), lit, Rm=Rt)
        sac(c, T(-12.2, 5.8, 13.6), (4.6, 4.4, 5.0), lit, Rm=Rt)
        if not self.carried(mode, t):
            sac(c, T(-10.4, 0, 23.6), (4.8, 5.0, 5.2), lit, Rm=Rt)
        else:
            ellipsoid(c, T(-9.0, 0, 22.6), (2.6, 3.0, 2.6), "b_membrane", rot=Rt)  # the empty socket
        return {
            "sh_l": T(2.8, 10.6, 21.4),
            "sh_r": T(2.8, -10.6, 21.4),
            "head": T(11.6, 0, 23.4),
        }

    def head_tilt(self, mode, t, lean):
        if mode == "die":
            return DIE[t][4]
        return -lean * 0.8

    def head(self, c, at, Rm, lit, mode, t):
        P = lambda *v: at + Rm @ np.array(v, float)  # noqa: E731
        ellipsoid(c, P(0, 0, 0), (3.8, 4.4, 3.4), "b_flesh", rot=Rm)
        ellipsoid(c, P(2.6, 0, -1.4), (1.6, 3.4, 1.0), "b_membrane", rot=Rm)  # wide mouth
        capsule(c, P(1.0, -3.2, 2.0), P(1.0, 3.2, 2.0), 0.9, mat="b_bone")  # brow
        ellipsoid(c, P(3.0, 0.6, -2.6), (0.6, 0.6, 1.0), g("b_amber", lit), rot=Rm)  # acid drool
        eyes(c, at, Rm, [(3.0, 1.6, 0.6), (3.0, -1.6, 0.6), (3.2, 0, 1.0)], 0.7, lit, hot_every=3)

    def arm(self, c, sh, el, wr, side, Rt, lit, mode, t):
        ellipsoid(c, sh, (3.4, 3.4, 3.4), "b_flesh")
        capsule(c, sh, el, 3.2, 2.6, "b_flesh")
        ellipsoid(c, el, (2.4, 2.4, 2.4), "b_bone")
        capsule(c, el, wr, 2.6, 2.4, "b_flesh")
        d = wr - el
        d = d / max(1e-6, np.linalg.norm(d))
        sv = np.cross(np.array([0, 0, 1.0]), d)
        sv = sv / max(1e-6, np.linalg.norm(sv))
        for k in (-1, 0, 1):
            hook(c, wr + d * 1.2 + sv * k * 1.2, d + sv * k * 0.2, -d * 0.2 + np.array([0, 0, -1.0]), 3.0, 0.8, bend=1.4)
        if side < 0 and self.carried(mode, t):
            sac(c, wr + d * 3.0, (3.4, 3.4, 3.6), lit)

    def fire_body(self, frame):
        return {0: -0.12, 1: -0.38, 2: 0.30, 3: 0.40}[frame], {0: -0.06, 1: -0.14, 2: 0.18, 3: 0.24}[frame]

    def fire_arm(self, a, side, key, frame):
        sh = a[key]
        s = side
        if s < 0:
            el, d = {
                0: (np.array([-2.6, -0.8, 2.2]), np.array([-4.4, 1.8, 0.8])),  # reach back for a sac
                1: (np.array([-4.6, -0.8, 6.0]), np.array([-2.6, 0.0, 7.2])),  # cocked overhead
                2: (np.array([3.6, -0.6, 7.2]), np.array([6.4, 0.8, 3.0])),  # release
                3: (np.array([6.4, -1.6, -3.0]), np.array([7.2, 2.0, -3.4])),  # follow through
            }[frame]
            el = sh + el
            return el, el + d
        el = sh + np.array([4.0, 2.4, -6.4])
        return el, el + np.array([6.0, -1.0, 1.2])

    def extra(self, c, a, lit, mode, t):
        if mode == "fire" and t == 3:
            sac(c, np.array([24.0, -5.0, 44.0]), (3.6, 3.6, 3.8), lit)
            for k in range(3):
                ellipsoid(c, np.array([19.0 - k * 3.2, -5.0, 41.0 - k * 2.2]), (0.7 - 0.15 * k,) * 3, "b_amber")


# ================================================================ longspine


class Longspine(Creature):
    """Gaunt and very tall: stilt legs, a narrow ribcage, a narrow skull with
    many small eyes, the right arm a long bone spine launcher."""

    uid = "longspine"
    hip_z = 39.0
    hip_w = 4.4
    foot_w = 4.8
    thigh, shin = 20.0, 19.6
    stride = 9.0
    lift = 5.6
    walk_lean = 0.22
    fight_lean = 0.10
    water_z = 46.0
    lie_z = 5.0
    ua, fa = 12.0, 9.5
    arm_swing = 0.5
    neck_r = 1.6
    SPINE = 18.0
    die_leg = 0.6
    fa_bend = 0.5

    def leg(self, c, hip, foot, knee=None, lit=True):
        hip, foot = np.asarray(hip, float), np.asarray(foot, float)
        ankle = foot + np.array([0, 0, 2.6])
        knee = ik(hip, ankle, self.thigh, self.shin) if knee is None else np.asarray(knee, float)
        capsule(c, hip, knee, 2.5, 1.6, "b_flesh")
        ellipsoid(c, knee + np.array([0.8, 0, 0.2]), (1.6, 1.6, 1.8), "b_bone")
        capsule(c, knee, knee + np.array([-2.6, 0, 1.8]), 0.8, 0.2, "b_bone")  # knee spike
        capsule(c, knee, ankle, 1.4, 1.0, "b_flesh")
        capsule(c, knee + np.array([0.6, 0, -1.4]), ankle + np.array([0.5, 0, 2.8]), 0.7, 0.45, "b_bone")
        capsule(c, ankle, ankle + np.array([-2.4, 0, -1.6]), 0.7, 0.2, "b_bone")
        for k in (-1, 1):
            hook(c, ankle, (1.0, k * 0.35, -0.4), (0, 0, -1), 5.0, 0.7, bend=0.7)

    def torso(self, c, hip0, Rt, lit, mode, t):
        T = T_of(hip0, Rt)
        ellipsoid(c, T(0, 0, 1.2), (3.0, 4.4, 3.0), "b_flesh", rot=Rt)
        chain(c, [T(-1.4, 0, 1.0), T(-2.0, 0, 8.0), T(-1.8, 0, 14.0)], 1.4, 1.2, "b_bone")
        ellipsoid(c, T(0.2, 0, 7.0), (2.2, 3.0, 3.6), "b_membrane", rot=Rt)
        ellipsoid(c, T(0, 0, 15.6), (3.8, 5.4, 7.2), "b_flesh", rot=Rt)
        for k in range(5):
            z = 10.6 + k * 2.2
            for s in (1, -1):
                chain(c, bez(T(-2.6, s * 3.2, z + 1.0), T(3.2, s * 6.0, z), T(3.8, s * 0.8, z - 1.4), 5), 0.5, 0.4, "b_bone")
        plate(c, T(-3.8, 0, 16.6), Rt @ np.array([-1.0, 0, 0.1]), (1.4, 4.4, 5.8))
        ellipsoid(c, T(0.2, 0, 22.0), (2.4, 6.6, 1.8), "b_bone", rot=Rt)  # shoulder girdle
        return {
            "sh_l": T(0.2, 6.6, 21.8),
            "sh_r": T(0.2, -6.6, 21.8),
            "neck0": T(1.0, 0, 22.8),
            "neck1": T(2.6, 0, 26.4),
            "head": T(3.6, 0, 29.0),
        }

    def head_tilt(self, mode, t, lean):
        if mode == "die":
            return DIE[t][4]
        return -lean - 0.05

    def head(self, c, at, Rm, lit, mode, t):
        P = lambda *v: at + Rm @ np.array(v, float)  # noqa: E731
        ellipsoid(c, P(0, 0, 0.6), (3.4, 2.8, 4.0), "b_flesh", rot=Rm)
        ellipsoid(c, P(2.0, 0, -2.6), (2.2, 2.0, 1.4), "b_flesh", rot=Rm)  # jaw
        for k, (y, z) in enumerate(((0, 4.0), (1.4, 3.4), (-1.4, 3.4))):
            hook(c, P(-1.0, y, z), Rm @ np.array([-0.8, y * 0.2, 1.0]), Rm @ np.array([-1.0, 0, 0]), 4.4 - 0.8 * (k > 0), 0.8, bend=1.0)
        ofs = []
        for z in (0.2, 1.4, 2.4):
            for y in (-1.8, -0.9, 0.0, 0.9, 1.8):
                if z == 2.4 and abs(y) > 1.0:
                    continue
                ofs.append((3.0 - 0.3 * abs(y), y, z))
        eyes(c, at, Rm, ofs, 0.52, lit, hot_every=4)

    def spine_dir(self, mode, t):
        if mode == "fire":
            return np.array([1.0, 0.02, 0.0])
        if mode == "walk":
            k = math.sin(2 * math.pi * t) * 0.06
            return np.array([0.86, 0.0, -0.5 + k])
        return np.array([0.9, 0.0, -0.44])

    def arm(self, c, sh, el, wr, side, Rt, lit, mode, t):
        ellipsoid(c, sh, (2.2, 2.2, 2.2), "b_bone")
        capsule(c, sh, el, 1.9, 1.4, "b_flesh")
        ellipsoid(c, el, (1.5, 1.5, 1.5), "b_bone")
        if side > 0:
            capsule(c, el, wr, 1.4, 1.0, "b_flesh")
            d = wr - el
            d = d / max(1e-6, np.linalg.norm(d))
            for k in (-1, 0, 1):
                hook(c, wr, d + np.array([0, k * 0.3, 0]), np.array([0, 0, -1.0]), 4.0, 0.5, bend=1.2)
            return
        # The spine launcher: a swollen forearm, a gland, a long tapering bone.
        d = self.spine_dir(mode, t) if mode != "die" else np.array([0.35, -0.25, -1.0])
        if mode == "die" and t == 3:
            d = np.array([-0.3, -0.95, 0.0])  # flung out to the side, along the dirt
        d = d / np.linalg.norm(d)
        capsule(c, el, wr, 1.8, 2.6, "b_flesh")
        sac(c, wr + np.array([0, 0, 1.6]) - d * 1.4, (2.0, 1.8, 1.8), lit, veins=2)
        L = self.SPINE
        tip = wr + d * L
        capsule(c, wr, tip, 1.6, 0.45, "b_bone")
        for k in range(1, 5):
            p = wr + d * (L * k / 5.6)
            ellipsoid(c, p, (0.9, 1.9 - 0.25 * k, 1.9 - 0.25 * k), "b_bone", rot=along(d))
        ellipsoid(c, tip, (0.7, 0.7, 0.7), g("b_amber", lit))

    def arm_pose(self, a, side, key, mode, t):
        sh = a[key]
        s = side
        if s < 0 and mode in ("walk", "swim"):
            el = sh + np.array([1.8, s * 0.6, -11.2])
            return el, el + self.spine_dir(mode, t) * self.fa
        return super().arm_pose(a, side, key, mode, t)

    def fire_arm(self, a, side, key, frame):
        sh = a[key]
        recoil = {0: 0.0, 1: 1.2, 2: 0.5, 3: 0.2}[frame]
        if side < 0:
            el = sh + np.array([3.8 - recoil, -0.4, -7.8])
            return el, el + self.spine_dir("fire", frame) * self.fa
        # Left hand braces the launcher under the gland.
        _, wr_r = a["_sh_r"]
        el = sh + np.array([3.6, -1.6, -9.4])
        return el, wr_r + np.array([2.6, 1.6, -1.4])

    def extra(self, c, a, lit, mode, t):
        if mode != "fire":
            return
        s = {0: 0.85, 1: 0.45, 2: 0.0, 3: 0.0}[t]
        if s:
            _, wr = a["_sh_r"]
            d = self.spine_dir(mode, t)
            d = d / np.linalg.norm(d)
            flash_star(c, wr + d * (self.SPINE + 0.6), d, s, spin=t * 0.5)


# ================================================================ mender


class Mender(Creature):
    """Delicate: slender pale translucent limbs, a glowing organ in the chest,
    a bulbous dome head, four long feelers trailing amber threads."""

    uid = "mender"
    hip_x = -2.6
    hip_z = 27.0
    hip_w = 4.0
    foot_w = 4.6
    thigh, shin = 13.6, 13.4
    stride = 6.6
    lift = 4.0
    bob = 1.0
    walk_lean = 0.30
    fight_lean = 0.2
    water_z = 33.0
    lie_z = 5.0
    ua, fa = 8.0, 7.6
    arm_swing = 0.3
    neck_r = 1.4
    neck_mat = "b_pale"

    def leg(self, c, hip, foot, knee=None, lit=True):
        hip, foot = np.asarray(hip, float), np.asarray(foot, float)
        ankle = foot + np.array([0, 0, 2.2])
        knee = ik(hip, ankle, self.thigh, self.shin) if knee is None else np.asarray(knee, float)
        capsule(c, hip, knee, 2.2, 1.5, "b_pale")
        ellipsoid(c, knee, (1.4, 1.4, 1.4), "b_pale")
        capsule(c, knee, ankle, 1.3, 0.9, "b_pale")
        for k in (-1, 0, 1):
            hook(c, ankle, (1.0, k * 0.4, -0.4), (0, 0, -1), 3.4, 0.55, mat="b_pale", bend=0.8)

    def torso(self, c, hip0, Rt, lit, mode, t):
        T = T_of(hip0, Rt)
        ellipsoid(c, T(0, 0, 1.2), (2.8, 4.0, 2.8), "b_pale", rot=Rt)
        chain(c, [T(0, 0, 2.0), T(0.4, 0, 6.0), T(0.2, 0, 9.0)], 1.8, 2.2, "b_pale")
        ellipsoid(c, T(0.2, 0, 14.0), (3.8, 5.2, 6.4), "b_pale", rot=Rt)
        sac(c, T(2.8, 0, 13.6), (1.8, 2.4, 2.8), lit, Rm=Rt, veins=2)  # the organ glowing through
        plate(c, T(-3.4, 0, 15.0), Rt @ np.array([-1.0, 0, 0.1]), (1.3, 4.2, 5.0))
        return {
            "sh_l": T(0.2, 5.4, 18.8),
            "sh_r": T(0.2, -5.4, 18.8),
            "neck0": T(1.0, 0, 19.8),
            "neck1": T(2.4, 0, 22.4),
            "head": T(3.0, 0, 26.0),
            "fo_l": T(-0.8, 4.8, 19.4),
            "fo_r": T(-0.8, -4.8, 19.4),
        }

    def head_tilt(self, mode, t, lean):
        if mode == "die":
            return DIE[t][4]
        return -lean * 0.8

    def head(self, c, at, Rm, lit, mode, t):
        P = lambda *v: at + Rm @ np.array(v, float)  # noqa: E731
        ellipsoid(c, P(-0.4, 0, 1.0), (4.6, 4.8, 5.0), "b_pale", rot=Rm)  # the dome
        for o in ((-1.0, 2.2, 4.6), (-2.6, -1.6, 4.0), (0.8, -2.6, 4.2), (-3.4, 2.8, 2.2), (1.2, 1.0, 5.2)):
            ellipsoid(c, P(*o), (0.8, 0.8, 0.8), g("b_amber", lit))  # ganglia glowing through
        ellipsoid(c, P(3.0, 0, -2.2), (1.8, 2.4, 1.6), "b_pale", rot=Rm)  # face
        ellipsoid(c, P(4.4, 0, -2.8), (0.6, 1.2, 0.5), "b_membrane", rot=Rm)
        eyes(c, at, Rm, [(3.8, 1.4, -0.9), (3.8, -1.4, -0.9)], 0.65, lit, hot_every=1)
        self._head = (at, Rm)

    def arm(self, c, sh, el, wr, side, Rt, lit, mode, t):
        capsule(c, sh, el, 1.4, 1.0, "b_pale")
        capsule(c, el, wr, 1.0, 0.8, "b_pale")
        d = wr - el
        d = d / max(1e-6, np.linalg.norm(d))
        for k in (-1, 0, 1):
            hook(c, wr, d + np.array([0, k * 0.4, 0]), np.array([0, 0, -1.0]), 3.4, 0.4, mat="b_pale", bend=0.9)

    def arm_pose(self, a, side, key, mode, t):
        sh = a[key]
        s = side
        if mode in ("walk", "swim"):
            k = 0.6 * math.sin(2 * math.pi * t) * s if mode == "walk" else 0.0
            el = sh + np.array([1.6 + k, s * 0.6, -6.6])
            return el, el + np.array([5.4, -s * 2.4, 2.6])
        return super().arm_pose(a, side, key, mode, t)

    def fire_arm(self, a, side, key, frame):
        sh = a[key]
        s = side
        el = sh + np.array([4.0, s * 0.8, -4.6])
        return el, el + np.array([6.0, -s * 1.6, 1.4 + 0.6 * (frame % 2)])

    def feeler(self, c, o, side, idx, lit, mode, t):
        s = side
        o = np.asarray(o, float)
        glow = False
        if mode == "fire":
            reach = {0: 0.8, 1: 1.0, 2: 0.9, 3: 1.0}[t]
            wob = 0.8 * math.sin(t * 1.7 + idx)
            tip = np.array([24.0 * reach - 3.0 * idx, s * (4.0 + 4.0 * idx), 40.0 + 9.0 * idx + wob])
            c1 = o + np.array([2.0, s * 5.0, 6.0])
            c2 = tip + np.array([-8.0, s * 3.0, 5.0])
            glow = True
        elif mode == "die":
            drop = {0: 0.2, 1: 0.5, 2: 0.8, 3: 1.0}[t]
            tip = o + np.array([-12.0 + 6.0 * drop, s * (6.0 + 3.0 * idx), -o[2] * drop - 6.0 * (1 - drop)])
            c1 = o + np.array([-3.0, s * 3.0, 1.0])
            c2 = tip + np.array([2.0, -s * 1.0, 4.0 * (1 - drop)])
        else:
            w = 2 * math.pi * (t if mode == "walk" else t / 8.0)
            wave = 2.0 * math.sin(w + idx * 1.3 + (0 if s > 0 else 1.6))
            tip = o + np.array([-17.0 + 2.0 * idx, s * (5.0 + 2.6 * idx), -13.0 + 4.0 * idx + wave])
            c1 = o + np.array([-4.0, s * 3.0, 2.6])
            c2 = tip + np.array([5.0, -s * 1.0, 5.0 - wave * 0.5])
        pts = bez3(o, c1, c2, tip, 10)
        chain(c, pts, 1.1, 0.35, g("b_sac", lit) if glow else "b_pale")
        thread = [p + np.array([0, 0, 0.9]) for p in pts[2:]]
        chain(c, thread, 0.32, 0.25, g("b_amber", lit))
        ellipsoid(c, tip, (0.9, 0.9, 0.9) if not glow else (1.3, 1.3, 1.3), g("b_hot", lit))
        return tip

    def extra(self, c, a, lit, mode, t):
        at, Rm = self._head
        origins = [
            (at + Rm @ np.array([-1.0, 3.8, 2.2]), 1, 1),
            (at + Rm @ np.array([-1.0, -3.8, 2.2]), -1, 1),
            (a["fo_l"], 1, 0),
            (a["fo_r"], -1, 0),
        ]
        tips = [self.feeler(c, o, s, idx, lit, mode, t) for o, s, idx in origins]
        if mode == "fire":
            # Amber threads spun between the reaching tips, a knot of light ahead.
            knot = np.array([28.0, 0.0, 42.0 + (1.0 if t % 2 else 0.0)])
            for p in tips:
                chain(c, [p, (p + knot) / 2 + np.array([0, 0, 0.8]), knot], 0.3, 0.3, "b_amber")
            ellipsoid(c, knot, (1.4 + 0.4 * (t % 2),) * 3, "b_hot")


CREATURES = {k.uid: k for k in (Spawnling, Gobber, Quillback, Bloater, Longspine, Mender)}


# ================================================================ sheets / runner


def sheets_for(cr: Creature):
    return [
        R.SheetSpec("walk", 8, 0.88, cr.scale, lambda i: cr.walk(i / 8)),
        R.SheetSpec("fire", 4, 0.88, cr.scale, lambda i: cr.fire(i)),
        R.SheetSpec("die", 4, 0.72, cr.scale, lambda i: cr.die(i)),
        R.SheetSpec("swim", 8, WL_Y / CELL, cr.scale, lambda i: cr.swim(i), R.swim_post),
    ]


def render_sheet(spec, rows_only=None):
    clouds = [spec.pose(i) for i in range(spec.frames)]
    rows = []
    for r in range(16) if rows_only is None else rows_only:
        cells = [R.render(cl, r, spec.scale, spec.contact_y) for cl in clouds]
        if spec.post:
            cells = [spec.post(im, i) for i, im in enumerate(cells)]
        rows.append(cells)
    return rows


def labeled_grid(rows, labels, cell=CELL, zoom=1) -> Image.Image:
    lab = 14
    cols = max(len(r) for r in rows)
    out = Image.new("RGB", (cols * cell * zoom + 60, len(rows) * (cell * zoom + 2) + lab), (255, 0, 255))
    d = ImageDraw.Draw(out)
    for i, (cells, name) in enumerate(zip(rows, labels)):
        y = lab + i * (cell * zoom + 2)
        d.text((4, y + cell * zoom // 2), name, fill=(20, 16, 12))
        for j, im in enumerate(cells):
            im2 = im.resize((cell * zoom, cell * zoom), Image.Resampling.NEAREST) if zoom != 1 else im
            out.paste(im2, (60 + j * cell * zoom, y), im2)
    return out


def quick(cr: Creature, names) -> None:
    rows_idx = [0, 4, 8, 12]  # S W N E
    for spec in sheets_for(cr):
        if names and spec.name not in names:
            continue
        R.CLIPPED.clear()
        rows = render_sheet(spec, rows_idx)
        img = labeled_grid(rows, [ENGINE_ORDER[r] for r in rows_idx], zoom=2)
        p = PREVIEW / f"{cr.uid}-{spec.name}-quick.png"
        img.save(p)
        raw = Image.new("RGBA", (spec.frames * CELL, len(rows) * CELL), (0, 0, 0, 0))
        for i, cells in enumerate(rows):
            for j, im in enumerate(cells):
                raw.alpha_composite(im, (j * CELL, i * CELL))
        raw.save(PREVIEW / f"{cr.uid}-{spec.name}-quickraw.png")
        print(p, "clipped rows:", sorted(set(R.CLIPPED)))


def run(cr: Creature, names) -> int:
    PREVIEW.mkdir(parents=True, exist_ok=True)
    status = 0
    for spec in sheets_for(cr):
        if names and spec.name not in names:
            continue
        R.CLIPPED.clear()
        rows = render_sheet(spec)
        sheet = compose_sheet(rows, CELL)
        placed = {ENGINE_ORDER[r]: rows[r][0] for r in range(16)}
        clipped = sorted({ENGINE_ORDER[r] for r in R.CLIPPED}, key=ENGINE_ORDER.index)
        out = UNITS / f"{cr.uid}-{spec.name}.png"
        sheet.save(out)
        diag = diagnostics(placed, CELL)
        pops = [d["dir"] for d in diag if d.get("pop")]
        empties = [d["dir"] for d in diag if d.get("empty")]
        stem = out.stem
        preview_turntable(placed, CELL).save(PREVIEW / f"{stem}-turntable.png")
        draw = 26 if spec.contact_y < 0.8 else 20
        preview_strip(sheet, CELL, spec.frames, draw).save(PREVIEW / f"{stem}-strip.png")
        # Every frame of every row, labeled (the 16-row contact).
        labeled_grid(rows, ENGINE_ORDER).save(PREVIEW / f"{stem}-contact.png")
        manifest = {
            "id": stem,
            "cell": CELL,
            "cols": spec.frames,
            "rows": 16,
            "facing": 16,
            "order": ENGINE_ORDER,
            "contactY": spec.contact_y,
            "scale": round(spec.scale, 4),
            "out": str(out.relative_to(ROOT)),
            "size_pop_dirs": pops,
            "empty_dirs": empties,
            "clipped_dirs": clipped,
            "diag": diag,
            "source": "render_bloom_brood.py (16 unique yaws, no mirror)",
        }
        (PREVIEW / f"{stem}-manifest.json").write_text(json.dumps(manifest, indent=2))
        print(f"{stem}: {sheet.size} frames={spec.frames} pops={pops} empty={empties} clipped={clipped}")
        if empties or clipped:
            status = 2
        if spec.name == "walk":
            east = placed["E"]
            R.on_magenta(east).save(PREVIEW / f"{cr.uid}-east.png")
            R.cameo(east).save(UNITS / f"{cr.uid}-cameo.png")
    return status


def lineup() -> int:
    """All six east-facing (walk frame 0) at gameplay size next to the Thrall."""
    ids = ["thrall"] + list(CREATURES)
    draw = 20  # UNIT_SPRITE_DRAW_SIZE
    big = 3
    pad = 8
    w = len(ids) * (draw * big + pad) + pad
    h = draw * big + draw + 3 * pad + 40 + CELL
    out = Image.new("RGB", (w, h), (74, 107, 50))
    d = ImageDraw.Draw(out)
    for i, uid in enumerate(ids):
        sheet = Image.open(UNITS / f"{uid}-walk.png").convert("RGBA")
        cell = sheet.crop((0, 12 * CELL, CELL, 13 * CELL))  # row 12 = E, frame 0
        x = pad + i * (draw * big + pad)
        small = cell.resize((draw, draw), Image.Resampling.LANCZOS)
        out.paste(small, (x, pad), small)  # true gameplay size
        zoomed = small.resize((draw * big, draw * big), Image.Resampling.NEAREST)
        out.paste(zoomed, (x, 2 * pad + draw), zoomed)  # gameplay size, 3x for reading
        out.paste(cell.resize((draw * big, draw * big), Image.Resampling.LANCZOS), (x, 3 * pad + draw + draw * big + 16), cell.resize((draw * big, draw * big), Image.Resampling.LANCZOS))
        d.text((x, 2 * pad + draw + draw * big + 2), uid, fill=(255, 255, 255))
    p = PREVIEW / "bloom-brood-lineup.png"
    out.save(p)
    print(p)
    return 0


def heights(cr: Creature) -> None:
    """Column-0 bbox heights on all 16 rows (the size-pop check) without writing sheets."""
    for spec in sheets_for(cr):
        cl = spec.pose(0)
        hs = []
        for r in range(16):
            im = R.render(cl, r, spec.scale, spec.contact_y)
            if spec.post:
                im = spec.post(im, 0)
            bb = opaque_bbox(im)
            hs.append(bb[3] - bb[1])
        med = sorted(hs)[8]
        pops = [ENGINE_ORDER[i] for i, h in enumerate(hs) if abs(h - med) / med > 0.12]
        print(f"{cr.uid}-{spec.name}: med={med} min={min(hs)} max={max(hs)} pops={pops}")


def main(argv: list[str]) -> int:
    if "--lineup" in argv:
        return lineup()
    if "--heights" in argv:
        argv = [a for a in argv if a != "--heights"]
        for uid in [argv[argv.index("--only") + 1]] if "--only" in argv else list(CREATURES):
            heights(CREATURES[uid]())
        return 0
    only = None
    names = []
    q = False
    it = iter(argv)
    for a in it:
        if a == "--only":
            only = next(it)
        elif a == "--quick":
            q = True
        else:
            names.append(a)
    ids = [only] if only else list(CREATURES)
    status = 0
    for uid in ids:
        cr = CREATURES[uid]()
        if q:
            quick(cr, names)
        else:
            status = max(status, run(cr, names))
    return status


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
