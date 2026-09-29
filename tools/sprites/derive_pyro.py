#!/usr/bin/env python3
"""Pyro stills and sheets, derived from the AT Infantry's accepted unique yaws.

The Pyro is the same soldier as the AT Infantry (same turntable, camera,
scale, outline, palette, contact line), re-equipped as a flamethrower man:

  - the whole PTRD is erased (free space back to the magenta key, anything
    over the body inpainted from the body around it, silhouette re-traced)
  - a flame lance is laid along the rifle's own axis, through both hands:
    wooden rear grip, brass fuel valve, thin steel lance, a wider nozzle
    shroud with the igniter under it; the hands go back on top of it
  - the field pack becomes two steel fuel tanks with a rust band: upright on
    his back standing and kneeling, lying along his back when he crawls. They
    are placed off the helmet (a neutral grey nothing else in the still has),
    behind him along his facing, and paint over the body only behind his back
    plane, so facing the camera they stand behind him and peek out, and
    facing away they cover his back. The old pack is keyed out where the
    tanks paint over it.
  - a rubber hose hangs from the tanks to the rear of the lance
  - fire = the stand still with a nozzle flare and a short tongue of flame out
    of the shroud (4 frames); the long jet is drawn by the engine
  - die: the dropped rifle beside the corpse becomes the dropped lance

Tanks and lance are solids of revolution drawn with derive_rocketer's tube
renderer (one radius profile, turned and foreshortened per yaw). W-side yaws
are mirrors. Placement is the AT Infantry's source->cell transform.

Also writes gridlock/packages/client/src/render/pyro-nozzle.ts: the lance tip
per sheet row and posture, measured from these stills, so the engine's jet
leaves the nozzle it draws.

  python tools/sprites/derive_pyro.py            # writes tools/sprites/src/pyro-*/
  python tools/sprites/derive_pyro.py --compose  # also the engine sheets, cameo, previews, nozzle table
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import derive_rocketer as R  # noqa: E402
from compose_unit_sheet import (  # noqa: E402
    ENGINE_ORDER,
    MIRROR_OF,
    UNIQUE_ORDER,
    diagnostics,
    key_magenta,
    opaque_bbox,
    preview_strip,
    preview_turntable,
)

ROOT = R.ROOT
SRC = R.SRC
UNITS = R.UNITS
PREVIEW = R.PREVIEW
NAMES = R.NAMES
SCREEN_DEG = R.SCREEN_DEG
SV = R.SV
MAG = R.MAG
OUTLINE = R.OUTLINE
NOZZLE_TS = ROOT / "gridlock/packages/client/src/render/pyro-nozzle.ts"

C = lambda *v: np.array(v, float)  # noqa: E731
PAL = {
    # Tanks: field-grey steel. Rust band. Darker domes.
    "tank": [C(0x4A, 0x4E, 0x46), C(0x66, 0x6B, 0x60), C(0x8A, 0x90, 0x84)],
    "dome": [C(0x42, 0x46, 0x3F), C(0x5C, 0x61, 0x57), C(0x7E, 0x84, 0x78)],
    "rust": [C(0x62, 0x2A, 0x1E), C(0x8B, 0x3A, 0x2A), C(0xA8, 0x52, 0x3C)],
    "valve": [C(0x6E, 0x5A, 0x2E), C(0x94, 0x7A, 0x40), C(0xB8, 0x9C, 0x58)],
    # Lance: dark steel. Grip: dark wood.
    "lance": [C(0x2C, 0x2E, 0x2A), C(0x44, 0x47, 0x42), C(0x64, 0x68, 0x60)],
    "shroud": [C(0x26, 0x27, 0x24), C(0x3A, 0x3C, 0x38), C(0x56, 0x59, 0x52)],
    "grip": [C(0x46, 0x2E, 0x1C), C(0x66, 0x44, 0x28), C(0x84, 0x5A, 0x36)],
    "band": [R.BAND, R.BAND, R.BAND],
    "hose": [C(0x1E, 0x1C, 0x1A), C(0x30, 0x2E, 0x2A), C(0x46, 0x44, 0x3E)],
}
BORE = R.BORE
FLASH = R.FLASH

# ---------------------------------------------------------------- tube renderer (palette-aware copy)


def tube_layer(shape, ax: R.Axis, knots, k: float, top_end_first: bool, bore_at: float | None = None):
    """RGB, alpha, t-map of a solid of revolution along `ax`. Materials index PAL."""
    h, w = shape
    col = np.zeros((h, w, 3))
    sil = np.zeros((h, w), bool)
    tmap = np.full((h, w), np.nan)
    t_lo, t_hi = knots[0][0], knots[-1][0]
    n_steps = max(2, int((t_hi - t_lo) * ax.L))
    ts = np.linspace(t_lo, t_hi, n_steps + 1)
    if top_end_first:
        ts = ts[::-1]
    ys, xs = np.mgrid[0:h, 0:w]
    for t in ts:
        r, mat = R.radius_at(knots, t)
        if r <= 0.5:
            continue
        c = ax.at(t)
        x0, x1 = int(max(0, c[0] - r - 2)), int(min(w, c[0] + r + 3))
        y0, y1 = int(max(0, c[1] - r - 2)), int(min(h, c[1] + r + 3))
        if x0 >= x1 or y0 >= y1:
            continue
        px = xs[y0:y1, x0:x1] - c[0]
        py = ys[y0:y1, x0:x1] - c[1]
        su = px * ax.u[0] + py * ax.u[1]
        sn = px * ax.n[0] + py * ax.n[1]
        inside = (sn / r) ** 2 + (su / max(r * k, 0.6)) ** 2 <= 1.0
        if not inside.any():
            continue
        q = sn / r
        pal = PAL[mat]
        tone = np.where(q > 0.38, 2, np.where(q < -0.42, 0, 1))
        c_rgb = np.stack(pal)[tone]
        sub = col[y0:y1, x0:x1]
        sub[inside] = c_rgb[inside]
        sil[y0:y1, x0:x1] |= inside
        tmap[y0:y1, x0:x1][inside] = t
    if bore_at is not None:
        r, _ = R.radius_at(knots, bore_at)
        c = ax.at(bore_at)
        px, py = xs - c[0], ys - c[1]
        su = px * ax.u[0] + py * ax.u[1]
        sn = px * ax.n[0] + py * ax.n[1]
        m = (sn / (r * 0.6)) ** 2 + (su / max(r * 0.6 * k, 0.6)) ** 2 <= 1.0
        col[m & sil] = BORE
    ring = R.grow(sil, 4) & ~sil
    col[ring] = OUTLINE
    tt, _ = ax.coords((h, w))
    tmap[ring] = tt[ring]
    return col, sil | ring, tmap


# ---------------------------------------------------------------- lance

LANCE_T0 = -0.06
LANCE_TIP = 0.86


def lance_profile() -> list[tuple[float, float, str]]:
    r = 7.5
    return [
        (-0.06, 9.0, "grip"),
        (0.01, 9.5, "grip"),
        (0.02, 12.5, "valve"),
        (0.12, 12.5, "valve"),
        (0.13, 8.5, "band"),
        (0.16, r, "lance"),
        (0.72, r, "lance"),
        (0.73, 8.5, "band"),
        (0.745, 10.5, "shroud"),
        (0.83, 10.5, "shroud"),
        (0.84, 8.0, "lance"),
        (LANCE_TIP, 7.0, "lance"),
    ]


def lance_profile_die() -> list[tuple[float, float, str]]:
    # Lying beside the body: from the butt end, about 0.8 of the rifle.
    f = lambda x: 0.04 + x * 0.8  # noqa: E731
    base = lance_profile()
    t0, t1 = base[0][0], base[-1][0]
    return [(f((t - t0) / (t1 - t0)), r * 1.2, m) for t, r, m in base]


# ---------------------------------------------------------------- tanks


def helmet(a: np.ndarray) -> tuple[float, float] | None:
    """Centroid of the helmet: the biggest neutral-grey blob in the top of the silhouette."""
    ai = np.clip(a, 0, 255).astype(np.int32)
    bg = R.bg_mask(ai)
    ys, xs = np.nonzero(~bg)
    if len(ys) == 0:
        return None
    top, bot = ys.min(), ys.max()
    mx = ai.max(-1)
    mn = ai.min(-1)
    mean = ai.mean(-1)
    grey = (~bg) & (mx - mn < 16) & (mean > 42) & (mean < 125)
    grey[int(top + (bot - top) * 0.55):] = False
    comps = [c for c in R.components(grey) if len(c) > 200]
    if not comps:
        return None
    best = max(comps, key=len)
    return float(best[:, 0].mean()), float(best[:, 1].mean())


def facing_ground(name: str) -> tuple[np.ndarray, np.ndarray]:
    """Unit facing on the ground as seen on screen (y already squashed), and its lateral."""
    phi = math.radians(SCREEN_DEG[name])
    g = np.array([math.cos(phi), math.sin(phi) / SV])
    g /= np.linalg.norm(g)
    lat = np.array([-g[1], g[0]])
    return np.array([g[0], g[1] * SV]), np.array([lat[0], lat[1] * SV])


TANK_R = 23.0
# Per pose: back offset along the facing, drop below the helmet, tank top and bottom below the helmet, lateral spacing.
TANK_LAYOUT = {
    "stand": dict(back=78.0, top=38.0, bot=186.0, side=24.0),
    "crouch": dict(back=92.0, top=30.0, bot=160.0, side=24.0),
}


def tank_knots(length_px: float) -> list[tuple[float, float, str]]:
    """Upright tank from its top dome (t=0) to its base (t=1), in fractions of its screen length."""
    d = 10.0 / max(1.0, length_px)
    r = TANK_R
    return [
        (0.0, r * 0.35, "dome"),
        (d * 0.6, r * 0.78, "dome"),
        (d * 1.4, r * 0.97, "dome"),
        (d * 2.2, r, "tank"),
        (0.16, r, "tank"),
        (0.165, r, "rust"),
        (0.24, r, "rust"),
        (0.245, r, "tank"),
        (0.9, r, "tank"),
        (0.96, r * 0.94, "dome"),
        (1.0, r * 0.7, "dome"),
    ]


def draw_tanks(a: np.ndarray, pose: str, name: str, keep: np.ndarray) -> tuple[np.ndarray, list]:
    """Two fuel tanks on his back. Returns the image and each tank's axis (for the hose)."""
    hc = helmet(a)
    if hc is None:
        return a, []
    H = np.array(hc)
    gs, ls = facing_ground(name)
    gn = gs / max(1e-6, np.linalg.norm(gs))
    shape = a.shape[:2]
    ys, xs = np.mgrid[0 : shape[0], 0 : shape[1]]
    ai = np.clip(a, 0, 255).astype(np.int32)
    bg = R.bg_mask(ai)
    out = a.copy()
    axes = []
    if pose == "crawl":
        # Lying along his back, behind the helmet.
        # Facing the camera his back rises straight behind the helmet: keep the tanks close.
        centre = H - gs * (128.0 if gs[1] <= 0 else 128.0 - 50.0 * gn[1])
        L = 118.0
        along = gs / max(1e-6, np.linalg.norm(gs))
        span = along * L * np.linalg.norm(gs)
        tanks = []
        for sgn in (-1, 1):
            c = centre + ls * 22.0 * sgn
            ax = R.Axis(tuple(c - span / 2), tuple(c + span / 2))
            tanks.append((float(c @ np.array([0.3, 1.0])), ax))
        tanks.sort(key=lambda z: z[0])
        over = np.ones(shape, bool)
        kk = float(np.clip(math.sqrt(max(0.0, 1 - (np.linalg.norm(span) / 150.0) ** 2)), 0.3, 1.0))
        for _, ax in tanks:
            knots = [(0.0, TANK_R * 0.7, "dome"), (0.05, TANK_R * 0.97, "dome"), (0.09, TANK_R, "tank"),
                     (0.18, TANK_R, "rust"), (0.26, TANK_R, "tank"), (0.92, TANK_R, "tank"), (1.0, TANK_R * 0.75, "dome")]
            back_first = gs[1] > 0  # the end away from the camera paints first
            col, alpha, _t = tube_layer(shape, ax, knots, kk, not back_first)
            m = alpha & over & ~keep
            out[m] = col[m]
            axes.append(ax)
        return out, axes
    lay = TANK_LAYOUT[pose]
    # Back of the man along his facing; their height does not move with the yaw.
    centre = np.array([H[0] - gn[0] * lay["back"], H[1]])
    # The side-by-side pair: far one first.
    tanks = []
    for sgn in (-1, 1):
        off = ls * lay["side"] * sgn
        top = centre + off + np.array([0.0, lay["top"]])
        bot = centre + off + np.array([0.0, lay["bot"]])
        tanks.append((float(off[1]), R.Axis(tuple(top), tuple(bot))))
    tanks.sort(key=lambda z: z[0])
    # Behind his back plane the tanks paint over the body (and key out the old pack).
    rel_x = xs - H[0]
    rel_y = ys - (H[1] + 60.0)
    behind = rel_x * gn[0] + rel_y * gn[1] < -30.0
    union = np.zeros(shape, bool)
    for _, ax in tanks:
        L = ax.L
        col, alpha, _t = tube_layer(shape, ax, tank_knots(L), SV, True)
        over = alpha & (behind | bg) & ~keep
        out[over] = col[over]
        union |= alpha
        axes.append(ax)
    # What shows of the old pack past the tanks reads as their carrying frame.
    return out, axes


