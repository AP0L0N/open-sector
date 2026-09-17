#!/usr/bin/env python3
"""Copy named unique-facing stills out of a harvested turntable video.

Frames are 1-indexed f001.png from `ffmpeg -vf fps=8`.

  python tools/sprites/harvest_turntable.py \\
      --frames-dir tools/sprites/work/hull-turn \\
      --picks E=1,ESE=3,SE=5,SSE=7,S=9,N=25,NNE=28,NE=31,ENE=34 \\
      --out-dir tools/sprites/src/warden-hull
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

UNIQUE = ["E", "ESE", "SE", "SSE", "S", "N", "NNE", "NE", "ENE"]
ENGINE = [
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
    "N",
    "NNE",
    "NE",
    "ENE",
]


def parse_picks(s: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for part in s.split(","):
        k, v = part.strip().split("=")
        out[k.strip().upper()] = int(v)
    return out


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--frames-dir", type=Path, required=True)
    p.add_argument("--picks", required=True, help="DIR=frame,DIR=frame,... 1-indexed")
    p.add_argument("--out-dir", type=Path, required=True)
    p.add_argument("--sixteen", action="store_true", help="Require all 16 engine dirs instead of 9 unique")
    args = p.parse_args()
    picks = parse_picks(args.picks)
    need = ENGINE if args.sixteen else UNIQUE
    missing = [d for d in need if d not in picks]
    if missing:
        raise SystemExit(f"missing picks: {missing}")
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for d in need:
        src = args.frames_dir / f"f{picks[d]:03d}.png"
        if not src.exists():
            raise SystemExit(f"no frame {src}")
        dst = args.out_dir / f"{d}.png"
        shutil.copy(src, dst)
        print(f"{d:4} <- {src.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
