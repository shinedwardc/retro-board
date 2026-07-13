# AGENTS.md

Working agreement for AI agents (and humans) contributing to **retro-board** — a
real-time collaborative retrospective board. Users create/join rooms and add sticky notes
across three columns (Went Well, To Improve, Action Items) with live sync via Socket.IO.

**Live:** Vercel (client) + Render (server) + Neon (Postgres).

This is the canonical instruction file — `CLAUDE.md` just imports it. It links out to the
deeper docs rather than repeating them:

- **[README.md](README.md)** — what the app is and how to run it.
- **[DESIGN.md](DESIGN.md)** — the Transit Map design system. **Authoritative for any UI work.**

The guiding principle of the whole project: **the server is the source of truth, and every
state change travels as a Socket.IO event.** Keep that contract intact and everything else
follows.

---

## 1. Stack

Two independent apps, each with its own `package.json`, installs, and dev server:

| Concern | `/client` | `/server` |
|---|---|---|
| Framework | React 19 + Vite 8 | Express 5 + Socket.IO 4 |
| Language | TypeScript (strict) | TypeScript (strict), run via `tsx` |
| Runtime | Browser (Node ≥22 to build) | Node.js ≥22 |
| Styling | Tailwind CSS 4 (CSS-first `@theme`) | — |
| Persistence | — | PostgreSQL (`pg.Pool`) + node-pg-migrate |
| Drag & drop | `@dnd-kit/sortable` | — |
| Ordering | `fractional-indexing` (shared with server) | `fractional-indexing` |
| Tests | Vitest (`client/test/`) | none yet (a `loadtest` script exists) |
| Lint/format | Biome (shared root `biome.json`) | Biome (same config) |

---

## 2. Repo map

A coarse orientation map — directory responsibilities and the load-bearing files, not a
file-by-file index. Update it only when a boundary moves.

| Path | Responsibility |
|---|---|
| `client/src/App.tsx` | Root component; manages session state (Home vs Board view). |
| `client/src/pages/Board.tsx` | Owns all note state (reducer + hooks — no Redux/Zustand); applies every incoming socket event. |
| `client/src/pages/Home.tsx` | Room creation / joining UI. |
| `client/src/components/` | `NoteCard`, `NoteColumn`, `confirmDialog` — presentational, themed per DESIGN.md. |
| `client/src/socket.ts` | Socket.IO client singleton. |
| `client/src/utils/` | Pure helpers: `ordering.ts` (fractional ranks), `colors.ts` (avatar hues), `session.ts`, `generateRoomCode.ts`. These are what `client/test/` covers. |
| `client/src/index.css` | The Transit Map theme tokens (`@theme` block). **The implementation half of DESIGN.md.** |
| `server/src/socket/handlers.ts` | **All** socket event logic — room join/create, note CRUD, voting, moves, board clear, creator JWT checks. |
| `server/src/index.ts` | Express + Socket.IO bootstrap, `/health` endpoint. |
| `server/src/db.ts` | The `pg.Pool` — the only DB connection. |
| `server/migrations/` | node-pg-migrate migrations. Schema history lives here, not in docs. |
| root | `biome.json` (shared lint/format config), `.github/workflows/ci.yml`. |

---

## 3. Where conventions live

| Topic | Source of truth |
|---|---|
| Code style & lint rules | root `biome.json` + §5 below |
| UI / visual design (color, type, spacing, components) | **DESIGN.md** — follow it exactly |
| Socket event contract | §4 below + `server/src/socket/handlers.ts` |
| Note ordering | §4 below + `client/src/utils/ordering.ts` and its tests |
| Database schema | §8 below + `server/migrations/` |
| Commands & env vars | §6–§7 below |
| Branch & commit naming | §11 and §12 below |

If a convention isn't written down, match the surrounding code.

---

## 4. The one rule that matters most: keep the socket contract intact

There are **no REST endpoints** beyond `/health`. Every mutation is:
client emits → `handlers.ts` validates/persists → server broadcasts to the whole room →
every client (including the sender) applies the broadcast.

