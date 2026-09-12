import type { Ctx } from "../ctx.js";
import { beep, getMusic, getSfx, setMusic, setSfx } from "./audio.js";
import { el } from "./dom.js";

export function renderOptions(root: HTMLElement, ctx: Ctx): void {
  const screen = el("div", { class: "screen" });
  screen.append(el("h1", { class: "wordmark", text: "OPTIONS" }));
  const panel = el("div", { class: "panel" });
  panel.style.maxWidth = "420px";

  const sfx = el("input", { attrs: { type: "range", min: "0", max: "100" } });
  sfx.value = String(Math.round(getSfx() * 100));
  const music = el("input", { attrs: { type: "range", min: "0", max: "100" } });
  music.value = String(Math.round(getMusic() * 100));

  sfx.addEventListener("input", () => {
    setSfx(Number(sfx.value) / 100);
  });
  sfx.addEventListener("change", () => beep());
  music.addEventListener("input", () => {
    setMusic(Number(music.value) / 100);
  });

  const test = el("button", { class: "btn", text: "Test beep", attrs: { type: "button" } });
  test.addEventListener("click", () => beep());

  const back = el("button", { class: "btn btn-ghost", text: "Back", attrs: { type: "button" } });
  back.addEventListener("click", () => ctx.goto("menu"));

  panel.append(
    el("h2", { text: "Audio" }),
    el("label", { text: "Effects" }),
    sfx,
    el("label", { text: "Music (stub)" }),
    music,
    el("p", { class: "tiny", text: "Saved locally. No accounts in M1." }),
    test,
  );
  screen.append(panel);
  const row = el("div", { class: "btn-row" });
  row.style.marginTop = "16px";
  row.append(back);
  screen.append(row);
  root.append(screen);
}
