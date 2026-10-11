import {
  DEFAULT_MAP_ID,
  PROTOCOL_VERSION,
  SLOT_COUNT,
  isPlaytestMapId,
  loadCustomMap,
  unregisterMap,
  DISCONNECT_GRACE_MS,
  TICK_MS,
  applyCommand,
  applySkirmishSetup,
  canCreateRoom,
  createMatch,
  createRoom,
  defaultName,
  findPlayerSlot,
  generateRoomCode,
  hostSlot,
  joinRoom,
  leaveRoom,
  nudgeGameSpeed,
  refreshSceneryRev,
  setMap,
  snapshotFor,
  applySaveSeats,
  exportSave,
  restoreMatch,
  startMatch,
  stepMatch,
  updateSelf,
  type AiDifficulty,
  type ClientMessage,
  type ErrorCode,
  type MatchSnapshot,
  type MatchState,
  type RoomMode,
  type RoomState,
  type ServerMessage,
  type Faction,
} from "@gridlock/shared";
import { MapStore } from "./map-store.js";

export type SendFn = (msg: ServerMessage) => void;

export class Session {
  roomId: string | null = null;
  dropTimer: ReturnType<typeof setTimeout> | null = null;
  /** `scrapRev` of the last scrap grid this socket was sent; -1 before any. */
  scrapRev = -1;
  /** `sceneryRev` of the last scenery list this socket was sent; -1 before any. */
  sceneryRev = -1;
  /** True while the socket still holds unsent bytes past the backlog limit. A tick snapshot is skipped then. */
  backlogged: () => boolean = () => false;
  constructor(
    readonly playerId: string,
    public name: string,
    public send: SendFn,
  ) {}
}

function sanitizeName(raw: string, playerId: string): string {
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 24);
  return cleaned || defaultName(playerId);
}

function log(event: string, data: Record<string, string | number | boolean | undefined>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...data }));
}

export class Hub {
  readonly sessions = new Map<string, Session>();
  readonly rooms = new Map<string, RoomState>();
  readonly matches = new Map<string, MatchState>();
  private readonly members = new Map<string, Set<string>>();
  private readonly tickers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(readonly maps: MapStore = new MapStore(null)) {}

  connect(playerId: string, send: SendFn): Session {
    const session = new Session(playerId, defaultName(playerId), send);
    this.sessions.set(playerId, session);
    session.send({ type: "welcome", playerId, protocol: PROTOCOL_VERSION });
    session.send({ type: "maps.custom", maps: this.maps.list() });
    return session;
  }

  /** Socket died. Slot stays occupied for the grace period, then opens. */
  disconnect(playerId: string, immediate = false): void {
    const session = this.sessions.get(playerId);
    if (!session) return;
    session.send = () => {};
    if (session.dropTimer) {
      clearTimeout(session.dropTimer);
      session.dropTimer = null;
    }
    if (immediate || !session.roomId) {
      this.drop(playerId);
      return;
    }
    session.dropTimer = setTimeout(() => this.drop(playerId), DISCONNECT_GRACE_MS);
    session.dropTimer.unref?.();
  }

  shutdown(): void {
    for (const session of this.sessions.values()) {
      if (session.dropTimer) {
        clearTimeout(session.dropTimer);
        session.dropTimer = null;
      }
    }
    for (const t of this.tickers.values()) clearTimeout(t);
    this.tickers.clear();
    this.matches.clear();
    this.sessions.clear();
    this.rooms.clear();
    this.members.clear();
    this.matches.clear();
  }

