"""
ElevenLabs connector: voice design, text to speech, sound effects, and music.

Standard library only. The key comes from ELEVENLABS_API_KEY in the environment,
or from the first `.env` found walking up from this file or from the cwd (agent
worktrees live under the main checkout, so they find its `.env`).

As a module:

    from elevenlabs import ElevenLabs
    el = ElevenLabs()
    previews = el.design_voice("gruff veteran tank commander, 50s, gravelly", "Panzer ready.")
    voice_id = el.save_voice("Tiger Commander", "...", previews[0]["generated_voice_id"])
    el.tts(voice_id, "Rolling out!", out="x.mp3")
    el.sfx("short rifle shot, outdoor", duration=1.0, out="shot.mp3")
    el.music("tense orchestral march, war drums", length_ms=90000, out="theme.mp3")

As a CLI (one-off use):

    python3 tools/audio/elevenlabs.py voices
    python3 tools/audio/elevenlabs.py tts <voice_id> "Text" out.mp3
    python3 tools/audio/elevenlabs.py sfx "prompt" out.mp3 [--duration 1.5] [--loop]
    python3 tools/audio/elevenlabs.py music "prompt" out.mp3 [--length-ms 60000]
    python3 tools/audio/elevenlabs.py design "voice description" "sample text" outdir/
    python3 tools/audio/elevenlabs.py songs                 # music library, incl. songs made on the site
    python3 tools/audio/elevenlabs.py song <song_id> out.mp3

Every call retries on 429 and 5xx with backoff, so many workers can share one key.
Writes are atomic (tmp file then rename) so an interrupted batch never leaves half files.
"""

from __future__ import annotations

import base64
import json
import os
import pathlib
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.elevenlabs.io"

TTS_MODEL = "eleven_v3"  # understands [shouting], [whispers], [laughs] tags
TTS_FALLBACK_MODEL = "eleven_multilingual_v2"
SFX_MODEL = "eleven_text_to_sound_v2"
VOICE_DESIGN_MODEL = "eleven_ttv_v3"
MUSIC_MODEL = "music_v1"
FORMAT = "mp3_44100_128"


class ElevenLabsError(RuntimeError):
    def __init__(self, status: int, body: str, path: str):
        super().__init__(f"ElevenLabs {path} -> HTTP {status}: {body[:400]}")
        self.status = status
        self.body = body


def find_key() -> str:
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if key:
        return key
    starts = [pathlib.Path(__file__).resolve().parent, pathlib.Path.cwd().resolve()]
    for start in starts:
        for d in [start, *start.parents]:
            env = d / ".env"
            if env.is_file():
                for line in env.read_text().splitlines():
                    line = line.strip()
                    if line.startswith("export "):
                        line = line[7:]
                    if line.startswith("ELEVENLABS_API_KEY="):
                        val = line.split("=", 1)[1].strip().strip('"').strip("'")
                        if val:
                            return val
    raise SystemExit("ELEVENLABS_API_KEY not set and no .env with it found")


def _write(out: str | os.PathLike, data: bytes) -> pathlib.Path:
    p = pathlib.Path(out)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + f".tmp{os.getpid()}")
    tmp.write_bytes(data)
    tmp.replace(p)
    return p


