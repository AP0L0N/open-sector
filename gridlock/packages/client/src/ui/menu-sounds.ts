/**
 * Interface sounds: buttons, hovers, dropdowns, checkboxes, sliders, typing, and
 * screen changes. One set of delegated listeners on the app root covers every screen.
 * On the battle HUD only clicks sound (quieter), so hovering the sidebar stays silent;
 * the pause and leave dialogs over the battle count as menus.
 */
import type { Screen } from "../ctx.js";
import { menuSound } from "./game-audio.js";
import { buttonCue, screenCue, typingKey } from "./menu-cues.js";

/** Battle HUD clicks: same switch, quieter, under the gunfire. */
const BATTLE_CLICK_SCALE = 0.6;

function inBattleHud(t: Element): boolean {
  return !!t.closest("#battlefield") && !t.closest(".modal-back");
}

function buttonOf(t: EventTarget | null): HTMLButtonElement | null {
  const b = t instanceof Element ? t.closest("button") : null;
  return b instanceof HTMLButtonElement ? b : null;
}

function isDisabled(b: HTMLButtonElement): boolean {
  return b.disabled || b.getAttribute("aria-disabled") === "true" || b.classList.contains("is-disabled");
}

export function bindMenuSounds(root: HTMLElement): void {
  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const b = buttonOf(e.target);
    if (!b) return;
    const cue = buttonCue({ classes: [...b.classList], text: b.textContent ?? "", disabled: isDisabled(b) });
    if (inBattleHud(b)) {
      // The HUD has its own answers (units, announcer, deny buzz); a plain switch is enough.
      if (cue !== "deny") menuSound("click", BATTLE_CLICK_SCALE);
      return;
    }
    menuSound(cue);
  });

  let hovered: Element | null = null;
  root.addEventListener("pointerover", (e) => {
    const b = buttonOf(e.target);
    if (b === hovered) return;
    hovered = b;
    if (!b || isDisabled(b) || inBattleHud(b)) return;
    menuSound("hover");
  });

  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type === "checkbox")) {
      if (!inBattleHud(t)) menuSound("toggle");
    }
  });

  root.addEventListener("input", (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.type === "range") menuSound("tick");
  });

  root.addEventListener("keydown", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || (t.type !== "text" && t.type !== "")) return;
    if (!e.repeat && typingKey(e.key)) menuSound("type");
  });
}

let lastScreen: Screen | null = null;

/** Called on every render; sounds only when the screen actually changed. */
export function screenSound(screen: Screen): void {
  const cue = screenCue(lastScreen, screen);
  lastScreen = screen;
  if (cue) menuSound(cue);
}