  handle(playerId: string, msg: ClientMessage): void {
    const session = this.sessions.get(playerId);
    if (!session) return;
    switch (msg.type) {
      case "hello":
        this.onHello(session, msg.name);
        break;
      case "room.create":
        this.onCreate(session, msg.mapId, msg.maxSlots, msg.mode, msg.setup);
        break;
      case "room.join":
        this.onJoin(session, msg.code);
        break;
      case "room.leave":
        this.leaveInternal(session.playerId, true);
        break;
      case "slot.update":
        this.onSlotUpdate(session, msg);
        break;
      case "slot.host":
        this.onHostSlot(session, msg);
        break;
      case "room.map":
        this.onMap(session, msg.mapId);
        break;
      case "room.start":
        this.onStart(session);
        break;
      case "chat":
        this.onChat(session, msg.text);
        break;
      case "cmd.speed":
        this.onSpeed(session, msg.delta);
        break;
      case "match.pause":
        this.onMatchPause(session, msg.paused);
        break;
      case "match.save":
        this.onMatchSave(session);
        break;
      case "match.load":
        this.onMatchLoad(session, msg.save);
        break;
      case "map.save":
        this.onMapSave(session, msg.map, msg.key);
        break;
      case "map.delete":
        this.onMapDelete(session, msg.id, msg.key);
        break;
      case "map.test":
        this.onMapTest(session, msg.map, msg.spawnId);
        break;
      default:
        if (msg.type.startsWith("cmd.")) this.onCmd(session, msg);
        break;
    }
  }

  private drop(playerId: string): void {
    this.leaveInternal(playerId, false);
    this.sessions.delete(playerId);
  }

  private err(session: Session, code: ErrorCode, message: string): void {
    session.send({ type: "room.error", code, message });
  }

  private broadcast(roomId: string, msg: ServerMessage): void {
    for (const id of this.members.get(roomId) ?? []) {
      this.sessions.get(id)?.send(msg);
    }
  }

  private broadcastState(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    this.broadcast(roomId, { type: "room.state", room });
  }

  /** Sends this tick's snapshot to every member whose socket is clear. Returns the first one sent, for the slow-tick log. */
  private broadcastSnapshots(roomId: string): MatchSnapshot | null {
    const match = this.matches.get(roomId);
    if (!match) return null;
    let first: MatchSnapshot | null = null;
    for (const id of this.members.get(roomId) ?? []) {
      const session = this.sessions.get(id);
      // A stale snapshot is worthless once the next one is due: let a slow socket drain instead of piling on.
      if (!session || session.backlogged()) continue;
      const view = this.snapshotView(session, match);
      first ??= view;
      session.send({ type: "match.snapshot", match: view });
    }
    return first;
  }

  /** The player's view, with the scrap grid and the scenery list only when this socket has not seen the current ones. `full` forces both. */
  private snapshotView(session: Session, match: MatchState, full = false): MatchSnapshot {
    const scrap = full || session.scrapRev !== match.scrapRev;
    const sceneryRev = refreshSceneryRev(match);
    const scenery = full || session.sceneryRev !== sceneryRev;
    const view = snapshotFor(match, session.playerId, { scrap, scenery });
    if (scrap) session.scrapRev = match.scrapRev;
    if (scenery) session.sceneryRev = sceneryRev;
    return view;
  }

  private roomOf(session: Session): RoomState | undefined {
    if (!session.roomId) return undefined;
    return this.rooms.get(session.roomId);
  }

  private onHello(session: Session, name: string): void {
    session.name = sanitizeName(name, session.playerId);
    const room = this.roomOf(session);
    if (!room) return;
    const slot = findPlayerSlot(room, session.playerId);
    if (slot) slot.name = session.name;
    this.broadcastState(room.id);
  }

  private detachFromRoom(session: Session): void {
    if (!session.roomId) return;
    this.leaveInternal(session.playerId, true);
  }

  private onCreate(
    session: Session,
    mapId: string,
    maxSlots: number,
    mode?: RoomMode,
    setup?: unknown,
  ): void {
    const cap = canCreateRoom(this.rooms.size);
    if (!cap.ok) return this.err(session, cap.code, cap.message);
    this.detachFromRoom(session);
    let id: string;
    try {
      id = generateRoomCode(new Set(this.rooms.keys()));
    } catch {
      return this.err(session, "room_cap", "Could not allocate a room code.");
    }
    const created = createRoom({
      id,
      hostId: session.playerId,
      hostName: session.name,
      mapId,
      maxSlots,
      mode,
    });
    if (!created.ok) return this.err(session, created.code, created.message);
    if (setup !== undefined) applySkirmishSetup(created.value, setup);
    this.rooms.set(id, created.value);
    this.members.set(id, new Set([session.playerId]));
    session.roomId = id;
    log("room.create", { room: id, playerId: session.playerId, mapId });
    this.broadcastState(id);
  }