class ElevenLabs:
    def __init__(self, key: str | None = None, retries: int = 6, timeout: float = 300.0):
        self.key = key or find_key()
        self.retries = retries
        self.timeout = timeout

    # -- transport -----------------------------------------------------------

    def _request(self, method: str, path: str, body: dict | None = None,
                 query: dict | None = None, want: str = "json"):
        url = API + path
        if query:
            url += "?" + urllib.parse.urlencode(query)
        data = json.dumps(body).encode() if body is not None else None
        headers = {"xi-api-key": self.key, "Accept": "*/*"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        delay = 2.0
        for attempt in range(self.retries + 1):
            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    raw = r.read()
                    return json.loads(raw) if want == "json" else raw
            except urllib.error.HTTPError as e:
                text = e.read().decode(errors="replace")
                retryable = e.code == 429 or e.code >= 500
                if retryable and attempt < self.retries:
                    time.sleep(delay + random.random())
                    delay = min(delay * 2, 60)
                    continue
                raise ElevenLabsError(e.code, text, path) from None
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                if attempt < self.retries:
                    time.sleep(delay + random.random())
                    delay = min(delay * 2, 60)
                    continue
                raise

    # -- voices --------------------------------------------------------------

    def voices(self) -> list[dict]:
        return self._request("GET", "/v1/voices")["voices"]

    def find_voice(self, name: str) -> str | None:
        for v in self.voices():
            if v["name"] == name:
                return v["voice_id"]
        return None

    def design_voice(self, description: str, text: str | None = None,
                     guidance_scale: float = 5.0, seed: int | None = None) -> list[dict]:
        """Voice previews from a description. Each has generated_voice_id and audio_base_64."""
        body: dict = {"voice_description": description, "model_id": VOICE_DESIGN_MODEL,
                      "guidance_scale": guidance_scale}
        if text and len(text) >= 100:
            body["text"] = text
        else:
            body["auto_generate_text"] = True
        if seed is not None:
            body["seed"] = seed
        try:
            res = self._request("POST", "/v1/text-to-voice/design", body)
        except ElevenLabsError as e:
            if e.status not in (400, 404, 422):
                raise
            legacy = {"voice_description": description}
            if text and len(text) >= 100:
                legacy["text"] = text
            else:
                legacy["auto_generate_text"] = True
            res = self._request("POST", "/v1/text-to-voice/create-previews", legacy)
        return res["previews"]

    def save_voice(self, name: str, description: str, generated_voice_id: str) -> str:
        """Turn a design preview into a voice in the account. Returns voice_id."""
        body = {"voice_name": name, "voice_description": description,
                "generated_voice_id": generated_voice_id}
        try:
            res = self._request("POST", "/v1/text-to-voice", body)
        except ElevenLabsError as e:
            if e.status not in (404, 405):
                raise
            res = self._request("POST", "/v1/text-to-voice/create-voice-from-preview", body)
        return res["voice_id"]

    def delete_voice(self, voice_id: str) -> None:
        self._request("DELETE", f"/v1/voices/{voice_id}")

    # -- speech --------------------------------------------------------------

    def tts(self, voice_id: str, text: str, out: str | os.PathLike | None = None, *,
            model: str = TTS_MODEL, stability: float = 0.5, similarity: float = 0.8,
            style: float = 0.3, speed: float | None = None, fmt: str = FORMAT) -> bytes:
        settings: dict = {"stability": stability, "similarity_boost": similarity,
                          "style": style, "use_speaker_boost": True}
        if speed is not None:
            settings["speed"] = speed
        body = {"text": text, "model_id": model, "voice_settings": settings}
        audio = self._request("POST", f"/v1/text-to-speech/{voice_id}", body,
                              {"output_format": fmt}, want="bytes")
        if out:
            _write(out, audio)
        return audio

    # -- sound effects -------------------------------------------------------

    def sfx(self, prompt: str, out: str | os.PathLike | None = None, *,
            duration: float | None = None, influence: float = 0.5, loop: bool = False,
            fmt: str = FORMAT) -> bytes:
        body: dict = {"text": prompt, "prompt_influence": influence, "model_id": SFX_MODEL}
        if duration is not None:
            body["duration_seconds"] = max(0.5, min(30.0, duration))
        if loop:
            body["loop"] = True
        audio = self._request("POST", "/v1/sound-generation", body, {"output_format": fmt},
                              want="bytes")
        if out:
            _write(out, audio)
        return audio

    # -- music ---------------------------------------------------------------

    def music(self, prompt: str, out: str | os.PathLike | None = None, *,
              length_ms: int = 90_000, instrumental: bool = True, fmt: str = FORMAT) -> bytes:
        body: dict = {"prompt": prompt, "music_length_ms": length_ms, "model_id": MUSIC_MODEL}
        if instrumental:
            body["force_instrumental"] = True
        audio = self._request("POST", "/v1/music", body, {"output_format": fmt}, want="bytes")
        if out:
            _write(out, audio)
        return audio


    # -- songs made on the site ----------------------------------------------

    def songs(self) -> list[dict]:
        """Songs in the account's music library (made here or on the ElevenLabs site), newest first."""
        return self._request("GET", "/v1/music/songs")["songs"]

    def download_song(self, song_id: str, out: str | os.PathLike) -> pathlib.Path:
        """Save a library song. Its download_url is a signed storage link: fetched without the API key."""
        song = next((s for s in self.songs() if s["id"] == song_id), None)
        if not song or not song.get("download_url"):
            raise ElevenLabsError(404, f"song {song_id} not found or not ready", "/v1/music/songs")
        with urllib.request.urlopen(song["download_url"], timeout=self.timeout) as r:
            return _write(out, r.read())


def _main(argv: list[str]) -> None:
    import argparse

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("voices")
    sub.add_parser("songs")
    g = sub.add_parser("song"); g.add_argument("song_id"); g.add_argument("out")
    t = sub.add_parser("tts"); t.add_argument("voice_id"); t.add_argument("text"); t.add_argument("out")
    t.add_argument("--model", default=TTS_MODEL)
    s = sub.add_parser("sfx"); s.add_argument("prompt"); s.add_argument("out")
    s.add_argument("--duration", type=float); s.add_argument("--influence", type=float, default=0.5)
    s.add_argument("--loop", action="store_true")
    m = sub.add_parser("music"); m.add_argument("prompt"); m.add_argument("out")
    m.add_argument("--length-ms", type=int, default=90_000)
    d = sub.add_parser("design"); d.add_argument("description"); d.add_argument("text"); d.add_argument("outdir")
    a = ap.parse_args(argv)

    el = ElevenLabs()
    if a.cmd == "songs":
        for s in el.songs():
            print(s["id"], s["updated_at_utc"][:16], s["metadata"].get("title"), sep="\t")
    elif a.cmd == "song":
        print(el.download_song(a.song_id, a.out))
    elif a.cmd == "voices":
        for v in el.voices():
            print(v["voice_id"], v["name"], sep="\t")
    elif a.cmd == "tts":
        print(_write(a.out, el.tts(a.voice_id, a.text, model=a.model)))
    elif a.cmd == "sfx":
        print(_write(a.out, el.sfx(a.prompt, duration=a.duration, influence=a.influence, loop=a.loop)))
    elif a.cmd == "music":
        print(_write(a.out, el.music(a.prompt, length_ms=a.length_ms)))
    elif a.cmd == "design":
        for i, p in enumerate(el.design_voice(a.description, a.text)):
            f = _write(pathlib.Path(a.outdir) / f"preview{i}.mp3", base64.b64decode(p["audio_base_64"]))
            print(p["generated_voice_id"], f, sep="\t")


if __name__ == "__main__":
    _main(sys.argv[1:])
