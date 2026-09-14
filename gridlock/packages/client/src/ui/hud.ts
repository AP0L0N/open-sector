import {
  BUILDING_TYPES,
  CRIT_LABEL,
  SHELLS,
  SHELL_TYPES,
  STANCE_LABEL,
  TRAIN_QUEUE_CAP,
  TRAIN_TYPES,
  ammoOf,
  armorLabel,
  catalog,
  colorHex,
  getMap,
  hasAmmo,
  hasMg,
  isGarrisonable,
  isInfantryType,
  isShellType,
  isStance,
  producerType,
  productionSpeed,
  specialLabel,
  specialOf,
  specialReady,
  type BuildingType,
  type EntityType,
  type EntityView,
  type MatchSnapshot,
  type Stance,
  type TrainType,
} from "@gridlock/shared";
import type { Ctx } from "../ctx.js";
import { MapView, SPECIAL_HOTKEY } from "../render/mapview.js";
import { buzzDeny } from "./audio.js";
import { el } from "./dom.js";

let viewRef: MapView | null = null;
let configFocus: EntityType | null = null;

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
  const queue = el("div", { class: "prod-queue", attrs: { id: "prod-queue" } });
  const actions = el("div", { class: "quick-actions", attrs: { id: "quick-actions" } });
  body.append(canvas, queue, actions);

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
  for (const unit of TRAIN_TYPES) {
    trains.append(cameoButton("train-" + unit, catalog(unit).name, catalog(unit).cost, 0, false, true));
  }
  side.append(el("h3", { text: "Train" }), trains);

  const config = el("div", { class: "config-panel", attrs: { id: "config" } });
  config.append(
    el("div", { class: "config-types", attrs: { id: "config-types" } }),
    el("div", { class: "config-body", attrs: { id: "config-body" } }),
  );
  const inspect = el("div", { class: "inspect-box", attrs: { id: "inspect" } });
  inspect.textContent = "No selection.";
  side.append(el("h3", { text: "Config" }), config, el("h3", { text: "Inspect" }), inspect);

  const banner = el("div", { class: "victory-banner hidden", attrs: { id: "victory-banner" } });
  wrap.append(top, body, side, banner);
  root.append(wrap);

  existing?.destroy();
  const view = new MapView(canvas, mini, ctx.match);
  viewRef = view;
  view.onCommand = (msg) => ctx.net.send(msg);
  view.onPlaceMode = () => paintBattleHud(ctx);
  view.onAttackMoveMode = () => paintQuickActions(ctx, view);
  view.onSelect = (ids) => {
    ctx.inspect = ids[0] ?? null;
    paintInspect(ctx, view);
    paintConfig(ctx, view);
    paintQuickActions(ctx, view);
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
  for (const unit of TRAIN_TYPES) {
    const btn = document.getElementById("train-" + unit);
    btn?.addEventListener("click", (e) => {
      const m = ctx.match;
      if ((e.target as HTMLElement | null)?.closest(".cameo-hold, .cameo-paused")) {
        if (jobsOfType(m, unit).length === 0) return;
        ctx.net.send({ type: "cmd.pause", what: "train", unit });
        return;
      }
      const queued = jobsOfType(m, unit);
      if (queued.length > 0 && queued.every((j) => j.paused)) {
        ctx.net.send({ type: "cmd.pause", what: "train", unit });
        return;
      }
      if (m && m.you.scrap < catalog(unit).cost) {
        flashNoScrap(btn);
        return;
      }
      if (m && !canQueueMore(m, unit)) return;
      ctx.net.send({ type: "cmd.train", unit });
    });
    btn?.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (jobsOfType(ctx.match, unit).length === 0) return;
      ctx.net.send({ type: "cmd.cancel", what: "train", unit });
    });
  }

  config.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-config-type], [data-shell]");
    if (!t) return;
    e.preventDefault();
    if (t.dataset.configType) {
      configFocus = t.dataset.configType as EntityType;
      paintBattleHud(ctx);
      return;
    }
    const shell = t.dataset.shell;
    if (!shell || !isShellType(shell) || !viewRef || !ctx.match) return;
    const ids = selectedOfType(ctx, viewRef, configFocus)
      .filter((ent) => ent.ownerId === ctx.match!.youPlayerId && !ent.wreck && hasAmmo(ent.type))
      .map((ent) => ent.id);
    if (ids.length === 0) return;
    ctx.net.send({ type: "cmd.ammo", ids, shell });
  });

  actions.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-act]");
    if (!btn?.dataset.act || !viewRef || !ctx.match) return;
    e.preventDefault();
    runQuickAction(ctx, viewRef, btn.dataset.act);
  });

  queue.addEventListener("click", (e) => {
    const job = (e.target as HTMLElement | null)?.closest<HTMLElement>(".prod-job");
    if (!job) return;
    e.preventDefault();
    ctx.net.send({ type: "cmd.pause", what: "train", jobId: Number(job.dataset.job) });
  });
  queue.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const job = (e.target as HTMLElement | null)?.closest<HTMLElement>(".prod-job");
    if (!job) return;
    ctx.net.send({ type: "cmd.cancel", what: "train", jobId: Number(job.dataset.job) });
  });

  paintBattleHud(ctx);
  return view;
}

