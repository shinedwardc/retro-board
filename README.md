# Retro Board

A real-time collaborative retrospective board. One person creates a room and shares an 8-character code; everyone else joins with a display name — no accounts, no sign-up. Notes, votes, edits, and drag-and-drop reorders sync live to every participant over WebSockets.

**Live demo:** [retrospective-board.duckdns.org](https://retrospective-board.duckdns.org)

## Why

Running a retro shouldn't require licenses, logins, or a 10-minute setup. Most retro tools front-load friction — create an account, invite teammates by email, pick a plan — before anyone writes a single note. Retro Board strips that away: the only identity is the name you type when you join, and the only barrier to entry is a room code. The trade-off is deliberate — sessions are lightweight and disposable, with just enough persistence (PostgreSQL-backed rooms and notes) that a dropped connection or page refresh doesn't lose the board.

## Features

- **Live sync over Socket.IO.** Every create, edit, vote, move, and delete is broadcast to the whole room instantly — there are no REST endpoints beyond a health check; all state flows through WebSocket events.
- **Optimistic broadcasts.** For events whose payload is fully known from the input, the server emits to the room *before* persisting to Postgres, then rolls back with a follow-up event if the write fails. Measured with the included load test, this cut pooled p95 broadcast latency from ~205ms to ~9.5ms at 200 concurrent sockets (`server/loadtest/broadcast_latency.MD`).
- **Race-safe voting.** A vote toggle is a single `UPDATE … CASE … RETURNING` statement, so concurrent votes on the same note serialize under the row lock instead of losing updates.
- **Drag-and-drop with fractional indexing.** Built on `@dnd-kit/sortable` and `fractional-indexing`: moving a note sends one `{ noteId, rank }` pair rather than rewriting the whole column's order — a single-row write per move.
- **Creator controls via JWT.** The room creator receives a 30-day JWT (stored in `localStorage`); destructive actions like clearing the board are gated on it server-side.
- **Live presence.** See who's currently in the room with color-coded avatars, updated as people join and leave.

## Getting Started

**Prerequisites:** Node.js ≥ 22, PostgreSQL, npm.

The client and server are independent apps, each with its own `package.json`.

1. Clone and install both apps:

   ```bash
   git clone https://github.com/shinedwardc/retro-board.git
   cd retro-board
   (cd server && npm install)
   (cd client && npm install)
   ```

2. Create `server/.env`:

   ```
   PORT=3000
   CLIENT_URL=http://localhost:5173
   DATABASE_URL=postgresql://user:password@localhost:5432/retro_board
   JWT_SECRET=any-long-random-string
   ```

3. Run migrations, then start both dev servers (in separate terminals):

   ```bash
   cd server && npm run migrate && npm run dev   # http://localhost:3000
   cd client && npm run dev                      # http://localhost:5173
   ```

The client connects to `http://localhost:3000` by default, so no client `.env` is needed for local development.

## Configuration

**Server** (`server/.env`):

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | Signs room-creator tokens |
| `PORT` | No | `3001` | Set to `3000` locally to match the client's default server URL |
| `CLIENT_URL` | No | `http://localhost:5173` | Allowed CORS origin |
| `REDIS_URL` | No | — | e.g. `redis://localhost:6379`. Stores room presence in Redis / [mini-redis](https://github.com/shinedwardc/mini-redis) instead of server memory |

**Client** (`client/.env`):

| Variable | Required | Default | Notes |
|---|---|---|---|
| `VITE_SERVER_URL` | No | `http://localhost:3000` | Socket.IO server URL |

Production migrations use a separate gitignored `server/.env.production` pointing at the database's **direct** (non-pooled) endpoint — `node-pg-migrate` takes a session-level advisory lock that is unreliable through a transaction-mode pooler. The running app keeps using the pooled `DATABASE_URL`.

## How It Works

```
Board.tsx ──emit──▶ socket.ts ──ws──▶ handlers.ts ──broadcast──▶ every client in room
(React state)      (client            │
                    singleton)        └──persist──▶ db.ts ──▶ PostgreSQL
```

- `client/src/pages/Board.tsx` — owns all note state in React hooks (no Redux/Zustand) and updates it on each incoming socket event
- `client/src/socket.ts` — Socket.IO client singleton (WebSocket first, polling fallback)
- `server/src/socket/handlers.ts` — all event logic: room join/create, note CRUD, voting, reordering, board clear
- `server/src/db.ts` — `pg.Pool` connection pool

User presence is tracked in-memory on the server (lost on restart); rooms and notes persist in PostgreSQL.

## Available Scripts

### Server (`/server`)

| Script | Description |
|---|---|
| `npm run dev` | Start server with nodemon (hot reload) |
| `npm start` | Start server (production) |
| `npm run typecheck` | TypeScript type check (`tsc --noEmit`) |
| `npm run migrate` | Run pending migrations (local DB via `.env`) |
| `npm run migrate:create` | Create a new migration file |
| `npm run migrate:down` | Roll back the last migration (local) |
| `npm run migrate:prod` | Run migrations against prod (`.env.production`) |
| `npm run migrate:prod:down` | Roll back the last prod migration |
| `npm run loadtest` | Measure broadcast latency under concurrent socket load |
| `npm run check` / `check:fix` | Biome lint + format check / auto-fix |

### Client (`/client`)

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run typecheck` | TypeScript type check (`tsc --noEmit`) |
| `npm test` | Run unit tests (Vitest, `client/test/`) |
| `npm run check` / `check:fix` | Biome lint + format check / auto-fix |

## Testing

- **Client unit tests** (Vitest, `client/test/`) cover the utility layer: fractional-index ordering, color assignment, room-code generation, and session storage.
- **Server load test** (`server/loadtest/broadcast-latency.ts`) spins up configurable rooms × clients over WebSocket, hammers `note:create`, and reports pooled p50/p95/p99 broadcast latency — results and methodology in `server/loadtest/broadcast_latency.MD`.

## Deployment

`docker-compose.yml` runs the whole stack (Caddy + server + Postgres + mini-redis) on one machine behind your own domain. See [docs/self-hosting.md](docs/self-hosting.md).

GitHub Actions (`.github/workflows/ci.yml`) runs three parallel jobs on every push — a single Biome check over both apps (shared root `biome.json`), a server typecheck, and a client typecheck + build — then builds the `web` and `server` Docker images. On `main` it pushes them to GHCR (`ghcr.io/shinedwardc/retro-board-{web,server}`, tagged `sha-<commit>` and `latest`), and a `deploy` job SSHes to the server to run `scripts/deploy.sh` for that commit and checks `/health`. Setup: [docs/self-hosting.md](docs/self-hosting.md#5-automatic-deploys-from-ci-optional).
