/**
 * Which menu sound an interface action makes. Pure: takes what the DOM says about
 * the control, so it is testable without a document. `menu-sounds.ts` binds it.
 */
import type { Screen } from "../ctx.js";

export type MenuCue = "hover" | "click" | "confirm" | "back" | "toggle" | "tick" | "type" | "deny" | "transition" | "deploy";

/** Leaving a screen or a game: the softer switch-off. */
const BACK_WORDS = new Set(["back", "leave", "exit", "cancel", "close", "resume", "no"]);

export interface ButtonFacts {
  classes: readonly string[];
  text: string;
  disabled: boolean;
}

export function buttonCue(b: ButtonFacts): MenuCue {
  if (b.disabled) return "deny";
  if (b.classes.includes("btn-primary")) return "confirm";
  const word = b.text.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (BACK_WORDS.has(word)) return "back";
  return "click";
}

/** A screen change in the menus slides the map; the match starting gets its stinger. */
export function screenCue(prev: Screen | null, next: Screen): MenuCue | null {
  if (prev === null || prev === next) return null;
  if (next === "deploy") return "deploy";
  if (next === "battle" || prev === "battle" || prev === "deploy") return null;
  return "transition";
}

/** Keys that make a typewriter strike in a text field. */
export function typingKey(key: string): boolean {
  return key.length === 1 || key === "Backspace" || key === "Delete";
}
