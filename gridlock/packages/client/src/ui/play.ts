import { DEFAULT_MAP_ID, listMaps } from "@gridlock/shared";
import type { Ctx } from "../ctx.js";
import { el } from "./dom.js";

export function renderPlay(root: HTMLElement, ctx: Ctx): void {
  const maps = listMaps();
  const screen = el("div", { class: "screen" });
  screen.append(
    el("h1", { class: "wordmark", text: "NETWORK" }),
    el("p", { class: "tagline", text: "Create or join by code" }),
  );
  if (ctx.banner) screen.append(el("div", { class: "banner", text: ctx.banner }));

  const panel = el("div", { class: "panel" });
  panel.style.maxWidth = "420px";

  const mapLabel = el("label", { text: "Map" });
  const mapSel = el("select");
  for (const m of maps) {
    const opt = el("option", { text: `${m.name} (${m.width}×${m.height})`, attrs: { value: m.id } });
    if (m.id === DEFAULT_MAP_ID) opt.selected = true;
    mapSel.append(opt);
  }

  const maxLabel = el("label", { text: "Max commanders" });
  const maxSel = el("select");
  for (let n = 2; n <= 8; n++) {
    const opt = el("option", { text: String(n), attrs: { value: String(n) } });
    if (n === 8) opt.selected = true;
    maxSel.append(opt);
  }

  const createBtn = el("button", {
    class: "btn btn-primary",
    text: "Create room",
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

  const joinLabel = el("label", { text: "Room code" });
  const code = el("input", {
    attrs: { type: "text", maxlength: "8", placeholder: "K7M2" },
  });
  code.value = ctx.pendingJoin ?? "";
  const joinBtn = el("button", { class: "btn", text: "Join", attrs: { type: "button" } });
  const doJoin = () => {
    ctx.net.send({ type: "hello", name: ctx.name });
    ctx.net.send({ type: "room.join", code: code.value.trim() });
  };
  joinBtn.addEventListener("click", doJoin);
  code.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doJoin();
  });

  const back = el("button", { class: "btn btn-ghost", text: "Back", attrs: { type: "button" } });
  back.addEventListener("click", () => ctx.goto("menu"));

  panel.append(
    mapLabel,
    mapSel,
    maxLabel,
    maxSel,
    el("div", { class: "tiny", text: " " }),
    createBtn,
    joinLabel,
    code,
    joinBtn,
  );
  screen.append(panel, el("div", { class: "tiny", text: " " }));
  const row = el("div", { class: "btn-row" });
  row.style.marginTop = "16px";
  row.append(back);
  screen.append(row);
  root.append(screen);
}
