import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  resolve: { alias: { "@gridlock/shared": path.resolve(dir, "../shared/src/index.ts") } },
  server: {
    port: 5247,
    strictPort: true,
    host: true,
    proxy: { "/ws": { target: "ws://127.0.0.1:3047", ws: true }, "/health": "http://127.0.0.1:3047" },
  },
});
