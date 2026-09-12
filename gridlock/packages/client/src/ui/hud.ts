import {
  BUILDING_TYPES,
  armorLabel,
  catalog,
  colorHex,
  getMap,
  productionSpeed,
  specialLabel,
  specialReady,
  type BuildingType,
  type MatchSnapshot,
  type TrainType,
} from "@gridlock/shared";
import type { Ctx } from "../ctx.js";
import { MapView, SPECIAL_HOTKEY } from "../render/mapview.js";
import { buzzDeny } from "./audio.js";
import { el } from "./dom.js";

let viewRef: MapView | null = null;

export function mountBattlefield(
  root: HTMLElement,
  ctx: Ctx,
  existing: MapView | null,
): MapView | null {
  if (!ctx.match) return existing;
  const wrap = el("div", { class: "battlefield", attrs: { id: "battlefield" } });
  const top = el("div", { class: "topbar", attrs: { id: "topbar" } });
  top.append(
    el("span", { attrs: { id: "hud-scrap" }, html: "SCRAP <b>0</b>" }),
    el("span", { class: "scrap-toast", attrs: { id: "scrap-toast" }, text: "INSUFFICIENT SCRAP" }),
    el("span", { attrs: { id: "hud-power" }, html: "POWER <b>0 / 0</b>" }),
    el("span", { attrs: { id: "hud-speed" }, html: "SPEED <b>×1</b>" }),
    el("span", { class: "tiny", attrs: { id: "hud-map" }, text: getMap(ctx.match.mapId)?.name ?? ctx.match.mapId }),
  );

  const body = el("div", { class: "battle-canvas-wrap" });
  const canvas = el("canvas", { attrs: { id: "map-canvas" } });
  body.append(canvas);

  const side = el("aside", { class: "sidebar" });
  side.append(el("h3", { text: "Radar" }));
  const mini = el("canvas", { attrs: { id: "minimap" } });
  side.append(mini);

  const structs = el("div", { class: "cameos", attrs: { id: "cameos-struct" } });
  for (const type of BUILDING_TYPES) {
    structs.append(cameoButton("build-" + type, catalog(type).name, catalog(type).cost, catalog(type).power, true));
  }
  side.append(el("h3", { text: "Structures" }), structs);

  const trains = el("div", { class: "cameos", attrs: { id: "cameos-train" } });
  for (const unit of ["trooper", "hauler", "warden"] as TrainType[]) {
    trains.append(cameoButton("train-" + unit, catalog(unit).name, catalog(unit).cost, 0));
  }
  side.append(el("h3", { text: "Train" }), trains);

  const inspect = el("div", { class: "inspect-box", attrs: { id: "inspect" } });
  inspect.textContent = "No selection.";
  side.append(el("h3", { text: "Inspect" }), inspect);

  const banner = el("div", { class: "victory-banner hidden", attrs: { id: "victory-banner" } });
  wrap.append(top, body, side, banner);
  root.append(wrap);

  existing?.destroy();
  const view = new MapView(canvas, mini, ctx.match);
  viewRef = view;
  view.onCommand = (msg) => ctx.net.send(msg);
  view.onPlaceMode = () => paintBattleHud(ctx);
  view.onSelect = (ids) => {
    ctx.inspect = ids[0] ?? null;
    paintInspect(ctx, view);
  };

  for (const type of BUILDING_TYPES) {
    document.getElementById("build-" + type)?.addEventListener("click", () => {
      const m = ctx.match;
      const btn = document.getElementById("build-" + type);
      if (structureReady(m, type)) {
        view.placeMode = true;
        paintBattleHud(ctx);
        return;
      }
      if (m && m.you.scrap < catalog(type).cost) {
        flashNoScrap(btn);
        return;
      }
      ctx.net.send({ type: "cmd.build", building: type });
    });
  }
  for (const unit of ["trooper", "hauler", "warden"] as TrainType[]) {
    document.getElementById("train-" + unit)?.addEventListener("click", () => {
      const m = ctx.match;
      const btn = document.getElementById("train-" + unit);
      if (m && m.you.scrap < catalog(unit).cost) {
        flashNoScrap(btn);
        return;
      }
      ctx.net.send({ type: "cmd.train", unit });
    });
  }

  paintBattleHud(ctx);
  return view;
}