  private onJoin(session: Session, code: string): void {
    const id = code.trim().toUpperCase();
    const room = this.rooms.get(id);
    if (!room) return this.err(session, "not_found", "No room with that code.");
    if (session.roomId === id) {
      this.broadcastState(id);
      return;
    }
    this.detachFromRoom(session);
    const joined = joinRoom(room, session.playerId, session.name);
    if (!joined.ok) return this.err(session, joined.code, joined.message);
    this.members.get(id)?.add(session.playerId) ?? this.members.set(id, new Set([session.playerId]));
    session.roomId = id;
    log("room.join", { room: id, playerId: session.playerId });
    this.broadcastState(id);
  }

  private leaveInternal(playerId: string, explicit: boolean): void {
    const session = this.sessions.get(playerId);
    const roomId = session?.roomId;
    if (!session || !roomId) return;
    const room = this.rooms.get(roomId);
    session.roomId = null;
    this.members.get(roomId)?.delete(playerId);
    if (!room) return;
    const { hostLeft } = leaveRoom(room, playerId);
    if (hostLeft) {
      log("room.closed", { room: roomId, playerId, reason: "host left" });
      this.closeRoom(roomId, "host left");
      return;
    }
    if (room.phase === "playing" || room.phase === "countdown") {
      this.broadcastSnapshots(roomId);
      return;
    }
    this.broadcastState(roomId);
    void explicit;
  }

  private closeRoom(roomId: string, reason: string): void {
    const ids = [...(this.members.get(roomId) ?? [])];
    const room = this.rooms.get(roomId);
    if (room) room.phase = "ended";
    // A play test's sheet lives only as long as its room.
    if (room && isPlaytestMapId(room.mapId)) unregisterMap(room.mapId);
    this.stopTicker(roomId);
    this.matches.delete(roomId);
    this.rooms.delete(roomId);
    this.members.delete(roomId);
    this.matches.delete(roomId);
    for (const id of ids) {
      const s = this.sessions.get(id);
      if (!s) continue;
      s.roomId = null;
      s.send({ type: "room.closed", reason });
    }
  }

  private onSlotUpdate(
    session: Session,
    patch: { colorId?: number; team?: number; spawnId?: number; ready?: boolean; faction?: Faction },
  ): void {
    const room = this.roomOf(session);
    if (!room) return this.err(session, "not_member", "You are not in a room.");
    const res = updateSelf(room, session.playerId, patch);
    if (!res.ok) return this.err(session, res.code, res.message);
    this.broadcastState(room.id);
  }

  private onHostSlot(
    session: Session,
    msg: {
      slotIndex: number;
      status?: "open" | "human" | "closed" | "ai";
      kick?: boolean;
      colorId?: number;
      team?: number;
      spawnId?: number;
      faction?: Faction;
      ai?: AiDifficulty;
    },
  ): void {
    const room = this.roomOf(session);
    if (!room) return this.err(session, "not_member", "You are not in a room.");
    const victim = room.slots[msg.slotIndex]?.playerId;
    const res = hostSlot(room, session.playerId, msg.slotIndex, {
      status: msg.status,
      kick: msg.kick,
      colorId: msg.colorId,
      team: msg.team,
      spawnId: msg.spawnId,
      faction: msg.faction,
      ai: msg.ai,
    });
    if (!res.ok) return this.err(session, res.code, res.message);
    if (victim && victim !== session.playerId && !findPlayerSlot(room, victim)) {
      const vs = this.sessions.get(victim);
      this.members.get(room.id)?.delete(victim);
      if (vs) {
        vs.roomId = null;
        vs.send({ type: "room.closed", reason: "kicked" });
      }
    }
    this.broadcastState(room.id);
  }