function structureReady(m: MatchSnapshot | null | undefined, type: BuildingType): boolean {
  if (!m) return false;
  if (m.you.placingType === type) return true;
  return m.you.structureQueue?.ready === true && m.you.structureQueue.type === type;
}

function cameoButton(
  id: string,
  name: string,
  cost: number,
  power: number,
  showReady = false,
  train = false,
): HTMLButtonElement {
  const b = el("button", { class: "cameo", attrs: { type: "button", id } });
  const powerTxt = power > 0 ? `+${power}` : power < 0 ? `${power}` : "";
  const ready = showReady ? `<span class="cameo-ready">READY</span>` : "";
  const hold = train
    ? `<span class="cameo-hold hidden" title="Pause production"></span><span class="cameo-paused">PAUSED</span><span class="cameo-count hidden">0</span>`
    : "";
  if (train) b.title = "Left: train  ·  Pause icon: hold  ·  Right: cancel";
  b.innerHTML = `<span class="cameo-name">${name}</span><span class="cameo-meta">${cost}${powerTxt ? " · " + powerTxt : ""}</span><span class="pip"></span><span class="cameo-deny">NO SCRAP</span>${ready}${hold}`;
  return b;
}

interface JobRef {
  id: number;
  type: TrainType;
  progress: number;
  paused: boolean;
  active: boolean;
}

function ownTrainJobs(m: MatchSnapshot | null | undefined): JobRef[] {
  if (!m) return [];
  const out: JobRef[] = [];
  for (const e of m.entities) {
    if (e.ownerId !== m.youPlayerId || !e.trainQueue?.length) continue;
    e.trainQueue.forEach((j, i) => {
      out.push({
        id: j.id,
        type: j.type,
        progress: j.progress,
        paused: j.paused,
        active: i === 0,
      });
    });
  }
  return out;
}

function jobsOfType(m: MatchSnapshot | null | undefined, unit: TrainType): JobRef[] {
  return ownTrainJobs(m).filter((j) => j.type === unit);
}

function canQueueMore(m: MatchSnapshot, unit: TrainType): boolean {
  const want = producerType(unit);
  const producers = m.entities.filter((e) => e.ownerId === m.youPlayerId && e.type === want && e.hp > 0);
  if (producers.length === 0) return false;
  return producers.some((e) => (e.trainQueue?.length ?? 0) < TRAIN_QUEUE_CAP);
}

function paintProdQueue(jobs: JobRef[]): void {
  const root = document.getElementById("prod-queue");
  if (!root) return;
  const ids = jobs.map((j) => String(j.id)).join(",");
  const existing = [...root.children].map((c) => (c as HTMLElement).dataset.job ?? "").join(",");
  if (ids !== existing) {
    root.replaceChildren(...jobs.map(makeProdJob));
  }
  const nodes = root.children;
  for (let i = 0; i < jobs.length; i++) {
    const node = nodes[i] as HTMLElement | undefined;
    const job = jobs[i];
    if (node && job) updateProdJob(node, job);
  }
}

