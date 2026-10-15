"""
Research cameos: one 96x96 avatar per upgrade, for the Selection panel's upgrade grid.

Each starts from the structure's own cameo (same camera, palette, cell), and adds what the
upgrade gives in the hive's glow: orbiting relays for the Hive Core's Orbital Relay/Array, a
dome for the Force Shield (one per structure that can raise it), the real roof maw for the Ion
Turret, a tracking reticle for Sky Tracking, an energy arc for the Shield Wall, and level
chevrons for the Assembly and Nanite Forge levels. The Fusion Node and Fusion Core levels
already have their own rendered cameos and are copied as they are.

    python tools/sprites/render_research_cameos.py
    python tools/sprites/render_research_cameos.py --only forceshield,flakmaw --preview /tmp/research.png

Writes gridlock/packages/client/src/assets/research/<id>[-<structure>]-cameo.png.
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "gridlock/packages/client/src/assets"
BUILDINGS = ASSETS / "buildings"
OUT = ASSETS / "research"

SIZE = 96
SS = 4  # draw overlays at 4x, then box-filter down, like the turntables' supersampling

GLOW = (63, 232, 184)
BRIGHT = (190, 255, 236)
HULL = (22, 30, 30)
EDGE = (8, 12, 12)

FORCE_SHIELD_ON = ["spineturret", "pulsespire", "energywall", "laserfence", "fusioncore"]


def base(name: str) -> Image.Image:
    return Image.open(BUILDINGS / f"{name}-cameo.png").convert("RGBA")


def layer() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("RGBA", (SIZE * SS, SIZE * SS), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def down(im: Image.Image) -> Image.Image:
    return im.resize((SIZE, SIZE), Image.BOX)


def glow_of(im: Image.Image, radius: float, gain: float = 1.0) -> Image.Image:
    """A soft halo from a layer's alpha, in GLOW."""
    a = im.getchannel("A").filter(ImageFilter.GaussianBlur(radius))
    if gain != 1.0:
        a = a.point(lambda v: min(255, int(v * gain)))
    halo = Image.new("RGBA", im.size, GLOW + (0,))
    halo.putalpha(a)
    return halo


def stack(base_im: Image.Image, *overlays: Image.Image) -> Image.Image:
    out = base_im.copy()
    for o in overlays:
        out.alpha_composite(o)
    return out


def p(x: float, y: float) -> tuple[float, float]:
    return x * SS, y * SS


def ellipse(d: ImageDraw.ImageDraw, cx: float, cy: float, rx: float, ry: float, **kw) -> None:
    d.ellipse([p(cx - rx, cy - ry), p(cx + rx, cy + ry)], **kw)


def emblem(im: Image.Image, halo: float = 2.5, gain: float = 1.6) -> Image.Image:
    """An overlay drawn at SS, brought down with its glow under it."""
    small = down(im)
    return stack(glow_of(small, halo, gain), small)


# ---- emblems -------------------------------------------------------------------------------

def satellite(d: ImageDraw.ImageDraw, x: float, y: float, s: float = 1.0) -> None:
    """A relay: a lit core with two panel wings."""
    w, h = 7 * s, 2.6 * s
    d.rectangle([p(x - w - 2.2 * s, y - h / 2), p(x - 2.2 * s, y + h / 2)], fill=HULL + (255,), outline=GLOW + (255,), width=SS)
    d.rectangle([p(x + 2.2 * s, y - h / 2), p(x + w + 2.2 * s, y + h / 2)], fill=HULL + (255,), outline=GLOW + (255,), width=SS)
    ellipse(d, x, y, 2.6 * s, 2.6 * s, fill=BRIGHT + (255,), outline=EDGE + (255,), width=SS)


def orbit(d: ImageDraw.ImageDraw, cx: float, cy: float, rx: float, ry: float, a0: float, a1: float, alpha: int) -> None:
    pts = [p(cx + rx * math.cos(math.radians(a)), cy + ry * math.sin(math.radians(a))) for a in range(int(a0), int(a1) + 1, 3)]
    d.line(pts, fill=GLOW + (alpha,), width=SS)


def scan(relays: int) -> Image.Image:
    im, d = layer()
    cx, cy, rx, ry = 50, 30, 36, 11
    # The far half of the ring behind, the near half bright.
    orbit(d, cx, cy, rx, ry, 180, 360, 110 if relays > 1 else 70)
    orbit(d, cx, cy, rx, ry, 0, 180, 220 if relays > 1 else 120)
    spots = [330] if relays == 1 else [330, 210, 90]
    for a in spots:
        x = cx + rx * math.cos(math.radians(a))
        y = cy + ry * math.sin(math.radians(a))
        satellite(d, x, y, 0.85)
    # The downlink from the first relay to the hive.
    sx = cx + rx * math.cos(math.radians(330))
    sy = cy + ry * math.sin(math.radians(330))
    d.line([p(sx, sy + 3), p(50, 52)], fill=BRIGHT + (120,), width=SS)
    return stack(base("hivecore"), emblem(im))