  private onMap(session: Session, mapId: string): void {
    const room = this.roomOf(session);
    if (!room) return this.err(session, "not_member", "You are not in a room.");
    const res = setMap(room, session.playerId, mapId);
    if (!res.ok) return this.err(session, res.code, res.message);
    this.broadcastState(room.id);
  }

  /** Rooms on `mapId`. A running match pins its map; a lobby can be told it changed. */
  private roomsOnMap(mapId: string): { lobby: RoomState[]; playing: boolean } {
    const lobby: RoomState[] = [];
    let playing = false;
    for (const room of this.rooms.values()) {
      if (room.mapId !== mapId) continue;
      if (room.phase === "lobby") lobby.push(room);
      else playing = true;
    }
    return { lobby, playing };
  }

  private toAll(msg: ServerMessage): void {
    for (const s of this.sessions.values()) s.send(msg);
  }

  /** Lobby picks were made against the old starts. */
  private resetLobbyStarts(room: RoomState): void {
    for (const s of room.slots) {
      s.spawnId = 0;
      if (s.status === "human") s.ready = false;
    }
  }

  /**
   * Map Builder play test: load the sheet as a private map, open a skirmish on
   * it with the sender alone on `spawnId` (random when 0 or missing), and
   * start. Nothing is stored or announced.
   */
  private onMapTest(session: Session, map: unknown, spawnId?: unknown): void {
    if (spawnId !== undefined && !Number.isInteger(spawnId)) return this.err(session, "bad_payload", "Invalid start position.");
    const id = (map as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || !isPlaytestMapId(id)) return this.err(session, "bad_payload", "Invalid play test.");
    const using = this.roomsOnMap(id);
    if (using.playing || using.lobby.length > 0) return this.err(session, "map_locked", "That play test is already running.");
    const loaded = loadCustomMap({ ...(map as object), author: session.name, updatedAt: 0 }, { playtest: true });
    if (!loaded.ok) return this.err(session, "map_invalid", loaded.message);
    log("map.test", { playerId: session.playerId, mapId: id });
    this.onCreate(session, id, SLOT_COUNT, "skirmish");
    const room = this.roomOf(session);
    if (room?.mapId !== id) {
      unregisterMap(id);
      return;
    }
    if (spawnId) {
      const picked = updateSelf(room, session.playerId, { spawnId: spawnId as number });
      if (!picked.ok) {
        // The room is still a bare lobby: close it so the tester stays in the builder.
        this.err(session, picked.code, picked.message);
        this.leaveInternal(session.playerId, true);
        return;
      }
    }
    this.onStart(session);
  }

  private onMapSave(session: Session, map: unknown, key: unknown): void {
    const id = (map as { id?: unknown } | null)?.id;
    if (typeof id === "string" && this.roomsOnMap(id).playing) {
      return this.err(session, "map_locked", "A match is running on that map. Save a copy, or try again after it ends.");
    }
    const saved = this.maps.save(map, key, session.name);
    if (!saved.ok) return this.err(session, saved.code, saved.message);
    log("map.save", { playerId: session.playerId, mapId: saved.value.id });
    this.toAll({ type: "map.upsert", map: saved.value });
    session.send({ type: "map.saved", id: saved.value.id });
    for (const room of this.roomsOnMap(saved.value.id).lobby) {
      this.resetLobbyStarts(room);
      this.broadcastState(room.id);
    }
  }

  private onMapDelete(session: Session, id: unknown, key: unknown): void {
    if (typeof id !== "string") return this.err(session, "bad_payload", "Invalid map.");
    const using = this.roomsOnMap(id);
    if (using.playing) return this.err(session, "map_locked", "A match is running on that map.");
    const removed = this.maps.remove(id, key);
    if (!removed.ok) return this.err(session, removed.code, removed.message);
    log("map.delete", { playerId: session.playerId, mapId: id });
    for (const room of using.lobby) {
      room.mapId = DEFAULT_MAP_ID;
      this.resetLobbyStarts(room);
      this.broadcastState(room.id);
    }
    this.toAll({ type: "map.removed", id });
  }

