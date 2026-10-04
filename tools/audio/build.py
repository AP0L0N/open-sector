"""
Build game audio from specs with the ElevenLabs connector.

A spec is a JSON file under tools/audio/specs/. It may hold a voice, voice lines,
sound effects, and music. Everything is idempotent: a file that already exists is
skipped, and a designed voice is remembered in tools/audio/voices/<key>.json so the
same unit keeps the same voice on every run. Delete an output (or pass --force) to
regenerate it.

    python3 tools/audio/build.py tools/audio/specs/units/rifleman.json [more specs...]
    python3 tools/audio/build.py --all
    python3 tools/audio/build.py --all --dry-run       # list what would be generated

Spec shape (every section optional):

    {
      "key": "rifleman",                       # output folder and voice registry name
      "out": "units/rifleman",                 # under client src/assets/audio/
      "voice": {
        "name": "Open Sector - Rifleman",
        "description": "Young male infantry private, ...",   # 20..1000 chars
        "sample": "A 100+ char line in character, used to design the voice.",
        "stability": 0.4, "similarity": 0.8, "style": 0.45, "speed": 1.05
      },
      "lines": { "select": ["Rifleman here.", "[shouting] Ready!"], "move": [...], ... },
      "sfx":   { "fire": {"prompt": "...", "duration": 0.8, "variants": 3, "influence": 0.6, "loop": false} },
      "music": { "battle-1": {"prompt": "...", "length_ms": 150000} }
    }

Outputs (mp3, silence trimmed, loudness normalized):
    voice lines  -> <out>/voice-<event>-<n>.mp3   (n from 1, in list order)
    sound fx     -> <out>/sfx-<event>-<n>.mp3
    music        -> <out>/<name>.mp3
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures as cf
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import threading

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from elevenlabs import ElevenLabs, ElevenLabsError, TTS_FALLBACK_MODEL  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SPECS = HERE / "specs"
VOICES = HERE / "voices"
ASSETS = ROOT / "gridlock/packages/client/src/assets/audio"

FFMPEG = shutil.which("ffmpeg")
_print_lock = threading.Lock()


def log(*a) -> None:
    with _print_lock:
        print(*a, flush=True)


def trim_chain(threshold_db: int) -> str:
    rm = f"silenceremove=start_periods=1:start_duration=0.02:start_threshold={threshold_db}dB"
    return f"{rm},areverse,{rm},areverse"


def finish(raw: bytes, out: pathlib.Path, kind: str) -> None:
    """Trim, normalize, and encode. Without ffmpeg the API mp3 is kept as is."""
    out.parent.mkdir(parents=True, exist_ok=True)
    if not FFMPEG:
        out.write_bytes(raw)
        return
    if kind == "voice":
        af = f"highpass=f=90,{trim_chain(-45)},loudnorm=I=-15:TP=-1.5:LRA=7,apad=pad_dur=0.04"
        enc = ["-ac", "1", "-b:a", "96k"]
    elif kind == "sfx":
        af = f"{trim_chain(-55)},loudnorm=I=-14:TP=-1:LRA=11"
        enc = ["-ac", "1", "-b:a", "112k"]
    elif kind == "loop":  # trimming would break the loop seam
        af = "loudnorm=I=-18:TP=-1.5:LRA=11"
        enc = ["-ac", "1", "-b:a", "112k"]
    else:  # music
        af = "loudnorm=I=-18:TP=-1.5:LRA=11"
        enc = ["-ac", "2", "-b:a", "128k"]
    with tempfile.TemporaryDirectory() as td:
        src = pathlib.Path(td) / "in.mp3"
        src.write_bytes(raw)
        tmp = pathlib.Path(td) / "out.mp3"
        cmd = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src), "-af", af,
               "-ar", "44100", *enc, str(tmp)]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0 or not tmp.exists() or tmp.stat().st_size < 400:
            log(f"  ffmpeg failed on {out.name}, keeping raw: {r.stderr.strip()[:200]}")
            out.write_bytes(raw)
            return
        shutil.move(str(tmp), out)


def ensure_voice(el: ElevenLabs, key: str, v: dict, dry: bool) -> str | None:
    reg = VOICES / f"{key}.json"
    if reg.exists():
        return json.loads(reg.read_text())["voice_id"]
    if "voice_id" in v:  # a stock or hand-picked voice
        return v["voice_id"]
    if dry:
        log(f"[{key}] would design voice: {v['description'][:80]}")
        return None
    name = v.get("name") or f"Open Sector - {key}"
    existing = el.find_voice(name)
    if existing:
        voice_id = existing
        log(f"[{key}] reusing account voice '{name}' {voice_id}")
    else:
        sample = v.get("sample", "")
        previews = el.design_voice(v["description"], sample, seed=v.get("seed"))
        pick = previews[min(v.get("preview", 0), len(previews) - 1)]
        prev_dir = HERE / "previews" / key
        prev_dir.mkdir(parents=True, exist_ok=True)
        for i, p in enumerate(previews):
            (prev_dir / f"preview{i}.mp3").write_bytes(base64.b64decode(p["audio_base_64"]))
        try:
            voice_id = el.save_voice(name, v["description"], pick["generated_voice_id"])
        except ElevenLabsError as e:
            if "voice_limit_reached" in e.body:
                raise SystemExit(
                    f"[{key}] the ElevenLabs account is full of custom voices. Free a slot, or give the "
                    f"spec a stock voice: \"voice\": {{\"voice_id\": \"<id from elevenlabs.py voices>\", ...}}"
                ) from None
            raise
        log(f"[{key}] designed voice '{name}' {voice_id}")
    VOICES.mkdir(parents=True, exist_ok=True)
    reg.write_text(json.dumps({"key": key, "name": name, "voice_id": voice_id,
                               "description": v["description"]}, indent=2) + "\n")
    return voice_id


def jobs_for(spec: dict, force: bool) -> tuple[list[tuple], dict]:
    out_dir = ASSETS / spec.get("out", spec["key"])
    jobs: list[tuple] = []
    for event, lines in spec.get("lines", {}).items():
        for i, text in enumerate(lines, 1):
            p = out_dir / f"voice-{event}-{i}.mp3"
            if force or not p.exists():
                jobs.append(("voice", p, text))
    for event, s in spec.get("sfx", {}).items():
        for i in range(1, int(s.get("variants", 1)) + 1):
            p = out_dir / f"sfx-{event}-{i}.mp3"
            if force or not p.exists():
                jobs.append(("sfx", p, s))
    for name, m in spec.get("music", {}).items():
        p = out_dir / f"{name}.mp3"
        if force or not p.exists():
            jobs.append(("music", p, m))
    return jobs, {"out_dir": out_dir}


def run_job(el: ElevenLabs, spec: dict, voice_id: str | None, job: tuple) -> str:
    kind, path, arg = job
    rel = path.relative_to(ASSETS)
    try:
        if kind == "voice":
            v = spec.get("voice", {})
            kw = dict(stability=v.get("stability", 0.45), similarity=v.get("similarity", 0.8),
                      style=v.get("style", 0.35), speed=v.get("speed"))
            try:
                raw = el.tts(voice_id, arg, **kw)
            except ElevenLabsError as e:
                if e.status not in (400, 422):
                    raise
                raw = el.tts(voice_id, arg, model=TTS_FALLBACK_MODEL, **kw)
            finish(raw, path, "voice")
        elif kind == "sfx":
            raw = el.sfx(arg["prompt"], duration=arg.get("duration"),
                         influence=arg.get("influence", 0.55), loop=arg.get("loop", False))
            finish(raw, path, "loop" if arg.get("loop") else "sfx")
        else:
            raw = el.music(arg["prompt"], length_ms=int(arg.get("length_ms", 120_000)))
            finish(raw, path, "music")
        log(f"  ok   {rel}")
        return "ok"
    except Exception as e:  # keep going; a rerun picks up what is missing
        log(f"  FAIL {rel}: {e}")
        return "fail"


def build(paths: list[pathlib.Path], workers: int, force: bool, dry: bool) -> int:
    el = None if dry else ElevenLabs()
    failures = 0
    for sp in paths:
        spec = json.loads(sp.read_text())
        key = spec["key"]
        jobs, _ = jobs_for(spec, force)
        if not jobs:
            log(f"[{key}] up to date")
            continue
        voice_id = None
        if any(j[0] == "voice" for j in jobs):
            voice_id = ensure_voice(el, key, spec["voice"], dry)
        if dry:
            for kind, p, arg in jobs:
                log(f"[{key}] {kind:5} {p.relative_to(ASSETS)}")
            continue
        log(f"[{key}] {len(jobs)} files")
        with cf.ThreadPoolExecutor(max_workers=workers) as pool:
            results = list(pool.map(lambda j: run_job(el, spec, voice_id, j), jobs))
        failures += results.count("fail")
    return failures


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("specs", nargs="*", type=pathlib.Path)
    ap.add_argument("--all", action="store_true", help="every spec under tools/audio/specs")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    paths = sorted(SPECS.rglob("*.json")) if a.all else a.specs
    if not paths:
        ap.error("give spec files or --all")
    fails = build(paths, a.workers, a.force, a.dry_run)
    if fails:
        log(f"{fails} file(s) failed; rerun to retry just those")
        sys.exit(1)


if __name__ == "__main__":
    main()
