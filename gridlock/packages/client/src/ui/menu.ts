import type { Ctx } from "../ctx.js";
import { el } from "./dom.js";

export function renderMenu(root: HTMLElement, ctx: Ctx): void {
  const screen = el("div", { class: "screen" });
  screen.append(
    el("h1", { class: "wordmark", text: "GRIDLOCK" }),
    el("p", { class: "tagline", text: "Command briefing  ·  original prototype" }),
  );
  if (ctx.banner) screen.append(el("div", { class: "banner", text: ctx.banner }));

  const stack = el("div", { class: "stack" });
  const campaign = el("button", {
    class: "btn is-disabled",
    text: "Campaign",
    attrs: { type: "button", disabled: "true", title: "Later." },
  });
  const skirmish = el("button", { class: "btn btn-primary", text: "Skirmish", attrs: { type: "button" } });
  const network = el("button", { class: "btn", text: "Network", attrs: { type: "button" } });
  const options = el("button", { class: "btn", text: "Options", attrs: { type: "button" } });
  const credits = el("button", { class: "btn", text: "Credits", attrs: { type: "button" } });
  const exit = el("button", { class: "btn btn-ghost", text: "Exit", attrs: { type: "button" } });

  skirmish.addEventListener("click", () => {
    if (!ctx.net.connected) ctx.net.connect();
    ctx.playMode = "skirmish";
    ctx.goto("play");
  });
  network.addEventListener("click", () => {
    if (!ctx.net.connected) ctx.net.connect();
    ctx.playMode = "network";
    ctx.goto("play");
  });
  options.addEventListener("click", () => ctx.goto("options"));
  credits.addEventListener("click", () => ctx.goto("credits"));
  exit.addEventListener("click", () => {
    ctx.net.close();
    ctx.banner = "Disconnected.";
    ctx.render();
  });

  stack.append(campaign, skirmish, network, options, credits, exit);
  screen.append(stack);
  screen.append(el("div", { class: "version", text: "M1 · prototype" }));
  const pip = el("div", {
    class: `status-pip ${ctx.connected ? "on" : "off"}`,
    text: ctx.connected ? "LINK UP" : "LINK DOWN",
  });
  screen.append(pip);
  root.append(screen);
}