def draw_hose(a: np.ndarray, tank_axes, lance_ax: R.Axis, keep: np.ndarray) -> np.ndarray:
    """Rubber hose from the near tank's base to the lance valve. It hangs; seen only where it clears the body."""
    if not tank_axes:
        return a
    tank = tank_axes[-1]
    p0 = tank.at(0.88)
    p2 = lance_ax.at(0.02)
    mid = (p0 + p2) / 2 + np.array([0.0, 38.0])
    shape = a.shape[:2]
    ai = np.clip(a, 0, 255).astype(np.int32)
    bg = R.bg_mask(ai)
    ys, xs = np.mgrid[0 : shape[0], 0 : shape[1]]
    body = np.zeros(shape, bool)
    for t in np.linspace(0, 1, 60):
        p = (1 - t) ** 2 * p0 + 2 * (1 - t) * t * mid + t * t * p2
        body |= (xs - p[0]) ** 2 + (ys - p[1]) ** 2 <= 5.5**2
    ring = R.grow(body, 3) & ~body
    out = a.copy()
    m = body & bg & ~keep
    out[m] = PAL["hose"][1]
    out[ring & bg & ~keep] = OUTLINE
    return out


# ---------------------------------------------------------------- fire FX


def nozzle_flame(shape, ax: R.Axis, frame: int):
    """A short tongue of burning fuel out of the shroud; the engine draws the long jet."""
    h, w = shape
    col = np.zeros((h, w, 3))
    alpha = np.zeros((h, w), bool)
    tip = ax.at(LANCE_TIP)
    u, n = ax.u, ax.n
    rng = np.random.default_rng(31 + frame)
    length = [56, 74, 66, 50][frame]
    width = [16, 20, 18, 14][frame]

    def paint(m, c):
        col[m] = c
        alpha[m] = True

    # Outer red-orange, then orange, then the white-yellow core by the nozzle.
    for k, c, lf, wf in ((0, R.FLASH[2], 1.0, 1.0), (1, R.FLASH[1], 0.7, 0.66), (2, R.FLASH[0], 0.38, 0.4)):
        for i in range(5):
            d = length * lf * (0.18 + i * 0.2)
            droop = np.array([0.0, 1.0]) * (d * d / 900.0)
            wob = n * rng.uniform(-3, 3)
            ccen = tip + u * d + droop + wob
            rr = width * wf * (0.55 + i * 0.16)
            m = R.blob(shape, ccen, rr * 0.9, rr * 0.7, u, n)
            paint(m, c)
    return col, alpha


