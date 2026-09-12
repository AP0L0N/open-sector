import type { IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import type { RawData, WebSocket } from "ws";
import type { ClientMessage } from "@gridlock/shared";
import { Hub } from "./room.js";

function parseClient(raw: RawData): ClientMessage | { error: true } {
  let text: string;
  if (typeof raw === "string") text = raw;
  else if (Buffer.isBuffer(raw)) text = raw.toString("utf8");
  else if (Array.isArray(raw)) text = Buffer.concat(raw).toString("utf8");
  else text = Buffer.from(raw).toString("utf8");
  try {
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== "object" || typeof (data as { type?: unknown }).type !== "string") {
      return { error: true };
    }
    return data as ClientMessage;
  } catch {
    return { error: true };
  }
}

export function attachSocket(hub: Hub, ws: WebSocket, _req: IncomingMessage): string {
  const playerId = randomUUID();
  const session = hub.connect(playerId, (msg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  });

  ws.on("message", (raw) => {
    const parsed = parseClient(raw);
    if ("error" in parsed) {
      session.send({ type: "room.error", code: "bad_payload", message: "Invalid message." });
      return;
    }
    hub.handle(playerId, parsed);
  });

  ws.on("close", () => {
    hub.disconnect(playerId, false);
  });

  ws.on("error", () => {
    hub.disconnect(playerId, false);
  });

  return playerId;
}
