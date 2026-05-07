# Retro Board

A real-time collaborative retrospective board for agile teams. Create or join a room, add notes across three columns (What Went Well, What Needs Improvement, Action Items), vote on notes, and drag to reorder — all synced live for every participant.

## Features

- **Real-time collaboration** - via WebSockets, instantly sync changes made to board to all users participating
- **Room-based sessions** — generate a shareable room code or join an existing room
- **Three-column board** — Went Well (positive), Improvements (negative), Action Items (action)
- **Voting** — upvote/downvote notes; one vote per user per note
- **Drag-and-drop reordering** — reorder notes within columns, synced across all users
- **Inline editing** — edit note content in place
- **Live user presence** — see who's currently in the room with color-coded avatars

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4 |
| Real-time | Socket.IO (client + server) |
| Drag & Drop | dnd-kit |
| Backend | Node.js, Express 5 |
| Database | PostgreSQL 18 (via `pg`) |
| Migrations | node-pg-migrate |
| Linting | Biome |
| CI/CD | GitHub Actions → Render (server), Vercel (client) |

## Project Structure

```
retro-board/
├── client/          # React frontend (Vite)
│   └── src/
│       ├── components/   # NoteCard, NoteColumn
│       ├── pages/        # Home, Board
│       ├── utils/        # Color assignment, room code generator
│       └── socket.js     # Socket.IO client singleton
└── server/          # Express backend
    ├── src/
    │   ├── socket/       # Socket event handlers
    │   ├── db.js         # PostgreSQL connection pool
    │   └── index.js      # Server entry point
    └── migrations/       # node-pg-migrate migration files
```

## Live Demo

| | URL |
|---|---|
| **App** | https://retroflowboard.vercel.app |
| **API** | https://retro-board-izpo.onrender.com |

## Available Scripts

### Server (`/server`)

| Script | Description |
|---|---|
| `npm run dev` | Start server with nodemon (hot reload) |
| `npm start` | Start server (production) |
| `npm run migrate` | Run pending migrations |
| `npm run migrate:create` | Create a new migration file |
| `npm run migrate:down` | Roll back the last migration |
| `npm run check` | Run Biome lint + format checks |
| `npm run check:fix` | Run Biome and auto-fix issues |

### Client (`/client`)

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run check` | Run Biome lint + format checks |
| `npm run check:fix` | Run Biome and auto-fix issues |

## Database Schema

**rooms**

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated room identifier |
| `code` | varchar(8) | Unique shareable room code |
| `created_at` | timestamptz | Creation timestamp |

**notes**

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated note identifier |
| `room_id` | UUID (FK) | Reference to parent room |
| `content` | text | Note body |
| `category` | varchar(20) | `positive`, `negative`, or `action` |
| `author` | varchar(50) | Username of note creator |
| `votes` | text[] | Array of usernames who voted |
| `position` | integer | Display order within the column |
| `created_at` | timestamptz | Creation timestamp |

## Socket Events

| Event | Direction | Payload |
|---|---|---|
| `room:join` | client → server | `{ roomCode, userName }` |
| `room:state` | server → client | `{ notes, users }` |
| `room:error` | server → client | `{ message }` |
| `user:joined` | server → room | `{ userName }` |
| `user:left` | server → room | `{ userName }` |
| `note:create` | client → server | `{ roomCode, note }` |
| `note:created` | server → room | note object |
| `note:update` | client → server | `{ roomCode, noteId, updatedContent }` |
| `note:updated` | server → room | `{ noteId, updatedContent }` |
| `note:vote` | client → server | `{ roomCode, noteId }` |
| `note:voted` | server → room | `{ noteId, votes, incrementingVote }` |
| `note:delete` | client → server | `{ roomCode, noteId }` |
| `note:deleted` | server → room | `{ noteId }` |
| `note:move` | client → server | `{ roomCode, noteIds }` |
| `note:moved` | server → room | `noteIds` (ordered array) |

## Deployment

The CI pipeline (GitHub Actions) runs Biome checks on both client and server for every push. On merge to `main`, it triggers automatic deploys:

- **Server** → [retro-board-izpo.onrender.com](https://retro-board-izpo.onrender.com) (Render) via deploy hook
- **Client** → [retroflowboard.vercel.app](https://retroflowboard.vercel.app) (Vercel) via deploy hook