# ---------------------------------------------------------------- derive


def load(pose: str, name: str) -> np.ndarray:
    return R.load(pose, name)


def derive_one(pose: str, name: str, frames_fire: bool = False) -> tuple[list[np.ndarray], dict]:
    a0 = load(pose, name)
    ai = a0.astype(np.int32)
    ax = R.Axis(*R.AXIS[pose][name])
    if (pose, name) not in R.HIDDEN:
        ax = R.refine_axis(ai, ax)
    extra = R.ERASE_BOX.get((pose, name), ())
    if pose == "die":
        a, _ = R.erase_rifle(ai, ax, -0.10, 30.0, extra)
        knots = lance_profile_die()
    elif (pose, name) in R.HIDDEN:
        a = a0.copy()
        if extra:
            a, _ = R.erase_rifle(ai, R.Axis((0, 0), (1, 0)), 99.0, 1.0, extra)
        knots = lance_profile()
    else:
        # The lance is thin: the whole rifle has to go, stock and all.
        a, _ = R.erase_rifle(ai, ax, -0.12, 19.0, extra, 1 if (pose, name) in R.ONE_SIDE else 2, 9.0)
        knots = lance_profile()
    a = R.clean_orphans(a)
    hands_src = a0
    keep = np.zeros(a.shape[:2], bool)
    tank_axes: list = []
    if pose in ("stand", "crouch", "crawl"):
        # The helmet and face never go under a tank.
        hc = helmet(a)
        if hc is not None:
            ys, xs = np.mgrid[0 : a.shape[0], 0 : a.shape[1]]
            keep = (xs - hc[0]) ** 2 + ((ys - hc[1]) * 1.1) ** 2 <= 46.0**2
        a, tank_axes = draw_tanks(a, pose, name, keep)
    base_bg = R.bg_mask(np.clip(a, 0, 255).astype(np.int32))
    k = 0.45 if pose == "die" else R.cap_ratio(ax, pose)
    fv = R.front_visible(pose, name, ax)
    under = R.UNDER[pose].get(name)
    tip_t = knots[-1][0]
    col, alpha, tmap = tube_layer(a.shape[:2], ax, knots, k, not fv, bore_at=tip_t if fv else None)
    img = R.put_layer(a, base_bg, col, alpha, tmap, under)
    if pose != "die":
        img = R.restore_hands(img, hands_src, ax, alpha & ~np.isnan(tmap) & (tmap > 0.0), (-0.04, 0.5))
        img = draw_hose(img, tank_axes, ax, keep)
    info = {"tip": [float(v) for v in ax.at(tip_t)], "name": name, "pose": pose}
    if not frames_fire:
        return [img], info
    outs = []
    for fr in range(4):
        fcol, falpha = nozzle_flame(a.shape[:2], ax, fr)
        f = img.copy()
        now_bg = R.bg_mask(np.clip(f, 0, 255).astype(np.int32))
        if under is not None and not fv:
            m = falpha & now_bg
        else:
            m = falpha
        f[m] = fcol[m]
        outs.append(f)
    return outs, info