def dome(on: str) -> Image.Image:
    src = base(on)
    box = src.getbbox() or (0, 0, SIZE, SIZE)
    # Wrap the structure: centred on its art, a little wider than the pad.
    cx = (box[0] + box[2]) / 2
    floor = box[3] - 14
    rx = min((box[2] - box[0]) / 2 + 2, SIZE / 2 - 4)
    ry = min(floor - 6, rx * 0.95)
    fill, fd = layer()
    fd.pieslice([p(cx - rx, floor - ry), p(cx + rx, floor + ry)], 180, 360, fill=GLOW + (46,))
    fd.ellipse([p(cx - rx, floor - rx * 0.42), p(cx + rx, floor + rx * 0.42)], fill=GLOW + (30,))
    rim, rd = layer()
    rd.arc([p(cx - rx, floor - ry), p(cx + rx, floor + ry)], 180, 360, fill=BRIGHT + (235,), width=int(1.4 * SS))
    rd.arc([p(cx - rx, floor - rx * 0.42), p(cx + rx, floor + rx * 0.42)], 0, 180, fill=BRIGHT + (170,), width=SS)
    # A few hex seams catching the light on the dome's upper left.
    for k in range(3):
        a = math.radians(205 + k * 22)
        x = cx + rx * 0.62 * math.cos(a)
        y = floor + ry * 0.62 * math.sin(a)
        hexa = [p(x + 3.2 * math.cos(math.radians(60 * i)), y + 3.2 * math.sin(math.radians(60 * i))) for i in range(6)]
        rd.polygon(hexa, outline=BRIGHT + (110,))
    return stack(src, down(fill), emblem(rim, 1.8, 1.2))


def ion_turret() -> Image.Image:
    src = base("fusioncore")
    # The real roof maw (render_flak_maw.py), facing up-screen-right like the cameo light.
    maw = Image.open(ASSETS / "units/flakmaw/maw/0011.png").convert("RGBA")
    maw = maw.crop(maw.getbbox())
    scale = 30 / max(maw.size)
    maw = maw.resize((max(1, round(maw.width * scale)), max(1, round(maw.height * scale))), Image.LANCZOS)
    seat = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    # On the east tower's top.
    seat.alpha_composite(maw, (int(78 - maw.width / 2), int(34 - maw.height)))
    bolts, d = layer()
    for x, y, r in ((70, 9, 2.6), (80, 5, 2.0), (89, 3, 1.5)):
        ellipse(d, x, y, r, r, fill=BRIGHT + (255,))
    return stack(src, glow_of(seat, 1.5, 0.6), seat, emblem(bolts, 2.2, 2.2))


def sky_tracking() -> Image.Image:
    im, d = layer()
    cx, cy, r = 76, 17, 10
    ellipse(d, cx, cy, r, r, outline=GLOW + (240,), width=int(1.3 * SS))
    ellipse(d, cx, cy, 2, 2, fill=BRIGHT + (255,))
    for ax, ay in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        d.line([p(cx + ax * (r - 4), cy + ay * (r - 4)), p(cx + ax * (r + 4), cy + ay * (r + 4))], fill=BRIGHT + (255,), width=SS)
    # A flier caught in it: a small delta.
    d.polygon([p(cx + 5, cy - 6), p(cx + 1, cy - 3), p(cx + 4, cy - 3.5)], fill=BRIGHT + (255,))
    # The tracking arc from the gun up to the mark.
    pts = [p(46 + 30 * t, 40 - 26 * math.sin(t * math.pi / 2)) for t in [i / 12 for i in range(13)]]
    for i in range(0, 12, 2):
        d.line([pts[i], pts[i + 1]], fill=GLOW + (190,), width=SS)
    return stack(base("spineturret"), emblem(im))


def shield_wall() -> Image.Image:
    fill, fd = layer()
    rim, rd = layer()
    # A curved wall across the front of the Assembly, low and wide.
    box = [p(8, 46), p(90, 104)]
    fd.chord(box, 200, 340, fill=GLOW + (60,))
    for k, a in enumerate((205, 225, 245, 265, 285, 305, 325)):
        x0 = 49 + 41 * math.cos(math.radians(a))
        y0 = 75 + 29 * math.sin(math.radians(a))
        rd.line([p(x0, y0), p(x0, y0 + 10)], fill=GLOW + (120,), width=SS)
    rd.arc(box, 200, 340, fill=BRIGHT + (240,), width=int(1.6 * SS))
    shifted = [p(8, 56), p(90, 114)]
    rd.arc(shifted, 205, 335, fill=GLOW + (150,), width=SS)
    return stack(base("conversion"), down(fill), emblem(rim, 2.0, 1.4))


