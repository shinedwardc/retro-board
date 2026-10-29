# Self-hosting on one server

Everything runs on a single Linux machine with Docker Compose (`docker-compose.yml`):

```
browser ──https──▶ web (Caddy) ──/socket.io, /health──▶ server (Node) ──▶ postgres
                    │                                          └──────▶ mini-redis
                    └── everything else: the built React app
```

| Service      | What it is                                                          | Reachable from        |
| ------------ | ------------------------------------------------------------------- | --------------------- |
| `web`        | Caddy: serves `client/dist`, proxies Socket.IO, gets HTTPS certs     | the internet (80/443) |
| `server`     | the Node app; runs pending migrations on every start                 | `web` only            |
| `postgres`   | Postgres 17, data in the `pgdata` volume                             | `server` only         |
| `mini-redis` | built from github.com/shinedwardc/mini-redis (`main`)                | `server` only         |

Client and server share one origin (`https://$DOMAIN`), so there is no cross-site CORS setup.

## 1. Get a server and a domain

- **Server:** any VPS running Ubuntu 24.04 with at least 2 GB RAM. Hetzner, DigitalOcean, Linode and Vultr all have one for about $5/month. With 1 GB, add swap (below) or the client build can run out of memory.
- **Domain:** buy one from any registrar (Cloudflare, Porkbun, Namecheap, about $10/year). For a free option, use a DuckDNS subdomain.
- At the registrar, add an **A record** that points the name (e.g. `retro.yourdomain.com`) at the server's IPv4 address. On Cloudflare, set it to "DNS only" (grey cloud).

## 2. Prepare the server (once)

```bash
ssh root@<server-ip>

# Docker + Compose
curl -fsSL https://get.docker.com | sh

# Firewall: SSH and web only. Postgres and mini-redis never publish ports.
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# Only on a 1 GB machine: 2 GB of swap
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 3. Configure and start

```bash
git clone https://github.com/shinedwardc/retro-board.git
cd retro-board
cp .env.example .env
nano .env   # DOMAIN=retro.yourdomain.com, plus POSTGRES_PASSWORD and JWT_SECRET from `openssl rand -hex 32`
docker compose up -d --build
```

The first build takes a few minutes. When it finishes, open `https://$DOMAIN`. Caddy requests the certificate on the first request, once DNS points at the server.

To keep the rooms and notes that are in Neon today, restore them **before** the first full `up` (see step 4).

## 4. Move existing data from Neon (optional)

Restore into an empty database before the server starts, so its startup migrations find everything already applied:

```bash
docker compose up -d postgres
# Neon's direct (non -pooler) connection string, from the Neon dashboard
NEON_URL='postgresql://...neon.tech/neondb?sslmode=require'
docker compose exec -T postgres pg_dump --no-owner --no-acl "$NEON_URL" \
  | docker compose exec -T postgres psql -U retro -d retro
docker compose up -d --build
```

Creator tokens are signed with `JWT_SECRET`. To keep existing room creators' "clear board" rights, reuse the `JWT_SECRET` from Render.

## Day to day

```bash
git pull && docker compose up -d --build   # deploy the latest code (mini-redis is rebuilt from its GitHub main)
docker compose ps                          # what's running
docker compose logs -f server              # follow server logs (also: web, postgres, mini-redis)
docker compose restart server

# Back up the database
docker compose exec -T postgres pg_dump -U retro retro | gzip > backup-$(date +%F).sql.gz
```

`docker compose down` stops everything and keeps the data. `docker compose down -v` **deletes** the database and the certificates.
