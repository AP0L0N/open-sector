import { getMap, matchClock, type SaveGame } from "@gridlock/shared";
import type { Ctx, PausePane } from "../ctx.js";
import { el } from "./dom.js";
import {
  cleanSaveName,
  dropSaveSlot,
  newSaveId,
  putSaveSlot,
  readSaveSlots,
  suggestSaveName,
  writeSaveSlots,
  type SaveSlot,
} from "./saves.js";

/** Rebuild the battle modal only when this changes, so a snapshot does not wipe the name field. */
export function battleModalKey(ctx: Ctx): string {
  if (!ctx.leaveOpen) return "";
  if (ctx.playMode !== "skirmish") return `leave:${ctx.banner}`;
  return [
    "skirmish",
    ctx.pausePane,
    ctx.banner,
    ctx.saveWaiting ? "1" : "0",
    ctx.saveOverwriteId ?? "",
    ctx.saveDeleteId ?? "",
  ].join(":");
}

export function renderPauseModal(root: HTMLElement, ctx: Ctx): void {
  const back = el("div", { class: "modal-back" });
  const modal = el("div", { class: "panel modal sheet" });
  if (ctx.banner) modal.append(el("div", { class: "banner", text: ctx.banner }));
  if (ctx.pausePane === "save") renderSavePane(modal, ctx);
  else if (ctx.pausePane === "load") renderSlotList(modal, ctx, "pause");
  else renderPauseMenu(modal, ctx);
  back.append(modal);
  root.append(back);
}

export function renderMenuLoad(root: HTMLElement, ctx: Ctx): void {
  const screen = el("div", { class: "screen" });
  screen.append(
    el("h1", { class: "wordmark", text: "LOAD" }),
    el("p", { class: "tagline", text: "Saved skirmishes on this browser" }),
  );
  if (ctx.banner) screen.append(el("div", { class: "banner", text: ctx.banner }));
  const panel = el("div", { class: "panel sheet" });
  renderSlotList(panel, ctx, "menu");
  screen.append(panel);
  root.append(screen);
}

/** Ask the hub for the fight, then keep the blob it sends back. */
export function requestSave(ctx: Ctx, name: string): void {
  ctx.saveDraft = name;
  ctx.saveWaiting = true;
  ctx.banner = "";
  ctx.net.send({ type: "match.save" });
  ctx.render();
}

export function storeSavedGame(ctx: Ctx, save: SaveGame): void {
  ctx.saveWaiting = false;
  const fallback = suggestSaveName(save.mapId, save.tick);
  const name = cleanSaveName(ctx.saveDraft, fallback);
  const id = ctx.saveOverwriteId ?? newSaveId();
  const slot: SaveSlot = { id, name, savedAt: save.savedAt, mapId: save.mapId, tick: save.tick, save };
  const put = putSaveSlot(readSaveSlots(localStorage), slot);
  if (!put.ok) {
    ctx.banner = put.message;
    ctx.render();
    return;
  }
  const wrote = writeSaveSlots(put.slots, localStorage);
  ctx.banner = wrote.ok ? "Saved." : wrote.message;
  if (wrote.ok) {
    ctx.pausePane = "menu";
    ctx.saveOverwriteId = null;
    ctx.saveDraft = "";
  }
  ctx.render();
}

export function beginLoad(ctx: Ctx, save: SaveGame): void {
  ctx.banner = "";
  ctx.saveWaiting = false;
  if (!ctx.net.connected) {
    ctx.pendingLoad = save;
    ctx.banner = "Linking…";
    ctx.net.connect();
    ctx.render();
    return;
  }
  ctx.pendingLoad = null;
  ctx.net.send({ type: "match.load", save });
}

function renderPauseMenu(modal: HTMLElement, ctx: Ctx): void {
  modal.append(el("h2", { text: "Paused" }));
  modal.append(el("p", { class: "tiny", text: "The fight holds until you resume." }));
  const stack = el("div", { class: "stack" });
  stack.append(
    action("Resume", "btn btn-primary", () => ctx.resumeSkirmish()),
    action("Save game", "btn", () => openPane(ctx, "save")),
    action("Load game", "btn", () => openPane(ctx, "load")),
    action("Leave", "btn btn-ghost", () => leaveMatch(ctx)),
  );
  modal.append(stack);
}

