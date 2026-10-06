#!/usr/bin/env python3
"""Turned faces for the CIWS and RAM pads, which the player now rotates before placing.

Only the static base turns (the traversing gun sheets already cover every heading), so this
writes ciws/00..23.png + ciws/faces.json and ram/00..23.png + ram/faces.json: the base mesh of
render_ciws.py turned in 15 degree steps under the same light (turn_faces.py), t(1) x t(1).
ciws.png / ciws-turret.png / ram.png / ram-turret.png and their json are left untouched. The
diagonal gun shadow baked into the unturned base is not drawn on the turned faces.

  cd tools/sprites && python3 render_turned_pads.py --out ../../gridlock/packages/client/src/assets/buildings
"""

from __future__ import annotations

import argparse
from pathlib import Path

# Import order is the material chain: the WW2 kit first, then CIWS and RAM on top, so the
# pad's own "slab" and "ammo" win exactly as they do in render_ciws.py.
import render_ww2_fort as wf
import render_ciws as rc
import render_ram  # noqa: F401

TILES = (4, 4)


def pad_mesh(ground: bool = True):
    # The slab is the "ground" part: it takes the shadow but does not cast it, as in render_ciws.
    return rc.base_mesh(slab=ground)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="buildings asset folder")
    args = ap.parse_args()
    out = Path(args.out)
    for name in ("ciws", "ram"):
        # Both share the CIWS pad: same mesh, canvas margins, and stack height.
        wf.render_turned(out, name, pad_mesh, rc.W, rc.H, TILES, rc.TOP_MARGIN, rc.SIDE_MARGIN, 4.0, rc.PLINTH_TOP, rc.GUN_Z + 10.0)


if __name__ == "__main__":
    main()
