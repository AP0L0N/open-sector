#!/usr/bin/env python3
"""Drone Op stills, derived from the Medic's accepted unique yaws.

The Drone Op is the same soldier as the Medic (same turntable, camera, scale,
outline, palette), re-kitted:

  - the red crosses are painted out (inpainted from the surrounding khaki / camo)
  - the white armband becomes a neutral gray band (team-tint friendly, no insignia)
  - a chest-mounted drone controller with a stubby antenna (stand, crouch)
  - a short whip antenna on the pack, now the drone battery / radio (stand, crouch, crawl)
  - the dropped aid box beside the corpse becomes the dropped controller (die)

The props are placed from one small 3D model per pose (chest / pack offsets from
an annotated neck or pack point), yawed by the same facing as the still, so the
nine yaws stay one miniature. Mirrors are left to compose_unit_sheet.py.

  python tools/sprites/derive_droneop.py            # writes tools/sprites/src/droneop-*/
  python tools/sprites/derive_droneop.py --compose  # also composes the engine sheets + cameo
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tools/sprites/src"
UNITS = ROOT / "gridlock/packages/client/src/assets/units"
NAMES = ["E", "ESE", "SE", "SSE", "S", "N", "NNE", "NE", "ENE"]
# Screen bearing of each unique yaw (y down, degrees).
SCREEN_DEG = {"E": 0, "ESE": 22.5, "SE": 45, "SSE": 67.5, "S": 90, "N": -90, "NNE": -67.5, "NE": -45, "ENE": -22.5}

# Camera of the medic stills: high 3/4. Ground depth foreshortens by SV, height by CV.
SV = math.sin(math.radians(38))
CV = math.cos(math.radians(38))

OUTLINE = (0x1A, 0x14, 0x10)
CASING = (0x3A, 0x3A, 0x36)
CASING_HI = (0x4A, 0x4A, 0x46)
SCREEN = (0x8F, 0xB0, 0xB8)
SCREEN_LO = (0x5E, 0x80, 0x88)
ROD = (0x1F, 0x1D, 0x1A)
ROD_HI = (0x4A, 0x4A, 0x46)
TEAM = (0x7A, 0x7A, 0x74)
TIP = (0x6E, 0x6E, 0x68)

# Helmet-rim centre (neck) of each unique still, in 544 px source coords.
NECK = {
    "stand": {"E": (291, 176), "ESE": (298, 176), "SE": (291, 179), "SSE": (291, 183), "S": (278, 186),
              "N": (259, 168), "NNE": (275, 164), "NE": (285, 161), "ENE": (291, 155)},
    "crouch": {"E": (291, 173), "ESE": (294, 176), "SE": (275, 176), "SSE": (272, 168), "S": (278, 175),
               "N": (291, 149), "NNE": (304, 158), "NE": (304, 155), "ENE": (291, 152)},
}
# Top of the pack on the prone body.
PACK_TOP = {"E": (269, 235), "ESE": (238, 245), "SE": (212, 262), "SSE": (303, 193), "S": (295, 199),
            "N": (274, 206), "NNE": (283, 207), "NE": (292, 194), "ENE": (287, 214)}
# Centre of the dropped aid box beside the corpse.
DIE_BOX = {"E": (156, 364), "ESE": (119, 335), "SE": (103, 306), "SSE": (102, 288), "S": (108, 252),
           "N": (423, 227), "NNE": (444, 284), "NE": (417, 335), "ENE": (358, 367)}


def facing(name: str) -> tuple[np.ndarray, np.ndarray]:
    """Forward and left unit vectors on the ground (x east, y south)."""
    phi = math.radians(SCREEN_DEG[name])
    f = np.array([math.cos(phi), math.sin(phi) / SV])
    f /= np.linalg.norm(f)
    left = np.array([f[1], -f[0]])
    return f, left


def proj(anchor, ground=(0.0, 0.0), up=0.0) -> tuple[float, float]:
    """Screen point: anchor + ground offset (x east, y south) + height (px)."""
    return (anchor[0] + ground[0], anchor[1] + ground[1] * SV - up * CV)


# ---------------------------------------------------------------- masks / cleanup


def magenta_mask(a: np.ndarray) -> np.ndarray:
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (r > 150) & (b > 130) & (g < 120)


def red_mask(a: np.ndarray) -> np.ndarray:
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (r > 120) & (r - g > 60) & (r - b > 50) & ~magenta_mask(a)


def white_mask(a: np.ndarray) -> np.ndarray:
    mn = a.min(-1)
    return (mn > 165) & (a.max(-1) - mn < 45)


def grow(m: np.ndarray, k: int = 1) -> np.ndarray:
    for _ in range(k):
        g = m.copy()
        g[1:] |= m[:-1]
        g[:-1] |= m[1:]
        g[:, 1:] |= m[:, :-1]
        g[:, :-1] |= m[:, 1:]
        m = g
    return m


def inpaint(a: np.ndarray, hole: np.ndarray, avoid: np.ndarray) -> np.ndarray:
    """Fill `hole` from its neighbours, onion-peel, never sampling `avoid`."""
    a = a.astype(np.float64).copy()
    known = ~hole & ~avoid
    hole = hole.copy()
    for _ in range(200):
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


def clean_insignia(a: np.ndarray) -> np.ndarray:
    """Red crosses, their white grounds, and the white armband all go.

    Every insignia pixel (plus its anti-aliased pink / pale fringe) is inpainted
    from the khaki or camo around it. Outline pixels stay as they are.
    """
    ai = a.astype(np.int32)
    mag = magenta_mask(ai)
    r, g, b = ai[..., 0], ai[..., 1], ai[..., 2]
    red = red_mask(ai)
    white = white_mask(ai)
    # Fringe only next to a cross or a band, so skin (also pinkish) is never touched.
    near = grow(red | white, 4)
    red = red | ((r > 90) & (r - g > 40) & (r - b > 30) & grow(red | white, 6))
    pink = (r > 140) & (r - g > 25) & (r - b > 15) & grow(red, 3)
    pale = (ai.min(-1) > 150) & (ai.max(-1) - ai.min(-1) < 50) & near
    # The band in shadow (corpse yaws) is a light neutral gray, not white.
    pale |= (ai.min(-1) > 92) & (ai.max(-1) - ai.min(-1) < 26) & grow(white, 14)
    # Dark magenta fringe on the silhouette: never a colour source.
    purple = (r > 70) & (b > 60) & (g < np.minimum(r, b) - 25)
    mag = mag | (purple & grow(mag, 6))
    # Sleeve patch (dark red, away from any white) on a few crouch yaws.
    red = red | ((r > 110) & (r - g > 55) & (r - b > 30) & (g < 100))
    dark = ai.mean(-1) < 45
    # The cross's own ink border goes too, but never the silhouette outline next to the key.
    ink = dark & grow(red, 3) & ~grow(mag, 8)
    hole = (grow(red | white | (pink & ~mag) | pale, 2) & ~mag & ~dark) | ink
    out = inpaint(a, hole, mag | (dark & ~ink))
    # A band fully ringed by its own ink has no cloth neighbour: fill it from the
    # sleeve colours beyond the ink ring (sampled from a grown neighbourhood).
    left = hole & (np.abs(out - a.astype(np.float64)).sum(-1) < 1e-6)
    if left.any():
        ring = grow(left, 12) & ~grow(left, 3) & ~mag & ~dark
        if ring.any():
            out[left] = out[ring].mean(0)
    return out


# ---------------------------------------------------------------- drawing


def poly(d: ImageDraw.ImageDraw, pts, fill, outline=OUTLINE, width=5) -> None:
    d.polygon([tuple(map(float, p)) for p in pts], fill=fill)
    d.line([tuple(map(float, p)) for p in list(pts) + [pts[0]]], fill=outline, width=width, joint="curve")


def rod(d: ImageDraw.ImageDraw, p0, p1, knob: float = 5.0) -> None:
    d.line([p0, p1], fill=OUTLINE, width=9)
    d.line([p0, p1], fill=ROD_HI, width=3)
    x, y = p1
    d.ellipse([x - knob - 2, y - knob - 2, x + knob + 2, y + knob + 2], fill=OUTLINE)
    d.ellipse([x - knob, y - knob, x + knob, y + knob], fill=TIP)


def layer(size) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("RGBA", size, (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


VIEW = np.array([0.0, CV, SV])  # toward the camera in (east, south, up)


def to_screen(anchor, p3) -> np.ndarray:
    return np.array(proj(anchor, (p3[0], p3[1]), p3[2]))


def draw_controller(d: ImageDraw.ImageDraw, neck, f, left, down: float, fwd: float) -> None:
    """A controller box on a chest strap, top tipped out, screen toward his face, stubby antenna.

    Built as a real 3D box in his local frame and projected with the still's
    camera, so all nine yaws show the same object turned.
    """
    W, H, D, beta = 64.0, 42.0, 18.0, math.radians(22)
    F = np.array([f[0], f[1], 0.0])
    L = np.array([left[0], left[1], 0.0])
    U = np.array([0.0, 0.0, 1.0])
    Un = F * math.sin(beta) + U * math.cos(beta)  # box "up" (tipped out at the top)
    Fn = F * math.cos(beta) - U * math.sin(beta)  # box "out" (away from his chest)
    c = F * fwd - U * down
    corner = {}
    for i in (-1, 1):
        for j in (-1, 1):
            for k in (-1, 1):
                corner[(i, j, k)] = c + L * (i * W / 2) + Fn * (j * D / 2) + Un * (k * H / 2)
    faces = [
        # (normal, corner keys in order, role)
        (-Fn, [(-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)], "screen"),
        (Fn, [(-1, 1, -1), (1, 1, -1), (1, 1, 1), (-1, 1, 1)], "back"),
        (Un, [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)], "top"),
        (-Un, [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1)], "bottom"),
        (L, [(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)], "side"),
        (-L, [(-1, -1, -1), (-1, 1, -1), (-1, 1, 1), (-1, -1, 1)], "side"),
    ]
    # Antenna rises from the top, near his left rear corner; draw it behind the box when the box hides it.
    root3 = c + Un * (H / 2) + L * (W * 0.32) - Fn * (D * 0.2)
    tip3 = root3 + U * 30 + F * 3
    root, tip = to_screen(neck, root3), to_screen(neck, tip3)
    antenna_behind = float(np.dot(F, VIEW)) < 0  # box sits between antenna root and camera
    if antenna_behind:
        rod(d, tuple(root), tuple(tip), knob=4.0)
    for n, keys, role in faces:
        if float(np.dot(n, VIEW)) <= 0.02:
            continue
        pts = [to_screen(neck, corner[k]) for k in keys]
        fill = {"screen": CASING, "back": CASING_HI, "top": CASING_HI, "bottom": CASING, "side": CASING}[role]
        poly(d, pts, fill)
        if role == "screen":
            ctr = sum(pts) / 4
            poly(d, [ctr + (p - ctr) * 0.64 for p in pts], SCREEN, outline=SCREEN_LO, width=3)
        elif role == "back":
            a0, a1 = pts[0] + (pts[3] - pts[0]) * 0.5, pts[1] + (pts[2] - pts[1]) * 0.5
            d.line([tuple(a0 + (a1 - a0) * 0.18), tuple(a0 + (a1 - a0) * 0.82)], fill=TEAM, width=6)
    if not antenna_behind:
        rod(d, tuple(root), tuple(tip), knob=4.0)


def pack_antenna(d: ImageDraw.ImageDraw, root, f, length: float) -> None:
    tip = proj(root, f * -12, length)
    rod(d, tuple(root), tuple(tip), knob=5.0)


def composite(a: np.ndarray, top: Image.Image | None, under: Image.Image | None) -> np.ndarray:
    out = a.copy()
    mag = magenta_mask(a.astype(np.int32))
    for im, where in ((under, mag), (top, np.ones(mag.shape, bool))):
        if im is None:
            continue
        la = np.asarray(im).astype(np.float64)
        al = (la[..., 3:] / 255.0) * where[..., None]
        out = out * (1 - al) + la[..., :3] * al
    return out


def upright(a: np.ndarray, name: str, pose: str) -> np.ndarray:
    neck = NECK[pose][name]
    f, left = facing(name)
    size = (a.shape[1], a.shape[0])
    top, dt = layer(size)
    und, du = layer(size)
    down = 100 if pose == "stand" else 92
    # Pack antenna: pack sits behind him (-f), on his left. Hidden by the body/head
    # (drawn under) whenever that corner is on the far side from the camera.
    off = f * -40 + left * 22
    root = proj(neck, off, -22)
    pack_antenna(du if off[1] < 0 else dt, root, f, 62 if pose == "stand" else 60)
    ctrl_behind = f[1] < -0.2
    draw_controller(du if ctrl_behind else dt, neck, f, left, down, 34.0)
    return composite(a, top, und)


def prone(a: np.ndarray, name: str) -> np.ndarray:
    f, _ = facing(name)
    size = (a.shape[1], a.shape[0])
    top, dt = layer(size)
    und, du = layer(size)
    pack_antenna(du if f[1] > 0.35 else dt, PACK_TOP[name], f, 58)
    return composite(a, top, und)


def flood(mask: np.ndarray, x: int, y: int) -> np.ndarray:
    reg = np.zeros_like(mask)
    if not mask[y, x]:
        return reg
    reg[y, x] = True
    while True:
        g = grow(reg, 1) & mask
        if (g == reg).all():
            return reg
        reg = g


def corpse(a: np.ndarray, name: str) -> np.ndarray:
    """Dropped aid box becomes the dropped controller: gray casing, glass screen, stub antenna."""
    ai = a.astype(np.int32)
    mag = magenta_mask(ai)
    inner = ~mag & (ai.mean(-1) > 60)
    cx, cy = DIE_BOX[name]
    best = None
    for dy in range(-14, 15, 4):
        for dx in range(-14, 15, 4):
            reg = flood(inner, cx + dx, cy + dy)
            n = int(reg.sum())
            if 1500 < n < 12000 and (best is None or n > best.sum()):
                best = reg
    if best is None:
        raise SystemExit(f"die {name}: dropped box not found near {DIE_BOX[name]}")
    out = a.astype(np.float64).copy()
    label = (red_mask(ai) | white_mask(ai)) & best
    label = grow(label, 2) & best
    body = best & ~label
    lum = out[body].mean(-1, keepdims=True) / 110.0
    out[body] = np.clip(np.array(CASING_HI) * lum, 0, 255)
    lum2 = out[label].mean(-1, keepdims=True) / 200.0
    out[label] = np.clip(np.array(SCREEN) * (0.75 + 0.25 * lum2), 0, 255)
    ys, xs = np.nonzero(best)
    i = int(np.argmin(ys * 4 + xs))
    root = (float(xs[i]) + 6, float(ys[i]) + 6)
    top, dt = layer((a.shape[1], a.shape[0]))
    rod(dt, root, (root[0] + 18, root[1] - 16), knob=4.0)
    return composite(out, top, None)


def derive(pose: str, out_dir: Path) -> None:
    src_dir = SRC / f"medic-{pose}"
    out_dir.mkdir(parents=True, exist_ok=True)
    for n in NAMES:
        a = np.asarray(Image.open(src_dir / f"{n}.png").convert("RGB")).astype(np.float64)
        if pose == "die":
            a = corpse(a, n)
        a = clean_insignia(a)
        if pose in ("stand", "crouch"):
            a = upright(a, n, pose)
        elif pose == "crawl":
            a = prone(a, n)
        Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), "RGB").save(out_dir / f"{n}.png")
    print("wrote", out_dir)


# ---------------------------------------------------------------- compose

# Medic locks (tools/sprites/preview/medic-*-1-manifest.json): same cell, contact, scale.
POSES = {
    #          sheet     frames contactY scale
    "stand": ("walk", 8, 0.90, 0.2078),
    "crouch": ("crouch", 8, 0.88, 0.2120),
    "crawl": ("crawl", 8, 0.72, 0.2143),
    "die": ("die", 4, 0.82, 0.1963),
}


def compose(pose: str, tmp: Path) -> dict:
    sheet, frames, cy, scale = POSES[pose]
    one = tmp / f"droneop-{pose}-1.png"
    cmd = [
        sys.executable, str(ROOT / "tools/sprites/compose_unit_sheet.py"),
        "--unique-dir", str(SRC / f"droneop-{pose}"),
        "--cell", "96", "--contact-y", str(cy), "--padding", "6",
        "--scale", str(scale),
        "--draw-size", "25" if pose == "crawl" else "20",
        "--id", f"droneop_{pose}",
        "--preview-dir", str(ROOT / "tools/sprites/preview"),
        "--out", str(one),
    ]
    subprocess.run(cmd, check=True, cwd=ROOT)
    col = Image.open(one).convert("RGBA")
    out = Image.new("RGBA", (96 * frames, col.height), (0, 0, 0, 0))
    for k in range(frames):
        out.paste(col, (96 * k, 0))
    dest = UNITS / f"droneop-{sheet}.png"
    out.save(dest)
    man = json.loads((ROOT / "tools/sprites/preview" / f"droneop-{pose}-1-manifest.json").read_text())
    print("sheet", dest, out.size, "empty", man.get("empty_dirs"), "pop", man.get("size_pop_dirs"))
    return man


def cameo() -> None:
    im = Image.open(SRC / "droneop-stand/E.png").convert("RGB")
    a = np.asarray(im).astype(np.int32)
    alpha = np.where(magenta_mask(a), 0, 255).astype(np.uint8)
    rgba = Image.fromarray(np.dstack([a.astype(np.uint8), alpha]), "RGBA")
    bb = rgba.getbbox()
    crop = rgba.crop(bb)
    fit = min(64 / crop.width, 66 / crop.height)
    small = crop.resize((max(1, round(crop.width * fit)), max(1, round(crop.height * fit))), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (72, 72), (0, 0, 0, 0))
    out.alpha_composite(small, ((72 - small.width) // 2, 70 - small.height))
    out.save(UNITS / "droneop-cameo.png")
    print("cameo", UNITS / "droneop-cameo.png")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--compose", action="store_true")
    ap.add_argument("--tmp", default="/tmp")
    ap.add_argument("--poses", default="stand,crouch,crawl,die")
    args = ap.parse_args()
    poses = args.poses.split(",")
    for p in poses:
        derive(p, SRC / f"droneop-{p}")
    if (SRC / "droneop-stand/E.png").exists():
        Image.open(SRC / "droneop-stand/E.png").save(SRC / "droneop-east.png")
    if args.compose:
        for p in poses:
            compose(p, Path(args.tmp))
        cameo()


if __name__ == "__main__":
    main()
