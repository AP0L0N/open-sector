import {
  PROTOCOL_VERSION,
  DISCONNECT_GRACE_MS,
  TICK_MS,
  applyCommand,
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
  setMap,
  snapshotFor,
  startMatch,
  stepMatch,
  updateSelf,
  type ClientMessage,
  type ErrorCode,
  type MatchState,
  type RoomMode,
  type RoomState,
  type ServerMessage,
} from "@gridlock/shared";

export type SendFn = (msg: ServerMessage) => void;

export class Session {
  roomId: string | null = null;
  dropTimer: ReturnType<typeof setTimeout> | null = null;
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

  connect(playerId: string, send: SendFn): Session {
    const session = new Session(playerId, defaultName(playerId), send);
    this.sessions.set(playerId, session);
    session.send({ type: "welcome", playerId, protocol: PROTOCOL_VERSION });
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
        this.onCreate(session, msg.mapId, msg.maxSlots, msg.mode);
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

  private broadcastSnapshots(roomId: string): void {
    const match = this.matches.get(roomId);
    if (!match) return;
    for (const id of this.members.get(roomId) ?? []) {
      this.sessions.get(id)?.send({ type: "match.snapshot", match: snapshotFor(match, id) });
    }
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
    patch: { colorId?: number; team?: number; spawnId?: number; ready?: boolean },
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

  private onStart(session: Session): void {
    const room = this.roomOf(session);
    if (!room) return this.err(session, "not_member", "You are not in a room.");
    const started = startMatch(room, session.playerId);
    if (!started.ok) return this.err(session, started.code, started.message);
    const match = createMatch(room, started.value);
    this.matches.set(room.id, match);
    log("room.start", { room: room.id, playerId: session.playerId, mapId: room.mapId });
    for (const id of this.members.get(room.id) ?? []) {
      this.sessions.get(id)?.send({ type: "match.start", match: snapshotFor(match, id) });
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
    stepMatch(match);
    for (const line of match.pendingComms) {
      this.broadcast(roomId, { type: "chat", from: "sys", name: "HQ", text: line, at: Date.now() });
    }
    match.pendingComms = [];
    this.broadcastSnapshots(roomId);
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

  private onSpeed(session: Session, delta: number): void {
    const room = this.roomOf(session);
    if (!room) return this.err(session, "not_member", "You are not in a room.");
    if (room.hostId !== session.playerId) {
      return this.err(session, "not_host", "Only the host can change game speed.");
    }
    const match = this.matches.get(room.id);
    if (!match) return this.err(session, "started", "No match.");
    if (match.ended) return this.err(session, "ended", "Match is over.");
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
