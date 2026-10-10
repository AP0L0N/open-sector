import {
  canLunge,
  canBurrow,
  costFor,
  energyOf,
  energySupplyOf,
  usesHiveEnergy,
  isAirfieldType,
  BUILDING_TYPES,
  YARD_FIELD_TYPES,
  isHqBuilding,
  HQ_OF,
  isHqRig,
  isSmelterType,
  type Faction,
  CRIT_LABEL,
  isCyborg,
  canContinuousTrain,
  isOneAtATime,
  DRONE_MODE_LABEL,
  SHELL_TYPES,
  STANCE_LABEL,
  TRAIN_QUEUE_CAP,
  techNeeds,
  BUILD_REQUIRES,
  TRAIN_TYPES,
  TICK_DT,
  WALKER_ONE_BURST,
  ENGINEER_BUILDINGS,
  BRIDGE_TYPES,
  BRIDGES_HIDDEN,
  TILE_SUBDIV,
  bridgeCost,
  bridgeCostPerTile,
  isBridge,
  HAULER_SMOKE_CHARGES,
  MAULER_CART_HP,
  SMELTER_SCRAP_PER_SEC,
  smelterRateOn,
  type ScrapCell,
  isEngineerBuilding,
  ammoOf,
  armorLabel,
  beltOf,
  carriesShell,
  airLoadoutOf,
  AIR_DROPS,
  AIR_DROP_INFO,
  BV222_TROOPS,
  MAMMOTH_MINE_PACKS,
  isAirDrop,
  isTransportType,
  catalog,
  clockMarkLine,
  colorHex,
  getMap,
  matchClock,
  hasAmmo,
  hasMg,
  gatlingHeatOf,
  hullFlamerOf,
  RADAR_RANGE_MODES,
  roofCiwsOf,
  hasScout,
  infantryGunFor,
  infantryLoadout,
  isCivilianType,
  isDefenceStructure,
  garrisonCandidate,
  isGarrisonable,
  tankDeckOf,
  isHiddenField,
  hasSpotlight,
  lampUnderway,
  isInfantryType,
  isInfantryWeaponId,
  isShellType,
  radarLaidOf,
  aimsOwnGun,
  rocketsOf,
  rocketAmmoOf,
  launcherOnlyOf,
  isStance,
  isYardField,
  onLineLane,
  producerType,
  productionSpeed,
  shellsFor,
  engineerBuildSeconds,
  specialLabel,
  specialOf,
  specialReady,
  wreckScrapOf,
  WALKER_GUN_MODES,
  WALKER_SELF_DESTRUCT_HP,
  WALKER_SELF_DESTRUCT_MODES,
  COMMANDER_FIELD_MODES,
  hasForceField,
  type BuildingType,
  type YardFieldType,
  canPowerDown,
  isSimUnit,
  type EntityType,
  type EntityView,
  type MatchSnapshot,
  type Stance,
  type TrainType,
} from "@gridlock/shared";
import type { Ctx } from "../ctx.js";
import {
  ATTACK_MOVE_HOTKEY,
  PATROL_HOTKEY,
  GARRISON_HOTKEY,
  GUARD_HOTKEY,
  MapView,
  ROTATE_HOTKEY,
  SPECIAL_HOTKEY,
  STOP_HOTKEY,
} from "../render/mapview.js";
import { buzzDeny } from "./audio.js";
import { announce, selectionVoice, setAnnouncerFaction } from "./game-audio.js";
import { el } from "./dom.js";
import { renderOptionsPane } from "./pause.js";
import { garrisonRoster, type GarrisonSeat } from "./garrison-roster.js";
import { commandHotkey, commandIconSvg, groupCommands, hasCommandIcon } from "./command-bar.js";
import {
  SIDEBAR_GROUPS,
  groupLabel,
  groupEntries,
  groupState,
  type SidebarGroup,
} from "./sidebar-groups.js";

/** Key that lays a field line being placed. */
export const FIELD_CONFIRM_KEY = "Enter";

let viewRef: MapView | null = null;
let configFocus: EntityType | null = null;
/** Ready structure: first right-click is a no-op; second cancels. */
let readyCancelArmed: BuildingType | YardFieldType | null = null;
let sidebarGroup: SidebarGroup = "structures";
/** The local commander's faction: which cameos the sidebar holds and which announcer speaks. */
let hudFaction: Faction = "alliance";