function makeProdJob(job: JobRef): HTMLButtonElement {
  const b = el("button", {
    class: "prod-job",
    attrs: {
      type: "button",
      "data-job": String(job.id),
      "data-type": job.type,
      title: "Left: pause  ·  Right: cancel",
    },
  });
  b.append(el("span", { class: "clock" }), el("span", { class: "hold-mark" }));
  updateProdJob(b, job);
  return b;
}

function updateProdJob(node: HTMLElement, job: JobRef): void {
  node.classList.toggle("is-paused", job.paused);
  node.classList.toggle("is-active", job.active);
  node.classList.toggle("is-waiting", !job.active);
  const clock = node.querySelector(".clock") as HTMLElement | null;
  if (clock) clock.style.setProperty("--p", String(Math.round(job.progress * 100)));
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

  const jobs = ownTrainJobs(m);
  for (const unit of TRAIN_TYPES) {
    const btn = document.getElementById("train-" + unit) as HTMLButtonElement | null;
    if (!btn) continue;
    const want = producerType(unit);
    const hasProducer = m.entities.some((e) => e.ownerId === m.youPlayerId && e.type === want && e.hp > 0);
    const unitJobs = jobs.filter((j) => j.type === unit);
    const heads = unitJobs.filter((j) => j.active);
    const primary = heads.slice().sort((a, b) => b.progress - a.progress)[0];
    const paused = heads.length > 0 && heads.every((j) => j.paused);
    const training = heads.some((j) => !j.paused);
    btn.disabled = !hasProducer || !m.you.alive;
    btn.classList.toggle("unaffordable", m.you.scrap < catalog(unit).cost);
    btn.classList.toggle("slow-power", m.you.lowPower && training);
    btn.classList.toggle("is-training", unitJobs.length > 0);
    btn.classList.toggle("is-paused", paused);
    const pip = btn.querySelector(".pip") as HTMLElement | null;
    if (pip) pip.style.width = primary ? `${Math.round(primary.progress * 100)}%` : "0";
    const count = btn.querySelector(".cameo-count") as HTMLElement | null;
    if (count) {
      count.textContent = String(unitJobs.length);
      count.classList.toggle("hidden", unitJobs.length <= 1);
    }
    const hold = btn.querySelector(".cameo-hold") as HTMLElement | null;
    hold?.classList.toggle("hidden", unitJobs.length === 0 || paused);
  }
  paintProdQueue(jobs);

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
  paintConfig(ctx, viewRef);
  paintQuickActions(ctx, viewRef);
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
  const qn = e.trainQueue?.length ?? 0;
  const qPaused = e.trainQueue?.[0]?.paused === true;
  const q =
    e.trainProgress != null
      ? `  ·  train ${qPaused ? "paused " : ""}${Math.round(e.trainProgress * 100)}%${qn > 1 ? " ×" + qn : ""}`
      : "";
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
  const wreck = e.wreck ? "  ·  WRECK" : "";
  const injuries =
    e.crits && e.crits.length > 0 ? `  ·  ${e.crits.map((c) => CRIT_LABEL[c]).join(", ")}` : "";
  const posture = e.swimming
    ? "  ·  swimming"
    : isInfantryType(e.type) && e.stance
      ? `  ·  ${STANCE_LABEL[e.stance]}${e.stanceOrder && e.stanceOrder !== e.stance ? " (under fire)" : ""}`
      : "";
  const rack =
    e.ammo && e.shell && !e.wreck ? `  ·  ${e.shell.toUpperCase()} ${ammoOf(e.ammo, e.shell)}` : "";
  const mg =
    e.mgAmmo != null && !e.wreck
      ? `  ·  MG ${e.mgAmmo}${e.mgOverheat && e.mgOverheat > 0 ? " HOT" : ""}`
      : "";
  const garrison =
    e.garrison
      ? `  ·  garrison ${e.garrison.count}/${e.garrison.cap}${e.garrison.hide ? " hide" : e.garrison.count ? " watch" : ""}`
      : e.garrisonedIn
        ? "  ·  inside"
        : "";
  const capturing =
    e.capture && e.capture.progress > 0 ? `  ·  capturing ${Math.round(e.capture.progress * 100)}%` : "";
  const holding = e.guardFacing != null ? "  ·  GUARD" : e.holdPosition ? "  ·  HOLD" : "";
  const who = owner?.name ?? (isGarrisonable(e.type) ? "civilian" : "—");
  box.textContent = `${def.name}${wreck}  ·  ${e.hp}/${e.hpMax} HP${plates}${injuries}${posture}${rack}${mg}  ·  ${who}${q}${cargo}${dep}${special}${garrison}${capturing}${holding}`;
  const occ = e.garrison?.ownerId
    ? ctx.match.players.find((p) => p.playerId === e.garrison!.ownerId)
    : owner;
  box.style.borderColor = occ ? colorHex(occ.colorId) : "#b08968";
}

