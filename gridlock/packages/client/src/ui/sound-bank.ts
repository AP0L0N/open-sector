/**
 * Index of the generated audio files (tools/audio, ElevenLabs) by folder and event.
 * Names follow `<folder>/<voice|sfx>-<event>-<n>.mp3` and `<folder>/<name>.mp3`.
 * Pure: takes the glob map, so it is testable without Vite.
 */

export interface SoundBank {
  /** `units/rifleman` + `voice-select` -> urls, in take order. */
  get(folder: string, cue: string): readonly string[];
  folders(): string[];
}

const NAME = /^(.*)\/((?:voice|sfx)-[a-z0-9_]+)-(\d+)\.mp3$/;
const PLAIN = /^(.*)\/([a-z0-9_-]+)\.mp3$/;

/** `globbed` maps module paths (`../assets/audio/units/x/voice-select-1.mp3`) to urls. */
export function buildBank(globbed: Record<string, string>, root = "/assets/audio/"): SoundBank {
  const map = new Map<string, Map<string, { n: number; url: string }[]>>();
  for (const [path, url] of Object.entries(globbed)) {
    const at = path.indexOf(root);
    if (at < 0) continue;
    const rel = path.slice(at + root.length);
    const m = NAME.exec(rel);
    const folder = m ? m[1]! : PLAIN.exec(rel)?.[1];
    const cue = m ? m[2]! : PLAIN.exec(rel)?.[2];
    if (folder === undefined || cue === undefined) continue;
    const n = m ? Number(m[3]) : 1;
    let cues = map.get(folder);
    if (!cues) map.set(folder, (cues = new Map()));
    let list = cues.get(cue);
    if (!list) cues.set(cue, (list = []));
    list.push({ n, url });
  }
  const sorted = new Map<string, Map<string, string[]>>();
  for (const [folder, cues] of map) {
    const s = new Map<string, string[]>();
    for (const [cue, list] of cues) s.set(cue, list.sort((a, b) => a.n - b.n).map((x) => x.url));
    sorted.set(folder, s);
  }
  return {
    get: (folder, cue) => sorted.get(folder)?.get(cue) ?? [],
    folders: () => [...sorted.keys()],
  };
}

/**
 * Takes from a list without saying the same line twice running, the way RTS units
 * answer repeated clicks. Each list is dealt from a shuffled deck; a new deck never
 * starts with the line that ended the last one.
 */
export class LineDeck {
  private decks = new Map<string, string[]>();
  private last = new Map<string, string>();

  constructor(private rand: () => number = Math.random) {}

  pick(key: string, list: readonly string[]): string | null {
    if (list.length === 0) return null;
    if (list.length === 1) return list[0]!;
    let deck = this.decks.get(key);
    if (!deck || deck.length === 0) {
      deck = [...list];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        [deck[i], deck[j]] = [deck[j]!, deck[i]!];
      }
      // Dealt from the end: keep the previous line away from the top.
      if (deck[deck.length - 1] === this.last.get(key)) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1]!, deck[0]!];
      this.decks.set(key, deck);
    }
    const url = deck.pop()!;
    this.last.set(key, url);
    return url;
  }
}
