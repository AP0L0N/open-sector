#!/usr/bin/env python3
"""Split the Mauler into a hull sheet and a towed-cart sheet.

Inputs are the composed full sheet (dozer + cart) and the cart-off sheet from
`compose_mauler.py`, kept under tools/sprites/src/mauler/. The client draws
the cart as its own object on a hitch, so each output sheet is anchored on its
own ground point instead of the whole rig's bbox.

Cart rows: the cart is a box on four wheels, so a 180° yaw draws the same
picture. Each pair (k, k+8) takes whichever row shows the cart unoccluded.

Hull rows: the cart-off frames for NW, NNW, NNE, NE are a different render
(no blade), so those four are cut from the full frame and the patch the cart
covered is filled from the surrounding plate.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tools/sprites/src/mauler"
OUT = ROOT / "gridlock/packages/client/src/assets/units"
WORK = ROOT / "tools/sprites/work"
CELL = 128
DIRS = 16
BROKEN_BARE_ROWS = {6, 7, 9, 10}
# Ground point sits here in the cell; the client adds the usual 10% sink.
ANCHOR_Y = round(CELL * 0.82)
ALPHA = 40


def rows(sheet: Image.Image) -> list[np.ndarray]:
    a = np.asarray(sheet.convert("RGBA")).astype(np.int16)
    return [a[r * CELL : (r + 1) * CELL] for r in range(DIRS)]


def components(mask: np.ndarray) -> list[np.ndarray]:
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out: list[np.ndarray] = []
    for y0 in range(h):
        for x0 in range(w):
            if not mask[y0, x0] or seen[y0, x0]:
                continue
            comp = np.zeros_like(mask, dtype=bool)
            q = deque([(y0, x0)])
            seen[y0, x0] = True
            while q:
                y, x = q.popleft()
                comp[y, x] = True
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            q.append((ny, nx))
            out.append(comp)
    return out


def dilate(mask: np.ndarray, r: int = 1) -> np.ndarray:
    out = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= np.roll(np.roll(mask, dy, 0), dx, 1)
    return out


def orange(px: np.ndarray) -> np.ndarray:
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    return (r > 170) & (g > 70) & (g < 170) & (b < 90) & (r - b > 110)


def cart_mask(full: np.ndarray, bare: np.ndarray) -> np.ndarray:
    fa = full[..., 3] > ALPHA
    ba = bare[..., 3] > ALPHA
    delta = np.abs(full[..., :3] - bare[..., :3]).sum(-1)
    diff = fa & (~ba | (delta > 60))
    rim = orange(full) & fa
    grown = dilate(diff, 1) & fa
    best: np.ndarray | None = None
    best_score = 0
    for comp in components(grown):
        score = int((comp & rim).sum())
        if score > best_score:
            best, best_score = comp, score
    if best is None:
        return np.zeros_like(fa)
    # Pick up wheels and scrap that touch the rim blob but read as hull-dark.
    return best & diff | (best & rim)


def fill_holes(img: np.ndarray, hole: np.ndarray) -> np.ndarray:
    """Diffuse neighbouring plate into the pixels the cart covered."""
    out = img.copy()
    todo = hole.copy()
    known = (out[..., 3] > ALPHA) & ~todo
    for _ in range(64):
        if not todo.any():
            break
        acc = np.zeros(out.shape[:2] + (3,), dtype=np.int32)
        cnt = np.zeros(out.shape[:2], dtype=np.int32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                k = np.roll(np.roll(known, dy, 0), dx, 1)
                c = np.roll(np.roll(out[..., :3], dy, 0), dx, 1)
                acc += np.where(k[..., None], c, 0)
                cnt += k
        ready = todo & (cnt >= 2)
        if not ready.any():
            ready = todo & (cnt >= 1)
        if not ready.any():
            break
        out[ready, :3] = acc[ready] // cnt[ready, None]
        out[ready, 3] = 255
        known |= ready
        todo &= ~ready
    return out


def convex_fill(mask: np.ndarray) -> np.ndarray:
    ys, xs = np.nonzero(mask)
    pts = sorted(set(zip(xs.tolist(), ys.tolist())))
    if len(pts) < 3:
        return mask

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower: list[tuple[int, int]] = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper: list[tuple[int, int]] = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    hull = lower[:-1] + upper[:-1]
    im = Image.new("L", (mask.shape[1], mask.shape[0]), 0)
    ImageDraw.Draw(im).polygon(hull, fill=255)
    return np.asarray(im) > 0


def hull_row(full: np.ndarray, bare: np.ndarray, cart: np.ndarray, row: int) -> np.ndarray:
    if row not in BROKEN_BARE_ROWS:
        return bare.copy()
    body = full.copy()
    body[cart] = 0
    solid = body[..., 3] > ALPHA
    # Keep only the dozer: the hitch bar and cart specks are small islands.
    comps = components(solid)
    main = max(comps, key=lambda c: int(c.sum()))
    body[~main] = 0
    hole = convex_fill(main) & cart
    return fill_holes(body, hole)


def centroid(img: np.ndarray) -> tuple[float, float]:
    a = img[..., 3] > ALPHA
    ys, xs = np.nonzero(a)
    return float(xs.mean()), float(ys.mean())


def anchored(img: np.ndarray, drop: float) -> Image.Image:
    """Shift so centroid + drop lands on the cell's ground point."""
    cx, cy = centroid(img)
    src = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGBA")
    ox = round(CELL / 2 - cx)
    oy = round(ANCHOR_Y - (cy + drop))
    out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    out.paste(src, (ox, oy), src)
    return out