def chevrons(d: ImageDraw.ImageDraw, n: int, x: float, y: float) -> None:
    for i in range(n):
        yy = y + i * 6
        pts = [p(x - 7, yy), p(x, yy - 5), p(x + 7, yy), p(x + 7, yy + 3.2), p(x, yy - 1.8), p(x - 7, yy + 3.2)]
        d.polygon(pts, fill=BRIGHT + (255,), outline=EDGE + (255,))


def level(on: str, n: int) -> Image.Image:
    im, d = layer()
    # The badge: a dark hex plate in the top right, the chevrons on it.
    cx, cy, r = 82, 14, 11.5
    hexa = [p(cx + r * math.cos(math.radians(60 * i + 30)), cy + r * math.sin(math.radians(60 * i + 30))) for i in range(6)]
    d.polygon(hexa, fill=HULL + (235,), outline=GLOW + (255,), width=int(1.2 * SS))
    chevrons(d, n, cx, cy - 1 - (n - 1) * 3 + 2)
    over = [emblem(im, 2.0, 1.2)]
    if n >= 2:
        # Neural: links from the badge down into the structure, lit at the joints.
        net, nd = layer()
        nodes = [(70, 24), (60, 32), (74, 36), (52, 42)]
        for a, b in ((0, 1), (0, 2), (1, 3), (1, 2)):
            nd.line([p(*nodes[a]), p(*nodes[b])], fill=GLOW + (200,), width=SS)
        for x, y in nodes:
            ellipse(nd, x, y, 1.7, 1.7, fill=BRIGHT + (255,))
        over.insert(0, emblem(net, 1.6, 1.6))
    return stack(base(on), *over)


def copy(name: str) -> Image.Image:
    return base(name)


GOLD = (236, 196, 74)
OLIVE = (58, 68, 48)


def rank(sheet: str, n: int) -> Image.Image:
    """An Alliance level: the levelled sheet's own cameo under a rank badge, gold chevrons on an olive shield."""
    im, d = layer()
    cx, cy = 82, 14
    shield = [p(cx - 10, cy - 10), p(cx + 10, cy - 10), p(cx + 10, cy + 3), p(cx, cy + 11), p(cx - 10, cy + 3)]
    d.polygon(shield, fill=OLIVE + (240,), outline=EDGE + (255,), width=int(1.4 * SS))
    for i in range(n):
        yy = cy - 3 - (n - 1) * 2.5 + i * 5.5
        pts = [p(cx - 7, yy + 2), p(cx, yy - 3), p(cx + 7, yy + 2), p(cx + 7, yy + 5), p(cx, yy), p(cx - 7, yy + 5)]
        d.polygon(pts, fill=GOLD + (255,), outline=EDGE + (255,))
    return stack(base(sheet), down(im))


JOBS = {
    "scanrelay": lambda: scan(1),
    "scanarray": lambda: scan(3),
    "advancedfusion": lambda: copy("fusionnode-advanced"),
    "ultrafusion": lambda: copy("fusionnode-ultra"),
    "fusionreactor": lambda: copy("fusioncore-reactor"),
    **{f"forceshield-{b}": (lambda b=b: dome(b)) for b in FORCE_SHIELD_ON},
    "flakmaw": ion_turret,
    "skyspines": sky_tracking,
    "shieldwall": shield_wall,
    "advancedassembly": lambda: level("conversion", 1),
    "neuralassembly": lambda: level("conversion", 2),
    "advancedforge": lambda: level("forge", 1),
    "neuralforge": lambda: level("forge", 2),
    "advancedtraining": lambda: rank("muster-advanced", 1),
    "specialforces": lambda: rank("muster-special", 2),
    "heavyworks": lambda: rank("armory-heavy", 1),
    "prototypeworks": lambda: rank("armory-prototype", 2),
    "gasturbines": lambda: rank("dynamo-turbine", 1),
    "fissionreactor": lambda: rank("dynamo-fission", 2),
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated job names (forceshield matches every forceshield-*)")
    ap.add_argument("--preview", help="also write a 2x contact sheet here")
    args = ap.parse_args()
    want = args.only.split(",") if args.only else None
    OUT.mkdir(parents=True, exist_ok=True)
    made: list[tuple[str, Image.Image]] = []
    for name, job in JOBS.items():
        if want and not any(name == w or name.startswith(w + "-") for w in want):
            continue
        im = job()
        assert im.size == (SIZE, SIZE), name
        im.save(OUT / f"{name}-cameo.png")
        made.append((name, im))
        print("wrote", (OUT / f"{name}-cameo.png").relative_to(ROOT))
    if args.preview and made:
        cols = 5
        rows = math.ceil(len(made) / cols)
        sheet = Image.new("RGBA", (cols * (SIZE + 8), rows * (SIZE + 8)), (40, 30, 20, 255))
        for i, (_, im) in enumerate(made):
            sheet.alpha_composite(im, ((i % cols) * (SIZE + 8), (i // cols) * (SIZE + 8)))
        sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(args.preview)


if __name__ == "__main__":
    main()