/** The faction this snapshot's viewer plays. */
export function viewerFaction(m: { youPlayerId: string; players: readonly { playerId: string; faction?: Faction }[] }): Faction {
  return m.players.find((p) => p.playerId === m.youPlayerId)?.faction ?? "alliance";
}

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
  // A fresh match opens on Structures; re-mounts mid-match keep the player's tab.
  if (!existing) sidebarGroup = "structures";
  const wrap = el("div", { class: "battlefield", attrs: { id: "battlefield" } });
  const top = el("div", { class: "topbar", attrs: { id: "topbar" } });
  top.append(
    el("span", { attrs: { id: "hud-scrap" }, html: "SCRAP <b>0</b>" }),
    el("span", { class: "scrap-toast", attrs: { id: "scrap-toast" }, text: hiveHud(ctx.match) ? "INSUFFICIENT ENERGY" : "INSUFFICIENT SCRAP" }),
    el("span", { attrs: { id: "hud-power" }, html: "POWER <b>0 / 0</b>" }),
    el("span", { attrs: { id: "hud-speed" }, html: "SPEED <b>×1</b>" }),
    el("span", { class: "tiny", attrs: { id: "hud-map" }, text: getMap(ctx.match.mapId)?.name ?? ctx.match.mapId }),
  );

  const body = el("div", { class: "battle-canvas-wrap" });
  const canvas = el("canvas", { attrs: { id: "map-canvas" } });
  const queue = el("div", { class: "prod-queue", attrs: { id: "prod-queue" } });
  // Occupants of the selected host, down the left edge; click one to send it out.
  const rosterDock = el("div", { class: "garrison-dock" });
  const rosterPanel = el("div", { class: "garrison-panel hidden", attrs: { id: "garrison-panel" } });
  const roster = el("div", { class: "garrison-roster", attrs: { id: "garrison-roster" } });
  rosterPanel.append(
    el("div", { class: "garrison-head", attrs: { id: "garrison-head" } }),
    roster,
    el("div", { class: "garrison-hint", text: "Click to send out" }),
  );
  rosterDock.append(rosterPanel);
  // The command bar, centred under the map.
  const actions = el("div", { class: "quick-actions", attrs: { id: "quick-actions" } });
  const commands = el("div", { class: "battle-commands" });
  commands.append(actions);
  const tip = el("div", { class: "cmd-tip", attrs: { id: "cmd-tip", role: "tooltip" } });
  body.append(canvas, queue, rosterDock, commands, tip);
  bindCommandTips(body, tip);

  const side = el("aside", { class: "sidebar" });
  const radarHead = el("div", { class: "radar-head" });
  const clock = el("div", {
    class: "match-clock",
    attrs: { id: "match-clock", "data-phase": "day" },
  });
  clock.append(
    el("span", { class: "match-clock-time", text: "06:00" }),
    el("span", { class: "match-clock-next", text: "NIGHT AT 20:30" }),
  );
  radarHead.append(el("h3", { text: "Radar" }), clock);
  const mini = el("canvas", { attrs: { id: "minimap" } });
  side.append(radarHead, mini);

  const tabs = el("div", { class: "group-tabs", attrs: { id: "group-tabs", role: "tablist" } });
  const heading = el("h3", { class: "group-heading", attrs: { id: "group-heading" } });
  const panels = el("div", { class: "group-panels" });
  hudFaction = viewerFaction(ctx.match);
  setAnnouncerFaction(hudFaction);
  const entries = groupEntries(hudFaction);
  for (const g of SIDEBAR_GROUPS) {
    const look = groupLabel(g, hudFaction);
    const tab = el("button", {
      class: "group-tab",
      attrs: { type: "button", id: "group-tab-" + g.id, role: "tab", title: look.label, "data-group": g.id },
      html:
        `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${g.icon}"/></svg>` +
        `<span class="group-tab-label">${look.short}</span><span class="group-light"></span>`,
    });
    tabs.append(tab);
    const grid = el("div", { class: "cameos", attrs: { id: "cameos-" + g.id, role: "tabpanel" } });
    for (const { id, type } of entries[g.id]) {
      const c = catalog(type);
      if (usesHiveEnergy(hudFaction)) {
        grid.append(hiveCameo(id, type, c.kind === "building"));
        continue;
      }
      grid.append(
        c.kind === "building"
          ? cameoButton(id, c.name, costFor(type, hudFaction), c.power, true)
          : cameoButton(id, c.name, c.cost, 0, false, true),
      );
    }
    panels.append(grid);
  }
  side.append(el("h3", { text: "Production" }), tabs, heading, panels);
  bindPress(tabs, "[data-group]", (tab) => {
    sidebarGroup = tab.dataset.group as SidebarGroup;
    paintGroupTabs();
  });

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
  let lastSelected = new Set<number>();
  view.onSelect = (ids) => {
    // Units joining the selection answer; reselecting the same group stays quiet.
    selectionVoice(ids.filter((id) => !lastSelected.has(id)), ctx.match);
    lastSelected = new Set(ids);
    ctx.inspect = ids[0] ?? null;
    paintInspect(ctx, view);
    paintConfig(ctx, view);
    paintQuickActions(ctx, view);
    paintGarrisonRoster(ctx, view);
  };

  for (const type of [...BUILDING_TYPES, ...YARD_FIELD_TYPES]) {
    const btn = document.getElementById("build-" + type);
    btn?.addEventListener("click", (e) => {
      const m = ctx.match;
      const q = laneQueue(m, type);
      const mine = q?.type === type ? q : null;
      if (isYardField(type)) {
        if (mine && !mine.ready) {
          if ((e.target as HTMLElement | null)?.closest(".cameo-hold, .cameo-paused") || mine.paused) {
            ctx.net.send({ type: "cmd.pause", what: "structure", paused: !mine.paused, building: type });
          }
          return;
        }
        if (q) return;
        view.armYardField(type);
        paintBattleHud(ctx);
        return;
      }
      if (structureReady(m, type)) {
        view.armPlace(type);
        paintBattleHud(ctx);
        return;
      }
      if (mine && !mine.ready) {
        if ((e.target as HTMLElement | null)?.closest(".cameo-hold, .cameo-paused") || mine.paused) {
          ctx.net.send({ type: "cmd.pause", what: "structure", paused: !mine.paused, building: type });
        }
        return;
      }
      if (q) return;
      if (m && buildTechNeed(m, type).length > 0) return;
      ctx.net.send({ type: "cmd.build", building: type });
    });
    btn?.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const q = laneQueue(ctx.match, type);
      if (isYardField(type)) {
        if (q?.type === type) ctx.net.send({ type: "cmd.cancel", what: "structure", building: type });
        else {
          view.yardArm = null;
          view.placeMode = false;
          paintBattleHud(ctx);
        }
        return;
      }
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
        ctx.net.send({ type: "cmd.cancel", what: "structure", building: type });
        return;
      }
      readyCancelArmed = null;
      if (!q.paused) ctx.net.send({ type: "cmd.pause", what: "structure", paused: true, building: type });
      else ctx.net.send({ type: "cmd.cancel", what: "structure", building: type });
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
      if (m && hudTechMissing(m, unit)) return;
      ctx.net.send({ type: "cmd.train", unit });
    });
    btn?.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const m = ctx.match;
      if (!m) return;
      if ((m.you.continuous ?? []).includes(unit)) {
        ctx.net.send({ type: "cmd.continuous", unit, on: false });
        return;
      }
      if (jobsOfType(m, unit).length === 0) {
        if (!canContinuousTrain(unit) || !canQueueMore(m, unit)) return;
        ctx.net.send({ type: "cmd.continuous", unit, on: true });
        return;
      }
      ctx.net.send({ type: "cmd.cancel", what: "train", unit });
    });
  }

  bindPress(config, "[data-config-type], [data-shell], [data-weapon], [data-guns], [data-selfdestruct], [data-fielddivert], [data-rockets], [data-reach], [data-payload]", (t) => {
    runConfigAction(ctx, t);
  });

  bindPress(actions, "[data-act]", (btn) => {
    if (!btn.dataset.act || !viewRef || !ctx.match) return;
    runQuickAction(ctx, viewRef, btn.dataset.act);
  });

  bindPress(roster, ".garrison-seat", (seat) => {
    const id = Number(seat.dataset.id);
    if (seat.dataset.mine !== "1" || !Number.isFinite(id)) return;
    ctx.net.send({ type: "cmd.ungarrison", ids: [id] });
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

/** The construction lane this cameo belongs to. Base, defence, and line lanes do not block each other. */
/** Buildings you still need standing before the yard will queue `type` (BUILD_REQUIRES). */
function buildTechNeed(m: MatchSnapshot, type: BuildingType | YardFieldType): BuildingType[] {
  const need = BUILD_REQUIRES[type as BuildingType] ?? [];
  return need.filter((t) => !m.entities.some((e) => e.ownerId === m.youPlayerId && e.type === t && e.hp > 0 && !e.wreck));
}

function laneQueue(m: MatchSnapshot | null | undefined, type: BuildingType | YardFieldType) {
  if (!m) return null;
  if (onLineLane(type)) return m.you.lineQueue;
  return isDefenceStructure(type) ? m.you.defenceQueue : m.you.structureQueue;
}

function structureReady(m: MatchSnapshot | null | undefined, type: BuildingType | YardFieldType): boolean {
  if (!m) return false;
  if (!isDefenceStructure(type) && m.you.placingType === type) return true;
  const q = laneQueue(m, type);
  return q?.ready === true && q.type === type;
}

/** Does this match's viewer run on hive energy (the Xenomorphs) instead of scrap and power? */
function hiveHud(m: MatchSnapshot | null | undefined): boolean {
  return !!m?.you.energy || usesHiveEnergy(m ? viewerFaction(m) : undefined);
}

/** A Xenomorph cameo: priced in hive energy, not scrap; a Fusion Node shows what it adds. */
function hiveCameo(id: string, type: BuildingType | TrainType | YardFieldType, building: boolean): HTMLButtonElement {
  const c = catalog(type);
  const supply = energySupplyOf(type);
  const take = energyOf(type);
  const price = supply > 0 ? `+${supply} EN` : take > 0 ? `${take} EN${type === "laserfence" ? " + link" : ""}` : "FREE";
  const b = building ? cameoButton(id, c.name, 0, 0, true) : cameoButton(id, c.name, 0, 0, false, true);
  const meta = b.querySelector(".cameo-meta");
  if (meta) meta.textContent = price;
  const deny = b.querySelector(".cameo-deny");
  if (deny) deny.textContent = "NO ENERGY";
  return b;
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
    ? `<span class="cameo-hold hidden" title="Pause production"></span><span class="cameo-paused">PAUSED</span><span class="cameo-count hidden">0</span>${train ? `<span class="cameo-loop">LOOP</span>` : ""}`
    : "";
  if (train) b.title = "Left: train  ·  Pause icon: hold  ·  Right: cancel one";
  if (showReady) b.title = "Left: build  ·  Right: pause, again to cancel";
  b.innerHTML = `<span class="cameo-name">${name}</span><span class="cameo-meta">${cost}${powerTxt ? " · " + powerTxt : ""}</span><span class="pip"></span><span class="cameo-deny">NO SCRAP</span>${ready}${hold}`;
  return b;
}

/** Show the chosen group's cameos; light every tab by what its cameos are doing. */
function paintGroupTabs(): void {
  const entries = groupEntries(hudFaction);
  for (const g of SIDEBAR_GROUPS) {
    const active = g.id === sidebarGroup;
    document.getElementById("cameos-" + g.id)?.classList.toggle("hidden", !active);
    const tab = document.getElementById("group-tab-" + g.id);
    if (!tab) continue;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    const flags = entries[g.id].flatMap(({ id }) => {
      const btn = document.getElementById(id) as HTMLButtonElement | null;
      if (!btn) return [];
      return [{
        disabled: btn.disabled,
        ready: btn.classList.contains("is-ready"),
        working: btn.classList.contains("is-training") || btn.classList.contains("is-building") || btn.classList.contains("is-continuous"),
        paused: btn.classList.contains("is-paused"),
      }];
    });
    tab.dataset.state = groupState(flags);
  }
  const heading = document.getElementById("group-heading");
  const group = SIDEBAR_GROUPS.find((g) => g.id === sidebarGroup);
  const label = group ? groupLabel(group, hudFaction).label : "";
  if (heading && heading.textContent !== label) heading.textContent = label;
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
  if (oneAtATimeHeld(m, unit)) return false;
  const want = producerType(unit);
  const producers = m.entities.filter((e) => e.ownerId === m.youPlayerId && e.type === want && e.hp > 0);
  if (producers.length === 0) return false;
  return producers.some((e) => (e.trainQueue?.length ?? 0) < TRAIN_QUEUE_CAP && padFree(e));
}

/**
 * A one-at-a-time unit (Titan, Cyborg Commander) you already have: "alive" while one
 * stands, "queued" while one is in a queue. The sim refuses another either way.
 */
function oneAtATimeHeld(m: MatchSnapshot, unit: TrainType): "alive" | "queued" | null {
  if (!isOneAtATime(unit)) return null;
  const mine = m.entities.filter((e) => e.ownerId === m.youPlayerId);
  if (mine.some((e) => e.type === unit && e.hp > 0 && !e.wreck)) return "alive";
  return mine.some((e) => e.trainQueue?.some((j) => j.type === unit)) ? "queued" : null;
}

/** First tech building this unit still needs you to have standing, or null. Mirrors the sim's techMissing. */
function hudTechMissing(m: MatchSnapshot, unit: TrainType): BuildingType | null {
  for (const need of techNeeds(unit)) {
    if (!m.entities.some((e) => e.ownerId === m.youPlayerId && e.type === need && e.hp > 0 && !e.wreck)) return need;
  }
  return null;
}

/** An Airfield with a hardstand left for one more plane (parked, flying, or queued). Other producers always pass. */
function padFree(e: EntityView): boolean {
  if (!e.pads) return true;
  return e.pads.used + (e.trainQueue?.length ?? 0) < e.pads.cap;
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
  announce("noscrap");
  window.setTimeout(() => {
    scrapEl?.classList.remove("scrap-denied");
    toast?.classList.remove("show");
    cameo?.classList.remove("scrap-denied");
  }, 900);
}

const scrapYieldIndex = new WeakMap<readonly ScrapCell[], Map<string, number>>();

/** Scrap yield by tile from a snapshot's scrap cells, built once per snapshot. */
function scrapYieldLookup(cells: readonly ScrapCell[]): (x: number, y: number) => number {
  let idx = scrapYieldIndex.get(cells);
  if (!idx) {
    idx = new Map(cells.map((c) => [`${c.x},${c.y}`, c.yield]));
    scrapYieldIndex.set(cells, idx);
  }
  const found = idx;
  return (x, y) => found.get(`${x},${y}`) ?? 0;
}

/** Nothing left to pay the next step of a job with: scrap, or the hive's free energy. */
function outOfFunds(m: MatchSnapshot): boolean {
  const hive = m.you.energy;
  return hive ? hive.used >= hive.cap : m.you.scrap <= 0;
}

/** The hive's store as a bar, like a Cyborg Commander's field: what is taken against what the hive holds. */
function hiveEnergyHtml(hive: { cap: number; used: number; offline: number }): string {
  const share = hive.cap > 0 ? Math.min(1, hive.used / hive.cap) : 1;
  const full = hive.used >= hive.cap;
  const offline = hive.offline > 0 ? ` <b class="cyborg-link">${hive.offline} OFFLINE</b>` : "";
  return (
    `ENERGY <span class="energy-bar${full ? " is-full" : ""}" role="meter" aria-valuemin="0" aria-valuemax="${hive.cap}" aria-valuenow="${hive.used}">` +
    `<i style="width:${Math.round(share * 100)}%"></i></span> <b>${hive.used} / ${hive.cap}</b>${offline}`
  );
}

export function paintBattleHud(ctx: Ctx): void {
  const m = ctx.match;
  if (!m) return;
  const scrap = document.getElementById("hud-scrap");
  const hive = m.you.energy;
  if (scrap && hive) {
    const next = hiveEnergyHtml(hive);
    if (scrap.innerHTML !== next) scrap.innerHTML = next;
    scrap.classList.toggle("hive-energy", true);
    scrap.classList.toggle("low-power", hive.offline > 0);
  } else if (scrap) {
    const yieldAt = scrapYieldLookup(m.scrap ?? []);
    let rate = 0;
    for (const e of m.entities) {
      if (e.ownerId === m.youPlayerId && isSmelterType(e.type) && e.hp > 0 && !e.wreck) rate += smelterRateOn(yieldAt, e.tileX, e.tileY);
    }
    // A full store pours nothing, so the rate would only mislead.
    const full = m.you.scrap >= m.you.scrapCap;
    const pour = full ? 0 : Math.round(rate * productionSpeed(m.you.provided, m.you.used));
    const next = `SCRAP <b>${m.you.scrap} / ${m.you.scrapCap}</b>${pour > 0 ? ` <i class="pour">+${pour}/s</i>` : ""}`;
    if (scrap.innerHTML !== next) scrap.innerHTML = next;
  }
  const power = document.getElementById("hud-power");
  power?.classList.toggle("hidden", !!hive);
  if (power && !hive) {
    const spd = productionSpeed(m.you.provided, m.you.used);
    const slow = m.you.lowPower ? ` · SLOW ×${spd.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}` : "";
    // No powered Cyborg Central (Conversion Chamber) and no Commander: your Cyborgs (hive soldiers) are about to go dark.
    const link = m.you.cyborgShutdownIn;
    const linked = viewerFaction(m) === "xeno" ? "HIVE LINK LOST" : "CYBORGS OFF";
    const cyborgs = link != null ? ` · <b class="cyborg-link">${linked} IN ${Math.ceil(link)}s</b>` : "";
    const next = `POWER <b>${m.you.used} / ${m.you.provided}</b>${slow}${cyborgs}`;
    if (power.innerHTML !== next) power.innerHTML = next;
    power.classList.toggle("low-power", m.you.lowPower || link != null);
  }
  const speed = document.getElementById("hud-speed");
  if (speed) {
    const next = m.paused ? "SPEED <b>PAUSED</b>" : `SPEED <b>×${m.gameSpeed || 1}</b>`;
    if (speed.innerHTML !== next) {
      speed.innerHTML = next;
      retrigger(speed, "speed-flash");
    }
  }
  const top = document.getElementById("topbar");
  top?.classList.toggle("low-power", m.you.lowPower);
  paintMatchClock(m.tick, getMap(m.mapId)?.night);

  const coreUp = m.entities.some((e) => e.ownerId === m.youPlayerId && isHqBuilding(e.type));
  const armed = readyCancelArmed ? laneQueue(m, readyCancelArmed) : null;
  if (!armed?.ready || armed.type !== readyCancelArmed) readyCancelArmed = null;
  for (const type of [...BUILDING_TYPES, ...YARD_FIELD_TYPES]) {
    const btn = document.getElementById("build-" + type) as HTMLButtonElement | null;
    if (!btn) continue;
    const lane = laneQueue(m, type);
    const job = lane?.type === type ? lane : null;
    // A job already queued stays live so it can still be placed, paused, or cancelled.
    const techNeed = job ? [] : buildTechNeed(m, type);
    btn.disabled = !coreUp || (!!lane && !job) || techNeed.length > 0;
    btn.classList.toggle("needs-tech", techNeed.length > 0);
    btn.dataset.baseTitle ??= btn.title;
    btn.title =
      techNeed.length > 0
        ? `${catalog(type).name} — needs a ${techNeed.map((t) => catalog(t).name).join(" and a ")}.`
        : btn.dataset.baseTitle;
    const pip = btn.querySelector(".pip") as HTMLElement | null;
    if (pip && job) {
      pip.style.width = `${Math.round((job.progressTicks / job.totalTicks) * 100)}%`;
    } else if (pip) pip.style.width = "0";
    const ready = job?.ready === true;
    const paused = !!job && job.paused && !job.ready;
    const stalled = !!job && !job.ready && !job.paused && outOfFunds(m);
    const siting = isYardField(type) && viewRef?.yardArm === type && !!viewRef.placeMode;
    btn.classList.toggle("is-ready", ready);
    btn.classList.toggle("is-building", !!job && !ready);
    btn.classList.toggle("is-placing", (ready && !!viewRef?.placeMode && viewRef.placePick === type) || siting);
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
    const padsFull = isAirfieldType(want) && hasProducer && !canQueueMore(m, unit);
    const tech = hudTechMissing(m, unit);
    const techMissing = tech != null;
    // One at a time: greyed out while yours stands. While one is queued the cameo stays live to pause or cancel it.
    const held = oneAtATimeHeld(m, unit);
    const looping = (m.you.continuous ?? []).includes(unit);
    const blocked = !hasProducer || padsFull || techMissing || held === "alive";
    // A latched cameo stays clickable so a right-click can still cancel it after the factory is gone.
    btn.disabled = !m.you.alive || (blocked && !looping);
    btn.classList.toggle("is-disabled", m.you.alive && blocked && looping);
    btn.setAttribute("aria-disabled", String(!m.you.alive || blocked));
    btn.classList.toggle("needs-tech", techMissing);
    btn.classList.toggle("one-held", held != null);
    btn.classList.toggle("is-continuous", looping);
    btn.dataset.baseTitle ??= btn.title;
    const name = catalog(unit).name;
    btn.title = padsFull
      ? `${name} — every hardstand is taken. Build another Airfield.`
      : techMissing
        ? `${name} — needs a ${catalog(tech).name}.`
        : held === "alive"
          ? `${name} — only one at a time. Yours is still in the field.`
          : held === "queued"
            ? `${name} — only one at a time. One is already in the queue.`
            : looping
              ? `${name} — building continuously. Right-click stops and cancels it.`
              : canContinuousTrain(unit) && unitJobs.length === 0
                ? `${name} — Left: train. Right: build continuously.`
                : btn.dataset.baseTitle;
    btn.classList.toggle("unaffordable", training && outOfFunds(m));
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
  paintGroupTabs();
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
  paintGarrisonRoster(ctx, viewRef);
}

/** Digital match clock beside Radar. The face is the sim day; the line under it names when night, dawn, or morning starts. */
function paintMatchClock(tick: number, alwaysNight = false): void {
  const node = document.getElementById("match-clock");
  if (!node) return;
  const clock = matchClock(tick, alwaysNight);
  const time = node.querySelector(".match-clock-time");
  const next = node.querySelector(".match-clock-next");
  if (time && time.textContent !== clock.text) time.textContent = clock.text;
  const mark = clockMarkLine(clock.phase, alwaysNight).toUpperCase();
  if (next && next.textContent !== mark) next.textContent = mark;
  if (node.dataset.phase !== clock.phase) node.dataset.phase = clock.phase;
  const label = `${clock.text}, ${clock.phase}. ${mark}.`;
  if (node.title !== label) node.title = label;
  if (node.getAttribute("aria-label") !== label) node.setAttribute("aria-label", label);
}

function paintInspect(ctx: Ctx, view: MapView | null): void {
  const box = document.getElementById("inspect");
  if (!box || !ctx.match) return;
  const id = ctx.inspect ?? (view ? [...view.selected][0] : null);
  const e = ctx.match.entities.find((x) => x.id === id);
  if (!e) {
    box.textContent = ctx.match.you.alive
      ? ctx.match.entities.some((x) => x.ownerId === ctx.match!.youPlayerId && isHqBuilding(x.type))
        ? "No selection."
        : `Select the ${catalog(HQ_OF[hudFaction].rig).name}, then click it again or press ${SPECIAL_HOTKEY.toUpperCase()} to deploy.`
      : `${catalog(HQ_OF[hudFaction].core).name} down.`;
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
  const cart =
    e.type === "hauler" && !e.wreck && e.cart != null
      ? e.cart <= 0
        ? "  ·  cart off — Smelter"
        : `  ·  cart ${e.cart}/${MAULER_CART_HP}`
      : "";
  const cd = e.specialCooldown ?? 0;
  const smoke =
    e.type === "hauler" && e.ownerId === ctx.match.youPlayerId && !e.wreck && e.smokeCharges != null
      ? e.smokeCharges <= 0 && cd > 0
        ? `  ·  smoke 0/${HAULER_SMOKE_CHARGES} reloading ${cd.toFixed(1)}s`
        : `  ·  smoke ${e.smokeCharges}/${HAULER_SMOKE_CHARGES}`
      : "";
  const dep =
    e.deployProgress != null
      ? `  ·  ${e.state === "undeploy" ? "packing" : e.type === "titan" ? "bracing" : "deploying"} ${Math.round(e.deployProgress * 100)}%`
      : "";
  const special =
    e.ownerId !== ctx.match.youPlayerId || !specialOf(e.type)
      ? ""
      : cd > 0 && e.state !== "deploy" && e.state !== "undeploy"
        ? `  ·  ${specialLabel(e.type, e.braced) ?? "Special"} ${cd.toFixed(1)}s`
        : specialReady(e.type, e.state, cd)
          ? `  ·  ${specialLabel(e.type, e.braced) ?? "Special"} (${SPECIAL_HOTKEY.toUpperCase()} / click)`
          : "";
  const armor = armorLabel(e.type);
  const plates = armor ? `  ·  armor ${armor}` : "";
  const blink = e.purge
    ? `  ·  PURGING ${Math.round(e.purge.u * 100)}%`
    : e.blink
      ? e.blink.u >= 1
        ? "  ·  blink ready"
        : `  ·  blink ${Math.round(e.blink.u * 100)}%`
      : "";
  const field =
    (e.field
      ? `  ·  field ${e.field.hp}/${e.field.max}${e.field.hp <= 0 ? " (down)" : ""}${e.fieldDivert ? " · SHIELD POWER" : ""}`
      : "") + blink;
  const wreck = e.wreck
    ? "  ·  WRECK"
    : e.shutdown
      ? e.takeover
        ? `  ·  SHUT DOWN — uplink ${Math.round(e.takeover.u * 100)}%`
        : "  ·  SHUT DOWN — wakes when the link is back, unless an enemy Cyborg Commander takes him over"
      : e.dormant
        ? "  ·  SHUT DOWN — hiding in plain sight: enemy guns pass him by. Power up to resume"
        : "";
  const injuries =
    e.crits && e.crits.length > 0
      ? `  ·  ${e.crits.map((c) => (isCyborg(e.type) && c === "leg" ? "legs torn off" : CRIT_LABEL[c])).join(", ")}${e.shielded ? " (plating holds — cannot be hurt yet)" : ""}`
      : "";
  const posture = e.swimming
    ? "  ·  swimming"
    : e.wading
      ? rocketsOf(e.type)
        ? "  ·  wading, rockets only"
        : "  ·  wading, cannot fire"
      : e.braced
        ? "  ·  braced"
        : isInfantryType(e.type) && e.stance
          ? `  ·  ${STANCE_LABEL[e.stance]}${e.stanceOrder && e.stanceOrder !== e.stance ? " (under fire)" : ""}`
          : "";
  const belt = beltOf(e.type);
  const walkerMode = e.type === "walker" ? WALKER_GUN_MODES.find((m) => m.guns === (e.guns === 2 ? 2 : 1)) : undefined;
  const gun = isInfantryType(e.type)
    ? infantryGunFor(e)
    : belt
      ? {
          name:
            walkerMode?.name ??
            (e.type === "ciws"
              ? "20mm belt"
              : e.type === "mammoth"
                ? "Bow MG"
                : e.type === "submarine"
                  ? "Torpedoes"
                  : e.type === "mgnest"
                    ? "MG42 belt"
                    : e.type === "flak"
                      ? "37mm clip"
                      : "Gatlings"),
          clip: belt.clip,
        }
      : null;
  const mag =
    gun && e.clip != null && !e.wreck
      ? e.fieldDivert
        ? `  ·  ${gun.name} dark`
        : e.reload && e.reload > 0
        ? `  ·  ${gun.name} reloading ${e.reload.toFixed(1)}s`
        : "id" in gun && gun.id === "daggers"
        ? `  ·  ${gun.name}`
        : `  ·  ${gun.name} ${e.clip}/${gun.clip}`
      : "";
  const rack =
    e.ammo && e.shell && !e.wreck ? `  ·  ${e.shell.toUpperCase()} ${ammoOf(e.ammo, e.shell)}` : "";
  const rockets =
    rocketsOf(e.type) && !e.wreck && e.ownerId === ctx.match.youPlayerId
      ? e.rocketsOff
        ? `  ·  rockets off ${e.rockets ?? 0}`
        : (e.rockets ?? 0) <= 0
          ? "  ·  rockets EMPTY"
          : (e.rocketReload ?? 0) > 0
            ? `  ·  rockets ${e.rockets} · ${e.rocketReload!.toFixed(1)}s`
            : `  ·  rockets ${e.rockets} ready`
      : "";
  const mg =
    e.mgAmmo != null && !e.wreck
      ? `  ·  ${roofCiwsOf(e.type) ? "20mm" : "MG"} ${e.mgAmmo}${e.mgOverheat && e.mgOverheat > 0 ? " HOT" : ""}`
      : "";
  const garrison =
    e.garrison && !isTransportType(e.type) && e.type !== "supply"
      ? tankDeckOf(e.type)
        ? `  ·  deck ${e.garrison.count}/${e.garrison.cap}`
        : `  ·  garrison ${e.garrison.count}/${e.garrison.cap}${e.garrison.hide ? " hide" : e.garrison.count ? " watch" : ""}`
      : e.mountedGun != null
        ? "  ·  on the deck MG"
        : e.garrisonedIn
          ? "  ·  inside"
          : "";
  const capturing =
    e.capture && e.capture.progress > 0 ? `  ·  capturing ${Math.round(e.capture.progress * 100)}%` : "";
  const holding = e.patrol?.length
    ? "  ·  PATROL"
    : e.guardTargetId != null
      ? "  ·  GUARD UNIT"
      : e.guardFacing != null
        ? "  ·  GUARD"
        : e.holdPosition
          ? "  ·  HOLD"
          : "";
  const selfDestroy =
    e.type === "walker" &&
    !e.wreck &&
    e.ownerId === ctx.match.youPlayerId &&
    e.selfDestruct !== false &&
    e.hp <= e.hpMax * WALKER_SELF_DESTRUCT_HP
      ? "  ·  SELF DESTROY"
      : "";
  const tending =
    e.tend != null ? "  ·  tending" : ctx.match.entities.some((o) => o.tend === e.id) ? "  ·  being tended" : "";
  const scout =
    e.scout && e.ownerId === ctx.match.youPlayerId
      ? e.scout.hp <= 0
        ? "  ·  scout KIA"
        : e.scout.out
          ? `  ·  hatch ${e.scout.hp}/${e.scout.hpMax}`
          : `  ·  scout ${e.scout.hp}/${e.scout.hpMax}`
      : "";
  const bed = e.bed
    ? `  ·  ${e.bed.open ? "no driver" : e.bed.crew ? "crew" : "driven"} ${(e.bed.crew ? 1 : 0) + e.bed.seats}/2${
        e.supply != null ? `  ·  supply ${Math.round(e.supply)}` : ""
      }`
    : "";
  const occ = e.garrison?.ownerId
    ? ctx.match.players.find((p) => p.playerId === e.garrison!.ownerId)
    : owner;
  const who = occ?.name ?? (isGarrisonable(e.type) ? "civilian" : "—");
  const flight = e.drone
    ? droneLine(e.drone)
    : e.droneLink
      ? droneLinkLine(e.droneLink)
      : e.jet
        ? jetLine(e.jet)
        : e.type === "aswheli"
          ? "  ·  on the hunt"
          : e.air
            ? airLine(e.air, e.type)
            : "";
  const pads = e.pads ? `  ·  planes ${e.pads.used}/${e.pads.cap}` : "";
  const depth = e.dive ? diveLine(e.dive, !!e.submerged) : e.asw ? aswLine(e.asw) : "";
  box.textContent = `${def.name}${wreck}  ·  ${e.hp}/${e.hpMax} HP${field}${plates}${injuries}${posture}${mag}${rack}${rockets}${mg}${flight}${depth}  ·  ${who}${q}${cart}${smoke}${dep}${special}${garrison}${scout}${bed}${pads}${capturing}${holding}${selfDestroy}${tending}`;
  box.style.borderColor = occ ? colorHex(occ.colorId) : "#b08968";
}

const AIR_PHASE_LABEL: Record<NonNullable<EntityView["air"]>["phase"], string> = {
  parked: "on the pad",
  takeoff: "taking off",
  fly: "airborne",
  landing: "landing",
  crash: "going down",
};

/** Phase, and for your own planes fuel, bomb, and belts. A fighter carries no bomb; it counts barrages. */
function airLine(air: NonNullable<EntityView["air"]>, type: EntityType): string {
  let s = `  ·  ${AIR_PHASE_LABEL[air.phase]}`;
  if (air.fuel != null && air.fuelMax) s += `  ·  fuel ${Math.round((air.fuel / air.fuelMax) * 100)}%`;
  const load = airLoadoutOf(type);
  if (air.payload) {
    const name = AIR_DROP_INFO[air.payload].name.toLowerCase();
    if (air.payload === "troops") s += `  ·  paratroops ${air.troops ?? 0}/${BV222_TROOPS}`;
    else if (air.bombs != null) s += `  ·  ${name} ${air.bombs > 0 ? "loaded" : air.phase === "parked" ? "loading" : "dropped"}`;
    if (air.phase !== "parked" && air.homeId == null && air.fuel != null) s += "  ·  NO AIRFIELD";
    return s;
  }
  if (air.bombs != null && load.bombs > 0) s += `  ·  bomb ${air.bombs > 0 ? "armed" : "spent"}`;
  if (air.rounds != null) s += load.bombs > 0 ? `  ·  MG ${Math.round(air.rounds)}` : `  ·  barrages ${Math.floor(air.rounds)}`;
  if (air.phase !== "parked" && air.homeId == null && air.fuel != null) s += "  ·  NO AIRFIELD";
  return s;
}

/** Your own submarine: depth and air. */
function diveLine(d: NonNullable<EntityView["dive"]>, down: boolean): string {
  const air = `air ${Math.round((d.air / Math.max(1, d.airMax)) * 100)}%`;
  return `  ·  ${down ? "submerged" : "surfaced"}  ·  ${air}${d.winded ? " — recovering" : ""}`;
}

/** Your own Destroyer: the helicopter on the fantail and the mines on the rail. */
function aswLine(a: NonNullable<EntityView["asw"]>): string {
  const heli =
    a.heli === "up"
      ? "helicopter out"
      : a.heli === "lost"
        ? `new helicopter in ${Math.ceil(a.replace ?? 0)}s`
        : a.heli === "rearm"
          ? `helicopter loading${a.rearm != null ? ` ${Math.ceil(a.rearm)}s` : ""}`
          : "helicopter ready";
  return `  ·  ${heli}  ·  mines ${a.mines}/${a.minesMax}`;
}

/** Mode, and for your own drone the battery and a recall. */
function droneLine(d: NonNullable<EntityView["drone"]>): string {
  let s = `  ·  ${DRONE_MODE_LABEL[d.mode]}`;
  if (d.battery != null && d.batteryMax) s += `  ·  battery ${Math.round((d.battery / d.batteryMax) * 100)}%`;
  if (d.recall) s += "  ·  returning";
  return s;
}

/** The operator's drone: up, being built, or stowed with its charge. */
/** Jump Jet: flying or not, and for your own man the pack. */
function jetLine(j: NonNullable<EntityView["jet"]>): string {
  let s = j.alt > 0.5 ? "  ·  flying" : "";
  if (j.fuel != null && j.fuelMax) {
    s += `  ·  jet fuel ${Math.round((j.fuel / j.fuelMax) * 100)}%`;
    if (j.refuel != null) s += ` (refuel in ${Math.ceil(j.refuel)}s)`;
  }
  return s;
}

function droneLinkLine(l: NonNullable<EntityView["droneLink"]>): string {
  if (l.droneId != null) return `  ·  drone up (${DRONE_MODE_LABEL[l.mode]})`;
  if (l.rebuild != null) return `  ·  new drone in ${Math.ceil(l.rebuild)}s`;
  const pct = Math.round((l.charge / l.chargeMax) * 100);
  return `  ·  drone stowed ${pct}%${l.charge < l.launchMin ? " charging" : ""}`;
}

function beltLine(live: EntityView[]): string {
  const belt = live[0] ? beltOf(live[0].type) : null;
  if (!belt) return "Gatlings";
  const word = live[0]!.type === "submarine" ? "Torpedoes" : "Belt";
  if (live.length === 1) {
    const e = live[0]!;
    if ((e.reload ?? 0) > 0) return `Reloading ${e.reload!.toFixed(1)}s`;
    return `${word} ${e.clip ?? 0}/${belt.clip}`;
  }
  const reloading = live.filter((e) => (e.reload ?? 0) > 0).length;
  const rounds = live.reduce((n, e) => n + ((e.reload ?? 0) > 0 ? 0 : (e.clip ?? 0)), 0);
  const cap = belt.clip * live.length;
  return reloading ? `${word} ${rounds}/${cap} · ${reloading} reloading` : `${word} ${rounds}/${cap}`;
}

function infantryClipLine(live: EntityView[]): string {
  const gun = live[0] ? infantryGunFor(live[0]) : null;
  if (!gun) return "Small arms";
  if (gun.id === "daggers") return "Energy daggers — never run dry";
  if (gun.id === "penetrator") {
    const have = live.reduce((n, e) => n + (e.heavy ?? 0), 0);
    const cap = live.length;
    const arming = live.filter((e) => (e.heavy ?? 0) > 0 && (e.reload ?? 0) > 0);
    if (have <= 0) return `High penetration 0/${cap} — supply truck`;
    if (arming.length === live.length) return `Arming ${Math.max(...arming.map((e) => e.reload ?? 0)).toFixed(1)}s`;
    if (arming.length > 0) return `High penetration ${have}/${cap} · ${arming.length} arming`;
    return `High penetration ${have}/${cap}`;
  }
  if (live.length === 1) {
    const e = live[0]!;
    if ((e.reload ?? 0) > 0) return `Reloading ${e.reload!.toFixed(1)}s`;
    if (gun.id === "mg42") {
      if ((e.stance ?? "stand") !== "crawl" || e.swimming) return `Belt ${e.clip ?? 0}/${gun.clip} · crawl to fire`;
      if ((e.bipod ?? 0) > 0) return `Setting bipod ${(e.bipod ?? 0).toFixed(1)}s`;
      return `Belt ${e.clip ?? 0}/${gun.clip}`;
    }
    if (gun.id === "mortar") {
      if (e.swimming) return `Bombs ${e.clip ?? 0}/${gun.clip} · the tube stays dry`;
      if ((e.stance ?? "stand") !== "crouch") return `Bombs ${e.clip ?? 0}/${gun.clip} · kneel to plant`;
      if ((e.bipod ?? 0) > 0) return `Planting ${(e.bipod ?? 0).toFixed(1)}s`;
      return `Bombs ${e.clip ?? 0}/${gun.clip}`;
    }
    return `Clip ${e.clip ?? 0}/${gun.clip}`;
  }
  const reloading = live.filter((e) => (e.reload ?? 0) > 0).length;
  const rounds = live.reduce((n, e) => n + ((e.reload ?? 0) > 0 ? 0 : (e.clip ?? 0)), 0);
  const cap = gun.clip * live.length;
  return reloading ? `Clip ${rounds}/${cap} · ${reloading} reloading` : `Clip ${rounds}/${cap}`;
}

/** Titan pod switch. Off saves the rack; the main gun still fires. */
const ROCKET_MODES = [
  { id: "on", name: "Pods on", blurb: "Ripple four rockets at the target, then reload. Reaches planes in the air." },
  { id: "off", name: "Pods off", blurb: "Hold the rack. Only the main gun fires." },
] as const;

/** Nebelwerfer tube switch. The tubes are its only weapon, so off is hold fire. */
const LAUNCHER_MODES = [
  { id: "on", name: "Tubes on", blurb: "Stop, swing the frame on, and ripple twelve rockets at the target, then reload." },
  { id: "off", name: "Tubes off", blurb: "Hold fire and save the rack." },
] as const;

function rocketModesFor(type: EntityType): readonly { id: string; name: string; blurb: string }[] {
  return launcherOnlyOf(type) ? LAUNCHER_MODES : ROCKET_MODES;
}

function appendRocketRack(body: HTMLElement, type: EntityType): void {
  const pods = el("div", { class: "shell-rack" });
  for (const mode of rocketModesFor(type)) {
    pods.append(loadoutButton({ attr: "data-rockets", id: mode.id, name: mode.name, blurb: mode.blurb, count: "", on: false }));
  }
  body.append(el("div", { class: "tiny", text: "Rockets" }), pods);
}

function updateRocketRack(body: HTMLElement, type: EntityType, mine: EntityView[]): void {
  const left = mine.reduce((n, e) => n + (e.rockets ?? 0), 0);
  const cap = rocketAmmoOf(type) * mine.length;
  const on = mine.every((e) => !e.rocketsOff);
  const off = mine.every((e) => e.rocketsOff);
  for (const mode of rocketModesFor(type)) {
    const btn = body.querySelector(`[data-rockets="${mode.id}"]`);
    if (!(btn instanceof HTMLElement)) continue;
    updateLoadoutButton(btn, {
      count: mode.id === "on" ? `${left}/${cap}` : "",
      on: mode.id === "on" ? on : off,
      empty: mode.id === "on" && left <= 0,
    });
  }
}

function loadoutButton(opts: {
  attr: "data-shell" | "data-weapon" | "data-guns" | "data-selfdestruct" | "data-fielddivert" | "data-rockets" | "data-reach" | "data-payload";
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
  opts: { count: string; on: boolean; empty?: boolean; title?: string; locked?: boolean },
): void {
  btn.classList.toggle("is-on", opts.on);
  btn.classList.toggle("is-empty", !!opts.empty);
  if (opts.locked != null) {
    if (opts.locked) btn.setAttribute("aria-disabled", "true");
    else btn.removeAttribute("aria-disabled");
  }
  if (opts.title != null) btn.title = opts.title;
  const n = btn.querySelector(".shell-n");
  if (n && n.textContent !== opts.count) n.textContent = opts.count;
}

function infantryClipShown(e: EntityView, gunId: string): number {
  if (gunId === "penetrator") return e.heavy ?? 0;
  if (e.type === "rocketer" && gunId === "launcher") return e.clip ?? 0;
  const live = infantryGunFor(e);
  if (live?.id === gunId) return (e.reload ?? 0) > 0 ? 0 : (e.clip ?? 0);
  const gun = infantryLoadout(e.type).find((g) => g.id === gunId);
  return gun?.clip ?? 0;
}

const TYPE_ORDER: EntityType[] = [
  "fw190",
  "bv222",
  "he111",
  "horten",
  "stuka",
  "wasp",
  "scourge",
  "overseer",
  "gnat",
  "razorwing",
  "gasbag",
  "drifter",
  "harpy",
  "moth",
  "drone",
  "aswheli",
  "warden",
  "apocalypse",
  "ss3",
  "jagdtiger",
  "feuerwirbel",
  "walker",
  "behemoth",
  "juggernaut",
  "stalker",
  "siphon",
  "ravager",
  "mawcaster",
  "broodmother",
  "matriarch",
  "goretusk",
  "mantis",
  "bileworm",
  "skitter",
  "sporemaw",
  "cyborg",
  "xenodrone",
  "thrall",
  "lancer",
  "spitter",
  "shade",
  "weaver",
  "cyborgcommander",
  "simunit2",
  "titan",
  "mammoth",
  "nebelwerfer",
  "artillery",
  "supply",
  "hauler",
  "gunboat",
  "leech",
  "lurker",
  "leviathan",
  "spineback",
  "abyssray",
  "driftjelly",
  "broodbarge",
  "supplyboat",
  "submarine",
  "battleship",
  "destroyer",
  "lst",
  "rifleman",
  "gunner",
  "sniper",
  "atinfantry",
  "rocketer",
  "pyro",
  "mortarman",
  "engineer",
  "medic",
  "droneop",
  "jumpjet",
  "gobber",
  "spawnling",
  "quillback",
  "bloater",
  "longspine",
  "mender",
  "sandbags",
  "wall",
  "greatwall",
  "gate",
  "teeth",
  "trench",
  "rig",
  "seed",
  "sporepod",
  "core",
  "hivecore",
  "broodheart",
  "lumenbulb",
  "gorger",
  "broodnest",
  "gestator",
  "roost",
  "tidewomb",
  "braincoral",
  "thornspitter",
  "bilelance",
  "puffcap",
  "eyestalk",
  "husk",
  "dynamo",
  "fusionnode",
  "smelter",
  "assimilator",
  "muster",
  "armory",
  "airfield",
  "aerie",
  "dock",
  "spawnpool",
  "ciws",
  "research",
  "radar",
  "cyborgcentral",
  "conversion",
  "bunker",
  "tobruk",
  "casemate",
  "tower",
  "hochstand",
  "leitturm",
  "spotlight",
  "mgnest",
  "pak36",
  "pak43",
  "flak",
  "ram",
  "cottage",
  "shack",
  "house",
  "barn",
  "inn",
  "chapel",
  "manor",
  "warehouse",
  "granary",
  "factory",
  "foundry",
  "hall",
  "works",
  "shed",
  "boiler",
];

function selectedViews(ctx: Ctx, view: MapView | null): EntityView[] {
  if (!ctx.match || !view) return [];
  return ctx.match.entities.filter((e) => view.selected.has(e.id));
}

function selectedOfType(ctx: Ctx, view: MapView | null, type: EntityType | null): EntityView[] {
  if (!type) return [];
  return selectedViews(ctx, view).filter((e) => e.type === type);
}

/** A bunker, tower, house, or trench you occupy and have not shuttered. */
function garrisonForceHosts(you: string, selected: EntityView[]): EntityView[] {
  return selected.filter(
    (e) =>
      e.hp > 0 &&
      !e.wreck &&
      !isTransportType(e.type) &&
      e.garrison?.ownerId === you &&
      (e.garrison.count ?? 0) > 0 &&
      !e.garrison.hide,
  );
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
  if (focus.type === "walker") {
    parts.push("gatling");
    if (mine.length > 0) parts.push("charge");
  }
  else if (isTransportType(focus.type)) parts.push(mine.length > 0 ? "payload" : "transport");
  else if (hasAmmo(focus.type)) parts.push("ammo");
  if (rocketsOf(focus.type) && mine.length > 0) parts.push("rockets");
  else if (isInfantryType(focus.type)) {
    parts.push("inf", infantryLoadout(focus.type).map((g) => g.id).join("+"));
    if (mine.length > 0 && infantryLoadout(focus.type).length > 0) parts.push("guns");
    if (mine.length > 0 && hasForceField(focus.type)) parts.push("divert");
  } else if (beltOf(focus.type)) parts.push("belt");
  else if (focus.kind === "unit" && def.damage > 0) parts.push("smallarms");
  if (isInfantryType(focus.type)) parts.push("posture");
  if (hasMg(focus.type)) parts.push("mg");
  if (hasScout(focus.type)) parts.push("scout");
  if (armorLabel(focus.type)) parts.push("armor");
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
        text: `Impassable hull. An engineer cuts it up for ${wreckScrapOf(focus.type)} scrap.`,
      }),
    );
    return;
  }
  const def = catalog(focus.type);
  const mine = live.filter((e) => e.ownerId === you);
  body.append(el("div", { class: "config-kicker", attrs: { "data-field": "kicker" } }));
  if (focus.type === "walker") {
    const rack = el("div", { class: "shell-rack" });
    for (const mode of WALKER_GUN_MODES) {
      rack.append(
        loadoutButton({
          attr: "data-guns",
          id: String(mode.guns),
          name: mode.name,
          blurb: mode.blurb,
          count: "0",
          on: false,
        }),
      );
    }
    body.append(el("div", { class: "tiny", text: "Gatling" }), rack);
    if (mine.length > 0) {
      const charge = el("div", { class: "shell-rack" });
      for (const mode of WALKER_SELF_DESTRUCT_MODES) {
        charge.append(
          loadoutButton({
            attr: "data-selfdestruct",
            id: mode.id,
            name: mode.name,
            blurb: mode.blurb,
            count: "",
            on: false,
          }),
        );
      }
      body.append(el("div", { class: "tiny", text: "Self destroy" }), charge);
    }
    body.append(el("p", { class: "tiny", attrs: { "data-field": "clip" } }));
  } else if (isTransportType(focus.type)) {
    if (mine.length > 0) {
      const rack = el("div", { class: "shell-rack" });
      for (const id of AIR_DROPS) {
        const d = AIR_DROP_INFO[id];
        rack.append(loadoutButton({ attr: "data-payload", id, name: d.name, blurb: d.blurb, count: "", on: false }));
      }
      body.append(el("div", { class: "tiny", text: "Load (change on the pad)" }), rack);
    }
    body.append(el("p", { class: "tiny", attrs: { "data-field": "cargo" } }));
  } else if (hasAmmo(focus.type)) {
    const rack = el("div", { class: "shell-rack" });
    const table = shellsFor(focus.type);
    for (const id of SHELL_TYPES) {
      if (!carriesShell(focus.type, id)) continue;
      const s = table[id];
      rack.append(loadoutButton({ attr: "data-shell", id, name: s.name, blurb: s.blurb, count: "0", on: false }));
    }
    body.append(el("div", { class: "tiny", text: "Shell" }), rack);
    if (rocketsOf(focus.type) && mine.length > 0) appendRocketRack(body, focus.type);
  } else if (launcherOnlyOf(focus.type)) {
    if (mine.length > 0) appendRocketRack(body, focus.type);
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
    if (hasForceField(focus.type) && mine.length > 0) {
      const power = el("div", { class: "shell-rack" });
      for (const mode of COMMANDER_FIELD_MODES) {
        power.append(
          loadoutButton({ attr: "data-fielddivert", id: mode.id, name: mode.name, blurb: mode.blurb, count: "", on: false }),
        );
      }
      body.append(el("div", { class: "tiny", text: "Power" }), power);
    }
    if (loadout.length > 0) body.append(el("p", { class: "tiny", attrs: { "data-field": "clip" } }));
  } else if (beltOf(focus.type)) {
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
  if (radarLaidOf(focus.type) && mine.length > 0) {
    const reach = el("div", { class: "shell-rack" });
    for (const mode of RADAR_RANGE_MODES) {
      reach.append(loadoutButton({ attr: "data-reach", id: mode.id, name: mode.name, blurb: mode.blurb, count: "", on: false }));
    }
    body.append(el("div", { class: "tiny", text: "Reach" }), reach);
  }
  if (hasMg(focus.type) || gatlingHeatOf(focus.type)) {
    body.append(el("div", { class: "tiny", attrs: { "data-field": "mg-label" } }));
    const bar = el("div", { class: "mg-heat", attrs: { "data-field": "mg-heat" } });
    bar.append(el("span"));
    body.append(bar);
  }
  if (hasScout(focus.type)) body.append(el("p", { class: "tiny", attrs: { "data-field": "scout" } }));
  if (armorLabel(focus.type)) body.append(el("p", { class: "tiny", attrs: { "data-field": "armor" } }));
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
  if (focus.type === "walker") {
    const mine = live.filter((e) => e.ownerId === you);
    const guns = mine.length > 0 ? (mine[0]!.guns === 2 ? 2 : 1) : 1;
    const same = mine.every((e) => (e.guns === 2 ? 2 : 1) === guns);
    for (const mode of WALKER_GUN_MODES) {
      const btn = body.querySelector(`[data-guns="${mode.guns}"]`);
      if (!(btn instanceof HTMLElement)) continue;
      const left = mine.reduce((n, ent) => n + (ent.clip ?? 0), 0);
      const perWalker = mine.length > 0 ? left / mine.length : 0;
      updateLoadoutButton(btn, {
        count: `${Math.floor(perWalker / ((WALKER_ONE_BURST * mode.guns) / TICK_DT))}s`,
        on: same && guns === mode.guns,
        empty: left <= 0,
      });
    }
    const chargeOn = mine.length > 0 && mine.every((ent) => ent.selfDestruct !== false);
    const chargeOff = mine.length > 0 && mine.every((ent) => ent.selfDestruct === false);
    for (const mode of WALKER_SELF_DESTRUCT_MODES) {
      const btn = body.querySelector(`[data-selfdestruct="${mode.id}"]`);
      if (!(btn instanceof HTMLElement)) continue;
      updateLoadoutButton(btn, { count: "", on: mode.id === "on" ? chargeOn : chargeOff });
    }
    setField(body, "clip", beltLine(live));
  } else if (isTransportType(focus.type)) {
    const mine = live.filter((e) => e.ownerId === you && e.air);
    const load = mine[0]?.air?.payload;
    const same = mine.length > 0 && mine.every((e) => e.air?.payload === load);
    const parked = mine.some((e) => e.air?.phase === "parked");
    const aboard = mine.some((e) => (e.air?.troops ?? 0) > 0);
    for (const id of AIR_DROPS) {
      const btn = body.querySelector(`[data-payload="${id}"]`);
      if (!(btn instanceof HTMLElement)) continue;
      const on = same && load === id;
      const troops = mine.reduce((n, e) => n + (e.air?.payload === "troops" ? (e.air.troops ?? 0) : 0), 0);
      const loaded = mine.filter((e) => e.air?.payload === id && (e.air.bombs ?? 0) > 0).length;
      const info = AIR_DROP_INFO[id];
      const locked = aboard && id !== "troops";
      updateLoadoutButton(btn, {
        count: !on ? "" : id === "troops" ? `${troops}/${BV222_TROOPS * mine.length}` : `${loaded}/${mine.length}`,
        on,
        empty: (!on && !parked) || locked,
        locked,
        title: locked ? `${info.name} — Unload the plane before changing the load.` : `${info.name} — ${info.blurb}`,
      });
    }
    const lines = mine.map((e) => {
      const a = e.air!;
      if (a.payload === "troops") return `${a.troops ?? 0} aboard`;
      const name = AIR_DROP_INFO[a.payload ?? "mines"].name;
      return (a.bombs ?? 0) > 0 ? `${name} loaded` : a.phase === "parked" ? `${name} loading…` : `${name} dropped`;
    });
    setField(
      body,
      "cargo",
      mine.length === 0
        ? "Transport"
        : `${[...new Set(lines)].join("  ·  ")}  ·  Force-attack the ground to drop.`,
    );
  } else if (hasAmmo(focus.type)) {
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
    if (rocketsOf(focus.type) && shells.length > 0) updateRocketRack(body, focus.type, shells);
  } else if (launcherOnlyOf(focus.type)) {
    const mine = live.filter((e) => e.ownerId === you);
    if (mine.length > 0) updateRocketRack(body, focus.type, mine);
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
          empty: locked || (gun.id === "penetrator" && left <= 0),
          title: locked ? `${gun.name} — broken arm. ${gun.blurb}` : `${gun.name} — ${gun.blurb}`,
        });
      }
    }
    if (hasForceField(focus.type) && mine.length > 0) {
      const shield = mine.every((e) => e.fieldDivert);
      const laser = mine.every((e) => !e.fieldDivert);
      for (const mode of COMMANDER_FIELD_MODES) {
        const btn = body.querySelector(`[data-fielddivert="${mode.id}"]`);
        if (!(btn instanceof HTMLElement)) continue;
        updateLoadoutButton(btn, { count: "", on: mode.id === "field" ? shield : laser });
      }
    }
    if (loadout.length > 0) setField(body, "clip", infantryClipLine(live));
  } else if (beltOf(focus.type)) {
    setField(body, "clip", beltLine(live));
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
        ? "Swimming — small arms stay dry until they reach shore."
        : focus.type === "gunner"
          ? "Crawl and set the bipod. The MG42 fires only from the prone."
          : focus.type === "sniper"
            ? "Scoped rifle. He sees farther. Crouch or crawl to tighten the shot. A broken arm puts the rifle down."
            : focus.type === "atinfantry"
              ? "PTRD-41. Same reach as the sniper. Tank side and rear up close, light armor farther out. A broken arm puts the rifle down."
              : focus.type === "rocketer"
              ? "The tube reloads off his back. Loose at full reach, tighter as the target closes. High penetration is one missile: faster, accurate at long range, and it wrecks armor. Fitting it takes a few seconds unless it is already loaded. He fires that round only when you order the shot. A supply truck brings another. A broken arm puts the tube down."
              : focus.type === "pyro"
              ? "Flamethrower: a few strides of reach. The tanks hold four bursts and a short one, and only a supply truck refills them. The jet burns every soldier in its path, his own too, and the ground stays alight from just in front of him out to the target. Trees in the way burn down. Over sandbags and in through windows. A broken arm puts the lance down; if he is killed the tanks may go up."
              : focus.type === "mortarman"
              ? "Kneel and plant the tube. The bomb lobs past what he can see. Too close and it will not drop."
              : focus.type === "medic"
                ? "No weapon. He walks to a wounded soldier nearby and closes the wound. A long kneel sets a broken arm or leg. The bag does not run out."
              : focus.type === "cyborg"
                ? "Stands under fire — no crouch, no prone. Near death the legs tear off and he drags himself on, still firing. A medic or an engineer brings the legs back. Only a supply truck refills the drum. He shells a structure; he does not capture it."
              : focus.type === "simunit2"
                ? "Stands under fire — no crouch, no prone. A dagger in each hand: one slash kills a soldier at arm's reach, and he blinks onto the one he goes for when the charge is up; a Walker or a truck takes a slit, a tank or a wall almost nothing. Blink throws him across the ground on one charge that comes back by itself. Right-click a structure or hull with enemy soldiers inside and he blinks in, kills every soldier aboard in a couple of seconds, and blinks out. Shut down and he stands dark as no one's machine until you power him up. Near death the legs tear off and he drags himself on, still cutting. He shells nothing and captures nothing."
              : focus.type === "thrall"
                ? "Stands under fire — no crouch, no prone, and it always runs. Two armoured fists: a soldier at arm's reach is pummelled down in a few fast blows; a wall takes little. An armored hull it reaches, it detonates against and is gone. It vaults sandbags and walls. A bullet now and then catches its shoulder and staggers it for a moment. Near death the legs tear off and it drags itself on, still swinging. It shells nothing and captures nothing."
              : focus.type === "cyborgcommander"
                ? "Stands under fire — no crouch, no prone. The blue bar is his force field: it takes every hit first and comes back on after a while out of the fire. Power: Shield puts the laser's power into it, five times the points and five times the recharge, but he cannot attack. His plating mends itself, very slowly. The laser always cuts to full reach: a sweep across soldiers burns every man it passes, yours too, and one beam cuts a hull and anyone in front of it. Trees in the path burn down. Near death the legs tear off and he drags himself on, still firing. He shells a structure; he does not capture it."
              : "Capture player structures at point-blank. Civilian houses are garrisoned, not captured.",
    );
  }
  if (radarLaidOf(focus.type)) {
    const mine = live.filter((e) => e.ownerId === you);
    const max = mine.length > 0 && mine.every((e) => e.longRange);
    const normal = mine.length > 0 && mine.every((e) => !e.longRange);
    for (const mode of RADAR_RANGE_MODES) {
      const btn = body.querySelector(`[data-reach="${mode.id}"]`);
      if (btn instanceof HTMLElement) updateLoadoutButton(btn, { count: "", on: mode.id === "max" ? max : normal });
    }
  }
  if (hasMg(focus.type) || gatlingHeatOf(focus.type)) {
    const mine = live.filter((e) => e.ownerId === you);
    // A gatling without a coaxial belt feeds from its clip (the Walker's rack, the Cyborg's drum, the CIWS belt).
    // A bow flamer's fuel rides in the coaxial slot, so its turret gatlings feed from the clip too.
    const flamer = hullFlamerOf(focus.type);
    const coax = hasMg(focus.type) && !flamer;
    const belt = mine.reduce((n, e) => n + (coax ? (e.mgAmmo ?? 0) : (e.clip ?? 0)), 0);
    // Twin CIWS mounts heat apart: the bar shows the hotter one, and either locking reads as overheated.
    const heatOf = (e: EntityView) => (e.mounts ? Math.max(0, ...e.mounts.map((m) => m.heat ?? 0)) : (e.mgHeat ?? 0));
    const heat = mine.length ? mine.reduce((n, e) => n + heatOf(e), 0) / mine.length : 0;
    const hot = mine.some((e) => (e.mounts ? e.mounts.some((m) => m.hot) : (e.mgOverheat ?? 0) > 0));
    const beltName = roofCiwsOf(focus.type) || focus.type === "ciws" ? "20mm" : coax ? "MG" : "Gatling";
    const fuel = flamer ? `  ·  Fuel ${mine.reduce((n, e) => n + (e.mgAmmo ?? 0), 0)}` : "";
    setField(body, "mg-label", (hot ? `${beltName}  ${belt}  overheated` : `${beltName}  ${belt}`) + fuel);
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
  const spec = specialLabel(focus.type, live.length > 0 && live.every((e) => e.braced));
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

function paintGarrisonRoster(ctx: Ctx, view: MapView | null): void {
  const root = document.getElementById("garrison-roster");
  const panel = document.getElementById("garrison-panel");
  if (!root || !panel) return;
  const hosts = new Map<number, EntityView>();
  if (ctx.match && view) {
    for (const e of selectedViews(ctx, view)) {
      if ((e.garrison?.count ?? 0) > 0 && e.hp > 0) hosts.set(e.id, e);
    }
  }
  const seats = ctx.match ? garrisonRoster(ctx.match.entities, new Set(hosts.keys())) : [];
  panel.classList.toggle("hidden", seats.length === 0);
  if (seats.length > 0) {
    const head = document.getElementById("garrison-head");
    const host = hosts.size === 1 ? [...hosts.values()][0] : null;
    const text = host
      ? `${catalog(host.type).name}  ${host.garrison?.count ?? seats.length}/${host.garrison?.cap ?? seats.length}`
      : `Garrison  ${seats.length}`;
    if (head && head.textContent !== text) head.textContent = text;
    const cols = seats.length > 5 ? "2" : "1";
    if (root.dataset.cols !== cols) root.dataset.cols = cols;
  }
  const you = ctx.match?.youPlayerId;
  const ids = new Set(seats.map((s) => s.id));
  const mine = new Set<number>();
  const hostOf = new Map<number, number>();
  if (ctx.match && ids.size) {
    for (const e of ctx.match.entities) {
      if (!ids.has(e.id)) continue;
      if (e.ownerId === you) mine.add(e.id);
      if (e.garrisonedIn != null) hostOf.set(e.id, e.garrisonedIn);
    }
  }
  const sig = seats.map((s) => s.id).join(",");
  if (root.dataset.seats !== sig) {
    root.dataset.seats = sig;
    root.replaceChildren(...seats.map(garrisonSeatNode));
  }
  const nodes = root.children;
  for (let i = 0; i < seats.length; i++) {
    const node = nodes[i] as HTMLElement | undefined;
    const seat = seats[i];
    if (!node || !seat) continue;
    const host = hosts.get(hostOf.get(seat.id) ?? -1);
    patchGarrisonSeat(node, seat, mine.has(seat.id), host ? !!tankDeckOf(host.type) : false);
  }
  syncCommandTip();
}

function garrisonSeatNode(seat: GarrisonSeat): HTMLElement {
  const node = el("div", { class: "garrison-seat", attrs: { "data-id": String(seat.id), role: "button" } });
  const cameo = el("div", { class: "config-type", attrs: { "data-type": seat.type } });
  cameo.append(el("span", { class: "seat-exit", html: commandIconSvg("ungarrison") }));
  const bars = el("div", { class: "seat-bars" });
  const hp = el("span", { class: "seat-track" });
  hp.append(el("span", { class: "seat-hp" }));
  const primary = el("span", { class: "seat-track" });
  primary.append(el("span", { class: "seat-ammo" }));
  const secondary = el("span", { class: "seat-track" });
  secondary.append(el("span", { class: "seat-ammo is-secondary" }));
  bars.append(hp, primary, secondary);
  node.append(cameo, bars);
  return node;
}

function patchGarrisonSeat(node: HTMLElement, seat: GarrisonSeat, mine: boolean, deck: boolean): void {
  const name = catalog(seat.type).name;
  const tip = mine
    ? deck
      ? "Click: this one goes ashore down the ramp. The bow must be on the beach."
      : "Click: this one leaves; the rest stay inside."
    : "An ally's soldier.";
  setTip(node, name, tip, undefined, "right");
  node.dataset.mine = mine ? "1" : "0";
  node.setAttribute("aria-label", mine ? `${name}: send out` : name);
  node.classList.toggle("is-foreign", !mine);
  const cameo = node.querySelector(".config-type");
  if (cameo instanceof HTMLElement && cameo.dataset.type !== seat.type) cameo.dataset.type = seat.type;
  const hp = node.querySelector(".seat-hp");
  if (hp instanceof HTMLElement) {
    hp.style.width = `${Math.round(seat.hp * 100)}%`;
    hp.classList.toggle("is-mid", seat.tone === "mid");
    hp.classList.toggle("is-low", seat.tone === "low");
  }
  const tracks = node.querySelectorAll(".seat-track");
  for (let i = 1; i < tracks.length; i++) {
    const track = tracks[i];
    const fill = track?.querySelector(".seat-ammo");
    const value = seat.ammo[i - 1];
    if (!(track instanceof HTMLElement) || !(fill instanceof HTMLElement)) continue;
    if (value == null) {
      track.hidden = true;
      continue;
    }
    track.hidden = false;
    fill.style.width = `${Math.round(value * 100)}%`;
  }
}

/** Tooltip text lives on the element; one shared box shows it on hover. */
function setTip(node: HTMLElement, title: string, body: string, key?: string, side: "top" | "right" = "top"): void {
  if (node.dataset.tipTitle !== title) node.dataset.tipTitle = title;
  if (node.dataset.tip !== body) node.dataset.tip = body;
  if ((node.dataset.tipKey ?? "") !== (key ?? "")) {
    if (key) node.dataset.tipKey = key;
    else delete node.dataset.tipKey;
  }
  if (node.dataset.tipSide !== side) node.dataset.tipSide = side;
  if (tipAnchor === node) showCommandTip(node);
}

let tipAnchor: HTMLElement | null = null;

function bindCommandTips(wrap: HTMLElement, tip: HTMLElement): void {
  tipAnchor = null;
  tip.classList.remove("is-shown");
  wrap.addEventListener("pointerover", (e) => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-tip-title]");
    if (!target || !wrap.contains(target)) return;
    showCommandTip(target);
  });
  wrap.addEventListener("pointerout", (e) => {
    if (!tipAnchor) return;
    const to = e.relatedTarget as Node | null;
    if (to && tipAnchor.contains(to)) return;
    hideCommandTip();
  });
  wrap.addEventListener("pointerdown", () => hideCommandTip(), { capture: true });
}

