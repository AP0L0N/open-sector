# Ubuntu deploy (Milestone 1)

Node on `127.0.0.1:3010`. nginx on 80/443. No Docker.

1. **Host.** Ubuntu with nginx. TLS via existing certs or certbot later.

2. **Code.** Clone or rsync into `/opt/gridlock`. Dedicated user (or `www-data`):

   ```bash
   sudo useradd --system --home /opt/gridlock --shell /usr/sbin/nologin gridlock
   sudo rsync -a --exclude node_modules ./gridlock/ /opt/gridlock/
   sudo chown -R gridlock:gridlock /opt/gridlock
   ```

3. **Build on the server** (Node 22+ so ABI matches):

   ```bash
   cd /opt/gridlock
   sudo -u gridlock npm ci
   sudo -u gridlock npm run build
   ```

4. **systemd.** Install, enable, start:

   ```bash
   sudo cp /opt/gridlock/deploy/gridlock.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now gridlock
   sudo systemctl status gridlock
   ```

5. **nginx.** Site proxies to localhost only. Public ports: 80 and 443.

   ```bash
   sudo cp /opt/gridlock/deploy/nginx.example.conf /etc/nginx/sites-available/gridlock
   # set server_name
   sudo ln -sf /etc/nginx/sites-available/gridlock /etc/nginx/sites-enabled/gridlock
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d rts.example.com
   ```

6. **Firewall.** Allow 80/443. Do not publish 3010.

   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw deny 3010/tcp
   ```

7. **No Docker in M1.** One Node process, in-memory rooms, restart on failure.