const TYPE_ORDER: EntityType[] = [
  "warden",
  "hauler",
  "trooper",
  "rig",
  "core",
  "dynamo",
  "smelter",
  "muster",
  "armory",
  "cottage",
  "house",
  "manor",
];

function selectedViews(ctx: Ctx, view: MapView | null): EntityView[] {
  if (!ctx.match || !view) return [];
  return ctx.match.entities.filter((e) => view.selected.has(e.id));
}

function selectedOfType(ctx: Ctx, view: MapView | null, type: EntityType | null): EntityView[] {
  if (!type) return [];
  return selectedViews(ctx, view).filter((e) => e.type === type);
}

function occupiedHouses(ctx: Ctx, selected: EntityView[]): EntityView[] {
  const match = ctx.match;
  if (!match) return [];
  const you = match.youPlayerId;
  const out: EntityView[] = [];
  const seen = new Set<number>();
  for (const e of selected) {
    if (isGarrisonable(e.type) && e.garrison?.ownerId === you && (e.garrison.count ?? 0) > 0) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        out.push(e);
      }
    }
    if (e.garrisonedIn) {
      const house = match.entities.find((x) => x.id === e.garrisonedIn);
      if (house && house.garrison?.ownerId === you && !seen.has(house.id)) {
        seen.add(house.id);
        out.push(house);
      }
    }
  }
  return out;
}

function ownCommandable(ctx: Ctx, list: EntityView[]): EntityView[] {
  const you = ctx.match?.youPlayerId;
  return list.filter((e) => e.ownerId === you && !e.wreck && e.hp > 0);
}

