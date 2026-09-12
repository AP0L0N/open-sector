import type { ClientMessage, ServerMessage } from "@gridlock/shared";

export class GameSocket {
  private ws: WebSocket | null = null;
  playerId: string | null = null;
  connected = false;
  onMessage: (msg: ServerMessage) => void = () => {};
  onStatus: (connected: boolean) => void = () => {};

  connect(): void {
    this.close();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.addEventListener("open", () => {
      this.connected = true;
      this.onStatus(true);
    });
    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as ServerMessage;
        if (msg.type === "welcome") this.playerId = msg.playerId;
        this.onMessage(msg);
      } catch {
        /* ignore malformed frames */
      }
    });
    ws.addEventListener("close", () => {
      this.connected = false;
      this.onStatus(false);
    });
    ws.addEventListener("error", () => {
      this.connected = false;
      this.onStatus(false);
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.connected = false;
  }
}