function renderSavePane(modal: HTMLElement, ctx: Ctx): void {
  modal.append(el("h2", { text: "Save game" }));
  const fallback = ctx.match ? suggestSaveName(ctx.match.mapId, ctx.match.tick) : "Skirmish";
  const name = el("input", {
    attrs: { type: "text", maxlength: "32", autocomplete: "off", spellcheck: "false" },
  });
  name.value = ctx.saveDraft || fallback;
  name.addEventListener("input", () => {
    ctx.saveDraft = name.value;
  });
  const save = action(ctx.saveWaiting ? "Saving…" : "Save", "btn btn-primary", () => {
    if (ctx.saveWaiting) return;
    requestSave(ctx, name.value);
  });
  save.disabled = ctx.saveWaiting;
  name.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save.click();
    }
  });
  modal.append(el("label", { text: "Name" }), name);
  if (ctx.saveOverwriteId) modal.append(el("p", { class: "tiny", text: "Saving replaces the selected game." }));
  const slots = readSaveSlots(localStorage);
  if (slots.length) {
    modal.append(el("p", { class: "tiny", text: "Select a game to overwrite it." }));
    modal.append(slotColumn(ctx, slots, "save"));
  }
  const row = el("div", { class: "btn-row" });
  row.append(action("Back", "btn btn-ghost", () => openPane(ctx, "menu")), save);
  modal.append(row);
  requestAnimationFrame(() => name.focus());
}

function renderSlotList(host: HTMLElement, ctx: Ctx, where: "menu" | "pause"): void {
  if (where === "pause") host.append(el("h2", { text: "Load game" }));
  const slots = readSaveSlots(localStorage);
  if (slots.length === 0) {
    host.append(el("p", { class: "tiny", text: "No saved games." }));
  } else {
    if (where === "pause") host.append(el("p", { class: "tiny", text: "Loading replaces the fight underway." }));
    host.append(slotColumn(ctx, slots, "load"));
  }
  const back = action("Back", "btn btn-ghost", () => {
    ctx.banner = "";
    ctx.saveDeleteId = null;
    if (where === "menu") {
      ctx.menuLoad = false;
      ctx.render();
      return;
    }
    openPane(ctx, "menu");
  });
  const row = el("div", { class: "btn-row" });
  row.style.marginTop = "12px";
  row.append(back);
  host.append(row);
}

function slotColumn(ctx: Ctx, slots: SaveSlot[], mode: "save" | "load"): HTMLElement {
  const list = el("div", { class: "save-list" });
  for (const slot of slots) {
    const row = el("div", { class: "save-row" });
    const pick = el("button", { class: `btn${ctx.saveOverwriteId === slot.id && mode === "save" ? " btn-primary" : ""}`, attrs: { type: "button" } });
    const map = getMap(slot.mapId)?.name ?? slot.mapId;
    pick.append(
      el("span", { text: slot.name }),
      el("small", { text: `${map} · ${matchClock(slot.tick).text} · ${stamp(slot.savedAt)}` }),
    );
    pick.addEventListener("click", () => {
      if (mode === "save") {
        ctx.saveOverwriteId = slot.id;
        ctx.saveDraft = slot.name;
        ctx.saveDeleteId = null;
        ctx.render();
        return;
      }
      beginLoad(ctx, slot.save);
    });
    const del = el("button", {
      class: "btn btn-ghost",
      text: ctx.saveDeleteId === slot.id ? "Confirm" : "Delete",
      attrs: { type: "button" },
    });
    del.addEventListener("click", () => {
      if (ctx.saveDeleteId !== slot.id) {
        ctx.saveDeleteId = slot.id;
        ctx.render();
        return;
      }
      const left = dropSaveSlot(readSaveSlots(localStorage), slot.id);
      writeSaveSlots(left, localStorage);
      if (ctx.saveOverwriteId === slot.id) ctx.saveOverwriteId = null;
      ctx.saveDeleteId = null;
      ctx.render();
    });
    row.append(pick, del);
    list.append(row);
  }
  return list;
}

function openPane(ctx: Ctx, pane: PausePane): void {
  ctx.pausePane = pane;
  ctx.banner = "";
  ctx.saveDeleteId = null;
  if (pane === "save" && ctx.match && !ctx.saveDraft) ctx.saveDraft = suggestSaveName(ctx.match.mapId, ctx.match.tick);
  if (pane !== "save") ctx.saveOverwriteId = null;
  ctx.render();
}

function leaveMatch(ctx: Ctx): void {
  ctx.leaveOpen = false;
  ctx.pausePane = "menu";
  ctx.net.send({ type: "room.leave" });
  ctx.room = null;
  ctx.match = null;
  ctx.winner = null;
  ctx.goto("menu");
}

function action(text: string, className: string, run: () => void): HTMLButtonElement {
  const btn = el("button", { class: className, text, attrs: { type: "button" } });
  btn.addEventListener("click", run);
  return btn;
}

function stamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
