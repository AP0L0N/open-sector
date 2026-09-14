import { DEFAULT_MAP_ID, listMaps } from "@gridlock/shared";
import type { Ctx, NetworkStep } from "../ctx.js";
import { el } from "./dom.js";

function backRow(ctx: Ctx, to: NetworkStep | "menu"): HTMLDivElement {
  const back = el("button", { class: "btn btn-ghost", text: "Back", attrs: { type: "button" } });
  back.addEventListener("click", () => {
    ctx.banner = "";
    if (to === "menu") {
      ctx.goto("menu");
      return;
    }
    ctx.networkStep = to;
    ctx.render();
  });
  const row = el("div", { class: "btn-row" });
  row.style.marginTop = "16px";
  row.append(back);
  return row;
}

function frame(root: HTMLElement, ctx: Ctx, tagline: string, body: HTMLElement, backTo: NetworkStep | "menu"): void {
  const screen = el("div", { class: "screen" });
  screen.append(el("h1", { class: "wordmark", text: "NETWORK" }), el("p", { class: "tagline", text: tagline }));
  if (ctx.banner) screen.append(el("div", { class: "banner", text: ctx.banner }));
  screen.append(body, backRow(ctx, backTo));
  root.append(screen);
}

function renderChoose(root: HTMLElement, ctx: Ctx): void {
  const stack = el("div", { class: "stack" });
  const create = el("button", { class: "btn btn-primary", text: "Create game", attrs: { type: "button" } });
  const join = el("button", { class: "btn", text: "Join game", attrs: { type: "button" } });
  const back = el("button", { class: "btn btn-ghost", text: "Back", attrs: { type: "button" } });
  create.addEventListener("click", () => {
    ctx.banner = "";
    ctx.networkStep = "create";
    ctx.render();
  });
  join.addEventListener("click", () => {
    ctx.banner = "";
    ctx.networkStep = "join";
    ctx.render();
  });
  back.addEventListener("click", () => {
    ctx.banner = "";
    ctx.goto("menu");
  });
  stack.append(create, join, back);
  const screen = el("div", { class: "screen" });
  screen.append(
    el("h1", { class: "wordmark", text: "NETWORK" }),
    el("p", { class: "tagline", text: "Create a game or join by code" }),
  );
  if (ctx.banner) screen.append(el("div", { class: "banner", text: ctx.banner }));
  screen.append(stack);
  root.append(screen);
}

function renderCreate(root: HTMLElement, ctx: Ctx): void {
  const maps = listMaps();
  const panel = el("div", { class: "panel" });
  panel.style.maxWidth = "420px";

  const mapSel = el("select");
  for (const m of maps) {
    const opt = el("option", { text: `${m.name} (${m.width}×${m.height})`, attrs: { value: m.id } });
    if (m.id === DEFAULT_MAP_ID) opt.selected = true;
    mapSel.append(opt);
  }

  const maxSel = el("select");
  for (let n = 2; n <= 8; n++) {
    const opt = el("option", { text: String(n), attrs: { value: String(n) } });
    if (n === 8) opt.selected = true;
    maxSel.append(opt);
  }

  const createBtn = el("button", {
    class: "btn btn-primary",
    text: "Create game",
    attrs: { type: "button" },
  });
  createBtn.addEventListener("click", () => {
    ctx.net.send({ type: "hello", name: ctx.name });
    ctx.net.send({
      type: "room.create",
      mapId: mapSel.value,
      maxSlots: Number(maxSel.value),
      mode: "network",
    });
  });

  panel.append(
    el("label", { text: "Map" }),
    mapSel,
    el("label", { text: "Max commanders" }),
    maxSel,
    el("div", { class: "tiny", text: " " }),
    createBtn,
  );
  frame(root, ctx, "Host a briefing", panel, "choose");
}

function renderJoin(root: HTMLElement, ctx: Ctx): void {
  const panel = el("div", { class: "panel" });
  panel.style.maxWidth = "420px";

  const code = el("input", {
    attrs: { type: "text", maxlength: "8", placeholder: "K7M2", autocomplete: "off", spellcheck: "false" },
  });
  code.value = ctx.pendingJoin ?? "";
  const joinBtn = el("button", { class: "btn btn-primary", text: "Join game", attrs: { type: "button" } });
  joinBtn.disabled = code.value.trim().length === 0;

  const doJoin = (): void => {
    const trimmed = code.value.trim();
    if (!trimmed) {
      ctx.banner = "Enter a room code.";
      ctx.render();
      return;
    }
    ctx.net.send({ type: "hello", name: ctx.name });
    ctx.net.send({ type: "room.join", code: trimmed });
  };
  joinBtn.addEventListener("click", doJoin);
  code.addEventListener("input", () => {
    joinBtn.disabled = code.value.trim().length === 0;
  });
  code.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doJoin();
  });

  panel.append(el("label", { text: "Room code" }), code, el("div", { class: "tiny", text: " " }), joinBtn);
  frame(root, ctx, "Join by code", panel, "choose");
  requestAnimationFrame(() => code.focus());
}

export function renderPlay(root: HTMLElement, ctx: Ctx): void {
  if (ctx.networkStep === "create") {
    renderCreate(root, ctx);
    return;
  }
  if (ctx.networkStep === "join") {
    renderJoin(root, ctx);
    return;
  }
  renderChoose(root, ctx);
}
