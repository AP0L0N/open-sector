import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
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
    const url = req.url ?? "/";
    if (url === "/health" || url.startsWith("/health?")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
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
