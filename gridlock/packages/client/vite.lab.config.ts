// Scratch: private lab server. Not shipped.
import base from "./vite.config";
export default { ...base, server: { port: 5199, strictPort: true, proxy: { "/ws": { target: "ws://127.0.0.1:3099", ws: true }, "/health": "http://127.0.0.1:3099" } } };