- **Client → server:** `room:create`, `room:join`, `note:create`, `note:update`,
  `note:vote`, `note:delete`, `note:move`, `board:clear`
- **Server → room:** `room:state`, `room:created`, `user:joined`, `user:left`,
  `note:created`, `note:updated`, `note:voted`, `note:deleted`, `note:moved`,
  `board:cleared`, `room:error`

Rules that follow from this:

- **Broadcast-first persistence.** `handlers.ts` emits the broadcast immediately and then
  writes to Postgres; if the write fails it emits a compensating event (e.g.
  `note:deleted` with `reason: "save-failed"`). Preserve this pattern — don't make
  broadcasts wait on the DB, and always ship the rollback path with the optimistic emit.
- **Never mutate client state outside a socket event.** `Board.tsx` reacts to broadcasts;
  it doesn't locally apply what it just emitted.
- **Ordering is fractional.** Notes carry a text `rank` (from `fractional-indexing`) and
  sort by `(category, rank, id)`. A drag-and-drop reorder computes the moved note's new
  rank client-side and emits `note:move` with just `{ noteId, rank }`, persisted as a
  single-row update — never renumber the whole column. Read
  `client/src/utils/ordering.ts` and its tests before touching ordering.
- **Creator auth is a JWT** (30-day expiry, signed with `JWT_SECRET`, stored in
  `localStorage`) containing the room code, issued on room creation. Destructive room
  actions (`board:clear`) must verify it server-side in `handlers.ts`. Never trust a
  client-supplied "is creator" flag.
- **User presence is in-memory on the server** (lost on restart) — don't assume it
  survives reconnects or persists anywhere.
- If you add an event, update **both** directions here, type it in both apps' `types/`,
  and handle it in `Board.tsx`'s reducer.

---

## 5. Code style

Biome is the enforcer (not ESLint/Prettier) — one shared `biome.json` at the repo root
covers both apps via Biome's upward config search (tab indent, line width 100, Tailwind
directive parsing, `useSortedClasses`). On top of what it checks:

- **ES modules only**; both packages are `"type": "module"`.
- TypeScript is strict in both apps. No `any` to dodge a type — model it or narrow it.
- Tailwind classes must stay sorted — run `npm run check:fix` rather than hand-ordering.
- Use theme tokens (`bg-surface-2`, `text-ink-muted`, `border-line-well`), never raw hex
  values in components. Tokens live only in `client/src/index.css`.
- Match the existing comment density: explain *why*, not *what*.

---

## 6. Configuration & secrets

**Server** (`/server/.env`, git-ignored):

```
PORT=3000
CLIENT_URL=http://localhost:5173
DATABASE_URL=postgresql://...
JWT_SECRET=...
```

**Client** (`/client/.env`):

```
VITE_SERVER_URL=http://localhost:3000
```

- Prod migrations read a separate git-ignored `server/.env.production` (copy from
  `.env.production.example`) holding the Neon **direct** `DATABASE_URL` — see §8.
- **Never** commit secrets or print `JWT_SECRET` / `DATABASE_URL`.
- New variables get documented here and in README.

---

## 7. Commands

Run from the respective app directory (`/client` or `/server`):

```bash
npm run dev            # client: Vite @ :5173 · server: nodemon @ :3000
npm run build          # client only — production build
npm start              # server only — production start
npm run typecheck      # tsc --noEmit (both apps)
npm run check          # Biome lint + format check (both apps)
npm run check:fix      # Biome auto-fix
npm test               # client only — Vitest (client/test/)
npm run migrate        # server — run pending migrations (local Postgres via .env)
npm run migrate:create # server — create a new migration file
npm run migrate:down   # server — roll back the last local migration
npm run migrate:prod   # server — migrate Neon prod via .env.production
npm run loadtest       # server — broadcast-latency load test
```

**Before every commit:** `npm run check` and `npm run typecheck` in every app you
touched, plus `npm test` in `/client`. CI runs Biome, both typechecks, and the client
build — **it does not run the Vitest suite**, so a green CI does not mean the tests
passed. Run them locally.

