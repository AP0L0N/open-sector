# Game audio (ElevenLabs)

Voices, voice lines, sound effects, and music for Open Sector, generated with ElevenLabs
from JSON specs. The key is `ELEVENLABS_API_KEY` in the repo-root `.env` (or the environment).

| File | What it does |
|---|---|
| `elevenlabs.py` | The connector: `design_voice`, `save_voice`, `tts`, `sfx`, `music`. Retries 429/5xx. Also a CLI. |
| `build.py` | Generates every missing file a spec asks for. Idempotent. `--all`, `--dry-run`, `--force`. |
| `qa.py` | ffmpeg check: decodes, not silent, length fits the kind. |
| `specs/units/<type>.json` | One per unit: voice, lines, sound effects. `<type>` is the catalog type id. |
| `specs/announcer.json`, `specs/sfx/*.json`, `specs/music.json` | Announcer, shared battlefield and UI effects, music. |
| `voices/<key>.json` | The ElevenLabs voice id designed for that spec. Committed, so reruns reuse the same voice. |

Output lands in `gridlock/packages/client/src/assets/audio/<out>/` as mp3 (silence trimmed,
loudness normalized), and the client picks files up by name with `import.meta.glob`.

```sh
python3 tools/audio/build.py tools/audio/specs/units/gunner.json
python3 tools/audio/qa.py units/gunner
```

### Custom voices and the account cap

The account holds a limited number of custom voices (10 on the current plan), so only some
specs have a designed voice (`voices/<key>.json`). The rest name a stock ElevenLabs voice in
the spec: `"voice": {"voice_id": "...", "stock_voice": "Harry", ...}`. Stock voices do not count
against the cap. To give such a unit its own designed voice later, free a slot (or raise the
plan), remove `voice_id`/`stock_voice` from its spec, delete its `voice-*.mp3` files, and rerun
build: it designs a voice from `description` + `sample` and regenerates the lines.

Redo one take: delete the file and rerun build. Redo a voice: delete `voices/<key>.json`
(and the voice in the ElevenLabs account, or rename it in the spec) and rerun with `--force`.

## Unit spec conventions

Key = catalog type id, `out` = `units/<type>`. The client maps these names, so keep them:

**Voice events** (`lines`) — short barks, 1 to 6 words, like a classic RTS:

| Event | When it plays | Count |
|---|---|---|
| `select` | Player selects the unit | 4–6 |
| `move` | Move order | 4–6 |
| `attack` | Attack / force-attack order | 3–5 |
| `ready` | Unit leaves the factory | 1–2 |
| `hit` | Unit takes damage (throttled) | 2 |
| `die` | Infantry death cry / vehicle crew last words | 2 |
| `special` | Unit-specific order (deploy, dive, take off, launch drone, self-destruct, build, heal...) | 0–3 |

eleven_v3 audio tags work inside lines: `[shouting]`, `[whispers]`, `[laughs]`, `[sighs]`,
`[groans]`, `[gasps]`, `[screaming]`, `[breathing heavily]`, `[radio static]`-style tags are not
reliable, keep to emotional tags. Vehicle voices are the commander or crew on the radio;
aircraft are the pilot; machines (Walker, Cyborg) may sound processed or robotic.

**Sound events** (`sfx`):

| Event | When it plays | Notes |
|---|---|---|
| `fire` | Each shot or burst | 2–3 variants, 0.5–2.5 s |
| `move` | Move order acknowledged: engine rev, boots, rotor, jet pack | one-shot, 1–3 s |
| `die` | Vehicle destroyed / plane crash / boat sunk | 2–4 s |
| `special` | Unit-specific (deploy outriggers, torpedo launch, dive klaxon...) | optional |
| `reload` | Optional | |

**Heavy guns and rockets.** Their `fire` is a 5 s, plainly worded WW2 scene ("Distant, powerful
boom of a World War 2 StuG III assault gun firing its 75mm cannon in an open field, ...") with
`"lufs": -9`: build compresses it and drives it into a -1.5 dBFS limiter until it reaches that
loudness, and the client plays those types at full volume (`HEAVY_FIRE` in `ui/game-audio.ts`).
Every sound effect's untouched API take is kept in `raw/` (gitignored); after a mastering change,
`build.py --remaster <specs>` re-masters from those takes without spending credits.

Prompts say "no music, no voice" and describe distance ("close", "medium distance outdoors").
Original voices and sounds only: no named real actors, no Westwood/EA material.
