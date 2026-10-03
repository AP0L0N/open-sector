import "./style/ra-feel.css";
import type { CustomMapSpec, ServerMessage } from "@gridlock/shared";
import { DEFAULT_MAP_ID, getMap, listMaps, loadCustomMap, unregisterMap } from "@gridlock/shared";
import { GameSocket } from "./net/client.js";
import type { Ctx, Screen } from "./ctx.js";
import { bindClicks, getMusic, getSfx, setMusic, setSfx } from "./ui/audio.js";
import { renderCallsign } from "./ui/callsign.js";
import { renderMenu } from "./ui/menu.js";
import { renderPlay } from "./ui/play.js";
import { renderLobby } from "./ui/lobby.js";
import { renderOptions } from "./ui/options.js";
import { renderCredits } from "./ui/credits.js";
import { builderError, builderMapSaved, refreshBuilder, renderBuilder } from "./ui/builder.js";
import { forgetTerrain } from "./render/terrain.js";
import { flashNoScrap, mountBattlefield, paintBattleHud, renderLeaveModal } from "./ui/hud.js";
import { el } from "./ui/dom.js";
import type { MapView } from "./render/mapview.js";

const NAME_KEY = "gridlock.name";
const found = document.getElementById("app");
if (!found) throw new Error("#app missing");
const appEl: HTMLElement = found;

setSfx(getSfx());
setMusic(getMusic());

const scan = document.createElement("div");
scan.className = "scanlines";
document.body.append(scan);

let mapView: MapView | null = null;
/** How long the deploy splash shows before the battle screen. */
const DEPLOY_SCREEN_MS = 500;
let deployTimer: ReturnType<typeof setTimeout> | null = null;

const params = new URLSearchParams(location.search);
const roomParam = params.get("room");

const net = new GameSocket();

const savedName = (localStorage.getItem(NAME_KEY) ?? "").trim().slice(0, 24);

const ctx: Ctx = {
  net,
  screen: savedName ? (roomParam ? "play" : "menu") : "callsign",
  playMode: roomParam ? "network" : "skirmish",
  networkStep: roomParam ? "join" : "choose",
  name: savedName,
  banner: "",
  room: null,
  match: null,
  chat: [],
  inspect: null,
  connected: false,
  pendingJoin: roomParam,
  pendingSkirmish: false,
  pendingSkirmishMap: null,
  leaveOpen: false,
  winner: null,
  goto(screen: Screen) {
    if (screen !== "battle") {
      mapView?.destroy();
      mapView = null;
    }
    if (screen !== "deploy" && deployTimer) {
      clearTimeout(deployTimer);
      deployTimer = null;
    }
    ctx.screen = screen;
    if (screen === "menu") {
      ctx.leaveOpen = false;
      ctx.networkStep = "choose";
    }
    ctx.render();
  },
  setName(name: string) {
    ctx.name = name.trim().slice(0, 24);
    localStorage.setItem(NAME_KEY, ctx.name);
  },
  enterSkirmish(mapId?: string) {
    ctx.playMode = "skirmish";
    if (!ctx.net.connected) {
      ctx.pendingSkirmish = true;
      ctx.pendingSkirmishMap = mapId ?? null;
      ctx.banner = "Linking…";
      ctx.net.connect();
      ctx.render();
      return;
    }
    ctx.pendingSkirmish = false;
    ctx.pendingSkirmishMap = null;
    ctx.net.send({ type: "hello", name: ctx.name });
    ctx.net.send({
      type: "room.create",
      mapId: mapId ?? DEFAULT_MAP_ID,
      maxSlots: 8,
      mode: "skirmish",
    });
  },
  render,
};

/** Register a Map Builder map from the hub. Its old bake (if any) is dropped. */
function takeCustomMap(spec: CustomMapSpec): void {
  forgetTerrain(spec.id);
  loadCustomMap(spec);
}

/** Lobby and builder list maps; redraw them when the list changes. */
function mapsChanged(): void {
  if (ctx.screen === "builder") refreshBuilder(ctx);
  else if (ctx.screen === "lobby") ctx.render();
}

function render(): void {
  if (ctx.screen === "builder" && document.getElementById("builder-root")) {
    refreshBuilder(ctx);
    return;
  }
  if (ctx.screen === "battle" && document.getElementById("battlefield") && mapView) {
    if (ctx.match) mapView.setSnapshot(ctx.match);
    paintBattleHud(ctx);
    if (ctx.leaveOpen && !document.querySelector(".modal-back")) renderLeaveModal(appEl, ctx);
    if (!ctx.leaveOpen) document.querySelector(".modal-back")?.remove();
    return;
  }

  appEl.innerHTML = "";
  switch (ctx.screen) {
    case "callsign":
      renderCallsign(appEl, ctx);
      break;
    case "menu":
      renderMenu(appEl, ctx);
      break;
    case "play":
      renderPlay(appEl, ctx);
      break;
    case "lobby":
      renderLobby(appEl, ctx);
      break;
    case "deploy": {
      const mapName = ctx.match ? (getMap(ctx.match.mapId)?.name ?? ctx.match.mapId) : "";
      const screen = el("div", { class: "screen deploy" });
      screen.append(
        el("h1", { text: mapName.toUpperCase() }),
        el("p", { text: "Take your positions." }),
      );
      appEl.append(screen);
      break;
    }
    case "battle":
      mapView = mountBattlefield(appEl, ctx, mapView);
      if (ctx.leaveOpen) renderLeaveModal(appEl, ctx);
      break;
    case "options":
      renderOptions(appEl, ctx);
      break;
    case "credits":
      renderCredits(appEl, ctx);
      break;
    case "builder":
      renderBuilder(appEl, ctx);
      break;
  }
}

function onMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case "welcome":
      if (ctx.name) net.send({ type: "hello", name: ctx.name });
      if (ctx.screen === "callsign") break;
      if (ctx.pendingJoin) {
        net.send({ type: "room.join", code: ctx.pendingJoin });
      } else if (ctx.pendingSkirmish) {
        ctx.pendingSkirmish = false;
        net.send({
          type: "room.create",
          mapId: ctx.pendingSkirmishMap ?? DEFAULT_MAP_ID,
          maxSlots: 8,
          mode: "skirmish",
        });
        ctx.pendingSkirmishMap = null;
      }
      break;
    case "room.state":
      ctx.room = msg.room;
      ctx.playMode = msg.room.mode;
      ctx.banner = "";
      ctx.pendingJoin = null;
      ctx.pendingSkirmish = false;
      if (
        ctx.screen === "play" ||
        ctx.screen === "menu" ||
        ctx.screen === "lobby" ||
        ctx.screen === "callsign" ||
        ctx.screen === "builder"
      ) {
        ctx.screen = "lobby";
      }
      ctx.render();
      break;
    case "room.error":
      if (ctx.screen === "battle" && msg.code === "low_scrap") {
        flashNoScrap();
        return;
      }
      if (builderError(ctx, msg.message)) return;
      ctx.banner = msg.message;
      ctx.render();
      break;
    case "match.start":
      ctx.match = msg.match;
      ctx.chat = [];
      ctx.winner = null;
      ctx.screen = "deploy";
      ctx.render();
      if (deployTimer) clearTimeout(deployTimer);
      deployTimer = setTimeout(() => {
        ctx.goto("battle");
      }, DEPLOY_SCREEN_MS);
      break;
    case "match.snapshot":
      ctx.match = msg.match;
      if (msg.match.winner) ctx.winner = msg.match.winner;
      if (ctx.screen === "battle") ctx.render();
      break;
    case "match.end":
      ctx.winner = msg.winnerPlayerId
        ? { playerId: msg.winnerPlayerId, team: msg.winnerTeam ?? 0 }
        : null;
      if (ctx.screen === "battle") ctx.render();
      break;
    case "room.closed":
      mapView?.destroy();
      mapView = null;
      ctx.room = null;
      ctx.match = null;
      ctx.winner = null;
      ctx.banner = msg.reason === "kicked" ? "You were removed from the roster." : "Host left.";
      ctx.goto("menu");
      break;
    case "maps.custom": {
      const keep = new Set(msg.maps.map((m) => m.id));
      for (const m of listMaps()) {
        if (m.custom && !keep.has(m.id)) {
          unregisterMap(m.id);
          forgetTerrain(m.id);
        }
      }
      for (const spec of msg.maps) takeCustomMap(spec);
      mapsChanged();
      break;
    }
    case "map.upsert":
      takeCustomMap(msg.map);
      mapsChanged();
      break;
    case "map.removed":
      unregisterMap(msg.id);
      forgetTerrain(msg.id);
      mapsChanged();
      break;
    case "map.saved":
      builderMapSaved(ctx, msg.id);
      break;
    case "chat":
      ctx.chat.push({ name: msg.name, text: msg.text, at: msg.at });
      if (ctx.chat.length > 50) ctx.chat.shift();
      ctx.render();
      break;
  }
}

net.onMessage = onMessage;
net.onStatus = (connected) => {
  ctx.connected = connected;
  // The Map Builder edits offline; only saving needs the hub.
  if (!connected && ctx.screen !== "menu" && ctx.screen !== "callsign" && ctx.screen !== "builder") {
    ctx.banner = "Link lost.";
    ctx.room = null;
    ctx.match = null;
    ctx.winner = null;
    ctx.pendingSkirmish = false;
    ctx.networkStep = "choose";
    mapView?.destroy();
    mapView = null;
    ctx.screen = ctx.name ? "menu" : "callsign";
  }
  ctx.render();
};

window.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && ctx.screen === "battle" && mapView?.fieldPending()) {
    e.preventDefault();
    mapView.confirmField();
    return;
  }
  if (e.key === "Escape" && ctx.screen === "battle") {
    if (mapView?.cancelFieldPlacing()) return;
    if (mapView?.placeMode) {
      mapView.placeMode = false;
      mapView.onPlaceMode();
      return;
    }
    ctx.leaveOpen = !ctx.leaveOpen;
    ctx.render();
  }
});

bindClicks(appEl);
net.connect();
ctx.render();
