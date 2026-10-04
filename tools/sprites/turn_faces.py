"""Turned faces for buildings the player rotates before placing (Bunker, Watch Tower, Airfield).

The game stands these at BUILDING_FACINGS steps of BUILDING_TURN_STEP (catalog.ts): 24 faces,
15 degrees apart, turning clockwise on screen (east toward south). Each face is the building's
mesh turned about its centre under the same key light, so shading and shadows stay true.
Textures are read in the building's own frame, so concrete and grass turn with it instead of
swimming under it.

Every face is cropped to its pixels and carries its own pad metrics, written to a manifest:
the anchor is the south corner of that facing's tile box (`turnedBox` in building-rect.ts) and
the pad width is that box's iso width, so the client draws a turned building from its tile box
exactly the way it draws an unturned one.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

import render_airfield as ra

FACES = 24
STEP = 2 * math.pi / FACES

# The angle the mesh is being drawn at; the texture wrapper reads it.
_turn = {"angle": 0.0, "cx": 0.0, "cy": 0.0}


def face_angle(k: int) -> float:
    return k * STEP


def js_round(x: float) -> int:
    """Math.round: halves go up, like the client and the sim."""
    return int(math.floor(x + 0.5))


def box_tiles(tile_w: int, tile_h: int, angle: float) -> tuple[int, int]:
    """turnedBox in building-rect.ts: the tile box around the turned footprint."""
    c, s = abs(math.cos(angle)), abs(math.sin(angle))
    return max(1, js_round(tile_w * c + tile_h * s)), max(1, js_round(tile_w * s + tile_h * c))


def turn_mesh(m: ra.Mesh, angle: float, cx: float, cy: float) -> ra.Mesh:
    """Turn the mesh clockwise on screen (east toward south) about (cx, cy)."""
    c, s = math.cos(angle), math.sin(angle)
    for v in m.verts:
        dx, dy = v[0] - cx, v[1] - cy
        v[0], v[1] = cx + dx * c - dy * s, cy + dx * s + dy * c
    return m


def unturn_points(X: np.ndarray, Y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """World ground points back into the building's own (unturned) frame."""
    a, cx, cy = _turn["angle"], _turn["cx"], _turn["cy"]
    c, s = math.cos(a), math.sin(a)
    dx, dy = X - cx, Y - cy
    return cx + dx * c + dy * s, cy - dx * s + dy * c


def set_turn(angle: float, cx: float, cy: float) -> None:
    _turn.update(angle=angle, cx=cx, cy=cy)


def install_texture_frame() -> None:
    """Wrap ra.tex once so every material is read in the building's own frame."""
    if getattr(ra.tex, "_turned", False):
        return
    inner = ra.tex

    def tex(mat: str, P: np.ndarray, n: np.ndarray) -> np.ndarray:
        if _turn["angle"] == 0.0:
            return inner(mat, P, n)
        lx, ly = unturn_points(P[:, 0], P[:, 1])
        Q = np.stack([lx, ly, P[:, 2]], axis=1)
        a = _turn["angle"]
        c, s = math.cos(a), math.sin(a)
        m = np.array([n[0] * c + n[1] * s, -n[0] * s + n[1] * c, n[2]])
        return inner(mat, Q, m)

    tex._turned = True  # type: ignore[attr-defined]
    ra.tex = tex


def disc_canvas(cx: float, cy: float, radius: float, top: float, margin: float) -> ra.Canvas:
    """A canvas holding everything within `radius` of (cx, cy) on the ground, up to `top` high."""
    k = ra.ZOOM * ra.SS
    r = radius * math.sqrt(2) + margin
    left = (cx - cy - r) * k
    right = (cx - cy + r) * k
    upper = ((cx + cy) * 0.5 - r * 0.5 - top) * k
    lower = ((cx + cy) * 0.5 + r * 0.5 + margin) * k
    w = int(math.ceil((right - left) / ra.SS)) * ra.SS
    h = int(math.ceil((lower - upper) / ra.SS)) * ra.SS
    return ra.Canvas(w, h, -left, -upper)


def face_metrics(
    cv: ra.Canvas,
    cx: float,
    cy: float,
    box_w: float,
    box_h: float,
    stack: tuple[float, float, float],
    crop: tuple[int, int],
) -> dict:
    """Pad metrics of a cropped face, in its own pixels."""
    south = cv.to_screen(np.array([[cx + box_w / 2, cy + box_h / 2, 0.0]]))
    top = cv.to_screen(np.array([list(stack)]))
    ox, oy = crop
    return {
        "padWidth": round((box_w + box_h) * ra.ZOOM, 2),
        "padSouthX": round(float(south[0][0]) / ra.SS - ox, 2),
        "padSouthY": round(float(south[1][0]) / ra.SS - oy, 2),
        "stackX": round(float(top[0][0]) / ra.SS - ox, 2),
        "stackY": round(float(top[1][0]) / ra.SS - oy, 2),
    }


def crop_box(*imgs: Image.Image) -> tuple[int, int, int, int]:
    """One crop that keeps every pixel of every layer, so layers share an anchor."""
    boxes = [b for b in (im.getbbox() for im in imgs) if b]
    if not boxes:
        return (0, 0, 1, 1)
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


def write_manifest(path: Path, name: str, faces: list[dict], **extra) -> None:
    info = {"name": name, "faces": faces, **extra}
    path.write_text(json.dumps(info, indent=1) + "\n")
