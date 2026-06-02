# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Real-time collaborative retrospective board. Users create/join rooms and add sticky notes across three columns (Went Well, To Improve, Action Items) with live sync via Socket.IO.

**Live:** Vercel (client) + Render (server)

## Structure

Two independent apps — each with its own `package.json`, installs, and dev server:

- `/client` — React 19 + TypeScript + Vite + Tailwind CSS 4
- `/server` — Node.js + TypeScript + Express 5 + Socket.IO + PostgreSQL

## Commands

### Client (`/client`)
```bash
npm run dev        # Vite dev server (http://localhost:5173)
npm run build      # Production build
npm run check      # Biome lint + format check
npm run check:fix  # Biome auto-fix
```

### Server (`/server`)
```bash
npm run dev            # nodemon dev server (http://localhost:3000)
npm start              # Production start
npm run migrate        # Run pending DB migrations (local Postgres via .env)
npm run migrate:create # Create new migration file
npm run migrate:down   # Rollback last migration (local)
npm run migrate:prod   # Run migrations against Neon prod (.env.production)
npm run check          # Biome lint + format check
npm run check:fix      # Biome auto-fix
```

No tests are configured yet (`npm test` is a placeholder).

## Environment Variables

**Server** (`/server/.env`):
```
PORT=3000
CLIENT_URL=http://localhost:5173
DATABASE_URL=postgresql://...
JWT_SECRET=...
```

Prod migrations read a separate gitignored `/server/.env.production` (copy from `.env.production.example`) holding the Neon **direct** `DATABASE_URL`. See Database below.

**Client** (`/client/.env`):
```
VITE_SERVER_URL=http://localhost:3000
```

## Architecture

### Real-time Communication
All state changes flow through Socket.IO events — there are no REST endpoints beyond a `/health` check. The client emits events and the server broadcasts updates to the entire room.

**Client → Server events:** `room:join`, `note:create`, `note:update`, `note:vote`, `note:delete`, `note:move`, `board:clear`

**Server → Room broadcasts:** `room:state`, `room:created`, `user:joined`, `user:left`, `note:created`, `note:updated`, `note:voted`, `note:deleted`, `note:moved`, `board:cleared`, `room:error`

### Key Files
- `server/src/index.ts` — Express + Socket.IO setup, health endpoint
- `server/src/db.ts` — PostgreSQL connection pool (`pg.Pool`)
- `server/src/socket/handlers.ts` — All socket event logic (room join, note CRUD, voting, drag-and-drop reorder, board clear)
- `client/src/socket.ts` — Socket.IO client singleton
- `client/src/App.tsx` — Root component; manages session state (Home vs Board view)
- `client/src/pages/Board.tsx` — Main board; holds all note state, syncs via socket events
- `client/src/pages/Home.tsx` — Room creation/joining UI

### State Management
No Redux/Zustand — React hooks only. `Board.tsx` owns note state and updates it on each incoming socket event. User presence is tracked in-memory on the server (lost on restart).

### Creator Authentication
When a room is created, the server issues a JWT (30-day expiry) stored in `localStorage`. The `board:clear` action is gated behind this token. The JWT contains the room code and is verified server-side in `handlers.ts`.

### Database (PostgreSQL + node-pg-migrate)
- **rooms**: `id` (UUID PK), `code` (varchar(8) unique), `created_at`
- **notes**: `id` (UUID PK), `room_id` (UUID FK → rooms CASCADE), `content`, `category` (varchar(20)), `author` (varchar(50)), `votes` (text[]), `position` (integer), `created_at`

Migrations live in `server/migrations/`. Always run `npm run migrate` after pulling changes that add migration files.

**Local vs prod migrations:** `npm run migrate` targets the local Postgres in `server/.env`. To migrate the Neon prod DB, use `npm run migrate:prod`, which loads `server/.env.production` (gitignored — copy from `.env.production.example`). That file must point at Neon's **direct** endpoint (host without `-pooler`): node-pg-migrate takes a session-level advisory lock, which is unreliable through Neon's pooled (PgBouncer transaction-mode) endpoint. The running app still uses the **pooled** `DATABASE_URL`.

### Drag & Drop
Uses `@dnd-kit/sortable` with a vertical list strategy per column. Reordering emits `note:move` with the new sorted array, which is persisted to the DB via a bulk position update in `handlers.ts`.

### Styling & Theme
Tailwind CSS 4 (CSS-first). The global stylesheet `client/src/index.css` defines the **Transit Map** theme in an `@theme` block, so every token is available as a utility (e.g. `--color-line-well` → `bg-line-well`, `text-line-well`, `border-line-well`).

- **Surfaces:** `surface-0` (app canvas), `surface-1` (board/columns), `surface-2` (note paper), `rail` (dividers / "track" lines)
- **Ink:** `ink-strong`, `ink`, `ink-muted`
- **Accent:** `accent`, `accent-hover`, `accent-soft` (electric blue)
- **Transit "lines" (one per column):** `line-well` (Went Well — blue), `line-improve` (To Improve — red), `line-action` (Action Items — green), plus `interchange` for action-item nodes
- **Fonts:** `--font-sans` Inter (body/headers), `--font-mono` JetBrains Mono (metadata like vote counts and author tags)
- **Type scale:** `text-xs` (12px) → `text-3xl` (44px)

### Linting
Both packages use Biome (not ESLint/Prettier), configured by a single shared `biome.json` at the repo root (auto-discovered by Biome's upward config search). It enables Tailwind directive parsing (`@theme`), tab indent, width 100, and the `useSortedClasses` rule. Run `npm run check:fix` to auto-format. CI runs `npm run check` before deploying.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`):
1. `lint` — one job runs Biome once over both apps via the shared root config (`biome check client/src server/src`)
2. `typecheck-server` and `typecheck-client` — per-app typecheck (client also builds), in parallel
3. On `main` after all three pass: trigger Render deploy hook (server) and Vercel deploy hook (client) via `curl`

Secrets required: `RENDER_DEPLOY_HOOK`, `VERCEL_DEPLOY_HOOK`
