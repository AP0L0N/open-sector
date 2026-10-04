/**
 * Background music. The menu screens loop the menu theme; a match plays the
 * battle tracks in a shuffled order, one after another, with a short crossfade.
 * Streams through <audio> elements (no decode of whole tracks). Follows the
 * Music volume in Options. Browsers block sound until the first click or key,
 * so the first track waits for one.
 */
import { getMusic } from "./audio.js";

const files = import.meta.glob("../assets/audio/music/*.mp3", { eager: true, import: "default" }) as Record<
  string,
  string
>;
const tracks = Object.entries(files).map(([path, url]) => ({ name: path.split("/").pop()!.replace(/\.mp3$/, ""), url }));
const MENU = tracks.filter((t) => t.name.startsWith("menu")).map((t) => t.url);
const BATTLE = tracks.filter((t) => t.name.startsWith("battle")).map((t) => t.url);

export type MusicMode = "menu" | "battle" | "off";

const FADE_MS = 2500;
/** Music sits under the battle: the slider's top is not full scale. */
const MUSIC_SCALE = 0.6;
/** The menu theme is a low bed under the menus, quieter still. */
const MENU_SCALE = 0.35;

let mode: MusicMode = "off";
let current: HTMLAudioElement | null = null;
let order: string[] = [];
let unlocked = false;
let fadeTimer: number | null = null;
let lastUrl: string | null = null;

function level(): number {
  return getMusic() * (mode === "menu" ? MENU_SCALE : MUSIC_SCALE);
}

function fade(el: HTMLAudioElement, to: number, ms: number, done?: () => void): void {
  const from = el.volume;
  const start = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - start) / ms);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

function nextUrl(): string | null {
  const pool = mode === "menu" ? MENU : mode === "battle" ? BATTLE : [];
  if (pool.length === 0) return null;
  if (order.length === 0) {
    order = [...pool].sort(() => Math.random() - 0.5);
    if (order.length > 1 && order[0] === lastUrl) order.push(order.shift()!);
  }
  return order.shift()!;
}

function stopCurrent(): void {
  const old = current;
  current = null;
  if (fadeTimer !== null) window.clearTimeout(fadeTimer);
  fadeTimer = null;
  if (!old) return;
  fade(old, 0, FADE_MS / 2, () => {
    old.pause();
    old.src = "";
  });
}

function playNext(): void {
  if (!unlocked || mode === "off" || level() <= 0) return;
  const url = nextUrl();
  if (!url) return;
  stopCurrent();
  lastUrl = url;
  const el = new Audio(url);
  el.preload = "auto";
  el.volume = 0;
  el.loop = mode === "menu" && MENU.length === 1;
  current = el;
  el.addEventListener("ended", () => {
    if (current === el) playNext();
  });
  // Start the crossfade into the next track a little before this one ends.
  el.addEventListener("loadedmetadata", () => {
    if (el.loop || !Number.isFinite(el.duration)) return;
    const lead = Math.max(0, (el.duration * 1000) - FADE_MS);
    fadeTimer = window.setTimeout(() => {
      if (current === el) playNext();
    }, lead);
  });
  void el.play().then(
    () => fade(el, level(), FADE_MS),
    () => {
      // Still locked: wait for the next gesture.
      unlocked = false;
      current = null;
    },
  );
}

/** Switch what plays. Calling with the same mode keeps the current track. */
export function setMusicMode(next: MusicMode): void {
  if (next === mode && current) return;
  const changed = next !== mode;
  mode = next;
  if (changed) order = [];
  if (mode === "off") stopCurrent();
  else playNext();
}

function unlock(): void {
  if (unlocked) return;
  unlocked = true;
  if (!current) playNext();
}

/** Call once at startup. */
export function initMusic(): void {
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });
  window.addEventListener("gridlock-music", () => {
    if (level() <= 0) stopCurrent();
    else if (current) current.volume = level();
    else playNext();
  });
}