def save_rgb(a: np.ndarray, path: Path) -> None:
    R.save_rgb(a, path)


TIPS: dict[str, dict[str, list[float]]] = {}


def derive(pose: str) -> None:
    for n in NAMES:
        if pose == "fire":
            outs, info = derive_one("stand", n, frames_fire=True)
            strip = np.concatenate(outs, axis=1)
            save_rgb(strip, SRC / f"pyro-fire-strips/{n}.png")
        else:
            (img,), info = derive_one(pose, n)
            save_rgb(img, SRC / f"pyro-{pose}/{n}.png")
            TIPS.setdefault(pose, {})[n] = info["tip"]
    (SRC / "pyro-tips.json").write_text(json.dumps(TIPS, indent=1)) if TIPS else None
    print("wrote", pose)


# ---------------------------------------------------------------- compose

POSES = R.POSES


def compose(pose: str) -> dict:
    sheet_name, base, frames, cy, scale, draw = POSES[pose]
    cell = 96
    placed_frames: list[dict[str, Image.Image]] = []
    clipped_dirs = []
    for fi in range(frames if pose == "fire" else 1):
        placed: dict[str, Image.Image] = {}
        for n in UNIQUE_ORDER:
            ref = key_magenta(Image.open(SRC / f"atinfantry-{base}/{n}.png"))
            if pose == "fire":
                strip = Image.open(SRC / f"pyro-fire-strips/{n}.png")
                w = strip.width // frames
                new = key_magenta(strip.crop((fi * w, 0, (fi + 1) * w, strip.height)))
            else:
                new = key_magenta(Image.open(SRC / f"pyro-{pose}/{n}.png"))
            placed[n], clipped = R.place_like(new, ref, cell, scale, cy)
            if clipped:
                clipped_dirs.append(f"{n}#{fi}")
        for dest, src_name in MIRROR_OF.items():
            placed[dest] = placed[src_name].transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        placed_frames.append(placed)
    sheet = Image.new("RGBA", (frames * cell, 16 * cell), (0, 0, 0, 0))
    for r, d in enumerate(ENGINE_ORDER):
        for c in range(frames):
            src = placed_frames[c % len(placed_frames)][d]
            sheet.alpha_composite(src, (c * cell, r * cell))
    dest = UNITS / f"pyro-{sheet_name}.png"
    sheet.save(dest)
    stem = f"pyro-{sheet_name}"
    diag = diagnostics(placed_frames[0], cell)
    pops = [d["dir"] for d in diag if d.get("pop")]
    empties = [d["dir"] for d in diag if d.get("empty")]
    PREVIEW.mkdir(parents=True, exist_ok=True)
    preview_turntable(placed_frames[0], cell).save(PREVIEW / f"{stem}-turntable.png")
    preview_strip(sheet, cell, frames, draw).save(PREVIEW / f"{stem}-strip.png")
    man = {
        "id": stem,
        "cell": cell,
        "cols": frames,
        "rows": 16,
        "facing": 16,
        "order": ENGINE_ORDER,
        "unique": UNIQUE_ORDER,
        "mirror": MIRROR_OF,
        "contactY": cy,
        "scale": scale,
        "pivot": "none",
        "placement": f"atinfantry-{base} source->cell transform",
        "out": str(dest.relative_to(ROOT)),
        "size_pop_dirs": pops,
        "empty_dirs": empties,
        "clipped": clipped_dirs,
        "diag": diag,
    }
    (PREVIEW / f"{stem}-manifest.json").write_text(json.dumps(man, indent=2))
    print("sheet", dest.name, sheet.size, "pop", pops, "empty", empties, "clipped", clipped_dirs)
    return man


