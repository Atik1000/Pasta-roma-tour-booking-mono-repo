# Deploying to a Linux server

One host, Docker, three containers behind a reverse proxy. Everything below is run **on the server**.

> **Before you start.** Any credential that has been pasted into a chat, an email or a ticket is compromised — rotate it. That includes GitHub tokens (`ghp_…`), which grant repository access, and the server's own password.

## 1. Harden the box first

Do this before deploying anything, not after.

```bash
adduser deploy && usermod -aG sudo deploy       # stop using root day to day
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy/

# Key-based login only. Password auth on a public IP is brute-forced constantly.
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/'            /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

Copy your public key up **before** disabling password auth, or you will lock yourself out:

```bash
ssh-copy-id deploy@YOUR_SERVER_IP
```

## 2. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy      # log out and back in for this to take effect
```

## 3. Get the code

```bash
sudo mkdir -p /var/www && sudo chown deploy:deploy /var/www
cd /var/www
git clone https://github.com/Atik1000/Pasta-roma-tour-booking-mono-repo.git pasta-roma-tour
cd pasta-roma-tour
```

Private repo: authenticate with a **deploy key** (read-only, scoped to this one repository) rather than a personal access token, which carries your whole account.

```bash
ssh-keygen -t ed25519 -C "deploy@pasta-roma-tour" -f ~/.ssh/id_deploy -N ""
cat ~/.ssh/id_deploy.pub     # add under: repo → Settings → Deploy keys
```

## 4. Configure

```bash
cp .env.production.example .env.production
./scripts/generate-secrets.sh          # writes the three secrets, chmod 600
nano .env.production                   # set the URLs, CORS_ORIGINS, SMTP, Stripe
```

`SITE_URL`, `ADMIN_URL`, `PUBLIC_API_URL` and `CORS_ORIGINS` must be the real public URLs. Two things break silently otherwise: the browser is refused by CORS, and refresh cookies — which are `secure` in production — never survive plain HTTP, so login fails with no obvious cause.

## 5. Deploy

```bash
./scripts/deploy.sh
```

It pulls `main`, rebuilds only what changed, runs migrations as a one-shot service, starts everything, and polls `/health/ready` until the database actually answers. **A failed migration aborts the deploy with the previous release still serving.**

To land with the demo catalogue in place — 18 tours, 152 bookings, 24 posts — deploy with `--seed`:

```bash
./scripts/deploy.sh --seed
```

That seeds **only when the catalogue is empty**. The seed truncates every table, so the emptiness check is what makes the flag safe to leave in the command you run every release: on the first deploy it fills the database, on every deploy after it does nothing.

Then change the seeded admin password immediately — it is a known value in a public repository.

## 6. Reverse proxy and TLS

The containers listen on `127.0.0.1:3000`, `:3001` and `:4000`. Nginx terminates TLS in front.

```bash
apt install -y nginx certbot python3-certbot-nginx
```

`/etc/nginx/sites-available/pasta-roma-tour`:

```nginx
server { listen 80; server_name your-domain.com;
  location / { proxy_pass http://127.0.0.1:3000; include proxy_params; } }

server { listen 80; server_name admin.your-domain.com;
  location / { proxy_pass http://127.0.0.1:3001; include proxy_params; } }

server { listen 80; server_name api.your-domain.com;
  # Stripe webhook payloads must arrive unmodified or signature checks fail.
  proxy_request_buffering off;
  client_max_body_size 12M;          # room for the 10MB image upload cap
  location / { proxy_pass http://127.0.0.1:4000; include proxy_params; } }
```

```bash
ln -s /etc/nginx/sites-available/pasta-roma-tour /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d your-domain.com -d admin.your-domain.com -d api.your-domain.com
```

## 7. Check it

```bash
curl -fsS https://api.your-domain.com/api/v1/health/ready   # 200, or 503 if the DB is down
curl -fsS https://your-domain.com   | head -c 80
curl -fsS https://admin.your-domain.com/login | head -c 80
```

## Releasing an update

```bash
cd /var/www/pasta-roma-tour && ./scripts/deploy.sh
```

## Backups

The database is the only thing you cannot rebuild from the repository.

```bash
# /etc/cron.daily/pasta-backup — make it executable
docker compose -f /var/www/pasta-roma-tour/docker/docker-compose.prod.yml \
  --env-file /var/www/pasta-roma-tour/.env.production \
  exec -T postgres pg_dump -U pasta pasta_roma_tour | gzip \
  > /var/backups/pasta-$(date +\%F).sql.gz
find /var/backups -name 'pasta-*.sql.gz' -mtime +30 -delete
```

A backup you have never restored is a hypothesis. Test one.

## When something is wrong

| Symptom                            | Look at                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------- |
| API will not start                 | `docker compose -f docker/docker-compose.prod.yml logs api`             |
| 503 from `/health/ready`           | Postgres is down or unreachable: `… logs postgres`                      |
| Login works then immediately drops | `SITE_URL`/`ADMIN_URL` not `https://`, so the refresh cookie is dropped |
| Browser calls refused              | The origin is missing from `CORS_ORIGINS`                               |
| Front-end points at the wrong API  | `PUBLIC_API_URL` is baked in at build time — rebuild, do not restart    |
| Payment routes return 503          | Stripe keys are unset. Deliberate — see `docs/PAYMENTS.md`              |
