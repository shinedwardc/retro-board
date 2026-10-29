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

- **Server:** any VPS running Ubuntu 24.04 with at least 2 GB RAM. Hetzner, DigitalOcean, Linode and Vultr all have one for about $5/month. CI builds the app images, so 1 GB works; add swap (below) only if you plan to build on the box with `--build`.
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

# A non-root user that owns the app and runs deploys (CI logs in as this user)
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy   # note: the docker group is root-equivalent on this box
```

## 3. Configure and start

As the `deploy` user (`su - deploy`):

```bash
git clone https://github.com/shinedwardc/retro-board.git
cd retro-board
cp .env.example .env
nano .env   # DOMAIN=retro.yourdomain.com, plus POSTGRES_PASSWORD and JWT_SECRET from `openssl rand -hex 32`
docker compose pull && docker compose up -d
```

`web` and `server` are prebuilt by CI and pulled from GHCR (`ghcr.io/shinedwardc/retro-board-{web,server}`); only `mini-redis` is built on the box, which takes a minute the first time. When it finishes, open `https://$DOMAIN`. Caddy requests the certificate on the first request, once DNS points at the server.

If the pull fails with `denied`, the GHCR packages are private. Either make them public (GitHub → your profile → Packages → each package → Package settings → Change visibility), or log the server in once with a personal access token (classic) that has only the `read:packages` scope:

```bash
echo <token> | docker login ghcr.io -u shinedwardc --password-stdin
```

To keep the rooms and notes that are in Neon today, restore them **before** the first full `up` (see step 4).

## 4. Move existing data from Neon (optional)

Restore into an empty database before the server starts, so its startup migrations find everything already applied:

```bash
docker compose up -d postgres
# Neon's direct (non -pooler) connection string, from the Neon dashboard
NEON_URL='postgresql://...neon.tech/neondb?sslmode=require'
docker compose exec -T postgres pg_dump --no-owner --no-acl "$NEON_URL" \
  | docker compose exec -T postgres psql -U retro -d retro
docker compose pull && docker compose up -d
```

Creator tokens are signed with `JWT_SECRET`. To keep existing room creators' "clear board" rights, reuse the `JWT_SECRET` from Render.

## 5. Automatic deploys from CI (optional)

Once set up, every push to `main` that passes CI deploys itself: the `deploy` job in `.github/workflows/ci.yml` SSHes in as `deploy` and runs `scripts/deploy.sh sha-<commit>`, then checks `https://$DOMAIN/health`. Until the `DOMAIN` variable below exists, the job is skipped.

**1. Make a key just for CI** (on your own machine, not the server):

```bash
ssh-keygen -t ed25519 -N "" -C "retro-board CI deploy" -f retro-deploy
```

**2. Let it run the deploy script and nothing else.** On the server, as `deploy`, add one line to `~/.ssh/authorized_keys` (paste the contents of `retro-deploy.pub` at the end):

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'command="/home/deploy/retro-board/scripts/deploy.sh",restrict ssh-ed25519 AAAA... retro-board CI deploy' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

`command=` means this key can only start `deploy.sh`, whatever CI asks for; the script reads the requested tag and refuses anything that isn't `latest` or `sha-<commit>`. `restrict` turns off port forwarding, agent forwarding and terminals.

**3. Pin the server's host key**, so CI refuses to talk to anything pretending to be your server:

```bash
ssh-keyscan -t ed25519 retro.yourdomain.com > known_hosts   # on your machine
ssh-keygen -lf known_hosts                                   # compare this fingerprint...
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub             # ...with this one, run on the server
```

**4. Give GitHub the values** (from your machine, in a checkout of the repo):

```bash
gh api -X PUT repos/shinedwardc/retro-board/environments/production
gh secret set DEPLOY_SSH_KEY --env production < retro-deploy
gh secret set DEPLOY_KNOWN_HOSTS --env production < known_hosts
gh variable set DOMAIN --body retro.yourdomain.com   # turns the deploy job on
# gh variable set DEPLOY_USER --body someone-else   # only if the user isn't "deploy"
```

Then delete `retro-deploy` from your machine; GitHub holds the only copy it needs. The next push to `main` deploys, and the repo's **Environments → production** page lists every deploy. To require a click before each one, add yourself under **Settings → Environments → production → Required reviewers**.

## Day to day

```bash
./scripts/deploy.sh                                        # deploy the latest images CI pushed from main
./scripts/deploy.sh sha-abc1234                            # run (or roll back to) one commit's images
docker compose build mini-redis && docker compose up -d    # pick up a newer mini-redis main
docker compose ps                                          # what's running
docker compose logs -f server                              # follow server logs (also: web, postgres, mini-redis)
docker compose restart server

# Back up the database
docker compose exec -T postgres pg_dump -U retro retro | gzip > backup-$(date +%F).sql.gz
```

`deploy.sh` pulls the repo, pulls that tag's images, records it as `IMAGE_TAG` in `.env` (so a plain `docker compose up -d` keeps running it), restarts what changed and prunes old images. Image tags are on the GitHub repo's Packages page; `sha-abc1234` is the short commit SHA. Rolling back only swaps code: migrations the newer server already applied stay applied.

`docker compose down` stops everything and keeps the data. `docker compose down -v` **deletes** the database and the certificates.