def tip_in_cell(pose: str, name: str, tip: list[float]) -> tuple[float, float]:
    """Source tip -> cell fraction, with the same transform place_like used on the AT still."""
    _sheet, base, _frames, cy, scale, _draw = POSES[pose]
    cell = 96
    ref = key_magenta(Image.open(SRC / f"atinfantry-{base}/{name}.png"))
    rb = opaque_bbox(ref)
    rw = round((rb[2] - rb[0]) * scale)
    rh = round((rb[3] - rb[1]) * scale)
    rx = round((cell - rw) / 2)
    ry = round(cell * cy - rh)
    x = rx + (tip[0] - rb[0]) * scale
    y = ry + (tip[1] - rb[1]) * scale
    return x / cell - 0.5, y / cell - cy


def write_nozzle_table() -> None:
    tips = json.loads((SRC / "pyro-tips.json").read_text())
    rows: dict[str, list[list[float]]] = {}
    for pose, stance in (("stand", "stand"), ("crouch", "crouch"), ("crawl", "crawl")):
        per = []
        for d in ENGINE_ORDER:
            src = MIRROR_OF.get(d, d)
            fx, fy = tip_in_cell(pose, src, tips[pose][src])
            deg = SCREEN_DEG[src]
            if d != src:
                fx = -fx
                deg = 180.0 - deg
            per.append([round(fx, 4), round(fy, 4), round(deg, 1)])
        rows[stance] = per
    body = ",\n".join(
        f"  {stance}: [\n" + "\n".join(f"    [{r[0]}, {r[1]}, {r[2]}]," for r in per) + "\n  ]" for stance, per in rows.items()
    )
    NOZZLE_TS.write_text(
        f'''/**
 * Where the Pyro's lance tip is on screen, for each sheet row and posture.
 * Measured from the sprite stills by tools/sprites/derive_pyro.py; do not edit by hand.
 */
import type {{ Stance }} from "@gridlock/shared";

export interface NozzleTip {{
  /** Screen offset from his feet of the ground point under the tip. */
  gx: number;
  gy: number;
  /** Tip height above that ground, screen pixels. */
  h: number;
}}

/**
 * Per row (0 = screen south, clockwise): tip x and y as a share of the cell
 * from the cell centre and the contact line, and the screen bearing he faces.
 */
const TIPS: Record<Stance, [number, number, number][]> = {{
{body},
}};

/**
 * Lance tip for a sheet row and posture, drawn `drawSize` pixels tall with
 * the feet `sink` pixels into the ground. The tip is split into the ground
 * point under it (along his facing) and a height above that point, so the
 * jet can arc down onto the ground from the right place.
 */
export function pyroNozzleScreen(row: number, stance: Stance, drawSize = 20, sink = 0): NozzleTip {{
  const r = ((Math.round(row) % 16) + 16) % 16;
  const [fx, fy, deg] = (TIPS[stance] ?? TIPS.stand)[r]!;
  const tx = fx * drawSize;
  const ty = fy * drawSize + sink;
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const rest = stance === "crawl" ? 2 : stance === "crouch" ? 5 : 7;
  let h = rest;
  if (Math.abs(c) > 0.35) {{
    // Ground point on his bearing straight under the tip.
    const along = tx / c;
    h = along * s - ty;
  }}
  h = Math.max(1, Math.min(rest * 1.8, h));
  return {{ gx: tx, gy: ty + h, h }};
}}
'''
    )
    print("nozzle table", NOZZLE_TS)


