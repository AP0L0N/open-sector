import type { Ctx } from "../ctx.js";
import { el } from "./dom.js";

export function renderCredits(root: HTMLElement, ctx: Ctx): void {
  const screen = el("div", { class: "screen" });
  screen.append(el("h1", { class: "wordmark", text: "CREDITS" }));
  const box = el("div", { class: "panel credits" });
  box.append(
    el("p", { text: "Original game. Not affiliated with EA." }),
    el("p", {
      text: "Gridlock is a prototype briefing-room RTS. Mood is industrial chrome; names, maps, and chrome are original.",
    }),
    el("p", { text: "Milestone 1: lobby, deployment, commander tokens. No combat." }),
  );
  const back = el("button", { class: "btn btn-ghost", text: "Back", attrs: { type: "button" } });
  back.addEventListener("click", () => ctx.goto("menu"));
  screen.append(box);
  const row = el("div", { class: "btn-row" });
  row.style.marginTop = "16px";
  row.append(back);
  screen.append(row);
  root.append(screen);
}
