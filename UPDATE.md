# Updating Open Sector (Gridlock) on xerxes

Host: https://opensector.tilenpoje.eu  
Checkout (with `.git`): `/var/www/opensector`  
Game app: `/var/www/opensector/gridlock`  
Live process: systemd `opensector-gridlock` → Node on `127.0.0.1:3010` (serves `packages/client/dist` + WebSocket `/ws`). Apache reverse-proxies the hostname; Apache reload is **not** needed after a normal code update.

## Pull + rebuild + restart

```bash
cd /var/www/opensector
git pull --ff-only
cd gridlock
npm ci
npm run build
sudo systemctl restart opensector-gridlock
sudo systemctl status opensector-gridlock --no-pager
curl -sS http://127.0.0.1:3010/health
```

Node 22+ is already on PATH for user `apolon`. Owner of the tree: `apolon:apolon`.