def sheet(cells: list[Image.Image]) -> Image.Image:
    s = Image.new("RGBA", (CELL, DIRS * CELL), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        s.alpha_composite(c, (0, i * CELL))
    return s


def lower_drop(imgs: list[np.ndarray]) -> float:
    """Centroid sits above the ground point by about a third of centroid-to-bottom."""
    d = []
    for img in imgs:
        ys = np.nonzero(img[..., 3] > ALPHA)[0]
        d.append(ys.max() - ys.mean())
    return float(np.median(d)) * 0.35


def main() -> int:
    full_rows = rows(Image.open(SRC / "hauler-move.png"))
    bare_rows = rows(Image.open(SRC / "hauler-bare.png"))
    carts = [cart_mask(f, b) for f, b in zip(full_rows, bare_rows)]
    hulls = [hull_row(f, b, c, r) for r, (f, b, c) in enumerate(zip(full_rows, bare_rows, carts))]

    cart_imgs: list[np.ndarray] = [None] * DIRS  # type: ignore[list-item]
    for k in range(DIRS // 2):
        pair = [r for r in (k, k + 8) if r not in BROKEN_BARE_ROWS] or [k, k + 8]
        pick = max(pair, key=lambda r: int(carts[r].sum()))
        img = full_rows[pick].copy()
        img[~carts[pick]] = 0
        cart_imgs[k] = img
        cart_imgs[k + 8] = img

    hull_drop = lower_drop(hulls)
    cart_drop = lower_drop(cart_imgs)
    hull_cells = [anchored(h, hull_drop) for h in hulls]
    cart_cells = [anchored(c, cart_drop) for c in cart_imgs]
    sheet(hull_cells).save(OUT / "hauler-hull.png")
    sheet(cart_cells).save(OUT / "hauler-cart.png")

    # Tow length in cell pixels, measured where hull and cart sit side by side.
    for r in (4, 12):
        towed = full_rows[r].copy()
        towed[~carts[r]] = 0
        hx, hy = centroid(hulls[r])
        cx, cy = centroid(towed)
        print(f"row {r} hull->cart {cx - hx:.1f}px x {cy - hy:.1f}px (cell {CELL})")

    WORK.mkdir(parents=True, exist_ok=True)
    preview = Image.new("RGBA", (CELL * 3, CELL * DIRS), (255, 0, 255, 255))
    for r in range(DIRS):
        preview.alpha_composite(hull_cells[r], (0, r * CELL))
        preview.alpha_composite(cart_cells[r], (CELL, r * CELL))
        preview.alpha_composite(hull_cells[r], (2 * CELL, r * CELL))
        g = ImageDraw.Draw(preview)
        for col in range(3):
            g.ellipse((col * CELL + 62, r * CELL + ANCHOR_Y - 2, col * CELL + 66, r * CELL + ANCHOR_Y + 2), fill=(0, 255, 0, 255))
    preview.save(WORK / "mauler-split.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
