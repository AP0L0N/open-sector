import {
  COLORS,
  colorHex,
  getMap,
  heightAt,
  isoLift,
  listMaps,
  tileDiamond,
  usedColors,
  usedSpawns,
  waitingReason,
  worldToIso,
  type IsoPt,
  type Slot,
} from "@gridlock/shared";
import type { Ctx } from "../ctx.js";
import { scrapFromMapTiles, terrainFor } from "../render/terrain.js";
import { copyText, el } from "./dom.js";

function drawPreview(canvas: HTMLCanvasElement, mapId: string, slots: Slot[]): void {
  const map = getMap(mapId);
  const ctx = canvas.getContext("2d");
  if (!map || !ctx) return;
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const bw = Math.floor(w * dpr);
  const bh = Math.floor(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0a0806";
  ctx.fillRect(0, 0, w, h);
  const bake = terrainFor(map, scrapFromMapTiles(map));
  const scale = Math.min(w / bake.width, h / bake.height) * 0.94;
  const ox = (w - bake.width * scale) / 2;
  const oy = (h - bake.height * scale) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "low";
  ctx.drawImage(bake.canvas, ox, oy, bake.width * scale, bake.height * scale);
  const to = (p: { x: number; y: number }): { x: number; y: number } => ({
    x: (p.x - bake.originX) * scale + ox,
    y: (p.y - bake.originY) * scale + oy,
  });
  const lift = (p: IsoPt, z: number): IsoPt => to({ x: p.x, y: p.y - z });
  for (const f of map.features ?? []) {
    const d = tileDiamond(f.x, f.y, map.tileSize);
    const ez = 6;
    ctx.fillStyle = "#b08968";
    ctx.beginPath();
    ctx.moveTo(lift(d.n, ez).x, lift(d.n, ez).y);
    ctx.lineTo(lift(d.e, ez).x, lift(d.e, ez).y);
    ctx.lineTo(lift(d.s, 0).x, lift(d.s, 0).y);
    ctx.lineTo(lift(d.w, 0).x, lift(d.w, 0).y);
    ctx.closePath();
    ctx.fill();
  }
  for (const spawn of map.spawns) {
    const occupant = slots.find((s) => s.status === "human" && s.spawnId === spawn.id);
    const iso = worldToIso((spawn.x + 0.5) * map.tileSize, (spawn.y + 0.5) * map.tileSize, map.tileSize);
    const p = to({ x: iso.x, y: iso.y - isoLift(heightAt(map, spawn.x, spawn.y)) });
    ctx.fillStyle = occupant ? colorHex(occupant.colorId) : "#e8b84a";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function renderLobby(root: HTMLElement, ctx: Ctx): void {
  const room = ctx.room;
  if (!room) return;
  const you = ctx.net.playerId;
  const isHost = room.hostId === you;
  const skirmish = room.mode === "skirmish";
  const map = getMap(room.mapId);
  const takenColors = usedColors(room, you ?? undefined);
  const takenSpawns = usedSpawns(room, you ?? undefined);

  const screen = el("div", { class: "screen" });
  const wrap = el("div", { class: "lobby" });

  const head = el("div", { class: "lobby-head" });
  head.append(el("h1", { text: skirmish ? "SKIRMISH" : "BRIEFING ROSTER" }));
  head.append(el("span", { class: "tiny", text: map?.name ?? room.mapId }));
  wrap.append(head);

  if (ctx.banner) {
    const banner = el("div", { class: "banner", text: ctx.banner });
    banner.style.gridColumn = "1 / -1";
    wrap.append(banner);
  }

  const rosterWrap = el("div", { class: "roster-wrap panel" });
  const table = el("table", { class: "roster" });
  const thead = el("thead");
  const hr = el("tr");
  const headers = skirmish
    ? ["#", "Name", "Color", "Team", "Start"]
    : ["#", "Name", "Color", "Team", "Start", "Ready", ""];
  for (const h of headers) {
    hr.append(el("th", { text: h }));
  }
  thead.append(hr);
  table.append(thead);
  const tbody = el("tbody");

  for (const slot of room.slots) {
    if (skirmish && slot.status !== "human") continue;
    const tr = el("tr");
    if (slot.playerId === you) tr.classList.add("is-you");
    if (slot.status === "closed") tr.classList.add("is-closed");
    tr.append(el("td", { class: "mono", text: String(slot.index + 1) }));

    let nameText = "OPEN";
    if (slot.status === "closed") nameText = "CLOSED";
    if (slot.status === "human") nameText = slot.name ?? "Commander";
    tr.append(el("td", { text: nameText }));

    const colorTd = el("td");
    if (slot.status === "human") {
      const row = el("div", { class: "swatches" });
      const mine = slot.playerId === you;
      for (const c of COLORS) {
        const b = el("button", {
          class: "swatch",
          attrs: { type: "button", title: c.name },
        });
        b.style.background = c.hex;
        if (slot.colorId === c.id) b.classList.add("is-mine");
        const taken = takenColors.has(c.id) && slot.colorId !== c.id;
        if (taken) b.classList.add("is-taken");
        if (mine && !taken) {
          b.addEventListener("click", () => ctx.net.send({ type: "slot.update", colorId: c.id }));
        } else {
          b.disabled = true;
        }
        row.append(b);
      }
      colorTd.append(row);
    }
    tr.append(colorTd);

    const teamTd = el("td");
    if (slot.status === "human") {
      const sel = el("select");
      const labels = ["FFA", "Team 1", "Team 2", "Team 3", "Team 4"];
      labels.forEach((label, i) => {
        const o = el("option", { text: label, attrs: { value: String(i) } });
        if (slot.team === i) o.selected = true;
        sel.append(o);
      });
      sel.disabled = slot.playerId !== you;
      sel.addEventListener("change", () =>
        ctx.net.send({ type: "slot.update", team: Number(sel.value) }),
      );
      teamTd.append(sel);
    }
    tr.append(teamTd);

    const spawnTd = el("td");
    if (slot.status === "human") {
      const sel = el("select");
      const rnd = el("option", { text: "Random", attrs: { value: "0" } });
      if (slot.spawnId === 0) rnd.selected = true;
      sel.append(rnd);
      for (let i = 1; i <= 8; i++) {
        const taken = takenSpawns.has(i) && slot.spawnId !== i;
        const o = el("option", {
          text: taken ? `${i} (taken)` : String(i),
          attrs: { value: String(i) },
        });
        if (taken) o.disabled = true;
        if (slot.spawnId === i) o.selected = true;
        sel.append(o);
      }
      sel.disabled = slot.playerId !== you;
      sel.addEventListener("change", () =>
        ctx.net.send({ type: "slot.update", spawnId: Number(sel.value) }),
      );
      spawnTd.append(sel);
    }
    tr.append(spawnTd);

    if (!skirmish) {
      const readyTd = el("td");
      if (slot.status === "human") {
        const lamp = el("span", { class: `lamp${slot.ready ? " on" : ""}` });
        if (slot.playerId === you) {
          const cb = el("input", { attrs: { type: "checkbox" } });
          cb.checked = slot.ready;
          cb.addEventListener("change", () => ctx.net.send({ type: "slot.update", ready: cb.checked }));
          readyTd.append(cb, lamp);
        } else {
          readyTd.append(lamp);
        }
      }
      tr.append(readyTd);

      const act = el("td");
      if (isHost && slot.playerId && slot.playerId !== you) {
        const kick = el("button", { class: "btn", text: "Kick", attrs: { type: "button" } });
        kick.style.padding = "4px 8px";
        kick.style.fontSize = "0.75rem";
        kick.addEventListener("click", () =>
          ctx.net.send({ type: "slot.host", slotIndex: slot.index, kick: true }),
        );
        act.append(kick);
      } else if (isHost && slot.status !== "human" && slot.playerId !== you) {
        const toggle = el("button", {
          class: "btn btn-ghost",
          text: slot.status === "closed" ? "Open" : "Close",
          attrs: { type: "button" },
        });
        toggle.style.padding = "4px 8px";
        toggle.style.fontSize = "0.75rem";
        toggle.addEventListener("click", () =>
          ctx.net.send({
            type: "slot.host",
            slotIndex: slot.index,
            status: slot.status === "closed" ? "open" : "closed",
          }),
        );
        act.append(toggle);
      }
      tr.append(act);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  rosterWrap.append(table);
  wrap.append(rosterWrap);

  const brief = el("div", { class: "brief panel" });
  brief.append(el("h2", { text: map?.name ?? "Map" }));
  if (isHost) {
    const mapSel = el("select");
    for (const m of listMaps()) {
      const o = el("option", { text: m.name, attrs: { value: m.id } });
      if (m.id === room.mapId) o.selected = true;
      mapSel.append(o);
    }
    mapSel.addEventListener("change", () => ctx.net.send({ type: "room.map", mapId: mapSel.value }));
    brief.append(el("label", { text: "Theatre" }), mapSel);
  }
  const preview = el("canvas");
  brief.append(preview);
  const humans = room.slots.filter((s) => s.status === "human").length;
  brief.append(
    el("p", {
      class: "tiny",
      text: skirmish ? "Single commander" : `${humans} / ${room.maxSlots} commanders`,
    }),
    el("p", { class: "tiny", text: "AI — next plan" }),
  );
  if (!skirmish) {
    const codeRow = el("div", { class: "code-row" });
    codeRow.append(el("span", { class: "tiny", text: "ROOM" }), el("strong", { class: "mono", text: room.id }));
    const copyBtn = el("button", { class: "btn", text: "Copy", attrs: { type: "button" } });
    copyBtn.style.padding = "4px 8px";
    copyBtn.style.fontSize = "0.75rem";
    const invite = `${location.origin}${location.pathname}?room=${room.id}`;
    copyBtn.addEventListener("click", () => copyText(room.id));
    const inviteBtn = el("button", { class: "btn btn-ghost", text: "Invite URL", attrs: { type: "button" } });
    inviteBtn.style.padding = "4px 8px";
    inviteBtn.style.fontSize = "0.75rem";
    inviteBtn.addEventListener("click", () => copyText(invite));
    codeRow.append(copyBtn, inviteBtn);
    brief.append(codeRow);
  }
  wrap.append(brief);

  requestAnimationFrame(() => drawPreview(preview, room.mapId, room.slots));

  const foot = el("div", { class: "lobby-foot" });
  const leave = el("button", { class: "btn btn-ghost", text: "Leave", attrs: { type: "button" } });
  leave.addEventListener("click", () => {
    ctx.net.send({ type: "room.leave" });
    ctx.room = null;
    ctx.goto("menu");
  });
  foot.append(leave);

  const reason = waitingReason(room);
  const start = el("button", { class: "btn btn-primary", text: "Start", attrs: { type: "button" } });
  start.disabled = !isHost || Boolean(reason);
  start.addEventListener("click", () => ctx.net.send({ type: "room.start" }));
  let reasonText = "";
  if (reason) reasonText = isHost ? reason : "Waiting for host.";
  else if (!isHost) reasonText = "Waiting for host.";
  else if (!skirmish) reasonText = "All commanders ready.";
  const reasonEl = el("div", { class: "lock-reason", text: reasonText });
  if (!reason && isHost) reasonEl.style.color = "var(--ready)";
  foot.append(reasonEl, start);
  wrap.append(foot);

  screen.append(wrap);
  root.append(screen);
}