function showCommandTip(anchor: HTMLElement): void {
  const tip = document.getElementById("cmd-tip");
  const wrap = tip?.parentElement;
  if (!tip || !wrap) return;
  tipAnchor = anchor;
  const head = el("div", { class: "cmd-tip-head" });
  head.append(el("span", { class: "cmd-tip-title", text: anchor.dataset.tipTitle ?? "" }));
  if (anchor.dataset.tipKey) head.append(el("kbd", { class: "cmd-tip-key", text: anchor.dataset.tipKey }));
  const parts: HTMLElement[] = [head];
  if (anchor.dataset.tip) parts.push(el("div", { class: "cmd-tip-body", text: anchor.dataset.tip }));
  tip.replaceChildren(...parts);
  tip.classList.add("is-shown");
  const box = wrap.getBoundingClientRect();
  const at = anchor.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  let left: number;
  let top: number;
  if (anchor.dataset.tipSide === "right") {
    left = at.right - box.left + 8;
    top = at.top - box.top + at.height / 2 - h / 2;
  } else {
    left = at.left - box.left + at.width / 2 - w / 2;
    top = at.top - box.top - h - 8;
  }
  left = Math.max(6, Math.min(box.width - w - 6, left));
  top = Math.max(6, Math.min(box.height - h - 6, top));
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function hideCommandTip(): void {
  tipAnchor = null;
  document.getElementById("cmd-tip")?.classList.remove("is-shown");
}

/** A rebuilt bar can drop the hovered button without a pointerout. */
function syncCommandTip(): void {
  if (tipAnchor && !tipAnchor.isConnected) hideCommandTip();
}

function paintQuickActions(ctx: Ctx, view: MapView | null): void {
  const root = document.getElementById("quick-actions");
  if (!root || !ctx.match) return;
  const groups = groupCommands(listQuickActions(ctx, view));
  const sig = groups.map((g) => `${g.id}:${g.items.map((i) => i.slot).join(",")}`).join("|");
  if (root.dataset.sig !== sig) {
    root.dataset.sig = sig;
    root.replaceChildren(
      ...groups.map((g) => {
        const group = el("div", { class: "cmd-group", attrs: { "data-group": g.id, role: "group", "aria-label": g.label } });
        const btns = el("div", { class: "cmd-group-btns" });
        btns.append(...g.items.map(makeQact));
        group.append(el("span", { class: "cmd-group-label", text: g.label }), btns);
        return group;
      }),
    );
    syncCommandTip();
    return;
  }
  const nodes = root.querySelectorAll<HTMLElement>(".qact");
  const items = groups.flatMap((g) => g.items);
  for (let i = 0; i < items.length; i++) {
    const node = nodes[i];
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
  /** The one thing the player is being asked to do now: lit up so it cannot be missed. */
  urgent?: boolean;
  /** Icon key in command-bar.ts; defaults to the act. */
  icon?: string;
  /** Show this unit or building's cameo instead of an icon. */
  cameo?: EntityType;
  /** Small count in the corner, e.g. mines left. */
  badge?: string;
}

function listQuickActions(ctx: Ctx, view: MapView | null): QAct[] {
  if (!ctx.match) return [];
  const out: QAct[] = [];
  if (view?.fieldPending()) {
    out.push({
      slot: "confirm-field",
      act: "confirm-field",
      label: "Confirm placement",
      title: `Lay the line as drawn (${FIELD_CONFIRM_KEY}). Click to add another leg; right-click takes the last leg back; Esc drops the line.`,
      urgent: true,
    });
  }
  const selected = selectedViews(ctx, view);
  const units = ownCommandable(ctx, selected.filter((e) => e.kind === "unit"));
  const buildings = ownCommandable(ctx, selected.filter((e) => e.kind === "building"));
  const houses = selected.filter((e) => isGarrisonable(e.type) && e.hp > 0);
  const you = ctx.match.youPlayerId;
  const garrisonForce = garrisonForceHosts(you, houses);
  // A CIWS, a RAM, or a crewed gun aims its own gun: it takes Stop, Force attack, and Rotate like a unit.
  const mounts = buildings.filter((e) => aimsOwnGun(e.type));
  const lamps = buildings.filter((e) => hasSpotlight(e.type) && e.spotFacing != null);
  if (units.length === 0 && buildings.length === 0 && houses.length === 0) return out;

  // A gate locks and unlocks. It is built from the Defences tab.
  const gates = buildings.filter((e) => e.gate);
  if (gates.length) {
    const locked = gates.every((g) => g.gate?.locked);
    out.push({
      slot: "gate-lock",
      act: "gate-lock",
      label: locked ? "Unlock gate" : "Lock gate",
      title: locked
        ? "Let the boom lift again for your side."
        : "Drop the boom and keep it down: nothing passes, and a padlock shows over the gate.",
      on: locked,
    });
  }

  if (units.length || mounts.length || garrisonForce.length || lamps.length) {
    const stopTitle = units.length
      ? `Halt selected units (${STOP_HOTKEY.toUpperCase()})`
      : lamps.length && mounts.length === 0 && garrisonForce.length === 0
        ? `Stop the spotlight (${STOP_HOTKEY.toUpperCase()})`
        : `Drop the forced aim and pick targets again (${STOP_HOTKEY.toUpperCase()})`;
    out.push({
      slot: "stop",
      act: "stop",
      label: "Stop",
      title: stopTitle,
    });
  }
  if (units.length) {
    out.push({
      slot: "attackmove",
      act: "attackmove",
      label: "Move attack",
      title: `Move, halt to fire (${ATTACK_MOVE_HOTKEY.toUpperCase()})`,
      on: !!view?.attackMoveMode,
    });
  }
  if (units.length || lamps.length) {
    const patrolTitle = units.length
      ? `Place points, right-click to finish. Click a point already placed to close a loop and circle it; otherwise they walk the points and back. They fight enemies along that path (${PATROL_HOTKEY.toUpperCase()})${lamps.length ? " A tower turns its spotlight the same way." : ""}`
      : `Place points, right-click to finish. Click a point already placed to close a loop; otherwise the spotlight goes out and back (${PATROL_HOTKEY.toUpperCase()})`;
    out.push({
      slot: "patrol",
      act: "patrol",
      label: "Patrol",
      title: patrolTitle,
      on: !!view?.patrolMode,
    });
  }
  if (units.length > 0 && units.every((e) => isTransportType(e.type))) {
    out.push({
      slot: "forceattack",
      act: "forceattack",
      label: "Drop here",
      title: "Fly over a point and drop the load: mines, a supply crate, or the paratroops (hold Ctrl and click).",
      icon: "drop",
      on: !!view?.forceAttackMode,
    });
  } else if (units.length || mounts.length || garrisonForce.length) {
    out.push({
      slot: "forceattack",
      act: "forceattack",
      label: "Force attack",
      title:
        "Fire at a point or any unit, including friendlies (hold Ctrl and click). Every selected gun in range fires at that point, even if it cannot see it. Soldiers inside a selected garrison shoot too, when they can reach. Smoke fires once. A Move given afterwards keeps the aim while the guns can still reach it and bear on it from the course.",
      on: !!view?.forceAttackMode,
    });
  }
  // Hold and rotate mean nothing to a plane. Guard does: it fights the area, lands when the ammo is gone, and comes back.
  const grounded = units.some((e) => !e.air);
  const plane = units.some((e) => !!e.air && !e.drone);
  if (grounded || plane || units.some((e) => e.drone)) {
    const guarding = units.every((e) => e.guardFacing != null || e.guardTargetId != null);
    const title = grounded
      ? `Move here, face a direction, hold. Click a friendly unit to stay with it (${GUARD_HOTKEY.toUpperCase()}). Click and drag to face.`
      : plane
        ? `Guard this area. When the ammo is gone the plane lands, rearms to a full load, and comes back (${GUARD_HOTKEY.toUpperCase()}).`
        : `Circle this spot, or over a friendly unit (${GUARD_HOTKEY.toUpperCase()}). Surveillance circles wide and slow; Search & Destroy dives on the first enemy it sees.`;
    out.push({
      slot: "guard",
      act: "guard",
      label: "Guard",
      title,
      on: !!(view?.guardMode || guarding),
    });
  }
  if (grounded) {
    const holding = units.every((e) => e.holdPosition);
    out.push({
      slot: "hold",
      act: "hold",
      label: "Hold",
      title: "Hold position — fire in range, no chase, no withdraw (P)",
      on: holding,
    });
    const xenos = units.filter((e) => isCyborg(e.type));
    if (xenos.length) {
      out.push({
        slot: "engage",
        act: "engage",
        label: "Engage",
        title: "Engage contacts — fire on what thermal and APS radar read, out of sight but in range",
        on: xenos.every((e) => e.engageContacts),
      });
    }
    out.push({
      slot: "rotate",
      act: "rotate",
      label: "Rotate",
      title: `Face a direction (${ROTATE_HOTKEY.toUpperCase()}). Tanks turn hull and turret.`,
      on: !!view?.rotateMode && !view.rotateLight,
    });
    const lampUnits = units.filter((e) => hasSpotlight(e.type) && e.spotFacing != null);
    if (lampUnits.length) {
      const titanOnly = lampUnits.every((e) => e.type === "titan");
      // A Titan on the march keeps its lamp on its own sweep; the order waits for it to stand.
      const underway = lampUnits.every((e) => lampUnderway(e));
      out.push({
        slot: "rotate-light",
        act: "rotate-light",
        label: "Rotate light",
        title: titanOnly
          ? "Hold the torso lamp on a spot: click where it should point. Left alone it sweeps a little either side of the nose. At night its beam lights the ground far out; up on the leg jets it lights one wide pool ahead. It turns with the Titan, and goes back to sweeping once the Titan moves."
          : "Swing the searchlight, then click where it should point. At night its beam lights the water far out. It turns with the ship.",
        on: !!view?.rotateMode && !!view.rotateLight,
        disabled: underway,
      });
    }
  } else if (mounts.length) {
    out.push({
      slot: "rotate",
      act: "rotate",
      label: "Rotate",
      title: `Rest the gun on a heading between targets (${ROTATE_HOTKEY.toUpperCase()}).`,
      on: !!view?.rotateMode,
    });
  } else if (lamps.length) {
    out.push({
      slot: "rotate",
      act: "rotate",
      label: "Rotate",
      title: `Swing the spotlight (${ROTATE_HOTKEY.toUpperCase()}). At night its beam lights the ground far out.`,
      on: !!view?.rotateMode,
    });
  }
  if (units.some((e) => e.type === "engineer")) {
    out.push({
      slot: "field-sandbags",
      act: "field-sandbags",
      label: "Sandbags",
      title: "Build sandbags. Scroll to turn. Click to set one, or drag a line; keep clicking to add legs round corners, then Confirm.",
      on: view?.fieldPlace === "sandbags",
    });
    out.push({
      slot: "field-teeth",
      act: "field-teeth",
      label: "Obstacle",
      title: "Build concrete pyramids that stop vehicles. Scroll to turn. Click to set one, or drag a line; keep clicking to add legs, then Confirm.",
      on: view?.fieldPlace === "teeth",
    });
    if (!isHiddenField("greatwall")) {
      out.push({
        slot: "field-greatwall",
        act: "field-greatwall",
        label: "Large wall",
        title:
          "Build a tall concrete wall with firing slits. Two infantry garrison each section and fire from it with triple health. Laid like the wall: drag, keep clicking round corners, then Confirm. One job; it appears when the engineer finishes.",
        on: view?.fieldPlace === "greatwall",
      });
    }
    for (const building of ENGINEER_BUILDINGS) {
      const def = catalog(building);
      out.push({
        slot: "construct-" + building,
        act: "construct-" + building,
        label: def.name,
        title:
          building === "dock"
            ? `Raise a ${def.name} on open water, any distance from the yard, for ${def.cost} scrap. Every tile under it must be water; he swims out to the site. He pays when he starts and works ${Math.round(engineerBuildSeconds(building))}s. It trains boats there and pushes your build range out to it.`
            : `Raise a ${def.name} on a scrap field, any distance from the yard, for ${def.cost} scrap. Click the field with at least half the footprint on scrap. He pays when he starts and works ${Math.round(engineerBuildSeconds(building))}s. It pours ${SMELTER_SCRAP_PER_SEC} scrap a second and pushes your build range out to it.`,
        on: view?.constructPlace === building,
        cameo: building,
      });
    }
    for (const bridge of BRIDGES_HIDDEN ? [] : BRIDGE_TYPES) {
      const def = catalog(bridge);
      const wide = bridge === "bigbridge" ? "two tanks" : "one tank";
      out.push({
        slot: "bridge-" + bridge,
        act: "bridge-" + bridge,
        label: def.name,
        title: `Bridge water ${wide} wide. Draw it like a wall, from one shore across: click each corner, Enter lays it. He lays it brick by brick, ${bridgeCost(bridge)} scrap a brick (${bridgeCostPerTile(bridge) * TILE_SUBDIV} a cell), paid as he starts each one. Anyone can cross it. Only a force-attack fires on it; a brick shot down drops into the water and an engineer rebuilds it.`,
        on: view?.bridgePlace === bridge,
        badge: bridge === "bigbridge" ? "2" : undefined,
      });
    }
  }
  const inf = units.filter((e) => isInfantryType(e.type) && e.type !== "engineer" && !isCyborg(e.type));
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
  const specialUnits = units.filter((e) => specialOf(e.type) && specialReady(e.type, e.state, e.specialCooldown ?? 0));
  if (specialUnits.length > 0) {
    // A braced Titan's special pulls the outriggers up.
    const pack = specialUnits.every((e) => e.braced);
    out.push({
      slot: "deploy",
      act: "deploy",
      label: pack ? "Pack" : "Deploy",
      title: pack
        ? `Pull the outriggers up and move again (${SPECIAL_HOTKEY.toUpperCase()})`
        : `Special: unpack, brace, or set up (${SPECIAL_HOTKEY.toUpperCase()})`,
      icon: pack ? "pack" : "deploy",
    });
  }
  const jets = units.filter((e) => e.jet && e.hp > 0 && !e.jet.crash);
  if (jets.length) {
    // A Titan alone in the selection: its leg jets, not a soldier's pack.
    const titans = jets.every((e) => e.type === "titan");
    const grounded = jets.filter((e) => !e.jet!.up);
    const ready = grounded.filter(
      (e) => e.jet!.fuel != null && e.jet!.fuel >= (e.jet!.takeoffMin ?? 0) && !e.crits?.includes("leg") && !e.swimming && !e.wading,
    );
    if (grounded.length) {
      const low = grounded.find((e) => e.jet!.fuel != null && e.jet!.fuel < (e.jet!.takeoffMin ?? 0));
      out.push({
        slot: "jet-up",
        act: "jet-up",
        label: "Take off",
        title: ready.length
          ? titans
            ? "Fire the leg jets (J). A short hop straight over anything: up there the gun is stowed and only the rocket pods fire, and only anti-air weapons reach it. Shot down, it falls and its reactor goes up on the ground."
            : "Light the jet pack (J). He flies straight over anything while the fuel lasts. Only machine guns, gatlings, the CIWS and RAM, and Titan rockets reach him up there; his bursts come down on men in cover."
          : low
            ? titans
              ? "Leg jets cooling"
              : "Jet pack refuelling"
            : "Cannot take off from here",
        disabled: ready.length === 0,
      });
    }
    if (jets.some((e) => e.jet!.up)) {
      out.push({
        slot: "jet-land",
        act: "jet-land",
        label: "Land",
        title: titans
          ? "Set down on the nearest open ground (J). It lands by itself when the burners run low."
          : "Set down on the nearest open ground (J). He lands by himself when the pack runs low.",
      });
    }
  }
  const ops = units.filter((e) => e.droneLink);
  const drones = units.filter((e) => e.drone);
  if (ops.length || drones.length) {
    const stowed = ops.filter((e) => e.droneLink!.droneId == null);
    const ready = stowed.filter((e) => e.droneLink!.rebuild == null && e.droneLink!.charge >= e.droneLink!.launchMin);
    if (stowed.length) {
      const building = stowed.find((e) => e.droneLink!.rebuild != null);
      out.push({
        slot: "drone-launch",
        act: "drone-launch",
        label: "Launch",
        title: ready.length
          ? "Put the drone up. It flies as its own unit inside the operator's reach, until the battery runs low."
          : building
            ? `Building a new drone — ${Math.ceil(building.droneLink!.rebuild!)}s`
            : "Battery recharging",
        disabled: ready.length === 0,
      });
    }
    if (drones.length || ops.some((e) => e.droneLink!.droneId != null)) {
      out.push({
        slot: "drone-recall",
        act: "drone-recall",
        label: "Recall",
        title: "Fly the drone back to its operator to be stowed and recharged. Right-click the operator does the same.",
      });
    }
    const modes = new Set([...ops.map((e) => e.droneLink!.mode), ...drones.map((e) => e.drone!.mode)]);
    out.push({
      slot: "drone-surveil",
      act: "drone-surveil",
      label: "Surveillance",
      title: "Fly high: wide sight. Only machine guns and gatlings reach it up there. It does not attack.",
      on: modes.size === 1 && modes.has("surveil"),
    });
    out.push({
      slot: "drone-strike",
      act: "drone-strike",
      label: "Search & Destroy",
      title: "Fly low and hunt: it dives on the nearest enemy inside the operator's reach and bursts. Rifles, machine guns, and rockets reach it down there.",
      on: modes.size === 1 && modes.has("strike"),
    });
  }
  const subs = units.filter((e) => e.dive);
  if (subs.length) {
    const winded = subs.every((e) => e.dive!.winded);
    out.push({
      slot: "sub-surface",
      act: "sub-surface",
      label: "Surface",
      title: "Run on the surface: seen like any boat, takes air back in, and its torpedoes strike boats, swimmers, and a Marine Base.",
      on: subs.every((e) => !e.submerged),
    });
    out.push({
      slot: "sub-dive",
      act: "sub-dive",
      label: "Dive",
      title: winded
        ? "Out of air — it stays up until its air is back."
        : "Run submerged: the enemy sees it only close by or just after it fires, and its torpedoes find only another submarine that is down. It surfaces by itself when the air runs out.",
      on: subs.every((e) => e.submerged),
      disabled: winded,
    });
  }
  const minelayers = units.filter((e) => e.minePacks != null);
  if (minelayers.length > 0) {
    const packs = minelayers.reduce((n, e) => n + (e.minePacks ?? 0), 0);
    const cap = MAMMOTH_MINE_PACKS * minelayers.length;
    out.push({
      slot: "deploy-mines",
      act: "deploy-mines",
      label: `Deploy mines (${packs}/${cap})`,
      title:
        packs <= 0
          ? "The launcher is empty. A supply truck or a dropped crate refills it, one pack at a time."
          : "Click the ground inside the ring: the launcher lobs one pack that bursts into a mine field, live under friend and foe alike. Click past the ring and it walks until the point is in reach. Shift queues several.",
      on: !!view?.mineLayMode,
      disabled: packs <= 0,
    });
  }
  const blinkers = units.filter((e) => isSimUnit(e.type) && !e.garrisonedIn && !e.dormant && !e.purge);
  if (blinkers.length > 0) {
    const charge = Math.min(...blinkers.map((e) => e.blink?.u ?? 1));
    const ready = charge >= 1;
    out.push({
      slot: "blink",
      act: "blink",
      label: "Blink",
      title: ready
        ? "Click the ground inside the ring: he is there at once. Click past the ring and he walks until it is in reach, then blinks. Shift queues it. Right-click an enemy garrison instead to blink in and purge it."
        : `The drive is charging (${Math.round(charge * 100)}%). Click a point now and he goes the moment it is back.`,
      on: !!view?.blinkMode,
      badge: ready ? undefined : `${Math.round(charge * 100)}%`,
    });
  }
  const lungers = units.filter((e) => canLunge(e.type) && !e.wreck && e.lungeAlt == null);
  if (lungers.length > 0) {
    const charge = Math.min(...lungers.map((e) => e.lungeCharge ?? 1));
    const ready = charge >= 1;
    out.push({
      slot: "lunge",
      act: "lunge",
      label: "Lunge",
      title: ready
        ? "Click the ground: its legs throw it up and forward, short of the point if it is past the ring. Where it lands, green lasers lash out all round, burning enemy soldiers and setting the ground alight."
        : `The legs are recharging (${Math.round(charge * 100)}%).`,
      on: !!view?.blinkMode,
      disabled: !ready,
      badge: ready ? undefined : `${Math.round(charge * 100)}%`,
    });
  }
  const stalkers = units.filter((e) => canBurrow(e.type) && !e.wreck);
  if (stalkers.length > 0) {
    const down = stalkers.some((e) => e.burrow === "down" || e.burrow === "digging");
    out.push({
      slot: "burrow",
      act: down ? "unburrow" : "burrow",
      label: down ? "Rise" : "Burrow",
      title: down
        ? "Break out of the ground. It comes up with its gun already laid and fires at once."
        : "Dig in where it stands. Once under, no enemy sees it or can pick it; it neither moves nor fires until it rises.",
    });
  }
  const dark = units.filter((e) => e.dormant);
  const canDark = units.filter((e) => canPowerDown(e.type) && !e.dormant && !e.shutdown && !e.garrisonedIn && !e.purge);
  if (dark.length > 0) {
    out.push({
      slot: "power",
      act: "power-on",
      label: "Power up",
      title: "Wake him where he stands. He takes orders and fires again at once.",
    });
  } else if (canDark.length > 0) {
    out.push({
      slot: "power",
      act: "power-off",
      label: "Shut down",
      title: "Power him down where he stands: dark, still, and silent. Enemy guns pass him by on their own; to the other side he reads as no one's machine. A named shot still finds him. Power up resumes at once.",
    });
  }
  const ships = units.filter((e) => e.asw);
  if (ships.length > 0) {
    const mines = ships.reduce((n, e) => n + e.asw!.mines, 0);
    const clearing = ships.every((e) => e.asw!.mines <= 0 || e.asw!.mineGap != null);
    out.push({
      slot: "lay-mine",
      act: "lay-mine",
      label: "Lay mine",
      badge: String(mines),
      title:
        mines <= 0
          ? "The mine rail is empty. Beside a Marine Base it fills again, one mine at a time."
          : "Put one contact mine over the stern. It lives a few seconds later and goes off under any hull, swimmer, or submarine that meets it — yours too. The enemy is not shown it.",
      disabled: mines <= 0 || clearing,
    });
  }
  if (units.some((e) => e.air && !e.drone && e.type !== "aswheli" && e.air.phase !== "parked")) {
    out.push({
      slot: "land",
      act: "land",
      label: "Return",
      title: "Fly home and land on the Airfield to refuel, rearm, and patch up. Right-click your Airfield does the same.",
    });
  }
  const trucks = units.filter((e) => e.type === "supply" && e.bed);
  if (units.some((e) => isTransportType(e.type) && e.air?.phase === "parked" && (e.air.troops ?? 0) > 0)) {
    out.push({
      slot: "unboard",
      act: "unboard",
      label: "Unload",
      title: "Everyone aboard climbs out onto the grass beside the hardstand.",
    });
  } else if (trucks.some((e) => e.bed?.crew && (e.bed.seats ?? 0) > 0)) {
    out.push({
      slot: "unboard",
      act: "unboard",
      label: "Unload",
      title: "The passenger climbs out. The factory driver stays.",
    });
  } else if (trucks.some((e) => !e.bed?.crew && !e.bed?.open && (e.bed?.seats ?? 0) > 0)) {
    out.push({
      slot: "unboard",
      act: "unboard",
      label: "Get out",
      title: "The driver climbs out and leaves the truck for anyone to take.",
    });
  }
  if (trucks.some((e) => e.towing != null)) {
    out.push({
      slot: "unhitch",
      act: "unhitch",
      label: "Unhitch",
      title: "Drop the field gun here. The crew sets it up to fire.",
    });
  }
  if (buildings.some((e) => !isHqBuilding(e.type) && !isCivilianType(e.type))) {
    out.push({
      slot: "sell",
      act: "sell",
      label: "Sell",
      title: "Sell selected structures for half their cost. Asks first.",
    });
  }
  if (
    units.some((e) => !isHqRig(e.type)) ||
    buildings.some((e) => !isHqBuilding(e.type) && !isCivilianType(e.type))
  ) {
    out.push({
      slot: "delete",
      act: "delete",
      label: "Delete",
      title: "Destroy the selection on the spot, with no scrap back. Asks first.",
    });
  }
  const deck = houses.find((e) => tankDeckOf(e.type));
  if (houses.some((h) => units.some((e) => e.id !== h.id && garrisonCandidate(h.type, e.type)))) {
    out.push({
      slot: "garrison",
      act: "garrison",
      label: deck ? "Board" : "Enter",
      title: deck
        ? `Up the bow ramp: infantry and vehicles, by the room they take (${GARRISON_HOTKEY.toUpperCase()})`
        : `Garrison infantry (${GARRISON_HOTKEY.toUpperCase()})`,
    });
  }
  if (
    units.some((e) => e.garrisonedIn) ||
    houses.some((e) => e.garrison?.ownerId === ctx.match!.youPlayerId && (e.garrison?.count ?? 0) > 0)
  ) {
    out.push({
      slot: "ungarrison",
      act: "ungarrison",
      label: deck ? "Unload" : "Exit",
      title: deck
        ? `Bow doors open, ramp down: everyone aboard goes ashore. The bow must be on the beach (${GARRISON_HOTKEY.toUpperCase()})`
        : `Leave the building (${GARRISON_HOTKEY.toUpperCase()})`,
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

function qactIcon(item: QAct): string {
  if (item.icon) return item.icon;
  if (item.slot.startsWith("bridge-")) return "bridge";
  return item.act;
}

/** The face of a button: an icon, a cameo, or (for a long one-off like Confirm) words. */
function qactFace(item: QAct): string {
  if (item.cameo) return `cameo:${item.cameo}`;
  const icon = qactIcon(item);
  if (item.urgent || !hasCommandIcon(icon)) return `text:${icon}`;
  return `icon:${icon}`;
}

function makeQact(item: QAct): HTMLButtonElement {
  const b = el("button", {
    class: "qact",
    attrs: { type: "button", "data-act": item.act, "data-slot": item.slot },
  });
  updateQact(b, item);
  return b;
}

function updateQact(node: HTMLElement, item: QAct): void {
  if (node.dataset.act !== item.act) node.dataset.act = item.act;
  if (node.dataset.slot !== item.slot) node.dataset.slot = item.slot;
  const key = commandHotkey(item.act);
  const face = qactFace(item);
  const label = item.label;
  if (node.dataset.face !== face || node.dataset.label !== label || (node.dataset.key ?? "") !== (key ?? "")) {
    node.dataset.face = face;
    node.dataset.label = label;
    if (key) node.dataset.key = key;
    else delete node.dataset.key;
    const parts: string[] = [];
    if (face.startsWith("cameo:")) parts.push(`<span class="config-type qact-cameo" data-type="${item.cameo}"></span>`);
    else if (face.startsWith("icon:")) parts.push(commandIconSvg(qactIcon(item)));
    else parts.push(`${commandIconSvg(qactIcon(item)) || commandIconSvg("confirm")}<span class="qact-label">${escapeHtml(item.label)}</span>`);
    if (key && key.length === 1 && !face.startsWith("text:")) parts.push(`<span class="qact-key">${key}</span>`);
    parts.push(`<span class="qact-badge"></span>`);
    node.innerHTML = parts.join("");
  }
  const badge = node.querySelector(".qact-badge");
  if (badge && badge.textContent !== (item.badge ?? "")) badge.textContent = item.badge ?? "";
  node.classList.toggle("is-wide", face.startsWith("text:"));
  node.setAttribute("aria-label", item.label);
  // The key already shows in the tooltip header; drop the "(S)" copy from the description.
  const body = key ? item.title.replace(/\s*\((?:[A-Z]|Enter)\)/g, "") : item.title;
  setTip(node, item.label, body, key);
  node.classList.toggle("is-on", !!item.on);
  node.classList.toggle("is-urgent", !!item.urgent);
  node.classList.toggle("is-disabled", !!item.disabled);
  node.setAttribute("aria-disabled", item.disabled ? "true" : "false");
  node.setAttribute("aria-pressed", item.on ? "true" : "false");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"));
}

function runConfigAction(ctx: Ctx, t: HTMLElement): void {
  if (t.dataset.configType) {
    configFocus = t.dataset.configType as EntityType;
    paintBattleHud(ctx);
    return;
  }
  if (!viewRef || !ctx.match) return;
  const payload = t.dataset.payload;
  if (payload) {
    if (!isAirDrop(payload)) return;
    const ids = selectedOfType(ctx, viewRef, configFocus)
      .filter((ent) => ent.ownerId === ctx.match!.youPlayerId && isTransportType(ent.type))
      .map((ent) => ent.id);
    if (ids.length === 0) return;
    ctx.net.send({ type: "cmd.payload", ids, payload });
    return;
  }
  const pods = t.dataset.rockets;
  if (pods === "on" || pods === "off") {
    const ids = selectedOfType(ctx, viewRef, configFocus)
      .filter((ent) => ent.ownerId === ctx.match!.youPlayerId && !ent.wreck && rocketsOf(ent.type))
      .map((ent) => ent.id);
    if (ids.length === 0) return;
    ctx.net.send({ type: "cmd.rockets", ids, on: pods === "on" });
    return;
  }
  const reach = t.dataset.reach;
  if (reach === "normal" || reach === "max") {
    const ids = selectedOfType(ctx, viewRef, configFocus)
      .filter((ent) => ent.ownerId === ctx.match!.youPlayerId && !ent.wreck && radarLaidOf(ent.type))
      .map((ent) => ent.id);
    if (ids.length === 0) return;
    ctx.net.send({ type: "cmd.reach", ids, max: reach === "max" });
    return;
  }
  const guns = t.dataset.guns;
  if (guns === "1" || guns === "2") {
    const ids = selectedOfType(ctx, viewRef, configFocus)
      .filter((ent) => ent.ownerId === ctx.match!.youPlayerId && !ent.wreck && ent.type === "walker")
      .map((ent) => ent.id);
    if (ids.length === 0) return;
    ctx.net.send({ type: "cmd.guns", ids, guns: guns === "1" ? 1 : 2 });
    return;
  }
  const charge = t.dataset.selfdestruct;
  if (charge === "on" || charge === "off") {
    const ids = selectedOfType(ctx, viewRef, configFocus)
      .filter((ent) => ent.ownerId === ctx.match!.youPlayerId && !ent.wreck && ent.type === "walker")
      .map((ent) => ent.id);
    if (ids.length === 0) return;
    ctx.net.send({ type: "cmd.selfdestruct", ids, on: charge === "on" });
    return;
  }
  const divert = t.dataset.fielddivert;
  if (divert === "laser" || divert === "field") {
    const ids = selectedOfType(ctx, viewRef, configFocus)
      .filter((ent) => ent.ownerId === ctx.match!.youPlayerId && !ent.wreck && hasForceField(ent.type))
      .map((ent) => ent.id);
    if (ids.length === 0) return;
    ctx.net.send({ type: "cmd.fielddivert", ids, on: divert === "field" });
    return;
  }
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
  if (act === "confirm-field") {
    view.confirmField();
    return;
  }
  const selected = selectedViews(ctx, view);
  const units = ownCommandable(ctx, selected.filter((e) => e.kind === "unit"));
  const buildings = ownCommandable(ctx, selected.filter((e) => e.kind === "building"));
  const aimers = [...units, ...buildings.filter((e) => aimsOwnGun(e.type))];
  const lamps = buildings.filter((e) => hasSpotlight(e.type) && e.spotFacing != null);
  const garrisonForce = garrisonForceHosts(match.youPlayerId, selected);
  if (act === "stop") {
    view.setAttackMoveMode(false);
    view.setForceAttackMode(false);
    view.setMineLayMode(false);
    view.setRotateMode(false);
    view.setGuardMode(false);
    view.setPatrolMode(false);
    const stopIds = [...new Set([...aimers, ...garrisonForce, ...lamps].map((e) => e.id))];
    if (stopIds.length) ctx.net.send({ type: "cmd.stop", ids: stopIds });
    return;
  }
  if (act === "attackmove") {
    if (units.length) view.setAttackMoveMode(!view.attackMoveMode);
    return;
  }
  if (act === "patrol") {
    if (units.length || lamps.length) view.setPatrolMode(!view.patrolMode);
    return;
  }
  if (act === "land") {
    const planes = units.filter((e) => !!e.air && !e.drone);
    if (planes.length) ctx.net.send({ type: "cmd.land", ids: planes.map((e) => e.id) });
    return;
  }
  if (act === "jet-up" || act === "jet-land") {
    const ids = units.filter((e) => e.jet).map((e) => e.id);
    if (ids.length) ctx.net.send({ type: "cmd.jet", ids, action: act === "jet-up" ? "up" : "land" });
    return;
  }
  if (act === "deploy-mines") {
    if (units.some((e) => (e.minePacks ?? 0) > 0)) view.setMineLayMode(!view.mineLayMode);
    return;
  }
  if (act === "lunge") {
    if (units.some((e) => canLunge(e.type) && (e.lungeCharge ?? 1) >= 1)) view.setBlinkMode(!view.blinkMode);
    return;
  }
  if (act === "burrow" || act === "unburrow") {
    const ids = units.filter((e) => canBurrow(e.type) && !e.wreck).map((e) => e.id);
    if (ids.length) ctx.net.send({ type: "cmd.burrow", ids, on: act === "burrow" });
    return;
  }
  if (act === "blink") {
    if (units.some((e) => isSimUnit(e.type) && !e.garrisonedIn && !e.dormant)) view.setBlinkMode(!view.blinkMode);
    return;
  }
  if (act === "power-off" || act === "power-on") {
    const on = act === "power-off";
    const ids = units.filter((e) => canPowerDown(e.type) && (on ? !e.dormant && !e.shutdown && !e.garrisonedIn && !e.purge : !!e.dormant)).map((e) => e.id);
    if (ids.length) ctx.net.send({ type: "cmd.powerdown", ids, on });
    return;
  }
  if (act === "lay-mine") {
    const ids = units.filter((e) => e.asw).map((e) => e.id);
    if (ids.length) ctx.net.send({ type: "cmd.laymine", ids });
    return;
  }
  if (act === "sub-dive" || act === "sub-surface") {
    const ids = units.filter((e) => e.dive).map((e) => e.id);
    if (ids.length) ctx.net.send({ type: "cmd.dive", ids, down: act === "sub-dive" });
    return;
  }
  if (act.startsWith("drone-")) {
    const ids = units.filter((e) => e.drone || e.droneLink).map((e) => e.id);
    if (ids.length === 0) return;
    if (act === "drone-launch") ctx.net.send({ type: "cmd.drone", ids, action: "launch" });
    else if (act === "drone-recall") ctx.net.send({ type: "cmd.drone", ids, action: "recall" });
    else ctx.net.send({ type: "cmd.drone", ids, action: "mode", mode: act === "drone-strike" ? "strike" : "surveil" });
    return;
  }
  if (act === "forceattack") {
    if (aimers.length || garrisonForce.length) view.setForceAttackMode(!view.forceAttackMode);
    return;
  }
  if (act === "guard") {
    if (units.length) view.setGuardMode(!view.guardMode);
    return;
  }
  if (act === "field-sandbags" || act === "field-teeth" || act === "field-greatwall") {
    const structure = act === "field-sandbags" ? "sandbags" : act === "field-teeth" ? "teeth" : "greatwall";
    view.setFieldPlace(structure);
    return;
  }
  if (act === "hold") {
    view.setAttackMoveMode(false);
    view.setForceAttackMode(false);
    view.setMineLayMode(false);
    view.setRotateMode(false);
    view.setGuardMode(false);
    view.setPatrolMode(false);
    if (units.length) {
      const hold = !units.every((e) => e.holdPosition);
      ctx.net.send({ type: "cmd.hold", ids: units.map((e) => e.id), hold });
    }
    return;
  }
  if (act === "engage") {
    const xenos = units.filter((e) => isCyborg(e.type));
    if (xenos.length) {
      const on = !xenos.every((e) => e.engageContacts);
      ctx.net.send({ type: "cmd.engagecontacts", ids: xenos.map((e) => e.id), on });
    }
    return;
  }
  if (act === "rotate") {
    if (aimers.length || lamps.length) view.setRotateMode(!(view.rotateMode && !view.rotateLight));
    return;
  }
  if (act === "rotate-light") {
    if (units.some((e) => hasSpotlight(e.type) && e.spotFacing != null && !lampUnderway(e))) {
      view.setRotateMode(!(view.rotateMode && view.rotateLight), true);
    }
    return;
  }
  if (act === "gate-lock") {
    const gates = buildings.filter((e) => e.gate);
    if (gates.length === 0) return;
    const locked = gates.every((g) => g.gate?.locked);
    ctx.net.send({ type: "cmd.gate", ids: gates.map((g) => g.id), action: locked ? "unlock" : "lock" });
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
  if (act.startsWith("bridge-")) {
    const bridge = act.slice("bridge-".length);
    if (isBridge(bridge)) view.setBridgePlace(bridge);
    return;
  }
  if (act.startsWith("construct-")) {
    const building = act.slice("construct-".length);
    if (isEngineerBuilding(building)) view.setConstructPlace(building);
    return;
  }
  if (act === "unboard") {
    const trucks = units.filter((e) => e.type === "supply" || (isTransportType(e.type) && (e.air?.troops ?? 0) > 0));
    for (const truck of trucks) ctx.net.send({ type: "cmd.unboard", truckId: truck.id });
    return;
  }
  if (act === "unhitch") {
    const towing = units.filter((e) => e.type === "supply" && e.towing != null);
    if (towing.length) ctx.net.send({ type: "cmd.tow", ids: towing.map((e) => e.id) });
    return;
  }
  if (act === "sell") {
    view.sellSelected();
    return;
  }
  if (act === "delete") {
    view.deleteSelected();
    return;
  }
  if (act === "garrison") {
    const house = selected.find((e) => isGarrisonable(e.type) && e.hp > 0);
    const inf = house ? units.filter((e) => e.id !== house.id && garrisonCandidate(house.type, e.type)) : [];
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
  if (ctx.pausePane === "options") {
    // A network match never holds, so the fight keeps running behind the settings.
    renderOptionsPane(modal, ctx);
    back.append(modal);
    root.append(back);
    return;
  }
  modal.append(el("h2", { text: "Leave match?" }));
  modal.append(el("p", { class: "tiny", text: "Host leave ends the match for everyone." }));
  const row = el("div", { class: "btn-row" });
  const stay = el("button", { class: "btn", text: "Stay", attrs: { type: "button" } });
  const go = el("button", { class: "btn btn-primary", text: "Leave", attrs: { type: "button" } });
  const options = el("button", { class: "btn", text: "Options", attrs: { type: "button" } });
  options.addEventListener("click", () => {
    ctx.pausePane = "options";
    ctx.render();
  });
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
  row.append(stay, options, go);
  modal.append(row);
  back.append(modal);
  root.append(back);
}