function paintConfig(ctx: Ctx, view: MapView | null): void {
  const typesEl = document.getElementById("config-types");
  const body = document.getElementById("config-body");
  if (!typesEl || !body || !ctx.match) return;
  const selected = selectedViews(ctx, view);
  if (selected.length === 0) {
    configFocus = null;
    typesEl.replaceChildren();
    body.textContent = "No selection.";
    return;
  }
  const counts = new Map<EntityType, number>();
  for (const e of selected) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  const types = TYPE_ORDER.filter((t) => counts.has(t));
  for (const t of counts.keys()) {
    if (!types.includes(t)) types.push(t);
  }
  if (!configFocus || !counts.has(configFocus)) configFocus = types[0] ?? null;

  typesEl.replaceChildren();
  for (const t of types) {
    const btn = el("button", {
      class: "config-type" + (t === configFocus ? " is-on" : ""),
      attrs: { type: "button", "data-config-type": t, "data-type": t, title: catalog(t).name },
    });
    const n = counts.get(t) ?? 0;
    btn.append(el("span", { class: "config-type-n", text: n > 1 ? "×" + n : catalog(t).letter }));
    typesEl.append(btn);
  }

  const ofType = selectedOfType(ctx, view, configFocus);
  body.replaceChildren();
  if (!configFocus || ofType.length === 0) {
    body.textContent = "No selection.";
    return;
  }
  const wrecks = ofType.filter((e) => e.wreck);
  const live = ofType.filter((e) => !e.wreck);
  if (live.length === 0 && wrecks.length > 0) {
    body.append(
      el("div", { class: "config-kicker", text: catalog(configFocus).name + " wreck" }),
      el("p", {
        class: "tiny",
        text: "Impassable hull. Shoot it to clear the road. Repair is not ready yet.",
      }),
    );
    return;
  }

  const focus = live[0] ?? ofType[0]!;
  const def = catalog(focus.type);
  body.append(
    el("div", {
      class: "config-kicker",
      text: live.length > 1 ? `${def.name}  ×${live.length}` : def.name,
    }),
  );

  if (hasAmmo(focus.type)) {
    const shells = live.filter((e) => e.ownerId === ctx.match!.youPlayerId);
    const same = shells.length > 0 && shells.every((e) => e.shell === shells[0]!.shell);
    const rack = el("div", { class: "shell-rack" });
    for (const id of SHELL_TYPES) {
      const s = SHELLS[id];
      const left = shells.reduce((n, e) => n + ammoOf(e.ammo, id), 0);
      const on = same && shells[0]?.shell === id;
      const btn = el("button", {
        class: "shell" + (on ? " is-on" : "") + (left <= 0 ? " is-empty" : ""),
        attrs: { type: "button", "data-shell": id, title: s.name },
      });
      btn.append(el("span", { text: s.name }), el("span", { class: "shell-n", text: String(left) }));
      rack.append(btn);
    }
    body.append(el("div", { class: "tiny", text: "Shell" }), rack);
  } else if (focus.kind === "unit" && def.damage > 0) {
    body.append(el("p", { class: "tiny", text: "Small arms · unlimited" }));
  }
  if (isInfantryType(focus.type)) {
    const swimming = live.every((e) => e.swimming);
    const mixedSwim = live.some((e) => e.swimming) && !swimming;
    const same = live.every((e) => (e.stance ?? "stand") === (focus.stance ?? "stand"));
    const label = mixedSwim
      ? "mixed"
      : swimming
        ? "swimming"
        : same
          ? STANCE_LABEL[focus.stance ?? "stand"]
          : "mixed posture";
    body.append(el("p", { class: "tiny", text: "Posture  " + label }));
    body.append(
      el("p", {
        class: "tiny",
        text: swimming
          ? "Swimming — rifles stay dry, they cannot fire until they reach shore."
          : "Capture buildings at point-blank. They do not fire on structures.",
      }),
    );
  }

  if (hasMg(focus.type)) {
    const mine = live.filter((e) => e.ownerId === ctx.match!.youPlayerId);
    const belt = mine.reduce((n, e) => n + (e.mgAmmo ?? 0), 0);
    const heat = mine.length ? mine.reduce((n, e) => n + (e.mgHeat ?? 0), 0) / mine.length : 0;
    const hot = mine.some((e) => (e.mgOverheat ?? 0) > 0);
    body.append(el("div", { class: "tiny", text: hot ? `MG  ${belt}  overheated` : `MG  ${belt}` }));
    const bar = el("div", { class: "mg-heat" + (hot ? " is-hot" : "") });
    const fill = el("span");
    fill.style.width = `${Math.round(Math.max(0, Math.min(1, heat)) * 100)}%`;
    bar.append(fill);
    body.append(bar);
  }

  const armor = armorLabel(focus.type);
  if (armor) body.append(el("p", { class: "tiny", text: "Armor  " + armor }));
  if (focus.type === "hauler") {
    const cargo = live.reduce((n, e) => n + (e.cargo ?? 0), 0);
    body.append(el("p", { class: "tiny", text: `Cargo  ${cargo}` }));
  }
  const spec = specialLabel(focus.type);
  if (spec) {
    const ready = live.some((e) => specialReady(e.type, e.state, e.specialCooldown ?? 0));
    body.append(
      el("p", {
        class: "tiny",
        text: ready ? `${spec}  (${SPECIAL_HOTKEY.toUpperCase()} / click)` : spec,
      }),
    );
  }
}

