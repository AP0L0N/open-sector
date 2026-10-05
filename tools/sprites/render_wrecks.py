#!/usr/bin/env python3
"""Burnt-out hulks for every hull that leaves a wreck.

Each wreck is built from the unit's own shipped layers so it keeps the live
camera, cell, scale, and contact line: the same fit the client applies at
runtime (composeAligned in turntable-sheet.ts) for turntable drop-ins, the
engine sheet itself for the rest. On top of that each class gets its own
damage: a turret knocked askew and a snapped barrel, a casemate gun torn
short, a launcher thrown off its mount, legs folded under a fallen torso, a
plane on its belly with a wing and the tail broken off. Every hulk is then
burnt (soot, rust, ash), holed, bitten at the edges, and set on a scorch
with debris around it.

Work happens at twice the engine cell and is downsampled once, the way the
runtime shrinks the 256 px turntable frames.

    python3 tools/sprites/render_wrecks.py               # every wreck sheet
    python3 tools/sprites/render_wrecks.py --only warden

Writes gridlock/packages/client/src/assets/units/wrecks/<type>.png
(1 frame x 16 rows, south first) and a live-vs-wreck contact sheet per unit
in tools/sprites/preview/wrecks/.
"""

from __future__ import annotations

import argparse
import json
import math
import zlib
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
UNITS = ROOT / "gridlock/packages/client/src/assets/units"
OUT = UNITS / "wrecks"
PREVIEW = ROOT / "tools/sprites/preview/wrecks"

DIRS = 16
K = 2  # work scale over the engine cell

OUTLINE = np.array([26, 20, 16], np.float32) / 255
SOOT = np.array([22, 19, 17], np.float32) / 255
CHARCOAL = np.array([66, 60, 54], np.float32) / 255
ASH = np.array([132, 124, 112], np.float32) / 255
RUST = np.array([104, 52, 28], np.float32) / 255
RUST_HI = np.array([150, 82, 40], np.float32) / 255
HOLE = np.array([12, 10, 9], np.float32) / 255
DEBRIS = [(38, 33, 29), (58, 51, 45), (84, 76, 66), (96, 50, 28), (120, 66, 34)]


# --------------------------------------------------------------------------- io


def frames(folder: Path) -> list[Image.Image]:
    return [Image.open(folder / f"{i:04d}.png").convert("RGBA") for i in range(1, DIRS + 1)]


def sheet_rows(path: Path, cell: int) -> list[Image.Image]:
    """Column 0 of an engine sheet, one cell per row, at work scale."""
    sheet = Image.open(path).convert("RGBA")
    out = []
    for r in range(DIRS):
        c = sheet.crop((0, r * cell, cell, (r + 1) * cell))
        out.append(c.resize((cell * K, cell * K), Image.LANCZOS))
    return out


def place(dst: Image.Image, src: Image.Image, x: int, y: int) -> None:
    """alpha_composite that tolerates offsets off the canvas."""
    sx0 = max(0, -x)
    sy0 = max(0, -y)
    sx1 = min(src.width, dst.width - x)
    sy1 = min(src.height, dst.height - y)
    if sx1 <= sx0 or sy1 <= sy0:
        return
    dst.alpha_composite(src.crop((sx0, sy0, sx1, sy1)), (x + sx0, y + sy0))


