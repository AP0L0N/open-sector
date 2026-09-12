import "./style/ra-feel.css";
import type { ServerMessage } from "@gridlock/shared";
import { getMap } from "@gridlock/shared";
import { GameSocket } from "./net/client.js";
import type { Ctx, Screen } from "./ctx.js";
import { bindClicks, getMusic, getSfx, setMusic, setSfx } from "./ui/audio.js";
import { renderMenu } from "./ui/menu.js";
import { renderPlay } from "./ui/play.js";
import { renderLobby } from "./ui/lobby.js";
import { renderOptions } from "./ui/options.js";
import { renderCredits } from "./ui/credits.js";
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
let deployTimer: ReturnType<typeof setTimeout> | null = null;

const params = new URLSearchParams(location.search);
const roomParam = params.get("room");

const net = new GameSocket();

const ctx: Ctx = {
  net,
  screen: roomParam ? "play" : "menu",
  playMode: roomParam ? "network" : "skirmish",
  name: localStorage.getItem(NAME_KEY) ?? "",
  banner: "",
  room: null,
  match: null,
  chat: [],
  inspect: null,
  connected: false,
  pendingJoin: roomParam,
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
    if (screen === "menu") ctx.leaveOpen = false;
    ctx.render();
  },
  setName(name: string) {
    ctx.name = name.trim().slice(0, 24);
    localStorage.setItem(NAME_KEY, ctx.name);
  },
  render,
};

function render(): void {
  if (ctx.screen === "battle" && document.getElementById("battlefield") && mapView) {
    if (ctx.match) mapView.setSnapshot(ctx.match);
    paintBattleHud(ctx);
    if (ctx.leaveOpen && !document.querySelector(".modal-back")) renderLeaveModal(appEl, ctx);
    if (!ctx.leaveOpen) document.querySelector(".modal-back")?.remove();
    return;
  }

  appEl.innerHTML = "";
  switch (ctx.screen) {
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
  }
}

function onMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case "welcome":
      net.send({ type: "hello", name: ctx.name });
      if (ctx.pendingJoin) {
        net.send({ type: "room.join", code: ctx.pendingJoin });
      }
      break;
    case "room.state":
      ctx.room = msg.room;
      ctx.banner = "";
      if (ctx.screen === "play" || ctx.screen === "menu" || ctx.screen === "lobby") {
        ctx.screen = "lobby";
      }
      ctx.render();
      break;
    case "room.error":
      if (ctx.screen === "battle" && msg.code === "low_scrap") {
        flashNoScrap();
        return;
      }
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
      }, 1800);
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
  if (!connected && ctx.screen !== "menu") {
    ctx.banner = "Link lost.";
    ctx.room = null;
    ctx.match = null;
    ctx.winner = null;
    mapView?.destroy();
    mapView = null;
    ctx.screen = "menu";
  }
  ctx.render();
};

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && ctx.screen === "battle") {
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