  private onStart(session: Session): void {
    const room = this.roomOf(session);
    if (!room) return this.err(session, "not_member", "You are not in a room.");
    const started = startMatch(room, session.playerId);
    if (!started.ok) return this.err(session, started.code, started.message);
    const match = createMatch(room, started.value);
    this.matches.set(room.id, match);
    log("room.start", { room: room.id, playerId: session.playerId, mapId: room.mapId });
    for (const id of this.members.get(room.id) ?? []) {
      const session = this.sessions.get(id);
      if (session) session.send({ type: "match.start", match: this.snapshotView(session, match, true) });
    }
    this.startTicker(room.id);
  }

  private stopTicker(roomId: string): void {
    const t = this.tickers.get(roomId);
    if (t) clearTimeout(t);
    this.tickers.delete(roomId);
  }

  private startTicker(roomId: string): void {
    this.stopTicker(roomId);
    const run = (): void => {
      const match = this.matches.get(roomId);
      if (!match) {
        this.tickers.delete(roomId);
        return;
      }
      const t0 = Date.now();
      this.tickRoom(roomId);
      if (!this.matches.has(roomId) || this.matches.get(roomId)?.ended) {
        this.tickers.delete(roomId);
        return;
      }
      const wait = Math.max(0, TICK_MS - (Date.now() - t0));
      const next = setTimeout(run, wait);
      next.unref?.();
      this.tickers.set(roomId, next);
    };
    const timer = setTimeout(run, TICK_MS);
    timer.unref?.();
    this.tickers.set(roomId, timer);
  }

  private tickRoom(roomId: string): void {
    const match = this.matches.get(roomId);
    if (!match) return;
    const t0 = Date.now();
    stepMatch(match);
    const simMs = Date.now() - t0;
    for (const line of match.pendingComms) {
      this.broadcast(roomId, { type: "chat", from: "sys", name: "HQ", text: line, at: Date.now() });
    }
    match.pendingComms = [];
    const t1 = Date.now();
    const sent = this.broadcastSnapshots(roomId);
    const snapMs = Date.now() - t1;
    const ms = simMs + snapMs;
    if (ms >= 50) {
      // The size of a snapshot already built: a slow tick must not pay for a second one.
      const bytes = sent ? Buffer.byteLength(JSON.stringify({ type: "match.snapshot", match: sent })) : 0;
      log("room.slow", {
        room: roomId,
        ms,
        simMs,
        snapMs,
        entities: match.entities.size,
        bytes,
        players: this.members.get(roomId)?.size ?? 0,
      });
    }
    if (match.ended) {
      const w = match.winner;
      this.broadcast(roomId, {
        type: "match.end",
        winnerPlayerId: w?.playerId ?? null,
        winnerTeam: w?.team ?? null,
        reason: "core",
      });
    }
  }

  private skirmishMatch(session: Session): { room: RoomState; match: MatchState } | undefined {
    const room = this.roomOf(session);
    if (!room) {
      this.err(session, "not_member", "You are not in a room.");
      return;
    }
    if (room.mode !== "skirmish") {
      this.err(session, "closed", "That is for a skirmish.");
      return;
    }
    if (room.hostId !== session.playerId) {
      this.err(session, "not_host", "Only the commander can do that.");
      return;
    }
    const match = this.matches.get(room.id);
    if (!match) {
      this.err(session, "started", "No match.");
      return;
    }
    return { room, match };
  }

  private onMatchPause(session: Session, paused: boolean): void {
    if (typeof paused !== "boolean") return this.err(session, "bad_payload", "Invalid pause.");
    const found = this.skirmishMatch(session);
    if (!found) return;
    if (found.match.ended) return this.err(session, "ended", "Match is over.");
    found.match.paused = paused;
    this.broadcastSnapshots(found.room.id);
  }

