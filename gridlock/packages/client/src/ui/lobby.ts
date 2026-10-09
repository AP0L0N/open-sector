import {
  AI_DIFFICULTIES,
  AI_PROFILES,
  COLORS,
  FACTIONS,
  FACTION_NAMES,
  getMap,
  listMaps,
  usedColors,
  usedSpawns,
  waitingReason,
  type Faction,
  type Slot,
} from "@gridlock/shared";
import type { Ctx } from "../ctx.js";
import { copyText, el } from "./dom.js";
import { drawMapPreview } from "./map-preview.js";

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
    ? ["#", "Name", "Faction", "Color", "Team", "Start", ""]
    : ["#", "Name", "Faction", "Color", "Team", "Start", "Ready", ""];
  for (const h of headers) {
    hr.append(el("th", { text: h }));
  }
  thead.append(hr);
  table.append(thead);
  const tbody = el("tbody");

  const occupied = (s: Slot) => s.status === "human" || s.status === "ai";
  const tinyBtn = (text: string, ghost: boolean, onClick: () => void): HTMLButtonElement => {
    const b = el("button", {
      class: ghost ? "btn btn-ghost" : "btn",
      text,
      attrs: { type: "button" },
    });
    b.style.padding = "4px 8px";
    b.style.fontSize = "0.75rem";
    b.addEventListener("click", onClick);
    return b;
  };

  for (const slot of room.slots) {
    const tr = el("tr");
    if (slot.playerId === you) tr.classList.add("is-you");
    if (slot.status === "closed") tr.classList.add("is-closed");
    if (slot.status === "ai") tr.classList.add("is-ai");
    tr.append(el("td", { class: "mono", text: String(slot.index + 1) }));

    let nameText = "OPEN";
    if (slot.status === "closed") nameText = "CLOSED";
    if (slot.status === "human") nameText = slot.name ?? "Commander";
    if (slot.status === "ai") nameText = slot.name ?? `${AI_PROFILES[slot.ai ?? "defensive"].label} CPU`;
    tr.append(el("td", { text: nameText }));

    const factionTd = el("td");
    if (occupied(slot)) {
      const sel = el("select", { class: "faction-select", attrs: { "data-slot": String(slot.index) } });
      for (const f of FACTIONS) {
        const o = el("option", { text: FACTION_NAMES[f], attrs: { value: f } });
        if ((slot.faction ?? "eu") === f) o.selected = true;
        sel.append(o);
      }
      const canEdit = slot.playerId === you || (isHost && slot.status === "ai");
      sel.disabled = !canEdit;
      sel.addEventListener("change", () => {
        const faction = sel.value as Faction;
        if (slot.status === "ai") {
          ctx.net.send({ type: "slot.host", slotIndex: slot.index, faction });
        } else {
          ctx.net.send({ type: "slot.update", faction });
        }
      });
      factionTd.append(sel);
    }
    tr.append(factionTd);

    const colorTd = el("td");
    if (occupied(slot)) {
      const row = el("div", { class: "swatches" });
      const canEdit = slot.playerId === you || (isHost && slot.status === "ai");
      for (const c of COLORS) {
        const b = el("button", {
          class: "swatch",
          attrs: { type: "button", title: c.name },
        });
        b.style.background = c.hex;
        if (slot.colorId === c.id) b.classList.add("is-mine");
        const taken = takenColors.has(c.id) && slot.colorId !== c.id;
        if (taken) b.classList.add("is-taken");
        if (canEdit && !taken) {
          b.addEventListener("click", () => {
            if (slot.status === "ai") {
              ctx.net.send({ type: "slot.host", slotIndex: slot.index, colorId: c.id });
            } else {
              ctx.net.send({ type: "slot.update", colorId: c.id });
            }
          });
        } else {
          b.disabled = true;
        }
        row.append(b);
      }
      colorTd.append(row);
    }
    tr.append(colorTd);

    const teamTd = el("td");
    if (occupied(slot)) {
      const sel = el("select");
      const labels = ["FFA", "Team 1", "Team 2", "Team 3", "Team 4"];
      labels.forEach((label, i) => {
        const o = el("option", { text: label, attrs: { value: String(i) } });
        if (slot.team === i) o.selected = true;
        sel.append(o);
      });
      const canEdit = slot.playerId === you || (isHost && slot.status === "ai");
      sel.disabled = !canEdit;
      sel.addEventListener("change", () => {
        const team = Number(sel.value);
        if (slot.status === "ai") {
          ctx.net.send({ type: "slot.host", slotIndex: slot.index, team });
        } else {
          ctx.net.send({ type: "slot.update", team });
        }
      });
      teamTd.append(sel);
    }
    tr.append(teamTd);

    const spawnTd = el("td");
    if (occupied(slot)) {
      const sel = el("select");
      const rnd = el("option", { text: "Random", attrs: { value: "0" } });
      if (slot.spawnId === 0) rnd.selected = true;
      sel.append(rnd);
      for (const spawn of map?.spawns ?? []) {
        const i = spawn.id;
        const taken = takenSpawns.has(i) && slot.spawnId !== i;
        const o = el("option", {
          text: taken ? `${i} (taken)` : String(i),
          attrs: { value: String(i) },
        });
        if (taken) o.disabled = true;
        if (slot.spawnId === i) o.selected = true;
        sel.append(o);
      }
      const canEdit = slot.playerId === you || (isHost && slot.status === "ai");
      sel.disabled = !canEdit;
      sel.addEventListener("change", () => {
        const patch = { spawnId: Number(sel.value) };
        if (slot.status === "ai") {
          ctx.net.send({ type: "slot.host", slotIndex: slot.index, ...patch });
        } else {
          ctx.net.send({ type: "slot.update", ...patch });
        }
      });
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
      } else if (slot.status === "ai") {
        readyTd.append(el("span", { class: "lamp on" }));
      }
      tr.append(readyTd);
    }

    const act = el("td");
    act.style.whiteSpace = "nowrap";
    act.style.display = "flex";
    act.style.gap = "4px";
    act.style.alignItems = "center";
    if (isHost && slot.status === "ai") {
      // The CPU's type: switch it in place.
      const typeSel = el("select", { attrs: { title: "CPU type" } });
      typeSel.style.width = "9rem";
      for (const d of AI_DIFFICULTIES) {
        const o = el("option", { text: AI_PROFILES[d].label, attrs: { value: d } });
        if ((slot.ai ?? "defensive") === d) o.selected = true;
        typeSel.append(o);
      }
      typeSel.addEventListener("change", () =>
        ctx.net.send({ type: "slot.host", slotIndex: slot.index, ai: typeSel.value as (typeof AI_DIFFICULTIES)[number] }),
      );
      act.append(typeSel);
      act.append(
        tinyBtn("Remove", false, () =>
          ctx.net.send({ type: "slot.host", slotIndex: slot.index, kick: true }),
        ),
      );
    } else if (isHost && slot.status === "human" && slot.playerId && slot.playerId !== you) {
      act.append(
        tinyBtn("Kick", false, () =>
          ctx.net.send({ type: "slot.host", slotIndex: slot.index, kick: true }),
        ),
      );
    } else if (isHost && slot.status !== "human") {
      for (const d of AI_DIFFICULTIES) {
        act.append(
          tinyBtn(AI_PROFILES[d].label, false, () =>
            ctx.net.send({ type: "slot.host", slotIndex: slot.index, status: "ai", ai: d }),
          ),
        );
      }
      if (!skirmish) {
        act.append(
          tinyBtn(slot.status === "closed" ? "Open" : "Close", true, () =>
            ctx.net.send({
              type: "slot.host",
              slotIndex: slot.index,
              status: slot.status === "closed" ? "open" : "closed",
            }),
          ),
        );
      }
    }
    tr.append(act);
    tbody.append(tr);
  }
  table.append(tbody);
  rosterWrap.append(table);
  wrap.append(rosterWrap);

  const brief = el("div", { class: "brief panel" });
  brief.append(el("h2", { text: map?.name ?? "Map" }));
  if (isHost) {
    const mapSel = el("select");
    const builtIn = el("optgroup", { attrs: { label: "Built-in" } });
    const custom = el("optgroup", { attrs: { label: "Map Builder" } });
    for (const m of listMaps()) {
      const by = m.custom ? ` · ${m.custom.author}` : "";
      const o = el("option", { text: `${m.name} (${m.spawns.length}p${by})`, attrs: { value: m.id } });
      if (m.id === room.mapId) o.selected = true;
      (m.custom ? custom : builtIn).append(o);
    }
    mapSel.append(builtIn);
    if (custom.childElementCount > 0) mapSel.append(custom);
    mapSel.addEventListener("change", () => ctx.net.send({ type: "room.map", mapId: mapSel.value }));
    brief.append(el("label", { text: "Theatre" }), mapSel);
  }
  const preview = el("canvas");
  preview.style.height = "240px";
  brief.append(preview);
  const filled = room.slots.filter((s) => s.status === "human" || s.status === "ai").length;
  const cpus = room.slots.filter((s) => s.status === "ai").length;
  brief.append(
    el("p", {
      class: "tiny",
      text: `${filled} / ${room.maxSlots} commanders${cpus ? ` · ${cpus} CPU` : ""} · map seats ${map?.spawns.length ?? 0}`,
    }),
    el("p", {
      class: "tiny",
      text: `Host: seat a CPU on an open slot. ${AI_DIFFICULTIES.map((d) => `${AI_PROFILES[d].label} ${AI_PROFILES[d].blurb}`).join("; ")}.`,
    }),
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

  requestAnimationFrame(() => {
    if (map) drawMapPreview(preview, map, room.slots);
  });

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