function structureReady(m: MatchSnapshot | null | undefined, type: BuildingType): boolean {
  if (!m) return false;
  if (m.you.placingType === type) return true;
  return m.you.structureQueue?.ready === true && m.you.structureQueue.type === type;
}

function cameoButton(id: string, name: string, cost: number, power: number, showReady = false): HTMLButtonElement {
  const b = el("button", { class: "cameo", attrs: { type: "button", id } });
  const powerTxt = power > 0 ? `+${power}` : power < 0 ? `${power}` : "";
  const ready = showReady ? `<span class="cameo-ready">READY</span>` : "";
  b.innerHTML = `<span class="cameo-name">${name}</span><span class="cameo-meta">${cost}${powerTxt ? " · " + powerTxt : ""}</span><span class="pip"></span><span class="cameo-deny">NO SCRAP</span>${ready}`;
  return b;
}

function retrigger(el: HTMLElement | null, cls: string): void {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export function flashNoScrap(cameo?: HTMLElement | null): void {
  const scrapEl = document.getElementById("hud-scrap");
  const toast = document.getElementById("scrap-toast");
  retrigger(scrapEl, "scrap-denied");
  retrigger(toast, "show");
  if (cameo) retrigger(cameo, "scrap-denied");
  buzzDeny();
  window.setTimeout(() => {
    scrapEl?.classList.remove("scrap-denied");
    toast?.classList.remove("show");
    cameo?.classList.remove("scrap-denied");
  }, 900);
}

export function paintBattleHud(ctx: Ctx): void {
  const m = ctx.match;
  if (!m) return;
  const scrap = document.getElementById("hud-scrap");
  if (scrap) {
    const next = `SCRAP <b>${m.you.scrap}</b>`;
    if (scrap.innerHTML !== next) scrap.innerHTML = next;
  }
  const power = document.getElementById("hud-power");
  if (power) {
    const spd = productionSpeed(m.you.provided, m.you.used);
    const slow = m.you.lowPower ? ` · SLOW ×${spd.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}` : "";
    const next = `POWER <b>${m.you.used} / ${m.you.provided}</b>${slow}`;
    if (power.innerHTML !== next) power.innerHTML = next;
    power.classList.toggle("low-power", m.you.lowPower);
  }
  const speed = document.getElementById("hud-speed");
  if (speed) {
    const next = `SPEED <b>×${m.gameSpeed || 1}</b>`;
    if (speed.innerHTML !== next) {
      speed.innerHTML = next;
      retrigger(speed, "speed-flash");
    }
  }
  const top = document.getElementById("topbar");
  top?.classList.toggle("low-power", m.you.lowPower);

  const coreUp = m.entities.some((e) => e.ownerId === m.youPlayerId && e.type === "core");
  const q = m.you.structureQueue;
  for (const type of BUILDING_TYPES) {
    const btn = document.getElementById("build-" + type) as HTMLButtonElement | null;
    if (!btn) continue;
    btn.disabled = !coreUp || (!!q && !q.ready) || (!!q && q.ready && q.type !== type);
    const pip = btn.querySelector(".pip") as HTMLElement | null;
    if (pip && q?.type === type) {
      pip.style.width = `${Math.round((q.progressTicks / q.totalTicks) * 100)}%`;
    } else if (pip) pip.style.width = "0";
    const ready = q?.ready === true && q.type === type;
    btn.classList.toggle("is-ready", ready);
    btn.classList.toggle("is-placing", ready && !!viewRef?.placeMode);
    btn.classList.toggle("unaffordable", !ready && m.you.scrap < catalog(type).cost);
    btn.classList.toggle("slow-power", m.you.lowPower && q?.type === type && !q.ready);
  }

  const hasMuster = m.entities.some((e) => e.ownerId === m.youPlayerId && e.type === "muster");
  const hasSmelter = m.entities.some((e) => e.ownerId === m.youPlayerId && e.type === "smelter");
  const hasArmory = m.entities.some((e) => e.ownerId === m.youPlayerId && e.type === "armory");
  const training = m.entities.some((e) => e.ownerId === m.youPlayerId && e.trainProgress != null);
  const tr = document.getElementById("train-trooper") as HTMLButtonElement | null;
  const ha = document.getElementById("train-hauler") as HTMLButtonElement | null;
  const wa = document.getElementById("train-warden") as HTMLButtonElement | null;
  if (tr) {
    tr.disabled = !hasMuster || !m.you.alive;
    tr.classList.toggle("unaffordable", m.you.scrap < catalog("trooper").cost);
    tr.classList.toggle("slow-power", m.you.lowPower && training && hasMuster);
  }
  if (ha) {
    ha.disabled = !hasSmelter || !m.you.alive;
    ha.classList.toggle("unaffordable", m.you.scrap < catalog("hauler").cost);
    ha.classList.toggle("slow-power", m.you.lowPower && training && hasSmelter);
  }
  if (wa) {
    wa.disabled = !hasArmory || !m.you.alive;
    wa.classList.toggle("unaffordable", m.you.scrap < catalog("warden").cost);
    wa.classList.toggle("slow-power", m.you.lowPower && training && hasArmory);
  }

  const banner = document.getElementById("victory-banner");
  if (banner) {
    const w = ctx.winner ?? m.winner;
    if (w) {
      banner.classList.remove("hidden");
      const youWin =
        w.playerId === m.youPlayerId ||
        (w.team !== 0 && m.players.find((p) => p.playerId === m.youPlayerId)?.team === w.team);
      banner.textContent = youWin ? "VICTORY" : "DEFEAT";
    } else {
      banner.classList.add("hidden");
    }
  }

  paintInspect(ctx, viewRef);
}

function paintInspect(ctx: Ctx, view: MapView | null): void {
  const box = document.getElementById("inspect");
  if (!box || !ctx.match) return;
  const id = ctx.inspect ?? (view ? [...view.selected][0] : null);
  const e = ctx.match.entities.find((x) => x.id === id);
  if (!e) {
    box.textContent = ctx.match.you.alive
      ? ctx.match.entities.some((x) => x.ownerId === ctx.match!.youPlayerId && x.type === "core")
        ? "No selection."
        : `Select the Rig, then click it again or press ${SPECIAL_HOTKEY.toUpperCase()} to deploy.`
      : "Core down.";
    return;
  }
  const owner = ctx.match.players.find((p) => p.playerId === e.ownerId);
  const def = catalog(e.type);
  const q = e.trainProgress != null ? `  ·  train ${Math.round(e.trainProgress * 100)}%` : "";
  const cargo = e.cargo ? `  ·  cargo ${e.cargo}` : "";
  const dep =
    e.deployProgress != null
      ? `  ·  ${e.state === "undeploy" ? "packing" : "deploying"} ${Math.round(e.deployProgress * 100)}%`
      : "";
  const cd = e.specialCooldown ?? 0;
  const special =
    e.ownerId !== ctx.match.youPlayerId
      ? ""
      : cd > 0 && e.state !== "deploy" && e.state !== "undeploy"
        ? `  ·  ${specialLabel(e.type) ?? "Special"} ${cd.toFixed(1)}s`
        : specialReady(e.type, e.state, cd)
          ? `  ·  ${specialLabel(e.type) ?? "Special"} (${SPECIAL_HOTKEY.toUpperCase()} / click)`
          : "";
  const armor = armorLabel(e.type);
  const plates = armor ? `  ·  armor ${armor}` : "";
  box.textContent = `${def.name}  ·  ${e.hp}/${e.hpMax} HP${plates}  ·  ${owner?.name ?? "—"}${q}${cargo}${dep}${special}`;
  box.style.borderColor = colorHex(owner?.colorId ?? 0);
}

export function renderLeaveModal(root: HTMLElement, ctx: Ctx): void {
  const back = el("div", { class: "modal-back" });
  const modal = el("div", { class: "panel modal" });
  modal.append(el("h2", { text: "Leave match?" }));
  modal.append(el("p", { class: "tiny", text: "Host leave ends the match for everyone." }));
  const row = el("div", { class: "btn-row" });
  const stay = el("button", { class: "btn", text: "Stay", attrs: { type: "button" } });
  const go = el("button", { class: "btn btn-primary", text: "Leave", attrs: { type: "button" } });
  stay.addEventListener("click", () => {
    ctx.leaveOpen = false;
    ctx.render();
  });
  go.addEventListener("click", () => {
    ctx.leaveOpen = false;
    ctx.net.send({ type: "room.leave" });
    ctx.room = null;
    ctx.match = null;
    ctx.winner = null;
    ctx.goto("menu");
  });
  row.append(stay, go);
  modal.append(row);
  back.append(modal);
  root.append(back);
}