function paintQuickActions(ctx: Ctx, view: MapView | null): void {
  const root = document.getElementById("quick-actions");
  if (!root || !ctx.match) return;
  const selected = selectedViews(ctx, view);
  const units = ownCommandable(ctx, selected.filter((e) => e.kind === "unit"));
  const buildings = ownCommandable(ctx, selected.filter((e) => e.kind === "building"));
  root.replaceChildren();
  const houses = selected.filter((e) => isGarrisonable(e.type) && e.hp > 0);
  if (units.length === 0 && buildings.length === 0 && houses.length === 0) return;

  const add = (act: string, label: string, title: string) => {
    const b = el("button", { class: "qact", text: label, attrs: { type: "button", "data-act": act, title } });
    root.append(b);
  };

  if (units.length) {
    add("stop", "Stop", "Halt selected units (X)");
    const atk = el("button", {
      class: "qact" + (view?.attackMoveMode ? " is-on" : ""),
      text: "Move attack",
      attrs: { type: "button", "data-act": "attackmove", title: "Move, halt to fire (F)" },
    });
    root.append(atk);
    const force = el("button", {
      class: "qact" + (view?.forceAttackMode ? " is-on" : ""),
      text: "Force attack here",
      attrs: {
        type: "button",
        "data-act": "forceattack",
        title: "Fire at a point or any unit, including friendlies (T). Smoke fires once.",
      },
    });
    root.append(force);
    const guarding = units.every((e) => e.guardFacing != null);
    const guard = el("button", {
      class: "qact" + (view?.guardMode || guarding ? " is-on" : ""),
      text: "Guard",
      attrs: {
        type: "button",
        "data-act": "guard",
        title: "Move here, face a direction, hold. Enemies in the cone are engaged first (V). Click and drag to face.",
      },
    });
    root.append(guard);
    const holding = units.every((e) => e.holdPosition);
    const hold = el("button", {
      class: "qact" + (holding ? " is-on" : ""),
      text: "Hold",
      attrs: {
        type: "button",
        "data-act": "hold",
        title: "Hold position — fire in range, no chase, no withdraw (P)",
      },
    });
    root.append(hold);
    const rotate = el("button", {
      class: "qact" + (view?.rotateMode ? " is-on" : ""),
      text: "Rotate",
      attrs: {
        type: "button",
        "data-act": "rotate",
        title: "Face a direction (R). Tanks turn hull and turret.",
      },
    });
    root.append(rotate);
  }
  const inf = units.filter((e) => isInfantryType(e.type));
  if (inf.length) {
    const ordered = new Set(inf.map((e) => e.stanceOrder ?? e.stance ?? "stand"));
    const legsBroken = inf.every((e) => e.crits?.includes("leg"));
    const addStance = (st: Stance, label: string, title: string) => {
      const locked = legsBroken && st !== "crawl";
      const b = el("button", {
        class: "qact" + (ordered.size === 1 && ordered.has(st) ? " is-on" : ""),
        text: label,
        attrs: {
          type: "button",
          "data-act": "stance-" + st,
          title: locked ? "Broken leg — can only crawl" : title,
          ...(locked ? { disabled: "" } : {}),
        },
      });
      root.append(b);
    };
    addStance("stand", "Stand", "Stand up");
    addStance("crouch", "Crouch", "Crouch (C) — harder to hit, more accurate");
    addStance("crawl", "Crawl", "Go prone (Z) — hardest to hit, most accurate");
  }
  if (units.some((e) => specialOf(e.type) && specialReady(e.type, e.state, e.specialCooldown ?? 0))) {
    add("deploy", "Deploy", `Special (${SPECIAL_HOTKEY.toUpperCase()})`);
  }
  if (units.some((e) => e.type === "hauler")) add("harvest", "Harvest", "Auto-harvest nearest scrap");
  if (buildings.some((e) => e.type !== "core" && !isGarrisonable(e.type))) add("sell", "Sell", "Sell selected structures");
  if (houses.length && units.some((e) => isInfantryType(e.type))) add("garrison", "Enter", "Garrison infantry (G)");
  if (
    units.some((e) => e.garrisonedIn) ||
    houses.some((e) => e.garrison?.ownerId === ctx.match!.youPlayerId && (e.garrison?.count ?? 0) > 0)
  ) {
    add("ungarrison", "Exit", "Leave the building (G)");
  }
  const held = occupiedHouses(ctx, selected);
  if (held.length) {
    const hiding = held.every((h) => h.garrison?.hide);
    const watching = held.every((h) => !h.garrison?.hide);
    const watchBtn = el("button", {
      class: "qact" + (watching ? " is-on" : ""),
      text: "Watch",
      attrs: {
        type: "button",
        "data-act": "garrison-watch",
        title: "Windows open — fire, full sight, occupancy visible (I)",
      },
    });
    root.append(watchBtn);
    const hideBtn = el("button", {
      class: "qact" + (hiding ? " is-on" : ""),
      text: "Hide",
      attrs: {
        type: "button",
        "data-act": "garrison-hide",
        title: "Shuttered — no fire, tiny sight, looks empty to the enemy (I)",
      },
    });
    root.append(hideBtn);
  }
}

