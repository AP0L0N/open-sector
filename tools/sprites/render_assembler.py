#!/usr/bin/env python3
"""Assembler: small Xenite walking nanite forge that builds Thralls. Three 16-face layers.

A low four-legged hull carrying a Nanite Forge in miniature: a telescoping
chitin vault with glow seams between its plates, an open bay at the rear that
glows where the Thralls step out, two nanite vats on the flanks, and a small
crane arm on top lowering a glowing core in. No weapon. Cold grey-green alloy,
dark chitin, the Seed's glow (xeno_walker.py). The Apocalypse's layout: hull /
turret / gun are passes of one locked camera, one scale, one origin, composed
by the client with composeAligned (TIGER_OPTS: cell 128, contactY 0.92). It
keeps the Broodmother's scale and draw size, so its smaller body reads small
next to the other walkers. bw.bake() then writes assembler-legs.png (8 trot
frames x 16), assembler-turret.png and assembler-gun.png (1 x 16).

  hull    low compact body, small sensor head, four short legs, empty ring.
  turret  the forge: telescoping vault, rear bay, flank vats, team plate.
  gun     the crane on the vault's front crest: pylon, jointed arm, claw, core.
          On the front (not the rear) so the client's gun-behind draw order is
          the true one.

0001 = nose screen-south, then clockwise 22.5° through 0016.

  python3 tools/sprites/render_assembler.py \\
      --out gridlock/packages/client/src/assets/units/assembler
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
import render_procedural as rp
import render_seed as rs
from render_procedural import Mesh, render_turntable

import xeno_walker as bw
from xeno_walker import ellipsoid, knob, leg, shell, tube

# Nanite slurry behind glass, and the hot assembly bay.
rp.MAT.update(
    {
        "vat": (rp.hex_rgb("#5fe8b4"), 0.0, 1.0),
        "bay": (rp.hex_rgb("#c8fff0"), 0.0, 1.0),
    }
)
rs.EMISSIVE.update({"vat", "bay"})

# Meters. +x nose, +y left, +z up. Feet on z = 0. Origin = turret ring centre.
BODY = (0.0, 0.0, 0.95)
BODY_R = (1.75, 1.15, 0.45)
RING_Z = 1.32
RING_R = 0.95
VAULT_X = (-1.6, 1.1)  # rear (the bay) -> front
VAULT_HW = (1.12, 0.92)  # half-width rear -> front
VAULT_HT = (1.3, 1.05)  # height rear -> front
VAULT_SEGS = 3
VAULT_Z = RING_Z + 0.04
CREST = (0.55, 0.0, VAULT_Z + 1.1)  # front crest of the vault, where the crane stands
CLAW = (1.45, 0.0, VAULT_Z + 1.35)

SCALE_FRAC = 0.07  # the Broodmother's: one scale for the Forge's walkers
Z_MID = 1.9
CY_FRAC = 0.62
LAYERS = ("hull", "turret", "gun")

STRIDE = 0.35  # half the foot's travel along the nose, m
LIFT = 0.35  # foot clearance at mid-swing, m


def build_hull(frame: int | None = None) -> Mesh:
    m = Mesh()
    ellipsoid(m, (BODY[0], 0, BODY[2] - 0.2), (BODY_R[0] * 0.92, BODY_R[1] * 0.85, 0.36), "chitin", rings=10, seg=14)
    shell(m, BODY, BODY_R, 3, team=(0, 0), seg=18)
    # Small sensor head: a low wedge, a row of eyes, two short feelers.
    shell(m, (1.85, 0, 0.85), (0.42, 0.6, 0.3), 2, seg=12)
    for s in (-1, 1):
        knob(m, (2.2, s * 0.2, 0.95), 0.09, "eye")
        knob(m, (2.05, s * 0.42, 1.0), 0.08, "eye")
        tube(m, (2.1, s * 0.3, 1.02), (2.65, s * 0.7, 1.3), 0.05, 0.02, "claw", n=5)
    # Rear: a glowing exhaust grille under the bay.
    tube(m, (-1.7, 0, 0.95), (-2.0, 0, 0.85), 0.42, 0.3, "chitin", n=10)
    knob(m, (-2.02, 0, 0.85), 0.22, "seam")
    for s in (-1, 1):
        for x in (-1.0, -0.2, 0.6):
            knob(m, (x, s * 1.08, 0.98), 0.08, "seam")
    # Four short legs, splayed. Walk: diagonal pairs. frame None = the static turntable pose.
    for s in (-1, 1):
        for i, (hx, dx) in enumerate(((1.05, 0.3), (-1.05, -0.3))):
            hip = (hx, s * 1.0, 0.85)
            knee = (hx + dx * 0.5, s * 1.75, 1.45)
            ankle = (hx + dx * 0.9, s * 2.0, 0.35)
            foot = (hx + dx, s * 2.08, 0.0)
            if frame is None:
                leg(m, hip, knee, ankle, foot, r=0.28)
            else:
                fx, fz = bw.gait(frame, (i + (s > 0)) % 2, STRIDE, LIFT)
                bw.posed_leg(m, hip, knee, ankle, foot, fx, fz, LIFT, r=0.28)
    bw.cylinder_z(m, 0.0, 0.0, RING_R + 0.08, RING_Z - 0.07, RING_Z, "seam", 24)
    bw.cylinder_z(m, 0.0, 0.0, RING_R, RING_Z - 0.05, RING_Z + 0.05, "chitin", 24)
    return m


def arch_ring(x: float, hw: float, ht: float, n: int = 14) -> list[np.ndarray]:
    """A vault profile at x: an arch from one side over the top to the other, closed along its floor."""
    pts = []
    for i in range(n + 1):
        t = math.pi * i / n
        pts.append(np.array([x, -hw * math.cos(t), VAULT_Z + ht * max(0.0, math.sin(t)) ** 0.8]))
    for k in (0.5, 0.0, -0.5):
        pts.append(np.array([x, -hw * k, VAULT_Z]))
    return pts


def vault_at(f: float) -> tuple[float, float, float]:
    """x, half-width and height a share `f` of the way from the rear to the front."""
    return (VAULT_X[0] + (VAULT_X[1] - VAULT_X[0]) * f, VAULT_HW[0] + (VAULT_HW[1] - VAULT_HW[0]) * f, VAULT_HT[0] + (VAULT_HT[1] - VAULT_HT[0]) * f)


def build_turret() -> Mesh:
    m = Mesh()
    # Low chitin plinth on the ring.
    bw.cylinder_z(m, -0.25, 0.0, 1.05, RING_Z, VAULT_Z, "claw", 20)
    # The carapace: telescoping plates, each a little smaller toward the front, a rib at the rear lip
    # and a glow seam where the next plate slides out from under it.
    for i in range(VAULT_SEGS):
        x0, hw0, ht0 = vault_at(i / VAULT_SEGS)
        x1, hw1, ht1 = vault_at((i + 1) / VAULT_SEGS)
        top = 7

        def plate(ri: int, s: int, i=i, top=top) -> str:
            if i == VAULT_SEGS - 1 and abs(s - top) <= 1:
                return "team"
            if s >= 14:
                return "claw"
            return "alloy_hi" if i % 2 else "alloy"

        m.loft([arch_ring(x0, hw0, ht0), arch_ring(x1, hw1 - 0.05, ht1 - 0.05)], plate, cap0=False, cap1=False)
        m.loft([arch_ring(x0 - 0.02, hw0 + 0.06, ht0 + 0.06), arch_ring(x0 + 0.16, hw0 + 0.06, ht0 + 0.06)], "chitin", cap0=False, cap1=False)
        if i > 0:
            m.loft([arch_ring(x0 - 0.1, hw0 - 0.02, ht0 - 0.02), arch_ring(x0 - 0.02, hw0 + 0.02, ht0 + 0.02)], "seam", cap0=False, cap1=False)
    # Front wall, closed.
    xf, hwf, htf = vault_at(1.0)
    m.loft([arch_ring(xf, hwf - 0.05, htf - 0.05), arch_ring(xf + 0.04, hwf - 0.05, htf - 0.05)], "alloy", cap0=False, cap1=True)
    # The rear bay: a dark frame, then the glowing assembly floor seen through the opening.
    xb, hwb, htb = vault_at(0.0)
    m.loft([arch_ring(xb, hwb + 0.06, htb + 0.06), arch_ring(xb - 0.08, hwb + 0.06, htb + 0.06)], "claw", cap0=False, cap1=False)
    m.loft([arch_ring(xb - 0.08, hwb + 0.06, htb + 0.06), arch_ring(xb - 0.08, hwb * 0.7, htb * 0.72)], "claw", cap0=False, cap1=False)
    m.loft([arch_ring(xb - 0.06, hwb * 0.7, htb * 0.72), arch_ring(xb + 0.02, hwb * 0.7, htb * 0.72)], "bay", cap0=False, cap1=True)
    # Teeth round the bay's edge.
    for k in range(1, 6):
        t = math.pi * k / 6
        y = -hwb * 0.72 * math.cos(t)
        z = VAULT_Z + htb * 0.74 * math.sin(t) ** 0.8
        tube(m, (xb - 0.1, y, z), (xb - 0.2, y * 0.8, VAULT_Z + (z - VAULT_Z) * 0.82), 0.07, 0.02, "claw", n=5)
    # Nanite vats on the flanks, piped into the vault.
    for s in (-1, 1):
        vx, vy = -0.35, s * 1.22
        bw.cylinder_z(m, vx, vy, 0.36, RING_Z - 0.2, RING_Z, "claw", 12)
        bw.cylinder_z(m, vx, vy, 0.3, RING_Z, RING_Z + 0.8, "vat", 12)
        for k in range(4):
            a = 2 * math.pi * k / 4 + 0.4
            px, py = vx + 0.32 * math.cos(a), vy + 0.32 * math.sin(a)
            tube(m, (px, py, RING_Z), (px, py, RING_Z + 0.8), 0.05, 0.05, "chitin", n=5)
        bw.cylinder_z(m, vx, vy, 0.34, RING_Z + 0.8, RING_Z + 0.9, "claw", 12)
        knob(m, (vx, vy, RING_Z + 0.95), 0.1, "core")
        tube(m, (vx, vy - s * 0.25, RING_Z + 0.55), (vx, s * 0.85, RING_Z + 0.7), 0.08, 0.08, "alloy", n=6)
    # Two short dorsal spines behind the crane.
    for x in (-0.55, -1.2):
        _, _, ht = vault_at((x - VAULT_X[0]) / (VAULT_X[1] - VAULT_X[0]))
        tube(m, (x, 0, VAULT_Z + ht - 0.05), (x - 0.25, 0, VAULT_Z + ht + 0.45), 0.1, 0.02, "claw", n=5)
    return m


def build_gun() -> Mesh:
    """The crane on the vault's front crest, so the client's gun-behind order (rows 5-11) is the true occlusion."""
    m = Mesh()
    base = np.array(CREST)
    elbow = base + np.array([0.25, 0.0, 0.75])
    wrist = np.array(CLAW) + np.array([0.0, 0.0, 0.25])
    knob(m, base, 0.24, "claw")
    tube(m, base, elbow, 0.13, 0.11, "alloy", n=8)
    knob(m, elbow, 0.15, "chitin")
    knob(m, elbow + np.array([0, 0, 0.1]), 0.06, "seam")
    tube(m, elbow, wrist, 0.1, 0.08, "alloy", n=8)
    knob(m, wrist, 0.12, "claw")
    # Three claw fingers round a glowing core being lowered into the forge.
    core = wrist + np.array([0.0, 0.0, -0.42])
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.5
        mid = wrist + np.array([0.2 * math.cos(a), 0.2 * math.sin(a), -0.18])
        tip = wrist + np.array([0.11 * math.cos(a), 0.11 * math.sin(a), -0.52])
        tube(m, wrist, mid, 0.05, 0.04, "claw", n=5)
        tube(m, mid, tip, 0.04, 0.015, "claw", n=5)
    knob(m, core, 0.16, "core")
    return m


MODEL = {"turretRingZ": RING_Z, "craneX": CLAW[0], "craneZ": CLAW[2], "vaultTopZ": VAULT_Z + VAULT_HT[0]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="unit folder; writes hull/ turret/ gun/ inside it")
    ap.add_argument("--ss", type=int, default=4)
    ap.add_argument("--check-only", action="store_true")
    ap.add_argument("--walk-only", action="store_true", help="keep the turntable folders; bake only the walk sheets")
    ap.add_argument("--jobs", type=int, default=8)
    args = ap.parse_args()
    out = Path(args.out)
    if not args.walk_only:
        if not args.check_only:
            common = dict(scale_frac=SCALE_FRAC, z_mid=Z_MID, cy_frac=CY_FRAC, ss=args.ss)
            for name, build in zip(LAYERS, (build_hull, build_turret, build_gun)):
                render_turntable(build(), out / name, f"assembler_{name}", f"assembler-{name}.json", **common)
        bw.check("assembler", out, list(LAYERS), SCALE_FRAC, Z_MID, CY_FRAC, model=MODEL, ref_draw_px_per_m=5.4)
        bw.cameo("assembler", out, list(LAYERS))
        if args.check_only:
            return
    bw.bake("assembler", out, build_hull, SCALE_FRAC, Z_MID, CY_FRAC, ss=args.ss, jobs=args.jobs)


if __name__ == "__main__":
    main()
