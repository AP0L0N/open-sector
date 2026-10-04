"""
Sanity-check generated audio with ffmpeg: every file decodes, has sound in it, and
has a length that fits its kind (a voice bark, a sound effect, a music track).

    python3 tools/audio/qa.py                 # everything under client src/assets/audio
    python3 tools/audio/qa.py units/rifleman  # one folder (relative to that root)

Exit 1 when anything is flagged. Delete a flagged file and rerun build.py to redo it.
"""

from __future__ import annotations

import concurrent.futures as cf
import pathlib
import re
import shutil
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from build import ASSETS  # noqa: E402

FFMPEG = shutil.which("ffmpeg")

# (min s, max s) by file name prefix
LIMITS = {"voice-": (0.25, 6.0), "sfx-": (0.12, 30.0)}
MUSIC = (30.0, 400.0)


def probe(p: pathlib.Path) -> tuple[float, float]:
    r = subprocess.run([FFMPEG, "-hide_banner", "-nostats", "-i", str(p), "-af", "volumedetect",
                        "-f", "null", "-"], capture_output=True, text=True)
    err = r.stderr
    dur = 0.0
    for m in re.finditer(r"time=(\d+):(\d+):([\d.]+)", err):
        dur = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
    if not dur:
        m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err)
        if m:
            dur = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
    m = re.search(r"max_volume: (-?[\d.]+) dB", err)
    peak = float(m[1]) if m else -99.0
    return dur, peak


def check(p: pathlib.Path) -> str | None:
    dur, peak = probe(p)
    lo, hi = next((v for k, v in LIMITS.items() if p.name.startswith(k)), MUSIC)
    if p.parent.name == "ui":  # clicks and ticks are meant to be tiny
        lo = 0.05
    if peak < -30:
        return f"near silent (peak {peak} dB)"
    if not lo <= dur <= hi:
        return f"length {dur:.2f}s outside {lo}-{hi}s"
    return None


def main() -> None:
    if not FFMPEG:
        sys.exit("ffmpeg not found")
    root = ASSETS / sys.argv[1] if len(sys.argv) > 1 else ASSETS
    files = sorted(root.rglob("*.mp3"))
    with cf.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(check, files))
    bad = [(f, r) for f, r in zip(files, results) if r]
    for f, r in bad:
        print(f"BAD {f.relative_to(ASSETS)}: {r}")
    print(f"{len(files) - len(bad)}/{len(files)} files ok")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