def compose_aligned(layers: list[list[Image.Image]], cell: int, contact_y: float, padding: int) -> list[list[Image.Image]]:
    """Python twin of composeAligned: one transform for every layer, hull bottom on the contact line."""
    boxes = []
    hull_bottoms = []
    for i in range(DIRS):
        for li, layer in enumerate(layers):
            b = layer[i].getbbox()
            if not b:
                raise SystemExit(f"empty layer {li} frame {i + 1}")
            boxes.append(b)
            if li == 0:
                hull_bottoms.append(b[3])
    x0 = min(b[0] for b in boxes)
    y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes)
    y1 = max(b[3] for b in boxes)
    room = max(1, cell - 2 * padding)
    scale = min(room / (x1 - x0), room / (y1 - y0), 1)
    cx = layers[0][0].width / 2
    med = sorted(hull_bottoms)[len(hull_bottoms) // 2]
    ox = cell / 2 - cx * scale
    oy = cell * contact_y - med * scale
    lo = padding - y0 * scale
    hi = cell - padding - y1 * scale
    oy = (lo + hi) / 2 if hi < lo else min(hi, max(lo, oy))
    out = []
    for layer in layers:
        cells = []
        for img in layer:
            w = max(1, round(img.width * scale))
            h = max(1, round(img.height * scale))
            c = Image.new("RGBA", (cell, cell))
            place(c, img.resize((w, h), Image.LANCZOS), round(ox), round(oy))
            cells.append(c)
        out.append(cells)
    return out


# ------------------------------------------------------------------- pixel ops


def arr(im: Image.Image) -> np.ndarray:
    return np.asarray(im, np.float32) / 255


def img(a: np.ndarray) -> Image.Image:
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")


def noise(rng: np.random.Generator, h: int, w: int, period: float) -> np.ndarray:
    gh = max(2, int(h / period) + 2)
    gw = max(2, int(w / period) + 2)
    g = (rng.random((gh, gw)) * 255).astype(np.uint8)
    return np.asarray(Image.fromarray(g, "L").resize((w, h), Image.BICUBIC), np.float32) / 255


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def morph(mask: np.ndarray, size: int, grow: bool) -> np.ndarray:
    m = Image.fromarray((mask * 255).astype(np.uint8), "L")
    m = m.filter(ImageFilter.MaxFilter(size) if grow else ImageFilter.MinFilter(size))
    return np.asarray(m) > 127


def bbox(im: Image.Image) -> tuple[int, int, int, int] | None:
    return im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()


def char(im: Image.Image, rng: np.random.Generator, soot: float = 0.5, rust: float = 0.35) -> Image.Image:
    """Burn the paint off. The live shading survives as the light on the bare metal."""
    a = arr(im)
    h, w = a.shape[:2]
    lum = a[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
    t = np.clip(lum * 1.3 + 0.04, 0, 1)[..., None]
    ramp = SOOT * (1 - t) ** 2 + CHARCOAL * 2 * t * (1 - t) + ASH * t * t
    s = smoothstep(1 - soot, 1 - soot + 0.3, noise(rng, h, w, 4 * K))[..., None] * 0.5
    r = smoothstep(1 - rust, 1 - rust + 0.25, noise(rng, h, w, 3 * K))[..., None] * (1 - s) * 0.55
    grain = noise(rng, h, w, 1.2 * K)[..., None]
    out = ramp * (1 - s) + SOOT * s
    out = out * (1 - r) + RUST * (0.7 + 0.6 * t) * r
    out = out * (0.92 + 0.16 * grain)
    # Keep the hard outline dark.
    dark = (lum < 0.2)[..., None]
    out = np.where(dark, np.minimum(out, a[..., :3] * 0.8 + OUTLINE * 0.2), out)
    a[..., :3] = out
    return img(a)


def punch_holes(im: Image.Image, rng: np.random.Generator, n: int, rmin: float, rmax: float) -> Image.Image:
    """Penetrations: dark torn holes with a rust lip."""
    a = arr(im)
    h, w = a.shape[:2]
    solid = a[..., 3] > 0.9
    inner = morph(solid, int(rmax * 2) | 1, grow=False)
    cand = np.argwhere(inner)
    if len(cand) == 0 or n <= 0:
        return im
    yy, xx = np.mgrid[0:h, 0:w]
    for _ in range(n):
        cy, cx = cand[rng.integers(len(cand))]
        r = rng.uniform(rmin, rmax)
        ph = rng.uniform(0, math.tau, 2)
        ang = np.arctan2(yy - cy, xx - cx)
        rr = r * (1 + 0.14 * np.sin(3 * ang + ph[0]) + 0.08 * np.sin(5 * ang + ph[1]))
        d = np.hypot(xx - cx, (yy - cy) * 1.3)
        hole = (d < rr) & solid
        lip = (d < rr + 0.8 * K) & ~hole & solid
        # Lit lower lip: the torn plate curls out toward the camera.
        low = lip & (yy > cy)
        a[hole, :3] = HOLE
        a[lip, :3] = a[lip, :3] * 0.5 + RUST * 0.5
        a[low, :3] = a[low, :3] * 0.55 + RUST_HI * 0.45
    return img(a)


def bite(im: Image.Image, rng: np.random.Generator, n: int, rmin: float, rmax: float) -> Image.Image:
    """Blow chunks off the silhouette and outline the torn edge."""
    a = arr(im)
    h, w = a.shape[:2]
    solid = a[..., 3] > 0.5
    edge = solid & morph(~solid, 3, grow=True)
    cand = np.argwhere(edge)
    if len(cand) == 0 or n <= 0:
        return im
    yy, xx = np.mgrid[0:h, 0:w]
    gone = np.zeros((h, w), bool)
    for _ in range(n):
        cy, cx = cand[rng.integers(len(cand))]
        r = rng.uniform(rmin, rmax)
        ph = rng.uniform(0, math.tau, 2)
        ang = np.arctan2(yy - cy, xx - cx)
        rr = r * (1 + 0.35 * np.sin(4 * ang + ph[0]) + 0.2 * np.sin(7 * ang + ph[1]))
        gone |= np.hypot(xx - cx, yy - cy) < rr
    gone &= solid
    a[gone, 3] = 0
    torn = (a[..., 3] > 0.5) & morph(gone, 3 + 2 * (K - 1), grow=True)
    a[torn, :3] = a[torn, :3] * 0.3 + OUTLINE * 0.7
    return img(a)


def snap_barrel(gun: Image.Image, pivot: tuple[float, float], keep: float, rng: np.random.Generator) -> Image.Image:
    """Cut the barrel off past `keep` of its reach from the pivot, with a ragged end."""
    a = arr(gun)
    solid = a[..., 3] > 0.05
    if not solid.any():
        return gun
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.hypot(xx - pivot[0], (yy - pivot[1]) * 1.6)
    ds = d[solid]
    cut = ds.min() + keep * (ds.max() - ds.min())
    jag = (noise(rng, h, w, 1.2 * K) - 0.5) * 3 * K
    a[(d > cut + jag), 3] = 0
    end = (a[..., 3] > 0.3) & (d > cut + jag - 2.2 * K)
    a[end, :3] = a[end, :3] * 0.25 + HOLE * 0.75
    return img(a)


def transform(im: Image.Image, angle: float, center: tuple[float, float], dx: float, dy: float) -> Image.Image:
    return im.rotate(angle, resample=Image.BICUBIC, center=center, translate=(dx, dy))


def squash_below(im: Image.Image, split: float, keep: float, splay: float = 1.0, tilt: float = 0.0) -> Image.Image:
    """Fold everything under `split` (fraction of the opaque height) down to `keep` of its height.

    The part above drops onto it. Used for legs giving way under a body.
    """
    b = bbox(im)
    if not b:
        return im
    x0, y0, x1, y1 = b
    sy = int(y0 + (y1 - y0) * split)
    top = im.crop((0, 0, im.width, sy))
    low = im.crop((0, sy, im.width, y1))
    nh = max(1, int(low.height * keep))
    nw = int(im.width * splay)
    low = low.resize((nw, nh), Image.LANCZOS)
    out = Image.new("RGBA", im.size)
    place(out, low, (im.width - nw) // 2, y1 - nh)
    drop = (y1 - sy) - nh
    top = transform(top, tilt, ((x0 + x1) / 2, sy), 0, 0)
    place(out, top, 0, drop + 1 * K)
    return out


# --------------------------------------------------------------- ground dressing


def footprint(im: Image.Image, contact_y: float) -> tuple[float, float, float, float]:
    b = bbox(im) or (0, 0, im.width, im.height)
    cx = (b[0] + b[2]) / 2
    cy = im.height * contact_y - (b[3] - b[1]) * 0.12
    rx = (b[2] - b[0]) * 0.5
    return cx, cy, rx, rx * 0.42


def scorch(size: int, fp: tuple[float, float, float, float], strength: float = 0.5, stretch: tuple[float, float] = (0, 0)) -> Image.Image:
    cx, cy, rx, ry = fp
    m = Image.new("L", (size, size))
    g = ImageDraw.Draw(m)
    g.ellipse((cx - rx * 1.05, cy - ry * 1.05, cx + rx * 1.05, cy + ry * 1.05), fill=int(255 * strength))
    if stretch != (0, 0):
        # A skid: the same burn smeared along the slide.
        for k in range(1, 7):
            f = k / 6
            ex = cx + stretch[0] * f
            ey = cy + stretch[1] * f
            sc = 1 - 0.55 * f
            g.ellipse((ex - rx * sc, ey - ry * sc, ex + rx * sc, ey + ry * sc), fill=int(255 * strength * (1 - 0.6 * f)))
    m = m.filter(ImageFilter.GaussianBlur(3 * K))
    out = Image.new("RGBA", (size, size), (18, 14, 11, 0))
    out.putalpha(m)
    return out


def debris(size: int, fp, rng: np.random.Generator, n: int, spread: float = 1.25, trail: tuple[float, float] = (0, 0)) -> tuple[Image.Image, Image.Image]:
    """Torn plate and track links around the hull. Returns (behind, in front)."""
    cx, cy, rx, ry = fp
    back = Image.new("RGBA", (size, size))
    front = Image.new("RGBA", (size, size))
    gb = ImageDraw.Draw(back)
    gf = ImageDraw.Draw(front)
    for i in range(n):
        if trail != (0, 0) and i % 2 == 0:
            f = rng.uniform(0.2, 1.0)
            x = cx + trail[0] * f + rng.normal(0, rx * 0.18)
            y = cy + trail[1] * f + rng.normal(0, ry * 0.25)
        else:
            ang = rng.uniform(0, math.tau)
            rad = rng.uniform(0.75, spread)
            x = cx + math.cos(ang) * rx * rad
            y = cy + math.sin(ang) * ry * rad
        s = rng.uniform(1.2, 3.2) * K
        pts = []
        verts = int(rng.integers(3, 6))
        rot = rng.uniform(0, math.tau)
        for v in range(verts):
            t = rot + v * math.tau / verts + rng.uniform(-0.4, 0.4)
            rr = s * rng.uniform(0.6, 1.3)
            pts.append((x + math.cos(t) * rr, y + math.sin(t) * rr * 0.6))
        col = DEBRIS[int(rng.integers(len(DEBRIS)))]
        g = gf if y > cy else gb
        g.polygon(pts, fill=col + (255,), outline=(26, 20, 16, 255))
    return back, front


def fade_edges(im: Image.Image, margin: float) -> Image.Image:
    """Ground dressing thins out before the cell edge so it never shows a straight cut."""
    a = arr(im)
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    edge = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)).astype(np.float32)
    a[..., 3] *= smoothstep(1, margin, edge)
    return img(a)


def stack(size: int, parts: list[Image.Image | None]) -> Image.Image:
    out = Image.new("RGBA", (size, size))
    for p in parts:
        if p is not None:
            out.alpha_composite(p)
    return out


def gun_behind(row: int) -> bool:
    """The live draw puts the gun under the turret when it points up the screen (rows NW..NE)."""
    return 5 <= row <= 11


def screen_axes(row: int, k: float = 0.5) -> tuple[tuple[float, float], tuple[float, float]]:
    """Nose and right-wing directions on screen for a south-first row."""
    a = math.radians(row * 22.5)
    fwd = (-math.sin(a), math.cos(a) * k)
    side = (math.cos(a), math.sin(a) * k)
    return fwd, side


# --------------------------------------------------------------------- recipes


@dataclass
class Spec:
    type: str
    cell: int
    contact_y: float
    recipe: str
    src: str = ""
    layers: list[str] = field(default_factory=list)
    padding: int = 4
    sheets: dict[str, str] = field(default_factory=dict)
    turn: int = 3  # rows the turret is knocked round
    keep: float = 0.45  # share of the barrel left
    holes: int = 3
    bites: int = 3
    soot: float = 0.5
    debris: int = 14
    raw: bool = False  # layers stacked 1:1 on their own cell, never refit (the Battle Ship)
    sink: float = 0.0  # engine px the hulk settles below the waterline
    list_deg: float = 0.0  # roll toward the low side, screen degrees


SPECS = [
    Spec("warden", 128, 0.92, "turret", src="tiger", layers=["hull", "turret", "gun"], turn=3, keep=0.42),
    Spec("apocalypse", 128, 0.92, "turret", src="apocalypse", layers=["hull", "turret", "gun", "ciws"], turn=-2, keep=0.5, holes=4, debris=18),
    Spec("ss3", 128, 0.92, "casemate", src="ss3", layers=["hull", "gun"], keep=0.4),
    Spec("jagdtiger", 128, 0.92, "casemate", src="jagdtiger", layers=["hull", "gun"], keep=0.36, holes=4, debris=16),
    Spec("supply", 128, 0.92, "soft", src="supply-truck", layers=["hull"], holes=4, bites=5, soot=0.68, debris=16),
    Spec("nebelwerfer", 128, 0.92, "launcher", src="nebelwerfer", layers=["hull", "launcher"], turn=2, holes=3, bites=4, soot=0.6),
    Spec("hauler", 128, 0.92, "soft", sheets={"hull": "hauler-hull.png"}, holes=3, bites=4, debris=16),
    Spec("hauler-cart", 128, 0.92, "soft", sheets={"hull": "hauler-cart.png"}, holes=2, bites=3, soot=0.45, debris=6),
    Spec("walker", 128, 0.9, "legs", sheets={"legs": "walker-legs.png", "torso": "walker-torso.png"}, turn=1, holes=2, bites=2, debris=10),
    Spec("titan", 192, 0.84, "legs", sheets={"legs": "titan-legs.png", "torso": "titan-torso.png", "gun": "titan-gun.png"}, turn=1, keep=0.5, holes=4, bites=3, debris=18),
    Spec("mammoth", 128, 0.92, "fold", sheets={"hull": "mammoth-walk.png"}, holes=4, bites=3, debris=18),
    Spec("stuka", 128, 0.8, "plane", src="stuka", layers=["hull"], padding=2, holes=3, bites=2, debris=14),
    Spec("fw190", 128, 0.8, "plane", src="fw190", layers=["hull"], padding=2, holes=3, bites=2, debris=12),
    Spec("bv222", 128, 0.8, "plane", src="bv222", layers=["hull"], padding=2, holes=5, bites=3, debris=18),
    Spec("he111", 128, 0.8, "plane", src="he111", layers=["hull"], padding=2, holes=4, bites=3, debris=16),
    Spec("gunboat", 128, 0.74, "sunk", src="gunboat", layers=["hull"], padding=2, holes=3, bites=3, soot=0.55, debris=8, sink=6, list_deg=7),
    Spec("submarine", 128, 0.74, "sunk", src="submarine", layers=["hull"], padding=2, holes=3, bites=2, soot=0.45, debris=6, sink=3.5, list_deg=-4),
    Spec("destroyer", 128, 0.74, "sunk", src="destroyer", layers=["hull"], padding=2, holes=4, bites=3, soot=0.55, debris=10, sink=5, list_deg=6),
    Spec("lst", 128, 0.74, "sunk", src="lst", layers=["hull"], padding=2, holes=5, bites=3, soot=0.55, debris=12, sink=5, list_deg=-5),
    Spec("aswheli", 128, 0.8, "plane", src="aswheli", layers=["hull"], padding=2, holes=2, bites=2, debris=10),
    # Same cell as render_battleship.py's CELL: the client reads the hulk on the live sheet's cell.
    Spec("battleship", 384, 0.56, "sunk", src="battleship", layers=["hull", "super", "turret", "ciws"], raw=True,
         turn=3, holes=6, bites=4, soot=0.5, debris=14, sink=15, list_deg=-3),
]


def load_layers(spec: Spec) -> dict[str, list[Image.Image]]:
    if spec.raw:
        size = spec.cell * K
        return {n: [f.resize((size, size), Image.LANCZOS) for f in frames(UNITS / spec.src / n)] for n in spec.layers}
    if spec.src:
        raw = [frames(UNITS / spec.src / name) for name in spec.layers]
        composed = compose_aligned(raw, spec.cell * K, spec.contact_y, spec.padding * K)
        return dict(zip(spec.layers, composed))
    return {name: sheet_rows(UNITS / file, spec.cell) for name, file in spec.sheets.items()}


def finish(spec: Spec, body: Image.Image, rng: np.random.Generator, extra_front: list[Image.Image] | None = None,
           skid: tuple[float, float] = (0, 0), scorch_strength: float = 0.5) -> Image.Image:
    size = body.width
    fp = footprint(body, spec.contact_y)
    if spec.recipe == "plane":
        # A plane's span fills the cell; burn the ground under the fuselage, not the wingtips.
        fp = (fp[0], fp[1], fp[2] * 0.55, fp[3] * 0.55)
    back, front = debris(size, fp, rng, spec.debris, trail=skid)
    margin = 5 * K
    ground = fade_edges(scorch(size, fp, scorch_strength, skid), margin)
    return stack(size, [ground, fade_edges(back, margin), body, *(extra_front or []), fade_edges(front, margin)])


def hull_damage(spec: Spec, im: Image.Image, rng: np.random.Generator, holes: int | None = None, bites: int | None = None) -> Image.Image:
    # Chunks scale with the silhouette, so a narrow nose-on row is not eaten away.
    b = bbox(im)
    m = min(b[2] - b[0], b[3] - b[1]) if b else spec.cell * K / 3
    im = bite(im, rng, spec.bites if bites is None else bites, m * 0.08, m * 0.16)
    im = char(im, rng, soot=spec.soot)
    unit = spec.cell / 128
    return punch_holes(im, rng, spec.holes if holes is None else holes, 1.1 * unit * K, 2.0 * unit * K)


def turret_pivot(turret: Image.Image) -> tuple[float, float]:
    b = bbox(turret) or (0, 0, turret.width, turret.height)
    return (b[0] + b[2]) / 2, (b[1] + b[3]) / 2


def wreck_turret(spec: Spec, L, r: int, rng) -> Image.Image:
    size = spec.cell * K
    tr = (r + spec.turn) % DIRS
    hull = hull_damage(spec, L["hull"][r], rng)
    turret = L["turret"][tr]
    pivot = turret_pivot(turret)
    gun = snap_barrel(L["gun"][tr], pivot, spec.keep, rng) if "gun" in L else None
    # Knocked off the ring: slewed, tipped, and slid toward the low side.
    tilt = (6 if spec.turn > 0 else -6) + rng.uniform(-2, 2)
    dx, dy = (2.5 * K if spec.turn > 0 else -2.5 * K), 1.5 * K
    turret = char(transform(turret, tilt, pivot, dx, dy), rng, soot=spec.soot)
    turret = punch_holes(turret, rng, 1, 1.6 * K, 2.6 * K)
    if gun is not None:
        gun = char(transform(gun, tilt, pivot, dx, dy + 1 * K), rng, soot=spec.soot + 0.1)
    behind = gun_behind(tr)
    body = stack(size, [gun if behind else None, hull, turret, None if behind else gun])
    extra = []
    if "ciws" in L:
        # The roof mount is torn off and lies beside the hull.
        mount = L["ciws"][(r + 5) % DIRS]
        mb = bbox(mount)
        hb = bbox(hull)
        if mb and hb:
            mount = char(mount, rng, soot=0.6)
            mount = transform(mount, 24, ((mb[0] + mb[2]) / 2, (mb[1] + mb[3]) / 2), 0, 0)
            tx = (hb[2] - (mb[0] + mb[2]) / 2) * 0.85
            ty = (hb[3] - (mb[1] + mb[3]) / 2) - 1.5 * K
            extra.append(transform(mount, 0, (0, 0), tx, ty))
    return finish(spec, body, rng, extra)


def wreck_casemate(spec: Spec, L, r: int, rng) -> Image.Image:
    size = spec.cell * K
    hull = hull_damage(spec, L["hull"][r], rng)
    pivot = turret_pivot(L["gun"][r])
    hb = bbox(L["hull"][r])
    if hb:
        pivot = ((hb[0] + hb[2]) / 2, (hb[1] + hb[3]) / 2)
    gun = snap_barrel(L["gun"][r], pivot, spec.keep, rng)
    # The torn barrel sags on its mantlet.
    gun = char(transform(gun, 0, pivot, 0, 1.5 * K), rng, soot=spec.soot + 0.1)
    behind = gun_behind(r)
    return finish(spec, stack(size, [gun if behind else None, hull, None if behind else gun]), rng)


def wreck_launcher(spec: Spec, L, r: int, rng) -> Image.Image:
    size = spec.cell * K
    hull = hull_damage(spec, L["hull"][r], rng)
    tr = (r + spec.turn) % DIRS
    frame = L["launcher"][tr]
    pivot = turret_pivot(frame)
    # The tube frame is blown half off its mount: slewed, tipped, tubes burst.
    frame = transform(frame, 11, pivot, 2 * K, 2 * K)
    frame = bite(frame, rng, 4, 2.5 * K, 5 * K)
    frame = char(frame, rng, soot=0.65)
    return finish(spec, stack(size, [hull, frame]), rng)


def wreck_soft(spec: Spec, L, r: int, rng) -> Image.Image:
    # The cab and bed burn out; the frame sags a little toward the ground.
    hull = L["hull"][r]
    hb = bbox(hull)
    if hb:
        hull = squash_below(hull, 0.0, 0.94)
    return finish(spec, hull_damage(spec, hull, rng), rng, scorch_strength=0.6)


def wreck_legs(spec: Spec, L, r: int, rng) -> Image.Image:
    size = spec.cell * K
    legs = L["legs"][r]
    tr = (r + spec.turn) % DIRS
    torso = L["torso"][tr]
    lb = bbox(legs)
    tb = bbox(torso)
    if not lb or not tb:
        return finish(spec, legs, rng)
    # Knees give: the legs fold to under half their height and splay.
    leg_h = lb[3] - lb[1]
    keep = 0.34
    folded = Image.new("RGBA", legs.size)
    low = legs.crop(lb)
    nh = max(1, int(low.height * keep))
    nw = int(low.width * 1.25)
    low = low.resize((nw, nh), Image.LANCZOS)
    place(folded, low, int((lb[0] + lb[2]) / 2 - nw / 2), lb[3] - nh)
    folded = hull_damage(spec, folded, rng, bites=spec.bites + 1)
    # The torso comes down onto them, tipped forward.
    drop = (leg_h - nh) * 0.85
    tilt = rng.uniform(16, 22) * (1 if r % 2 else -1)
    pivot = ((tb[0] + tb[2]) / 2, (tb[1] + tb[3]) / 2)
    torso_d = char(transform(torso, tilt, pivot, 0, drop), rng, soot=spec.soot)
    torso_d = punch_holes(torso_d, rng, max(1, spec.holes // 2), 1.6 * K, 3 * K)
    gun = None
    if "gun" in L:
        gun = snap_barrel(L["gun"][tr], pivot, spec.keep, rng)
        gun = char(transform(gun, tilt, pivot, 0, drop + 1 * K), rng, soot=spec.soot + 0.1)
    behind = gun_behind(tr)
    body = stack(size, [gun if behind else None, folded, torso_d, None if behind else gun])
    return finish(spec, body, rng)


def wreck_fold(spec: Spec, L, r: int, rng) -> Image.Image:
    # One sheet with the legs painted in: fold the lower half under the body.
    body = squash_below(L["hull"][r], 0.58, 0.38, splay=1.08, tilt=rng.uniform(-5, 5))
    return finish(spec, hull_damage(spec, body, rng), rng)


def wreck_plane(spec: Spec, L, r: int, rng, side: int) -> Image.Image:
    size = spec.cell * K
    plane = L["hull"][r]
    a = arr(plane)
    # The propeller blur is a half-clear disc. A dead engine does not spin it.
    a[a[..., 3] < 0.6, 3] = 0
    solid = a[..., 3] > 0.05
    ys, xs = np.nonzero(solid)
    if len(xs) == 0:
        return plane
    w8 = a[..., 3][solid]
    cx = float((xs * w8).sum() / w8.sum())
    cy = float((ys * w8).sum() / w8.sum())
    k = 0.5
    ang = math.radians(r * 22.5)
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    ux = xx - cx
    uy = (yy - cy) / k
    lat = ux * math.cos(ang) + uy * math.sin(ang)
    lon = -ux * math.sin(ang) + uy * math.cos(ang)
    span = np.abs(lat[solid]).max()
    length = np.abs(lon[solid]).max()
    fwd, right = screen_axes(r, k)

    def piece(mask: np.ndarray) -> Image.Image:
        p = a.copy()
        p[~mask, 3] = 0
        return img(p)

    jag = (noise(rng, h, w, 1.5 * K) - 0.5) * 4 * K
    wing_cut = (lat * side > span * 0.42 + jag) & solid
    tail_cut = (lon < -length * 0.5 + jag) & solid & ~wing_cut
    body = piece(solid & ~wing_cut & ~tail_cut)
    wing = piece(wing_cut)
    tail = piece(tail_cut)
    # The broken wing lies off to its side, the tail slewed behind.
    wdx = right[0] * side * 4 * K + fwd[0] * -2 * K
    wdy = right[1] * side * 4 * K + fwd[1] * -2 * K + 1 * K
    wb = bbox(wing)
    if wb:
        wing = transform(wing, 14 * side, ((wb[0] + wb[2]) / 2, (wb[1] + wb[3]) / 2), wdx, wdy)
    tb = bbox(tail)
    if tb:
        tdx = fwd[0] * -3 * K + right[0] * -side * 2.5 * K
        tdy = fwd[1] * -3 * K + right[1] * -side * 2.5 * K + 1 * K
        tail = transform(tail, -10 * side, ((tb[0] + tb[2]) / 2, (tb[1] + tb[3]) / 2), tdx, tdy)
    # Down on its belly: no gear under it.
    body = transform(body, 0, (0, 0), 0, 2 * K)
    body = hull_damage(spec, body, rng)
    wing = char(bite(wing, rng, 1, 2 * K, 4 * K), rng, soot=0.6)
    tail = char(tail, rng, soot=0.55)
    skid = (-fwd[0] * size * 0.18, -fwd[1] * size * 0.18)
    parts = sorted([wing, tail, body], key=lambda p: (bbox(p) or (0, 0, 0, 0))[3])
    return finish(spec, stack(size, parts), rng, skid=skid, scorch_strength=0.55)


# ------------------------------------------------------------------ sunk ships

WATER = np.array([34, 74, 82], np.float32) / 255
FOAM = (168, 196, 194)
OIL = (16, 18, 20)
SHEEN = [(84, 52, 104), (44, 92, 70), (110, 92, 40)]

# render_battleship.py's numbers, mirrored from client/src/render/battleship.ts.
BS_HALF_LENGTH = 13.6
BS_SCALE_FRAC = 0.0325
BS_TURRET_AT = (0.6, 0.38)
BS_TURRET_Z = (1.02, 1.6)
BS_CIWS_AT = (-0.04, -0.8)
BS_CIWS_Z = (2.58, 1.02)
BS_SUPER_AT = -1.2
SIN_CAM = math.sin(math.pi / 6)
COS_CAM = math.cos(math.pi / 6)


def ring_mask(im: Image.Image) -> np.ndarray:
    """The live hull's waterline halo: the teal wash a boat sheet is cut over."""
    a = arr(im)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (a[..., 3] > 0.02) & (b > r + 0.08) & (b > g - 0.04)


def strip_wake(im: Image.Image) -> Image.Image:
    a = arr(im)
    ring = ring_mask(im)
    a[ring, 3] = 0
    # The halo's own dark rim is left floating once the teal goes: drop dark pixels the hull no longer backs.
    solid = a[..., 3] > 0.5
    lum = a[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
    body = solid & (lum > 0.16)
    near = morph(body, 3 + 2 * K, grow=True)
    a[solid & ~near, 3] = 0
    a[a[..., 3] < 0.6, 3] = 0
    return img(a)


def waterline_area(hull_raw: Image.Image) -> np.ndarray:
    """Water the hull sat in: the halo and everything it encloses."""
    ring = ring_mask(hull_raw)
    solid = np.asarray(hull_raw)[..., 3] > 127
    wall = Image.fromarray(((ring | solid) * 255).astype(np.uint8), "L")
    wall = wall.filter(ImageFilter.MaxFilter(3))
    canvas = Image.new("L", (wall.width + 2, wall.height + 2), 0)
    canvas.paste(wall, (1, 1))
    ImageDraw.floodfill(canvas, (0, 0), 128)
    inside = np.asarray(canvas)[1:-1, 1:-1] != 128
    if not ring.any():
        return inside
    # Superstructure above the ring's top is not water.
    top = np.argwhere(ring)[:, 0].min()
    inside[:top] = False
    return inside


def bottom_contour(mask: np.ndarray) -> np.ndarray:
    """Lowest opaque row per column; columns off the hull take their nearest neighbour's."""
    h, w = mask.shape
    has = mask.any(axis=0)
    low = np.where(has, h - 1 - np.argmax(mask[::-1], axis=0), -1).astype(np.float32)
    cols = np.nonzero(has)[0]
    if len(cols) == 0:
        return np.full(w, -1, np.float32)
    idx = np.clip(np.searchsorted(cols, np.arange(w)), 0, len(cols) - 1)
    left = cols[np.clip(idx - 1, 0, len(cols) - 1)]
    right = cols[idx]
    pick = np.where(np.abs(np.arange(w) - left) < np.abs(right - np.arange(w)), left, right)
    out = np.where(has, low, low[pick])
    # Smooth the cut so it reads as a water surface, not a stair.
    k = max(1, 2 * K)
    pad = np.pad(out, k, mode="edge")
    return np.convolve(pad, np.ones(2 * k + 1) / (2 * k + 1), mode="same")[k:-k]


def settle(body: Image.Image, contour: np.ndarray, depth: float, list_deg: float, rng: np.random.Generator) -> Image.Image:
    """Drop the hulk by `depth`, roll it, and drown everything under the old waterline."""
    b = bbox(body) or (0, 0, body.width, body.height)
    pivot = ((b[0] + b[2]) / 2, b[3])
    moved = transform(body, list_deg, pivot, 0, depth)
    a = arr(moved)
    h, w = a.shape[:2]
    yy = np.mgrid[0:h, 0:w][0].astype(np.float32)
    jag = (noise(rng, h, w, 2 * K) - 0.5) * 1.2 * K
    line = contour[None, :] + jag
    under = yy > line
    # Below the surface the drowned hull still shows as a dim green-grey ghost, fading with depth.
    deep = smoothstep(0, 5.0 * K, yy - line)
    a[under, :3] = a[under, :3] * 0.3 + WATER * 0.7
    a[under, 3] *= (0.42 * (1 - deep[under] * 0.8))
    # Just above the cut the plate shows through the shallows: tinted, half there.
    band = 3.0 * K
    f = smoothstep(0, band, line - yy)[..., None]
    a[..., :3] = a[..., :3] * (0.45 + 0.55 * f) + WATER * (1 - f) * 0.55
    a[..., 3] *= (0.5 + 0.5 * f[..., 0])
    # Wash on the waterline where the hull breaks the surface.
    lip = (a[..., 3] > 0.3) & (line - yy < 1.0 * K) & (line - yy >= 0)
    a[lip, :3] = a[lip, :3] * 0.35 + np.array(FOAM, np.float32) / 255 * 0.65
    return img(a)


def water_dressing(size: int, area: np.ndarray, rng: np.random.Generator, n_debris: int) -> tuple[Image.Image, Image.Image]:
    """Oil slick and a ripple ring under the hulk, floating junk around it. Returns (under, over)."""
    margin = 5 * K
    m = Image.fromarray((area * 255).astype(np.uint8), "L")
    grow = int(6 * K) | 1
    slick = m.filter(ImageFilter.MaxFilter(grow)).filter(ImageFilter.GaussianBlur(3 * K))
    sl = np.asarray(slick, np.float32) / 255
    h, w = sl.shape
    blot = noise(rng, h, w, 7 * K)
    sl = sl * smoothstep(0.25, 0.7, blot * 0.6 + sl * 0.7)
    under = np.zeros((h, w, 4), np.float32)
    under[..., :3] = np.array(OIL, np.float32) / 255
    under[..., 3] = sl * 0.5
    # Rainbow sheen streaks on the slick.
    for i, col in enumerate(SHEEN):
        streak = smoothstep(0.62, 0.8, noise(rng, h, w, 3 * K)) * sl
        c = np.array(col, np.float32) / 255
        mix = (streak * 0.6)[..., None]
        under[..., :3] = under[..., :3] * (1 - mix) + c * mix
        under[..., 3] = np.maximum(under[..., 3], streak * 0.35)
    # A calm ring of disturbed water just off the hull.
    outer = np.asarray(m.filter(ImageFilter.MaxFilter(int(3 * K) | 1)), np.float32) / 255 > 0.5
    inner = np.asarray(m.filter(ImageFilter.MaxFilter(int(1.5 * K) | 1)), np.float32) / 255 > 0.5
    ripple = outer & ~inner & (noise(rng, h, w, 4 * K) > 0.55)
    under[ripple, :3] = np.array(FOAM, np.float32) / 255
    under[ripple, 3] = 0.22
    under_img = fade_edges(img(under), margin)

    over = Image.new("RGBA", (size, size))
    g = ImageDraw.Draw(over)
    ys, xs = np.nonzero(area)
    if len(xs) and n_debris > 0:
        cx, cy = xs.mean(), ys.mean()
        rx = max(4 * K, (xs.max() - xs.min()) / 2)
        ry = max(3 * K, (ys.max() - ys.min()) / 2)
        for _ in range(n_debris):
            ang = rng.uniform(0, math.tau)
            rad = rng.uniform(0.9, 1.5)
            x = cx + math.cos(ang) * rx * rad
            y = cy + math.sin(ang) * ry * rad
            s = rng.uniform(1.0, 2.4) * K
            rot = rng.uniform(0, math.pi)
            # A plank or a scrap of plate, flat on the water, with a ring of ripple round it.
            dx, dy = math.cos(rot) * s, math.sin(rot) * s * 0.5
            g.ellipse((x - s * 1.4, y - s * 0.7, x + s * 1.4, y + s * 0.7), outline=FOAM + (90,))
            col = DEBRIS[int(rng.integers(len(DEBRIS)))]
            g.line((x - dx, y - dy, x + dx, y + dy), fill=col + (255,), width=max(1, int(K * 1.2)))
    return under_img, fade_edges(over, margin)


def bs_row_yaw(row: int) -> float:
    phi = math.pi / 2 + row * math.pi / 8
    return math.atan2(-math.sin(phi) / SIN_CAM, math.cos(phi))


def bs_offset(row: int, x: float, z: float, size: int) -> tuple[float, float, float]:
    yaw = bs_row_yaw(row)
    k = BS_SCALE_FRAC * size
    gx = x * math.cos(yaw)
    gy = x * math.sin(yaw)
    return gx * k, -(gy * SIN_CAM + z * COS_CAM) * k, gy


def battleship_parts(L, r: int, turret_rows: tuple[int, int], ciws_rows: tuple[int | None, int | None]) -> list[tuple[str, int, float, float]]:
    """battleshipLayers() in mapview order: (layer, row, dx, dy), back to front, over the hull."""
    size = L["hull"][0].width
    hl = BS_HALF_LENGTH
    _, _, sfar = bs_offset(r, BS_SUPER_AT, 0, size)
    items = [("super", r, 0.0, 0.0, sfar)]
    turrets = []
    for i, at in enumerate(BS_TURRET_AT):
        dx, dy, far = bs_offset(r, at * hl, BS_TURRET_Z[i], size)
        turrets.append(("turret", turret_rows[i], dx, dy, far))
    items += turrets
    if ciws_rows[1] is not None:
        dx, dy, far = bs_offset(r, BS_CIWS_AT[1] * hl, BS_CIWS_Z[1], size)
        items.append(("ciws", ciws_rows[1], dx, dy, far))
    items.sort(key=lambda it: -it[4])
    slots = [i for i, it in enumerate(items) if it[0] == "turret"]
    for n, slot in enumerate(slots):
        items[slot] = turrets[n]
    if ciws_rows[0] is not None:
        dx, dy, far = bs_offset(r, BS_CIWS_AT[0] * hl, BS_CIWS_Z[0], size)
        items.append(("ciws", ciws_rows[0], dx, dy, far))
    return [(n, row, dx, dy) for n, row, dx, dy, _ in items]


def battleship_live(L, r: int) -> Image.Image:
    size = L["hull"][0].width
    out = Image.new("RGBA", (size, size))
    out.alpha_composite(L["hull"][r])
    for n, row, dx, dy in battleship_parts(L, r, (r, r), (r, (r + 8) % DIRS)):
        place(out, L[n][row], round(dx), round(dy))
    return out


def wreck_sunk(spec: Spec, L, r: int, rng) -> Image.Image:
    size = spec.cell * K
    hull_raw = L["hull"][r]
    area = waterline_area(hull_raw)
    hull = strip_wake(hull_raw)
    contour = bottom_contour(np.asarray(hull)[..., 3] > 127)
    hull = hull_damage(spec, hull, rng)
    if spec.raw:
        # Battle Ship: the turrets are blown round on their rings, B's guns snapped,
        # the island mount torn away; the stern mount hangs on at a slew.
        body = hull.copy()
        rows = ((r + spec.turn) % DIRS, (r - 2) % DIRS)
        for n, row, dx, dy in battleship_parts(L, r, rows, (None, (r + 11) % DIRS)):
            part = L[n][row]
            pb = bbox(part)
            if pb is None:
                continue
            piv = ((pb[0] + pb[2]) / 2, (pb[1] + pb[3]) / 2)
            if n == "turret":
                tilt = rng.uniform(4, 9) * (1 if row == rows[0] else -1)
                part = transform(part, tilt, piv, 0, 0)
                part = bite(part, rng, 2, 1.5 * K, 3 * K)
            elif n == "super":
                part = bite(part, rng, spec.bites, 2.5 * K, 5 * K)
                part = punch_holes(part, rng, 3, 1.4 * K, 2.4 * K)
            part = char(part, rng, soot=spec.soot + 0.1)
            place(body, part, round(dx), round(dy))
    else:
        body = hull
    depth = spec.sink * K
    body = settle(body, contour, depth, spec.list_deg * (1 if r < 8 else -1), rng)
    under, over = water_dressing(size, area, rng, spec.debris)
    return stack(size, [under, body, over])


RECIPES = {
    "sunk": wreck_sunk,
    "turret": wreck_turret,
    "casemate": wreck_casemate,
    "launcher": wreck_launcher,
    "soft": wreck_soft,
    "legs": wreck_legs,
    "fold": wreck_fold,
}


def live_row(spec: Spec, L, r: int) -> Image.Image:
    size = spec.cell * K
    if spec.recipe == "sunk" and spec.raw:
        return battleship_live(L, r)
    if spec.recipe == "legs":
        order = [L.get("gun", [None] * DIRS)[r] if gun_behind(r) else None, L["legs"][r], L["torso"][r],
                 None if gun_behind(r) else L.get("gun", [None] * DIRS)[r]]
        return stack(size, order)
    names = spec.layers or list(L)
    parts = []
    if "gun" in L and gun_behind(r):
        parts.append(L["gun"][r])
    for n in names:
        if n == "gun" and gun_behind(r):
            continue
        parts.append(L[n][r])
    return stack(size, parts)


def render(spec: Spec) -> dict:
    L = load_layers(spec)
    seed = zlib.crc32(spec.type.encode())
    side = 1 if seed % 2 else -1
    cell = spec.cell
    sheet = Image.new("RGBA", (cell, cell * DIRS))
    live_cells = []
    clipped = []
    for r in range(DIRS):
        rng = np.random.default_rng(seed * 31 + r)
        if spec.recipe == "plane":
            big = wreck_plane(spec, L, r, rng, side)
        else:
            big = RECIPES[spec.recipe](spec, L, r, rng)
        small = big.resize((cell, cell), Image.LANCZOS)
        a = np.asarray(small)[..., 3]
        if a[0].max() > 24 or a[-1].max() > 24 or a[:, 0].max() > 24 or a[:, -1].max() > 24:
            clipped.append(r)
        sheet.alpha_composite(small, (0, r * cell))
        live_cells.append(live_row(spec, L, r).resize((cell, cell), Image.LANCZOS))
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{spec.type}.png"
    sheet.save(out, optimize=True)
    preview(spec, sheet, live_cells)
    return {"type": spec.type, "out": out.relative_to(ROOT).as_posix(), "cell": cell, "rows": DIRS, "frames": 1,
            "contactY": spec.contact_y, "clipped_dirs": clipped}


LABELS = ["S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE"]


def preview(spec: Spec, sheet: Image.Image, live: list[Image.Image]) -> None:
    cell = spec.cell
    bg = (52, 96, 108, 255) if spec.recipe == "sunk" else (107, 83, 64, 255)
    grid = Image.new("RGBA", (cell * 8 + 16, cell * 4), bg)
    g = ImageDraw.Draw(grid)
    for r in range(DIRS):
        gx = (r % 4) * cell
        gy = (r // 4) * cell
        grid.alpha_composite(live[r], (gx, gy))
        grid.alpha_composite(sheet.crop((0, r * cell, cell, (r + 1) * cell)), (cell * 4 + 16 + gx, gy))
        g.text((gx + 3, gy + 2), LABELS[r], fill=(255, 255, 255, 255))
        g.text((cell * 4 + 16 + gx + 3, gy + 2), LABELS[r], fill=(255, 255, 255, 255))
    PREVIEW.mkdir(parents=True, exist_ok=True)
    grid.save(PREVIEW / f"{spec.type}.png")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--only", action="append", help="wreck type id (repeatable)")
    args = ap.parse_args()
    specs = [s for s in SPECS if not args.only or s.type in args.only]
    report = [render(s) for s in specs]
    (PREVIEW / "manifest.json").write_text(json.dumps(report, indent=2) + "\n")
    for row in report:
        flag = f"  clipped {row['clipped_dirs']}" if row["clipped_dirs"] else ""
        print(f"{row['type']:<12} {row['out']}{flag}")


if __name__ == "__main__":
    main()