---

## 8. Database & migrations

PostgreSQL, migrated with node-pg-migrate (`server/migrations/`).

- **rooms**: `id` (UUID PK), `code` (varchar(8) unique), `created_at`
- **notes**: `id` (UUID PK), `room_id` (UUID FK → rooms CASCADE), `content`, `category`
  (varchar(20)), `author` (varchar(50)), `votes` (text[]), `rank` (text, fractional
  index), `created_at` — sorted by `(category, rank, id)` via the
  `notes_room_category_rank` index.

**Rules:**

- **Migrations are append-only.** Never edit an existing migration; create a new one with
  `npm run migrate:create`. Always run `npm run migrate` after pulling changes that add
  migration files.
- **Local vs prod:** `npm run migrate` targets the local Postgres in `server/.env`.
  `npm run migrate:prod` loads `server/.env.production`, which must point at Neon's
  **direct** endpoint (host without `-pooler`) — node-pg-migrate takes a session-level
  advisory lock that's unreliable through Neon's pooled (PgBouncer transaction-mode)
  endpoint. The running app still uses the **pooled** `DATABASE_URL`.

---

## 9. Testing

- Client tests live in `client/test/` (not co-located) and run with Vitest
  (`npm test`). They currently cover the pure utils — `ordering`, `colors`, `session`,
  `generateRoomCode`. New pure logic in `client/src/utils/` should ship with a test there.
- The server has **no test framework yet** — don't assume one or invent commands. It does
  have `npm run loadtest` (`server/loadtest/broadcast-latency.ts`) for socket
  broadcast-latency measurements.
- If you add server tests, mock `pg` and the socket layer — never hit a live database in
  a unit test — and confirm the framework choice with the maintainer first.

---

## 10. CI/CD

GitHub Actions (`.github/workflows/ci.yml`):

1. `lint` — one job runs Biome once over both apps via the shared root config
   (`biome check client/src server/src`)
2. `typecheck-server` and `typecheck-client` — per-app typecheck (client also builds),
   in parallel
3. On `main` after all three pass: trigger the Render deploy hook (server) and Vercel
   deploy hook (client) via `curl`

Secrets required: `RENDER_DEPLOY_HOOK`, `VERCEL_DEPLOY_HOOK`.

---

## 11. Branch naming

Never commit to `main` directly — always branch off it. Format:

```
<type>/<description>
```

Prefixes: `feature/` (or `feat/`), `fix/` (or `bugfix/`), `chore/` (docs, deps, config,
tooling, CI), `hotfix/` (urgent prod fix). Lowercase letters, digits, and `-` only;
descriptive but concise, e.g. `feature/note-reactions`, `fix/empty-room-join`,
`chore/agents-md`.

---

## 12. Commit conventions

This repo uses plain, sentence-case, imperative subjects — no Conventional Commits type
prefixes. Match the existing history:

```
Add fractional-indexing spec, tests, and fixes
Use fractional indexing for note ordering
Socket broadcasting optimizations & broadcast-latency load test script
```

**Rules:**
- Capitalized, imperative mood, no trailing period: `Add note reactions`, not
  `added note reactions.`
- Subject describes the change's *effect*, not the process ("Fix vote toggle race", not
  "Update handlers.ts").
- Keep commits scoped — a schema migration and the UI that uses it can share a commit,
  but unrelated cleanups get their own.

---

## 13. Conventions for agents

- **Read before you write.** Open the file you're changing; match its idiom.
- **Stay in your lane on UI.** Any visual change must conform to DESIGN.md — theme tokens
  only, one transit line color per column, mono for machine voice. When in doubt, re-read it.
- **Both sides of an event.** A socket change is not done until the client emit, the
  server handler, the broadcast, the client reducer, and the shared types all agree.
- **Don't introduce dependencies casually.** Prefer what's already here; justify any new
  package.
- **Keep the docs honest.** If you change the socket contract, schema, commands, or
  theme, update this file (and DESIGN.md for visual changes) in the same commit.
