import {
  BUILDING_TYPES,
  CRIT_LABEL,
  SHELL_TYPES,
  STANCE_LABEL,
  TRAIN_QUEUE_CAP,
  TRAIN_TYPES,
  HAULER_SMOKE_CHARGES,
  ammoOf,
  armorLabel,
  catalog,
  colorHex,
  getMap,
  hasAmmo,
  hasMg,
  hasScout,
  infantryGunFor,
  infantryLoadout,
  isGarrisonable,
  isInfantryType,
  isInfantryWeaponId,
  isShellType,
  isStance,
  producerType,
  productionSpeed,
  shellsFor,
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
import {
  ATTACK_MOVE_HOTKEY,
  GARRISON_HOTKEY,
  GUARD_HOTKEY,
  MapView,
  ROTATE_HOTKEY,
  SPECIAL_HOTKEY,
  STOP_HOTKEY,
} from "../render/mapview.js";
import { buzzDeny } from "./audio.js";
import { el } from "./dom.js";

let viewRef: MapView | null = null;
let configFocus: EntityType | null = null;
/** Ready structure: first right-click is a no-op; second cancels. */
let readyCancelArmed: BuildingType | null = null;

/** Fire on press so a snapshot rebuild cannot swallow the click between mousedown and mouseup. */
function pressDisabled(btn: HTMLElement): boolean {
  if (btn instanceof HTMLButtonElement && btn.disabled) return true;
  return btn.getAttribute("aria-disabled") === "true" || btn.hasAttribute("disabled");
}

function bindPress(root: HTMLElement, selector: string, fn: (btn: HTMLElement) => void): void {
  const fire = (btn: HTMLElement) => {
    if (pressDisabled(btn)) return;
    fn(btn);
  };
  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>(selector);
    if (!btn || !root.contains(btn)) return;
    e.preventDefault();
    fire(btn);
  });
  root.addEventListener("click", (e) => {
    if (e.detail !== 0) return;
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>(selector);
    if (!btn || !root.contains(btn)) return;
    e.preventDefault();
    fire(btn);
  });
}

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
    const btn = document.getElementById("build-" + type);
    btn?.addEventListener("click", (e) => {
      const m = ctx.match;
      const q = m?.you.structureQueue;
      if (structureReady(m, type)) {
        view.placeMode = true;
        paintBattleHud(ctx);
        return;
      }
      if (q?.type === type && !q.ready) {
        if ((e.target as HTMLElement | null)?.closest(".cameo-hold, .cameo-paused") || q.paused) {
          ctx.net.send({ type: "cmd.pause", what: "structure", paused: !q.paused });
        }
        return;
      }
      if (q) return;
      ctx.net.send({ type: "cmd.build", building: type });
    });
    btn?.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const q = ctx.match?.you.structureQueue;
      if (!q || q.type !== type) {
        readyCancelArmed = null;
        return;
      }
      if (q.ready) {
        if (readyCancelArmed !== type) {
          readyCancelArmed = type;
          return;
        }
        readyCancelArmed = null;
        ctx.net.send({ type: "cmd.cancel", what: "structure" });
        return;
      }
      readyCancelArmed = null;
      if (!q.paused) ctx.net.send({ type: "cmd.pause", what: "structure", paused: true });
      else ctx.net.send({ type: "cmd.cancel", what: "structure" });
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
      if (m && !canQueueMore(m, unit)) return;
      ctx.net.send({ type: "cmd.train", unit });
    });
    btn?.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (jobsOfType(ctx.match, unit).length === 0) return;
      ctx.net.send({ type: "cmd.cancel", what: "train", unit });
    });
  }

  bindPress(config, "[data-config-type], [data-shell], [data-weapon]", (t) => {
    runConfigAction(ctx, t);
  });

  bindPress(actions, "[data-act]", (btn) => {
    if (!btn.dataset.act || !viewRef || !ctx.match) return;
    runQuickAction(ctx, viewRef, btn.dataset.act);
  });

  bindPress(queue, ".prod-job", (job) => {
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
  const hold = train || showReady
    ? `<span class="cameo-hold hidden" title="Pause production"></span><span class="cameo-paused">PAUSED</span><span class="cameo-count hidden">0</span>`
    : "";
  if (train) b.title = "Left: train  ·  Pause icon: hold  ·  Right: cancel";
  if (showReady) b.title = "Left: build  ·  Right: pause, again to cancel";
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
  if (!q?.ready || q.type !== readyCancelArmed) readyCancelArmed = null;
  for (const type of BUILDING_TYPES) {
    const btn = document.getElementById("build-" + type) as HTMLButtonElement | null;
    if (!btn) continue;
    const job = q?.type === type ? q : null;
    btn.disabled = !coreUp || (!!q && !job);
    const pip = btn.querySelector(".pip") as HTMLElement | null;
    if (pip && job) {
      pip.style.width = `${Math.round((job.progressTicks / job.totalTicks) * 100)}%`;
    } else if (pip) pip.style.width = "0";
    const ready = job?.ready === true;
    const paused = !!job && job.paused && !job.ready;
    const stalled = !!job && !job.ready && !job.paused && m.you.scrap <= 0;
    btn.classList.toggle("is-ready", ready);
    btn.classList.toggle("is-placing", ready && !!viewRef?.placeMode);
    btn.classList.toggle("is-paused", paused);
    btn.classList.toggle("unaffordable", stalled);
    btn.classList.toggle("slow-power", m.you.lowPower && !!job && !job.ready && !job.paused);
    const hold = btn.querySelector(".cameo-hold") as HTMLElement | null;
    hold?.classList.toggle("hidden", !job || job.ready || job.paused);
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
    btn.classList.toggle("unaffordable", training && m.you.scrap <= 0);
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
  const cd = e.specialCooldown ?? 0;
  const smoke =
    e.type === "hauler" && e.ownerId === ctx.match.youPlayerId && !e.wreck && e.smokeCharges != null
      ? e.smokeCharges <= 0 && cd > 0
        ? `  ·  smoke 0/${HAULER_SMOKE_CHARGES} reloading ${cd.toFixed(1)}s`
        : `  ·  smoke ${e.smokeCharges}/${HAULER_SMOKE_CHARGES}`
      : "";
  const dep =
    e.deployProgress != null
      ? `  ·  ${e.state === "undeploy" ? "packing" : "deploying"} ${Math.round(e.deployProgress * 100)}%`
      : "";
  const special =
    e.ownerId !== ctx.match.youPlayerId || !specialOf(e.type)
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
  const gun = isInfantryType(e.type) ? infantryGunFor(e) : null;
  const mag =
    gun && e.clip != null && !e.wreck
      ? e.reload && e.reload > 0
        ? `  ·  ${gun.name} reloading ${e.reload.toFixed(1)}s`
        : `  ·  ${gun.name} ${e.clip}/${gun.clip}`
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
  const holding =
    e.guardTargetId != null ? "  ·  GUARD UNIT" : e.guardFacing != null ? "  ·  GUARD" : e.holdPosition ? "  ·  HOLD" : "";
  const scout =
    e.scout && e.ownerId === ctx.match.youPlayerId
      ? e.scout.hp <= 0
        ? "  ·  scout KIA"
        : e.scout.out
          ? `  ·  hatch ${e.scout.hp}/${e.scout.hpMax}`
          : `  ·  scout ${e.scout.hp}/${e.scout.hpMax}`
      : "";
  const occ = e.garrison?.ownerId
    ? ctx.match.players.find((p) => p.playerId === e.garrison!.ownerId)
    : owner;
  const who = occ?.name ?? (isGarrisonable(e.type) ? "civilian" : "—");
  box.textContent = `${def.name}${wreck}  ·  ${e.hp}/${e.hpMax} HP${plates}${injuries}${posture}${mag}${rack}${mg}  ·  ${who}${q}${cargo}${smoke}${dep}${special}${garrison}${scout}${capturing}${holding}`;
  box.style.borderColor = occ ? colorHex(occ.colorId) : "#b08968";
}

function infantryClipLine(live: EntityView[]): string {
  const gun = live[0] ? infantryGunFor(live[0]) : null;
  if (!gun) return "Small arms";
  if (live.length === 1) {
    const e = live[0]!;
    if ((e.reload ?? 0) > 0) return `Reloading ${e.reload!.toFixed(1)}s`;
    return `Clip ${e.clip ?? 0}/${gun.clip}`;
  }
  const reloading = live.filter((e) => (e.reload ?? 0) > 0).length;
  const rounds = live.reduce((n, e) => n + ((e.reload ?? 0) > 0 ? 0 : (e.clip ?? 0)), 0);
  const cap = gun.clip * live.length;
  return reloading ? `Clip ${rounds}/${cap} · ${reloading} reloading` : `Clip ${rounds}/${cap}`;
}

function loadoutButton(opts: {
  attr: "data-shell" | "data-weapon";
  id: string;
  name: string;
  blurb: string;
  count: string;
  on: boolean;
  empty?: boolean;
  title?: string;
}): HTMLButtonElement {
  const btn = el("button", {
    class: "shell" + (opts.on ? " is-on" : "") + (opts.empty ? " is-empty" : ""),
    attrs: {
      type: "button",
      [opts.attr]: opts.id,
      title: opts.title ?? `${opts.name} — ${opts.blurb}`,
    },
  });
  const row = el("span", { class: "shell-row" });
  row.append(el("span", { text: opts.name }), el("span", { class: "shell-n", text: opts.count }));
  btn.append(row, el("span", { class: "shell-blurb", text: opts.blurb }));
  return btn;
}

function updateLoadoutButton(
  btn: HTMLElement,
  opts: { count: string; on: boolean; empty?: boolean; title?: string },
): void {
  btn.classList.toggle("is-on", opts.on);
  btn.classList.toggle("is-empty", !!opts.empty);
  if (opts.title != null) btn.title = opts.title;
  const n = btn.querySelector(".shell-n");
  if (n && n.textContent !== opts.count) n.textContent = opts.count;
}

function infantryClipShown(e: EntityView, gunId: string): number {
  const live = infantryGunFor(e);
  if (live?.id === gunId) return (e.reload ?? 0) > 0 ? 0 : (e.clip ?? 0);
  const gun = infantryLoadout(e.type).find((g) => g.id === gunId);
  return gun?.clip ?? 0;
}

const TYPE_ORDER: EntityType[] = [
  "warden",
  "ss3",
  "hauler",
  "trooper",
  "rig",
  "core",
  "dynamo",
  "smelter",
  "muster",
  "armory",
  "cottage",
  "shack",
  "house",
  "barn",
  "inn",
  "chapel",
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

function setField(root: HTMLElement, field: string, text: string): void {
  const n = root.querySelector(`[data-field="${field}"]`);
  if (n && n.textContent !== text) n.textContent = text;
}

function configBodyLayout(focus: EntityView, live: EntityView[], wrecks: EntityView[], you: string): string {
  if (live.length === 0 && wrecks.length > 0) return `${focus.type}|wreck`;
  const def = catalog(focus.type);
  const mine = live.filter((e) => e.ownerId === you);
  const parts = [focus.type, "live"];
  if (hasAmmo(focus.type)) parts.push("ammo");
  else if (isInfantryType(focus.type)) {
    parts.push("inf", infantryLoadout(focus.type).map((g) => g.id).join("+"));
    if (mine.length > 0 && infantryLoadout(focus.type).length > 0) parts.push("guns");
  } else if (focus.kind === "unit" && def.damage > 0) parts.push("smallarms");
  if (isInfantryType(focus.type)) parts.push("posture");
  if (hasMg(focus.type)) parts.push("mg");
  if (hasScout(focus.type)) parts.push("scout");
  if (armorLabel(focus.type)) parts.push("armor");
  if (focus.type === "hauler") parts.push("cargo");
  if (specialLabel(focus.type)) parts.push("spec");
  return parts.join("|");
}

function clearConfigPanel(typesEl: HTMLElement, body: HTMLElement): void {
  configFocus = null;
  if (typesEl.dataset.layout !== "empty") {
    typesEl.replaceChildren();
    typesEl.dataset.layout = "empty";
  }
  if (body.dataset.layout !== "empty") {
    body.replaceChildren();
    body.dataset.layout = "empty";
    body.textContent = "No selection.";
  }
}

function buildConfigBody(body: HTMLElement, focus: EntityView, live: EntityView[], wrecks: EntityView[], you: string): void {
  body.replaceChildren();
  if (live.length === 0 && wrecks.length > 0) {
    body.append(
      el("div", { class: "config-kicker", attrs: { "data-field": "kicker" } }),
      el("p", {
        class: "tiny",
        attrs: { "data-field": "wreck-help" },
        text: "Impassable hull. Shoot it to clear the road. Repair is not ready yet.",
      }),
    );
    return;
  }
  const def = catalog(focus.type);
  const mine = live.filter((e) => e.ownerId === you);
  body.append(el("div", { class: "config-kicker", attrs: { "data-field": "kicker" } }));
  if (hasAmmo(focus.type)) {
    const rack = el("div", { class: "shell-rack" });
    const table = shellsFor(focus.type);
    for (const id of SHELL_TYPES) {
      const s = table[id];
      rack.append(loadoutButton({ attr: "data-shell", id, name: s.name, blurb: s.blurb, count: "0", on: false }));
    }
    body.append(el("div", { class: "tiny", text: "Shell" }), rack);
  } else if (isInfantryType(focus.type)) {
    const loadout = infantryLoadout(focus.type);
    if (loadout.length > 0 && mine.length > 0) {
      const rack = el("div", { class: "shell-rack" });
      for (const gun of loadout) {
        rack.append(
          loadoutButton({ attr: "data-weapon", id: gun.id, name: gun.name, blurb: gun.blurb, count: "0", on: false }),
        );
      }
      body.append(el("div", { class: "tiny", text: "Weapon" }), rack);
    }
    body.append(el("p", { class: "tiny", attrs: { "data-field": "clip" } }));
  } else if (focus.kind === "unit" && def.damage > 0) {
    body.append(el("p", { class: "tiny", text: "Small arms · unlimited" }));
  }
  if (isInfantryType(focus.type)) {
    body.append(
      el("p", { class: "tiny", attrs: { "data-field": "posture" } }),
      el("p", { class: "tiny", attrs: { "data-field": "posture-help" } }),
    );
  }
  if (hasMg(focus.type)) {
    body.append(el("div", { class: "tiny", attrs: { "data-field": "mg-label" } }));
    const bar = el("div", { class: "mg-heat", attrs: { "data-field": "mg-heat" } });
    bar.append(el("span"));
    body.append(bar);
  }
  if (hasScout(focus.type)) body.append(el("p", { class: "tiny", attrs: { "data-field": "scout" } }));
  if (armorLabel(focus.type)) body.append(el("p", { class: "tiny", attrs: { "data-field": "armor" } }));
  if (focus.type === "hauler") body.append(el("p", { class: "tiny", attrs: { "data-field": "cargo" } }));
  if (specialLabel(focus.type)) body.append(el("p", { class: "tiny", attrs: { "data-field": "special" } }));
}

function patchConfigBody(body: HTMLElement, focus: EntityView, live: EntityView[], wrecks: EntityView[], you: string): void {
  if (live.length === 0 && wrecks.length > 0) {
    setField(body, "kicker", catalog(focus.type).name + " wreck");
    return;
  }
  const def = catalog(focus.type);
  setField(body, "kicker", live.length > 1 ? `${def.name}  ×${live.length}` : def.name);
  const kicker = body.querySelector('[data-field="kicker"]');
  if (kicker instanceof HTMLElement && def.blurb) kicker.title = def.blurb;
  if (hasAmmo(focus.type)) {
    const shells = live.filter((e) => e.ownerId === you);
    const same = shells.length > 0 && shells.every((e) => e.shell === shells[0]!.shell);
    for (const id of SHELL_TYPES) {
      const btn = body.querySelector(`[data-shell="${id}"]`);
      if (!(btn instanceof HTMLElement)) continue;
      const left = shells.reduce((n, e) => n + ammoOf(e.ammo, id), 0);
      updateLoadoutButton(btn, {
        count: String(left),
        on: !!(same && shells[0]?.shell === id),
        empty: left <= 0,
      });
    }
  } else if (isInfantryType(focus.type)) {
    const mine = live.filter((e) => e.ownerId === you);
    const loadout = infantryLoadout(focus.type);
    if (loadout.length > 0 && mine.length > 0) {
      const same = mine.every((e) => infantryGunFor(e)?.id === infantryGunFor(mine[0]!)?.id);
      const allArmed = mine.every((e) => (e.crits ?? []).includes("arm"));
      for (const gun of loadout) {
        const btn = body.querySelector(`[data-weapon="${gun.id}"]`);
        if (!(btn instanceof HTMLElement)) continue;
        const locked = allArmed && gun.id !== "handgun";
        const left = mine.reduce((n, e) => n + infantryClipShown(e, gun.id), 0);
        updateLoadoutButton(btn, {
          count: String(left),
          on: !!(same && infantryGunFor(mine[0]!)?.id === gun.id),
          empty: locked,
          title: locked ? `${gun.name} — broken arm. ${gun.blurb}` : `${gun.name} — ${gun.blurb}`,
        });
      }
    }
    setField(body, "clip", infantryClipLine(live));
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
    setField(body, "posture", "Posture  " + label);
    setField(
      body,
      "posture-help",
      swimming
        ? "Swimming — rifles stay dry, they cannot fire until they reach shore."
        : "Capture player structures at point-blank. Civilian houses are garrisoned, not captured.",
    );
  }
  if (hasMg(focus.type)) {
    const mine = live.filter((e) => e.ownerId === you);
    const belt = mine.reduce((n, e) => n + (e.mgAmmo ?? 0), 0);
    const heat = mine.length ? mine.reduce((n, e) => n + (e.mgHeat ?? 0), 0) / mine.length : 0;
    const hot = mine.some((e) => (e.mgOverheat ?? 0) > 0);
    setField(body, "mg-label", hot ? `MG  ${belt}  overheated` : `MG  ${belt}`);
    const bar = body.querySelector('[data-field="mg-heat"]');
    if (bar instanceof HTMLElement) {
      bar.classList.toggle("is-hot", hot);
      const fill = bar.querySelector("span");
      if (fill instanceof HTMLElement) {
        fill.style.width = `${Math.round(Math.max(0, Math.min(1, heat)) * 100)}%`;
      }
    }
  }
  if (hasScout(focus.type)) {
    const mine = live.filter((e) => e.ownerId === you);
    const dead = mine.length > 0 && mine.every((e) => (e.scout?.hp ?? 0) <= 0);
    const hatched = mine.length > 0 && mine.every((e) => e.scout?.out);
    const hp = mine.reduce((n, e) => n + (e.scout?.hp ?? 0), 0);
    const hpMax = mine.reduce((n, e) => n + (e.scout?.hpMax ?? 0), 0);
    const label = dead ? "Scout  KIA" : hatched ? "Scout  hatch" : "Scout  buttoned";
    setField(body, "scout", dead || hpMax <= 0 ? label : `${label}  ${hp}/${hpMax}  (I)`);
  }
  const armor = armorLabel(focus.type);
  if (armor) setField(body, "armor", "Armor  " + armor);
  if (focus.type === "hauler") {
    const cargo = live.reduce((n, e) => n + (e.cargo ?? 0), 0);
    setField(body, "cargo", `Cargo  ${cargo}`);
  }
  const spec = specialLabel(focus.type);
  if (spec) {
    const ready = live.some((e) => specialReady(e.type, e.state, e.specialCooldown ?? 0));
    setField(body, "special", ready ? `${spec}  (${SPECIAL_HOTKEY.toUpperCase()} / click)` : spec);
  }
}

function paintConfig(ctx: Ctx, view: MapView | null): void {
  const typesEl = document.getElementById("config-types");
  const body = document.getElementById("config-body");
  if (!typesEl || !body || !ctx.match) return;
  const selected = selectedViews(ctx, view);
  if (selected.length === 0) {
    clearConfigPanel(typesEl, body);
    return;
  }
  const counts = new Map<EntityType, number>();
  for (const e of selected) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  const types = TYPE_ORDER.filter((t) => counts.has(t));
  for (const t of counts.keys()) {
    if (!types.includes(t)) types.push(t);
  }
  if (!configFocus || !counts.has(configFocus)) configFocus = types[0] ?? null;

  const typeKey = types.join(",");
  if (typesEl.dataset.layout !== typeKey) {
    typesEl.replaceChildren();
    for (const t of types) {
      const btn = el("button", {
        class: "config-type",
        attrs: { type: "button", "data-config-type": t, "data-type": t, title: catalog(t).name },
      });
      btn.append(el("span", { class: "config-type-n" }));
      typesEl.append(btn);
    }
    typesEl.dataset.layout = typeKey;
  }
  for (const node of typesEl.children) {
    if (!(node instanceof HTMLElement)) continue;
    const t = node.dataset.configType as EntityType | undefined;
    if (!t) continue;
    node.classList.toggle("is-on", t === configFocus);
    const n = counts.get(t) ?? 0;
    const label = node.querySelector(".config-type-n");
    if (label) label.textContent = n > 1 ? "×" + n : catalog(t).letter;
  }

  const ofType = selectedOfType(ctx, view, configFocus);
  if (!configFocus || ofType.length === 0) {
    if (body.dataset.layout !== "empty") {
      body.replaceChildren();
      body.dataset.layout = "empty";
      body.textContent = "No selection.";
    }
    return;
  }
  const wrecks = ofType.filter((e) => e.wreck);
  const live = ofType.filter((e) => !e.wreck);
  const focus = live[0] ?? ofType[0]!;
  const you = ctx.match.youPlayerId;
  const layout = configBodyLayout(focus, live, wrecks, you);
  if (body.dataset.layout !== layout) {
    buildConfigBody(body, focus, live, wrecks, you);
    body.dataset.layout = layout;
  }
  patchConfigBody(body, focus, live, wrecks, you);
}

function paintQuickActions(ctx: Ctx, view: MapView | null): void {
  const root = document.getElementById("quick-actions");
  if (!root || !ctx.match) return;
  const items = listQuickActions(ctx, view);
  const sig = items.map((i) => i.slot).join(",");
  const existing = [...root.children].map((c) => (c as HTMLElement).dataset.slot ?? "").join(",");
  if (sig !== existing) {
    root.replaceChildren(...items.map(makeQact));
    return;
  }
  const nodes = root.children;
  for (let i = 0; i < items.length; i++) {
    const node = nodes[i] as HTMLElement | undefined;
    const item = items[i];
    if (node && item) updateQact(node, item);
  }
}

interface QAct {
  slot: string;
  act: string;
  label: string;
  title: string;
  on?: boolean;
  disabled?: boolean;
}

function listQuickActions(ctx: Ctx, view: MapView | null): QAct[] {
  if (!ctx.match) return [];
  const selected = selectedViews(ctx, view);
  const units = ownCommandable(ctx, selected.filter((e) => e.kind === "unit"));
  const buildings = ownCommandable(ctx, selected.filter((e) => e.kind === "building"));
  const houses = selected.filter((e) => isGarrisonable(e.type) && e.hp > 0);
  const out: QAct[] = [];
  if (units.length === 0 && buildings.length === 0 && houses.length === 0) return out;

  if (units.length) {
    out.push({
      slot: "stop",
      act: "stop",
      label: "Stop",
      title: `Halt selected units (${STOP_HOTKEY.toUpperCase()})`,
    });
    out.push({
      slot: "attackmove",
      act: "attackmove",
      label: "Move attack",
      title: `Move, halt to fire (${ATTACK_MOVE_HOTKEY.toUpperCase()})`,
      on: !!view?.attackMoveMode,
    });
    out.push({
      slot: "forceattack",
      act: "forceattack",
      label: "Force attack here",
      title: "Fire at a point or any unit, including friendlies (hold Ctrl and click). Smoke fires once.",
      on: !!view?.forceAttackMode,
    });
    const guarding = units.every((e) => e.guardFacing != null || e.guardTargetId != null);
    out.push({
      slot: "guard",
      act: "guard",
      label: "Guard",
      title: `Move here, face a direction, hold. Click a friendly unit to stay with it (${GUARD_HOTKEY.toUpperCase()}). Click and drag to face.`,
      on: !!(view?.guardMode || guarding),
    });
    const holding = units.every((e) => e.holdPosition);
    out.push({
      slot: "hold",
      act: "hold",
      label: "Hold",
      title: "Hold position — fire in range, no chase, no withdraw (P)",
      on: holding,
    });
    out.push({
      slot: "rotate",
      act: "rotate",
      label: "Rotate",
      title: `Face a direction (${ROTATE_HOTKEY.toUpperCase()}). Tanks turn hull and turret.`,
      on: !!view?.rotateMode,
    });
  }
  const inf = units.filter((e) => isInfantryType(e.type));
  if (inf.length) {
    const ordered = new Set(inf.map((e) => e.stanceOrder ?? e.stance ?? "stand"));
    const legsBroken = inf.every((e) => e.crits?.includes("leg"));
    const stance = (st: Stance, label: string, title: string) => {
      const locked = legsBroken && st !== "crawl";
      out.push({
        slot: "stance-" + st,
        act: "stance-" + st,
        label,
        title: locked ? "Broken leg — can only crawl" : title,
        on: ordered.size === 1 && ordered.has(st),
        disabled: locked,
      });
    };
    stance("stand", "Stand", "Stand up");
    stance("crouch", "Crouch", "Crouch (C) — harder to hit, more accurate");
    stance("crawl", "Crawl", "Go prone (Z) — hardest to hit, most accurate");
  }
  if (units.some((e) => specialOf(e.type) && specialReady(e.type, e.state, e.specialCooldown ?? 0))) {
    out.push({
      slot: "deploy",
      act: "deploy",
      label: "Deploy",
      title: `Special (${SPECIAL_HOTKEY.toUpperCase()})`,
    });
  }
  if (units.some((e) => e.type === "hauler")) {
    out.push({ slot: "harvest", act: "harvest", label: "Harvest", title: "Auto-harvest nearest scrap" });
  }
  if (buildings.some((e) => e.type !== "core" && !isGarrisonable(e.type))) {
    out.push({ slot: "sell", act: "sell", label: "Sell", title: "Sell selected structures" });
  }
  if (houses.length && units.some((e) => isInfantryType(e.type))) {
    out.push({
      slot: "garrison",
      act: "garrison",
      label: "Enter",
      title: `Garrison infantry (${GARRISON_HOTKEY.toUpperCase()})`,
    });
  }
  if (
    units.some((e) => e.garrisonedIn) ||
    houses.some((e) => e.garrison?.ownerId === ctx.match!.youPlayerId && (e.garrison?.count ?? 0) > 0)
  ) {
    out.push({
      slot: "ungarrison",
      act: "ungarrison",
      label: "Exit",
      title: `Leave the building (${GARRISON_HOTKEY.toUpperCase()})`,
    });
  }
  const tanks = units.filter((e) => hasScout(e.type) && (e.scout?.hpMax ?? 0) > 0);
  if (tanks.length) {
    const live = tanks.filter((e) => (e.scout?.hp ?? 0) > 0);
    const dead = live.length === 0;
    const hatched = live.length > 0 && live.every((e) => e.scout?.out);
    out.push({
      slot: "scout",
      act: hatched ? "scout-in" : "scout-out",
      label: dead ? "Scout KIA" : hatched ? "Hatch" : "Scout",
      title: dead
        ? "Hatch crew is dead — this tank can no longer scout"
        : hatched
          ? "Button up — hull sight only (I)"
          : "Open hatch — infantry sight, head is exposed (I)",
      on: hatched,
      disabled: dead,
    });
  }
  const held = occupiedHouses(ctx, selected);
  if (held.length) {
    const hiding = held.every((h) => h.garrison?.hide);
    const watching = held.every((h) => !h.garrison?.hide);
    out.push({
      slot: "garrison-watch",
      act: "garrison-watch",
      label: "Watch",
      title: "Windows open — fire, full sight, occupancy visible (I)",
      on: watching,
    });
    out.push({
      slot: "garrison-hide",
      act: "garrison-hide",
      label: "Hide",
      title: "Shuttered — no fire, tiny sight, looks empty to the enemy (I)",
      on: hiding,
    });
  }
  return out;
}

function makeQact(item: QAct): HTMLButtonElement {
  const b = el("button", {
    class: "qact",
    text: item.label,
    attrs: { type: "button", "data-act": item.act, "data-slot": item.slot, title: item.title },
  });
  updateQact(b, item);
  return b;
}

function updateQact(node: HTMLElement, item: QAct): void {
  if (node.dataset.act !== item.act) node.dataset.act = item.act;
  if (node.dataset.slot !== item.slot) node.dataset.slot = item.slot;
  if (node.textContent !== item.label) node.textContent = item.label;
  if (node.title !== item.title) node.title = item.title;
  node.classList.toggle("is-on", !!item.on);
  node.classList.toggle("is-disabled", !!item.disabled);
  node.setAttribute("aria-disabled", item.disabled ? "true" : "false");
}


function runConfigAction(ctx: Ctx, t: HTMLElement): void {
  if (t.dataset.configType) {
    configFocus = t.dataset.configType as EntityType;
    paintBattleHud(ctx);
    return;
  }
  if (!viewRef || !ctx.match) return;
  const weapon = t.dataset.weapon;
  if (weapon) {
    if (!isInfantryWeaponId(weapon)) return;
    const ids = selectedOfType(ctx, viewRef, configFocus)
      .filter((ent) => ent.ownerId === ctx.match!.youPlayerId && !ent.wreck && isInfantryType(ent.type))
      .map((ent) => ent.id);
    if (ids.length === 0) return;
    ctx.net.send({ type: "cmd.weapon", ids, weapon });
    return;
  }
  const shell = t.dataset.shell;
  if (!shell || !isShellType(shell)) return;
  const ids = selectedOfType(ctx, viewRef, configFocus)
    .filter((ent) => ent.ownerId === ctx.match!.youPlayerId && !ent.wreck && hasAmmo(ent.type))
    .map((ent) => ent.id);
  if (ids.length === 0) return;
  ctx.net.send({ type: "cmd.ammo", ids, shell });
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
  if (act === "scout-out" || act === "scout-in") {
    const tanks = units.filter((e) => hasScout(e.type) && (e.scout?.hp ?? 0) > 0);
    if (tanks.length) ctx.net.send({ type: "cmd.scout", ids: tanks.map((e) => e.id), out: act === "scout-out" });
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
