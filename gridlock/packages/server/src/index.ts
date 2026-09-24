import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import {
  HEIGHT_WORLD,
  TILE_BLOCKED,
  TILE_EMPTY,
  TILE_FENCE,
  TILE_ROAD,
  TILE_SCRAP,
  TILE_TREE,
  TILE_WATER,
  getMap,
  listMaps,
} from "@gridlock/shared";
import { Hub } from "./room.js";
import { attachSocket } from "./ws.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

export interface ListenOpts {
  port?: number;
  host?: string;
  staticDir?: string | null;
}

function defaultStaticDir(): string {
  return fileURLToPath(new URL("../../client/dist", import.meta.url));
}

function safeJoin(root: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const rel = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = path.resolve(root, rel);
  const rootResolved = path.resolve(root);
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) return null;
  return resolved;
}

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
} as const;

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body));
}

/** Layout payload for the Godot client (and any other 3D view). */
export function mapLayout(id: string): Record<string, unknown> | null {
  const map = getMap(id);
  if (!map) return null;
  return {
    id: map.id,
    name: map.name,
    width: map.width,
    height: map.height,
    tileSize: map.tileSize,
    heightWorld: HEIGHT_WORLD,
    maxHeight: map.maxHeight,
    tiles: map.tiles,
    heights: map.heights,
    spawns: map.spawns,
    features: map.features,
    tileEmpty: TILE_EMPTY,
    tileBlocked: TILE_BLOCKED,
    tileScrap: TILE_SCRAP,
    tileWater: TILE_WATER,
    tileTree: TILE_TREE,
    tileRoad: TILE_ROAD,
    tileFence: TILE_FENCE,
  };
}

function serveApi(pathname: string, res: http.ServerResponse): boolean {
  if (pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return true;
  }
  if (pathname === "/maps") {
    sendJson(
      res,
      200,
      listMaps().map((m) => ({ id: m.id, name: m.name, width: m.width, height: m.height })),
    );
    return true;
  }
  const mapMatch = pathname.match(/^\/map\/([^/]+)$/);
  if (mapMatch) {
    const layout = mapLayout(decodeURIComponent(mapMatch[1] ?? ""));
    if (!layout) {
      sendJson(res, 404, { error: "unknown map" });
      return true;
    }
    sendJson(res, 200, layout);
    return true;
  }
  return false;
}

function serveStatic(root: string, req: http.IncomingMessage, res: http.ServerResponse): void {
  const urlPath = req.url ?? "/";
  let file = safeJoin(root, urlPath);
  if (!file) {
    res.writeHead(400);
    res.end("bad path");
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const index = path.join(root, "index.html");
    if (fs.existsSync(index)) file = index;
    else {
      res.writeHead(404);
      res.end("not found");
      return;
    }
  }
  const ext = path.extname(file);
  const mime = MIME[ext] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime });
  fs.createReadStream(file).pipe(res);
}

export function startServer(opts: ListenOpts = {}): Promise<{
  server: http.Server;
  hub: Hub;
  port: number;
  host: string;
  close: () => Promise<void>;
}> {
  const isProd = process.env.NODE_ENV === "production";
  const host = opts.host ?? process.env.HOST ?? (isProd ? "127.0.0.1" : "0.0.0.0");
  const port = opts.port ?? Number(process.env.PORT ?? 3010);
  const staticDir =
    opts.staticDir === null
      ? null
      : (opts.staticDir ?? (isProd ? defaultStaticDir() : null));

  const hub = new Hub();
  const server = http.createServer((req, res) => {
    const pathname = (req.url ?? "/").split("?")[0] ?? "/";
    if (serveApi(pathname, res)) return;
    if (staticDir && fs.existsSync(staticDir)) {
      serveStatic(staticDir, req, res);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Gridlock server. Client is served by Vite in dev.");
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const pathname = (req.url ?? "/").split("?")[0];
    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      attachSocket(hub, ws, req);
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const addr = server.address();
      const boundPort = typeof addr === "object" && addr ? addr.port : port;
      console.log(
        JSON.stringify({
          t: new Date().toISOString(),
          event: "listen",
          host,
          port: boundPort,
          publicUrl: process.env.PUBLIC_URL ?? "",
        }),
      );
      resolve({
        server,
        hub,
        port: boundPort,
        host,
        close: () =>
          new Promise<void>((resClose) => {
            hub.shutdown();
            wss.close();
            server.close(() => resClose());
          }),
      });
    });
    server.on("error", reject);
  });
}

if (!process.env.NODE_TEST_CONTEXT) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
