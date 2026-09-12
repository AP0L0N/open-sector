import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WebSocket } from "ws";
import { startServer } from "./index.js";

describe("http + ws", () => {
  it("GET /health returns ok", async () => {
    const started = await startServer({ port: 0, host: "127.0.0.1", staticDir: null });
    try {
      const res = await fetch(`http://127.0.0.1:${started.port}/health`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { ok: boolean };
      assert.equal(body.ok, true);
    } finally {
      await started.close();
    }
  });

  it("websocket welcome then create room", async () => {
    const started = await startServer({ port: 0, host: "127.0.0.1", staticDir: null });
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${started.port}/ws`);
      const messages: unknown[] = [];
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), 4000);
        ws.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
        ws.on("message", (raw) => {
          messages.push(JSON.parse(String(raw)));
          if (messages.length === 1) {
            ws.send(JSON.stringify({ type: "hello", name: "Test" }));
            ws.send(JSON.stringify({ type: "room.create", mapId: "yard-64", maxSlots: 4 }));
          }
          if (messages.length >= 2) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      ws.close();
      const types = messages.map((m) => (m as { type: string }).type);
      assert.equal(types[0], "welcome");
      assert.ok(types.includes("room.state"));
    } finally {
      await started.close();
    }
  });
});
