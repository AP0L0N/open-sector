import type { Ctx } from "../ctx.js";
import { el } from "./dom.js";

export function renderCallsign(root: HTMLElement, ctx: Ctx): void {
  const screen = el("div", { class: "screen" });
  screen.append(
    el("h1", { class: "wordmark", text: "GRIDLOCK" }),
    el("p", { class: "tagline", text: "Identify yourself" }),
  );
  if (ctx.banner) screen.append(el("div", { class: "banner", text: ctx.banner }));

  const panel = el("div", { class: "panel" });
  panel.style.maxWidth = "420px";

  const name = el("input", {
    attrs: {
      type: "text",
      maxlength: "24",
      placeholder: "Commander",
      autocomplete: "nickname",
    },
  });
  name.value = ctx.name;

  const go = el("button", {
    class: "btn btn-primary",
    text: "Continue",
    attrs: { type: "button" },
  });
  go.disabled = name.value.trim().length === 0;

  const submit = (): void => {
    ctx.setName(name.value);
    if (!ctx.name) {
      ctx.banner = "Enter a callsign.";
      ctx.render();
      return;
    }
    ctx.banner = "";
    ctx.net.send({ type: "hello", name: ctx.name });
    if (ctx.pendingJoin) {
      ctx.playMode = "network";
      ctx.networkStep = "join";
      ctx.net.send({ type: "room.join", code: ctx.pendingJoin });
      ctx.goto("play");
      return;
    }
    ctx.goto("menu");
  };

  go.addEventListener("click", submit);
  name.addEventListener("input", () => {
    go.disabled = name.value.trim().length === 0;
  });
  name.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });

  panel.append(el("label", { text: "Callsign" }), name, el("div", { class: "tiny", text: " " }), go);
  screen.append(panel);
  root.append(screen);
  requestAnimationFrame(() => name.focus());
}