def cameo() -> None:
    """Same framing as atinfantry-cameo.png: 72x72, width-fit, feet on y=70."""
    rgba = key_magenta(Image.open(SRC / "pyro-stand/E.png"))
    crop = rgba.crop(opaque_bbox(rgba))
    fit = min(72 / crop.width, 63 / crop.height)
    small = crop.resize((max(1, round(crop.width * fit)), max(1, round(crop.height * fit))), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (72, 72), (0, 0, 0, 0))
    out.alpha_composite(small, ((72 - small.width) // 2, 70 - small.height))
    out.save(UNITS / "pyro-cameo.png")
    print("cameo", UNITS / "pyro-cameo.png")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--compose", action="store_true")
    ap.add_argument("--poses", default="stand,crouch,crawl,fire,die")
    args = ap.parse_args()
    poses = args.poses.split(",")
    if (SRC / "pyro-tips.json").exists():
        TIPS.update(json.loads((SRC / "pyro-tips.json").read_text()))
    for p in poses:
        derive(p)
    if (SRC / "pyro-stand/E.png").exists():
        Image.open(SRC / "pyro-stand/E.png").save(SRC / "pyro-east.png")
    if args.compose:
        for p in poses:
            compose(p)
        cameo()
        write_nozzle_table()


if __name__ == "__main__":
    main()
