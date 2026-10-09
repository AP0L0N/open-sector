#!/usr/bin/env python3
"""
Sim Unit II unit sheets — a fork of render_cyborg.py under the same lock.

A light, fast cyborg frame built for the knife: the Cyborg's camera, cell,
contact points, and row order, so the client reuses the Cyborg's sprite defs
with new file names. Graphite plating with teal trim on a slimmer frame, a
narrow cyan visor, a flat drive pack on the back with two lit slots, and a
short energy dagger in each hand instead of the gatling and the claw. About
8% lighter than the Cyborg and inside the 96 cell on every row.

  python tools/sprites/render_simunit2.py

Sheets: walk (8, a stride every frame), fire (4, the slash: one blade thrust
then the other, the lit blade longest on frames 1 and 3), crawl (8, legs torn
off, dragging on the left arm, the right blade forward), crawl-fire (4), die
(4), swim (8, chest-deep in the shared pool). Writes
gridlock/packages/client/src/assets/units/simunit2-*.png, the east lock at
tools/sprites/src/simunit2-east.png, and previews/manifests in
tools/sprites/preview/. Exits 2 if a row is empty or clipped.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
import render_cyborg as R  # noqa: E402
from compose_unit_sheet import ENGINE_ORDER, compose_sheet, diagnostics, preview_strip, preview_turntable  # noqa: E402
from derive_swim import WL_Y, bob_of  # noqa: E402

UNITS = R.UNITS
SRC = R.SRC
PREVIEW = R.PREVIEW
CELL = R.CELL

# Lighter than the Cyborg; the prone sheets keep the brief's prone draw size.
STAND_SCALE = 1.2 * 0.92
PRONE_SCALE = STAND_SCALE * 22 / 28
WATER_Z = 39.0

EXTRA_MATS = {
    "graphite": ((30, 32, 38), (52, 56, 64), (84, 90, 100)),  # frame plating
    "teal": ((20, 72, 80), (34, 118, 128), (62, 160, 168)),  # trim bands
    "plate2": ((70, 76, 84), (112, 118, 126), (160, 166, 172)),  # steel plates
    "eye2": (70, 225, 255),  # cyan visor
    "slot": (90, 210, 240),  # drive-pack slots
    "blade": (150, 240, 255),  # lit edge
    "blade_core": (236, 252, 255),  # white core
    "dead_blade": ((36, 50, 56), (52, 72, 80), (74, 98, 106)),  # dark blade on the ground
}
for _name, _spec in EXTRA_MATS.items():
    R.MATERIALS[_name] = _spec
    if _name not in R.MAT_IDS:
        R.MAT_IDS[_name] = len(R.MAT_IDS)
for _name in ("eye2", "slot", "blade", "blade_core"):
    R.EMISSIVE.add(_name)

Cloud = R.Cloud
ellipsoid, capsule, cylinder, box = R.ellipsoid, R.capsule, R.cylinder, R.box
rot_x, rot_y, rot_z = R.rot_x, R.rot_y, R.rot_z


# ---------------------------------------------------------------- parts


def su_head(c: Cloud, at, Rm=None) -> None:
    """Narrow armoured skull, cyan visor band, a low crest."""
    at = np.asarray(at, float)
    Rm = np.eye(3) if Rm is None else Rm
    P = lambda *v: at + Rm @ np.array(v, float)  # noqa: E731
    ellipsoid(c, at, (4.3, 3.9, 4.7), "graphite", rot=Rm)
    box(c, P(3.1, 0, -2.0), (1.4, 2.3, 1.6), "plate2", rot=Rm)  # jaw
    box(c, P(4.0, 0, 0.7), (0.7, 3.2, 0.6), "eye2", rot=Rm)  # visor band
    box(c, P(-0.4, 0, 4.2), (3.4, 0.7, 0.8), "teal", rot=Rm)  # crest
    for s in (1, -1):
        box(c, P(0.0, s * 3.8, 0.2), (2.0, 0.4, 2.0), "plate2", rot=Rm)


def su_torso(c: Cloud, z: float) -> None:
    """Pelvis to collar on a slim frame, drive pack flat on the back."""
    P = lambda *v: np.array(v, float)  # noqa: E731
    box(c, P(-0.4, 0, z + 1.0), (3.2, 5.6, 2.6), "graphite")
    box(c, P(2.6, 0, z + 0.6), (0.8, 2.6, 2.2), "plate2")
    for s in (1, -1):
        cylinder(c, P(-0.4, s * 4.4, z), P(-0.4, s * 6.6, z), 2.5, "dark")
    for i in range(3):
        zz = z + 4.6 + i * 2.0
        cylinder(c, P(-0.4, 0, zz), P(-0.4, 0, zz + 1.2), 3.6 - 0.2 * i, "dark")
    for s in (1, -1):
        capsule(c, P(1.4, s * 2.8, z + 3.6), P(2.0, s * 3.8, z + 10.4), 0.6, mat="teal")
    ellipsoid(c, P(0.0, 0, z + 16.6), (5.6, 7.8, 7.0), "graphite")
    box(c, P(4.6, 0, z + 17.0), (1.1, 5.2, 4.4), "plate2", rot=rot_y(-0.12))
    box(c, P(5.75, 0, z + 17.4), (0.15, 0.8, 3.8), "teal", rot=rot_y(-0.12))
    box(c, P(0.4, 0, z + 23.2), (3.6, 4.4, 1.2), "graphite")  # collar
    # Drive pack: a flat slab with two lit slots and a short fin.
    box(c, P(-7.2, 0, z + 17.0), (1.8, 5.2, 5.8), "graphite")
    for s in (1, -1):
        box(c, P(-9.05, s * 2.4, z + 17.0), (0.2, 0.9, 3.4), "slot")
    box(c, P(-7.4, 0, z + 23.6), (1.4, 0.5, 1.6), "teal")


def su_pauldron(c: Cloud, at, side: float) -> None:
    at = np.asarray(at, float)
    ellipsoid(c, at, (4.4, 3.8, 3.6), "plate2", keep=lambda p, z=at[2]: p[:, 2] >= z - 1.0)
    ellipsoid(c, at + np.array([0, side * 0.3, -1.0]), (4.6, 4.0, 0.6), "teal")


def dagger(c: Cloud, wrist, fwd, lit: float = 0.55, flash: int = 0) -> None:
    """Grip at the wrist, a short flat blade along `fwd`. `lit` is the blade length
    (body units); `flash` 1–4 grows and brightens it for the slash."""
    wrist = np.asarray(wrist, float)
    fwd = np.asarray(fwd, float)
    fwd = fwd / np.linalg.norm(fwd)
    ellipsoid(c, wrist, (1.7, 1.7, 1.7), "dark")
    grip0 = wrist + fwd * 0.6
    grip1 = wrist + fwd * 3.2
    capsule(c, grip0, grip1, 0.9, 0.8, "dark")
    box(c, grip1, (0.5, 1.6, 0.5), "plate2", rot=_along(fwd))  # guard
    length = {0: 5.2, 1: 7.4, 2: 5.8, 3: 7.0, 4: 5.4}[flash] * (lit / 0.55)
    b0 = grip1 + fwd * 0.4
    b1 = b0 + fwd * length
    capsule(c, b0, b1, 1.0, 0.25, "blade", caps=False)
    ellipsoid(c, b1, (0.35, 0.35, 0.35), "blade")
    core = 0.42 if flash in (1, 3) else 0.3
    capsule(c, b0 + fwd * 0.4, b1 - fwd * 0.8, core, 0.15, "blade_core", caps=False)
    if flash in (1, 3):
        # A ripple off the edge on the hard swing.
        side = np.cross(np.array([0, 0, 1.0]), fwd)
        side = side / max(1e-6, np.linalg.norm(side))
        for k in (-1, 1):
            ellipsoid(c, b0 + fwd * length * 0.55 + side * k * 1.6, (length * 0.3, 0.3, 0.3), "blade", rot=_along(fwd))


def _along(fwd: np.ndarray) -> np.ndarray:
    """Rotation taking +x onto `fwd`."""
    fwd = fwd / np.linalg.norm(fwd)
    yaw = math.atan2(fwd[1], fwd[0])
    pitch = -math.asin(max(-1.0, min(1.0, fwd[2])))
    return rot_z(yaw) @ rot_y(pitch)


def slim_leg(c: Cloud, hip, foot) -> None:
    hip = np.asarray(hip, float)
    foot = np.asarray(foot, float)
    ankle = foot + np.array([0, 0, 2.8])
    knee = R.leg_ik(hip, ankle, 15.0, 14.2)
    capsule(c, hip, knee, 3.2, 2.5, "graphite")
    ellipsoid(c, knee + np.array([1.1, 0, 0.3]), (2.4, 2.5, 2.6), "plate2")
    capsule(c, knee, ankle, 2.0, 1.7, "dark")
    capsule(c, knee + np.array([0.8, 0, -1.6]), ankle + np.array([1.1, 0, 2.2]), 1.6, 1.4, "graphite")
    capsule(c, knee + np.array([-1.9, 0, -0.8]), ankle + np.array([-2.0, 0, 1.0]), 0.7, mat="metal")
    ellipsoid(c, ankle, (1.9, 2.0, 1.7), "dark")
    box(c, foot + np.array([1.4, 0, 1.3]), (4.0, 2.4, 1.3), "graphite")
    box(c, foot + np.array([4.4, 0, 1.1]), (1.2, 2.2, 1.0), "plate2")
    box(c, foot + np.array([-2.2, 0, 1.4]), (0.9, 2.0, 1.4), "dark")


def arm(c: Cloud, shoulder, elbow, wrist, side: float) -> None:
    shoulder = np.asarray(shoulder, float)
    elbow = np.asarray(elbow, float)
    wrist = np.asarray(wrist, float)
    su_pauldron(c, shoulder + np.array([-0.2, side * 0.4, 2.2]), side)
    capsule(c, shoulder, elbow, 2.5, 2.1, "graphite")
    ellipsoid(c, elbow, (2.1, 2.1, 2.1), "dark")
    capsule(c, elbow, wrist, 1.9, 1.6, "plate2")
    box(c, (elbow + wrist) / 2, (2.4, 0.3, 1.0), "teal", rot=_along(wrist - elbow))


# ---------------------------------------------------------------- poses

HIP_Z = 31.5


def pose_stand(phase: float | None, flash: int = 0) -> tuple[Cloud, float]:
    c = Cloud()
    stride = 0.0 if phase is None else 1.0
    bob = 0.0 if phase is None else 0.7 * abs(math.sin(2 * math.pi * phase))
    for s, off in ((1, 0.0), (-1, 0.5)):
        p = 0.0 if phase is None else (phase + off) % 1.0
        fx = -6.4 * math.cos(2 * math.pi * p) * stride
        lift = 3.2 * max(0.0, math.sin(2 * math.pi * p)) * stride
        slim_leg(c, np.array([-0.4, s * 4.6, HIP_Z - bob]), np.array([fx, s * 5.0, lift]))
    hz = HIP_Z - bob
    su_torso(c, hz)
    z = hz - HIP_Z
    su_head(c, (1.2, 0, 61.6 + z))
    capsule(c, (0.2, 0, 54.8 + z), (0.8, 0, 57.8 + z), 2.2, mat="dark")
    swing = 0.0 if phase is None else 2.4 * math.sin(2 * math.pi * phase)
    if flash == 0:
        # Blades low and forward at the sides, ready.
        for s in (1, -1):
            sh = np.array([0.2, s * 9.2, 52.4 + z])
            el = np.array([-1.0 + s * swing, s * 10.6, 44.6 + z])
            wr = np.array([4.6 - s * swing * 0.5, s * 9.6, 40.4 + z])
            arm(c, sh, el, wr, s)
            dagger(c, wr, (0.9, -s * 0.15, -0.35))
    else:
        # The slash: one arm thrust out at chest height, the other drawn back.
        lead = -1 if flash in (1, 3) else 1  # right hand first
        for s in (1, -1):
            sh = np.array([0.2, s * 9.2, 52.4 + z])
            if s == lead:
                el = np.array([6.0, s * 8.0, 50.2 + z])
                wr = np.array([12.6, s * 4.4, 50.6 + z])
                arm(c, sh, el, wr, s)
                dagger(c, wr, (0.95, -s * 0.3, 0.0), lit=0.62, flash=flash)
            else:
                el = np.array([-5.2, s * 10.4, 47.0 + z])
                wr = np.array([-3.4, s * 8.6, 41.6 + z])
                arm(c, sh, el, wr, s)
                dagger(c, wr, (0.8, -s * 0.2, -0.5))
    return c, 0.0


def pose_crawl(t: float, flash: int = 0) -> tuple[Cloud, float]:
    """Legless. Chest on the dirt, dragging on the left arm, the right blade forward."""
    c = Cloud()
    pull = math.sin(2 * math.pi * t)
    z0 = 0.5 * max(0.0, pull)
    ellipsoid(c, (0, 0, 5.8 + z0), (9.8, 7.6, 5.0), "graphite")
    box(c, (1.8, 0, 10.2 + z0), (5.6, 3.8, 0.9), "plate2")
    box(c, (1.8, 0, 11.2 + z0), (4.6, 0.6, 0.2), "teal")
    for i in range(3):
        cylinder(c, (-6.4 - i * 1.5, 0, 4.8 + z0), (-7.3 - i * 1.5, 0, 4.8 + z0), 3.6 - 0.3 * i, "dark")
    R.stumps(c, np.array([-11.4, 0, 4.4 + z0]), np.array([-1.0, 0, -0.1]), t)
    box(c, (-10.4, 0, 4.6 + z0), (2.0, 5.6, 2.2), "graphite")
    box(c, (-1.0, 0, 13.2 + z0), (4.8, 4.4, 1.8), "graphite")
    for s in (1, -1):
        box(c, (-1.0, s * 2.0, 15.1 + z0), (2.4, 0.7, 0.2), "slot")
    capsule(c, (8.0, 0, 8.0 + z0), (10.2, 0, 10.4 + z0), 2.2, mat="dark")
    su_head(c, (12.4, 0, 12.0 + z0))
    # Right arm: blade forward along the ground, or raised in a cut.
    sh_r = np.array([6.0, -8.4, 8.4 + z0])
    if flash:
        el = np.array([10.6, -9.6, 11.0 + z0])
        wr = np.array([15.6, -6.2, 12.4 + z0])
        arm(c, sh_r, el, wr, -1)
        dagger(c, wr, (0.9, 0.3, -0.25), lit=0.62, flash=flash)
    else:
        el = np.array([11.0, -10.4, 5.0 + z0])
        wr = np.array([16.4, -9.2, 3.2 + z0])
        arm(c, sh_r, el, wr, -1)
        dagger(c, wr, (1.0, 0.1, -0.1))
    # Left arm reaching and dragging, the blade dug into the dirt.
    reach = 4.0 * pull
    sh_l = np.array([6.0, 8.4, 8.4 + z0])
    el = np.array([11.5 + reach * 0.5, 10.2, 2.4])
    wr = np.array([17.0 + reach, 8.4, 2.2])
    arm(c, sh_l, el, wr, 1)
    dagger(c, wr, (0.5, -0.1, -0.85), lit=0.4)
    return c, 0.0


def pose_swim(frame: int) -> tuple[Cloud, float]:
    c, _ = pose_stand(None)
    dz = -WATER_Z + bob_of(frame) / (STAND_SCALE * R.COS_P)
    out = Cloud()
    for p, n, m, k in zip(c.pts, c.nrm, c.mat, c.part):
        p = p + np.array([0.0, 0.0, dz])
        keep = p[:, 2] >= 0.0
        if keep.any():
            out.pts.append(p[keep])
            out.nrm.append(n[keep])
            out.mat.append(m[keep])
            out.part.append(k[keep])
    return out, 0.0


def pose_dead() -> tuple[Cloud, float]:
    """Face down, both blades dark on the dirt, one leg torn off beside him."""
    c = Cloud()
    ellipsoid(c, (0, 0, 4.2), (9.8, 7.8, 4.2), "graphite")
    box(c, (1.0, 0, 8.0), (5.6, 3.8, 0.9), "plate2")
    R.stumps(c, np.array([-10.8, 0, 3.2]), np.array([-1.0, 0, -0.05]), 0.0)
    box(c, (-9.8, 0, 3.4), (2.0, 5.6, 2.0), "graphite")
    box(c, (-3.6, 0, 9.2), (4.0, 4.4, 1.6), "graphite")
    box(c, (-3.6, 0, 10.9), (1.8, 1.8, 0.2), "rust")  # dead core
    su_head(c, (12.4, 1.0, 4.4), rot_x(math.radians(-25)))
    # Arms out either side, the blades dark.
    for s in (1, -1):
        sh = np.array([5.6, s * 8.0, 4.6])
        el = np.array([10.4, s * 11.6, 2.0])
        wr = np.array([15.8, s * 11.0, 1.6])
        capsule(c, sh, el, 2.4, 2.0, "graphite")
        capsule(c, el, wr, 1.8, 1.5, "plate2")
        ellipsoid(c, wr, (1.6, 1.6, 1.6), "dark")
        tip = wr + np.array([5.6, s * 1.4, 0.0])
        capsule(c, wr + np.array([0.8, 0, 0]), wr + np.array([3.0, s * 0.4, 0]), 0.8, 0.7, "dark")
        capsule(c, wr + np.array([3.4, s * 0.6, 0]), tip, 0.9, 0.2, "dead_blade", caps=False)
    # The torn leg on its side, foot toward his hips.
    lr = rot_z(math.radians(95)) @ rot_x(math.radians(90))
    base = np.array([0.0, 14.0, 3.0])
    capsule(c, base, base + lr @ np.array([0, 0, -11.0]), 3.0, 2.4, "graphite")
    ellipsoid(c, base + lr @ np.array([1.0, 0, -11.0]), (2.4, 2.5, 2.4), "plate2")
    capsule(c, base + lr @ np.array([0, 0, -11.0]), base + lr @ np.array([-1.8, 0, -21.0]), 2.0, 1.7, "dark")
    box(c, base + lr @ np.array([0.0, 0, -23.0]), (3.8, 2.2, 1.2), "graphite", rot=lr)
    for p in c.pts:
        p[:, 2] = np.maximum(p[:, 2], 0.35)
    allp = np.concatenate(c.pts)
    ctr = np.array([(allp[:, 0].min() + allp[:, 0].max()) / 2, (allp[:, 1].min() + allp[:, 1].max()) / 2, 0.0])
    c.pts = [p - ctr for p in c.pts]
    return c, 0.0


# ---------------------------------------------------------------- sheets

SHEETS = [
    R.SheetSpec("walk", 8, 0.88, STAND_SCALE, lambda i: pose_stand(None if i == 0 else i / 8)[0]),
    R.SheetSpec("fire", 4, 0.88, STAND_SCALE, lambda i: pose_stand(None, flash=i + 1)[0]),
    R.SheetSpec("crawl", 8, 0.72, PRONE_SCALE, lambda i: pose_crawl(i / 8)[0]),
    R.SheetSpec("crawl-fire", 4, 0.72, PRONE_SCALE, lambda i: pose_crawl(0.0, flash=i + 1)[0]),
    R.SheetSpec("die", 4, 0.72, STAND_SCALE, lambda i: pose_dead()[0]),
    R.SheetSpec("swim", 8, WL_Y / CELL, STAND_SCALE, lambda i: pose_swim(i)[0], R.swim_post),
]


def render_sheet(spec):
    clouds = [spec.pose(i) for i in range(spec.frames)]
    rows = []
    for r in range(16):
        cells = [R.render(cl, r, spec.scale, spec.contact_y) for cl in clouds]
        if spec.post:
            cells = [spec.post(im, i) for i, im in enumerate(cells)]
        rows.append(cells)
    sheet = compose_sheet(rows, CELL)
    placed = {ENGINE_ORDER[r]: rows[r][0] for r in range(16)}
    return sheet, placed


def main() -> int:
    PREVIEW.mkdir(parents=True, exist_ok=True)
    SRC.mkdir(parents=True, exist_ok=True)
    status = 0
    only = sys.argv[1:] or None
    for spec in SHEETS:
        if only and spec.name not in only:
            continue
        R.CLIPPED.clear()
        sheet, placed = render_sheet(spec)
        clipped = sorted({ENGINE_ORDER[r] for r in R.CLIPPED}, key=ENGINE_ORDER.index)
        out = UNITS / f"simunit2-{spec.name}.png"
        sheet.save(out)
        diag = diagnostics(placed, CELL)
        pops = [d["dir"] for d in diag if d.get("pop")]
        empties = [d["dir"] for d in diag if d.get("empty")]
        stem = out.stem
        preview_turntable(placed, CELL).save(PREVIEW / f"{stem}-turntable.png")
        draw = 26 if spec.contact_y < 0.8 else 20
        preview_strip(sheet, CELL, spec.frames, draw).save(PREVIEW / f"{stem}-strip.png")
        manifest = {
            "id": stem,
            "cell": CELL,
            "cols": spec.frames,
            "rows": 16,
            "facing": 16,
            "order": ENGINE_ORDER,
            "contactY": spec.contact_y,
            "scale": round(spec.scale, 4),
            "out": str(out.relative_to(R.ROOT)),
            "size_pop_dirs": pops,
            "empty_dirs": empties,
            "clipped_dirs": clipped,
            "diag": diag,
            "source": "render_simunit2.py (16 unique yaws, no mirror)",
        }
        (PREVIEW / f"{stem}-manifest.json").write_text(json.dumps(manifest, indent=2))
        print(f"{stem}: {sheet.size} frames={spec.frames} pops={pops} empty={empties} clipped={clipped}")
        if empties or clipped:
            status = 2
        if spec.name == "walk":
            east = placed["E"]
            R.on_magenta(east).save(SRC / "simunit2-east.png")
            R.cameo(east).save(UNITS / "simunit2-cameo.png")
    return status


if __name__ == "__main__":
    raise SystemExit(main())