function runQuickAction(ctx: Ctx, view: MapView, act: string): void {
  const match = ctx.match;
  if (!match) return;
  const selected = selectedViews(ctx, view);
  const units = ownCommandable(ctx, selected.filter((e) => e.kind === "unit"));
  const buildings = ownCommandable(ctx, selected.filter((e) => e.kind === "building"));
  if (act === "stop") {
    view.setAttackMoveMode(false);
    view.setForceAttackMode(false);
    view.setRotateMode(false);
    view.setGuardMode(false);
    if (units.length) ctx.net.send({ type: "cmd.stop", ids: units.map((e) => e.id) });
    return;
  }
  if (act === "attackmove") {
    if (units.length) view.setAttackMoveMode(!view.attackMoveMode);
    return;
  }
  if (act === "forceattack") {
    if (units.length) view.setForceAttackMode(!view.forceAttackMode);
    return;
  }
  if (act === "guard") {
    if (units.length) view.setGuardMode(!view.guardMode);
    return;
  }
  if (act === "hold") {
    view.setAttackMoveMode(false);
    view.setForceAttackMode(false);
    view.setRotateMode(false);
    view.setGuardMode(false);
    if (units.length) {
      const hold = !units.every((e) => e.holdPosition);
      ctx.net.send({ type: "cmd.hold", ids: units.map((e) => e.id), hold });
    }
    return;
  }
  if (act === "rotate") {
    if (units.length) view.setRotateMode(!view.rotateMode);
    return;
  }
  if (act === "deploy") {
    for (const e of units) {
      if (specialOf(e.type) === "deploy" && specialReady(e.type, e.state, e.specialCooldown ?? 0)) {
        ctx.net.send({ type: "cmd.deploy", id: e.id });
      }
    }
    return;
  }
  if (act === "harvest") {
    const haulers = units.filter((e) => e.type === "hauler");
    if (haulers.length) ctx.net.send({ type: "cmd.harvest", ids: haulers.map((e) => e.id) });
    return;
  }
  if (act === "sell") {
    for (const e of buildings) {
      if (e.type !== "core" && !isGarrisonable(e.type)) ctx.net.send({ type: "cmd.sell", id: e.id });
    }
    return;
  }
  if (act === "garrison") {
    const house = selected.find((e) => isGarrisonable(e.type) && e.hp > 0);
    const inf = units.filter((e) => isInfantryType(e.type));
    if (house && inf.length) ctx.net.send({ type: "cmd.garrison", ids: inf.map((e) => e.id), buildingId: house.id });
    return;
  }
  if (act === "ungarrison") {
    const holed = units.filter((e) => e.garrisonedIn);
    if (holed.length) {
      ctx.net.send({ type: "cmd.ungarrison", ids: holed.map((e) => e.id) });
      return;
    }
    const house = selected.find((e) => isGarrisonable(e.type) && e.garrison?.ownerId === match.youPlayerId);
    if (house) ctx.net.send({ type: "cmd.ungarrison", buildingId: house.id });
    return;
  }
  if (act === "garrison-watch" || act === "garrison-hide") {
    const held = occupiedHouses(ctx, selected);
    const ids = [
      ...held.map((h) => h.id),
      ...units.filter((u) => u.garrisonedIn).map((u) => u.id),
    ];
    if (ids.length) ctx.net.send({ type: "cmd.garrisonhide", ids, hide: act === "garrison-hide" });
    return;
  }
  if (act.startsWith("stance-")) {
    const st = act.slice("stance-".length);
    if (!isStance(st)) return;
    const inf = units.filter((e) => isInfantryType(e.type));
    if (inf.length) ctx.net.send({ type: "cmd.stance", ids: inf.map((e) => e.id), stance: st });
  }
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