  private onMatchSave(session: Session): void {
    const found = this.skirmishMatch(session);
    if (!found) return;
    session.send({ type: "match.saved", save: exportSave(found.match, found.room) });
  }

  private onMatchLoad(session: Session, raw: unknown): void {
    const existing = session.roomId ? this.rooms.get(session.roomId) : undefined;
    if (existing && existing.mode !== "skirmish") {
      return this.err(session, "closed", "Load is for a skirmish.");
    }
    let room = existing;
    if (!room) {
      let id: string;
      try {
        id = generateRoomCode(new Set(this.rooms.keys()));
      } catch {
        return this.err(session, "room_cap", "Could not allocate a room code.");
      }
      const cap = canCreateRoom(this.rooms.size);
      if (!cap.ok) return this.err(session, cap.code, cap.message);
      const restored = restoreMatch(raw, { roomId: id, humanPlayerId: session.playerId });
      if (!restored.ok) return this.err(session, "bad_payload", restored.message);
      const created = createRoom({
        id,
        hostId: session.playerId,
        hostName: session.name,
        mapId: restored.value.state.mapId,
        maxSlots: restored.value.save.maxSlots,
        mode: "skirmish",
      });
      if (!created.ok) return this.err(session, created.code, created.message);
      room = created.value;
      applySaveSeats(room, restored.value.save, session.playerId, session.name);
      this.rooms.set(id, room);
      this.members.set(id, new Set([session.playerId]));
      session.roomId = id;
      this.installLoaded(room, restored.value.state);
      return;
    }
    const restored = restoreMatch(raw, { roomId: room.id, humanPlayerId: session.playerId });
    if (!restored.ok) return this.err(session, "bad_payload", restored.message);
    applySaveSeats(room, restored.value.save, session.playerId, session.name);
    this.installLoaded(room, restored.value.state);
  }

  /** Swap the running fight for a loaded one and tell the commander. */
  private installLoaded(room: RoomState, match: MatchState): void {
    const wasTicking = this.tickers.has(room.id);
    this.matches.set(room.id, match);
    log("match.load", { room: room.id, mapId: match.mapId, tick: match.tick });
    if (!wasTicking && !match.ended) this.startTicker(room.id);
    for (const id of this.members.get(room.id) ?? []) {
      const session = this.sessions.get(id);
      if (session) session.send({ type: "match.resume", room, match: this.snapshotView(session, match, true) });
    }
  }

  private onSpeed(session: Session, delta: number): void {
    const room = this.roomOf(session);
    if (!room) return this.err(session, "not_member", "You are not in a room.");
    if (room.hostId !== session.playerId) {
      return this.err(session, "not_host", "Only the host can change game speed.");
    }
    const match = this.matches.get(room.id);
    if (!match) return this.err(session, "started", "No match.");
    if (match.ended) return this.err(session, "ended", "Match is over.");
    if (match.paused) return;
    const next = nudgeGameSpeed(match.gameSpeed, delta);
    if (next === match.gameSpeed) return;
    match.gameSpeed = next;
    this.broadcastSnapshots(room.id);
  }

  private onCmd(session: Session, msg: ClientMessage): void {
    const room = this.roomOf(session);
    if (!room) return this.err(session, "not_member", "You are not in a room.");
    const match = this.matches.get(room.id);
    if (!match) return this.err(session, "started", "No match.");
    const res = applyCommand(match, session.playerId, msg);
    if (!res.ok) this.err(session, res.code, res.message);
  }

  private onChat(session: Session, text: string): void {
    const room = this.roomOf(session);
    if (!room) return;
    const trimmed = text.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 200);
    if (!trimmed) return;
    this.broadcast(room.id, {
      type: "chat",
      from: session.playerId,
      name: session.name,
      text: trimmed,
      at: Date.now(),
    });
  }
}
