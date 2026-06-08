# Fractional-Indexing Note Ordering — Design

**Date:** 2026-06-02
**Status:** Approved (pending spec review)

## Problem

Note ordering currently uses an integer `position` column. Two problems stem from this:

1. **Create race:** `note:create` computes the next position with a separate read
   (`SELECT COUNT/MAX`) before the `INSERT`. Concurrent creates in the same room can
   read the same value and collide. This was patched with a per-room
   `pg_advisory_xact_lock` transaction.
2. **Reorder race:** `note:move` rewrites the entire ordering as `Promise.all` of N
   independent `UPDATE`s with no transaction. Two concurrent reorders can interleave
   their per-row writes and produce an order that matches neither user's intent. Even
   serialized, it is last-write-wins over the whole array, so one user's drag silently
   clobbers another's.

## Goal

Replace integer positions with **fractional indexing** so that:

- A move writes only the single dragged note's rank (one-row update), not the whole array.
- Concurrent moves of different notes never interfere.
- Concurrent moves into the same gap converge deterministically across all clients.
- The create-position race disappears (duplicate ranks are allowed and tolerated).

## Key insight

Fractional indexing **removes the need for the advisory lock**. Because order is encoded
as a per-row rank string rather than a contended integer sequence:

- **Creates** no longer need a serialized "next number" step — the client computes a rank
  that appends to the end of its category. If two clients pick the same rank, the `id`
  tie-break resolves it.
- **Moves** become a single-row `UPDATE` with no read-modify-write, so there is no race to
  serialize.

This change therefore **deletes** the `pool.connect` / `BEGIN` / `pg_advisory_xact_lock`
block from `note:create` and the `Promise.all` bulk update from `note:move`.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Rank scope | **Per-category** | Dragging is already locked within a column (`restrictToParentElement`). Separate rank sequences per column mean a drag in one column cannot collide with a drag in another. Keeps future cross-category drag easy (a cross-category move is just "set category + compute rank from destination neighbors"). |
| Who computes rank | **Client** | The client already knows the destination neighbors on drag end. It calls `generateKeyBetween` and emits `{ noteId, rank }`. Server validates minimally and persists. Trivial optimistic UI. |
| Collision policy | **id tie-break only** (no jitter) | Sort by `(category, rank, id)`. Identical ranks are allowed; `id` is a stable deterministic secondary key so every client renders the same order. Jitter (the Figma interleaving mitigation) is deliberately deferred — a retro board drags single notes, not runs, so interleaving barely arises. Jitter can be added later as a non-breaking layer on top. |
| Sort order | `ORDER BY category, rank, id` everywhere | |
| Library | `fractional-indexing` (`generateKeyBetween`, `generateNKeysBetween`) | |

## Data model & migration

### Schema change to `notes`
- Drop `position integer`.
- Add `rank text NOT NULL`.
- Add index `(room_id, category, rank)` to back the ordered fetch.

### Migration (node-pg-migrate, reversible)

**up:**
1. Add `rank text` (nullable).
2. **Backfill (JS, inside the migration):** for each `(room_id, category)` group ordered by
   current `position, created_at`, call `generateNKeysBetween(null, null, n)` to produce `n`
   evenly-spaced keys and write them back. Preserves every existing room's order exactly.
3. `ALTER COLUMN rank SET NOT NULL`.
4. Drop `position`.
5. Create index `(room_id, category, rank)`.

**down:**
1. Add `position integer` (nullable).
2. Backfill `position` from `row_number()` over `(category, rank, id)` per room.
3. `ALTER COLUMN position SET NOT NULL`; drop `rank` and the index.

Run locally via `npm run migrate`, then prod via `npm run migrate:prod` (Neon **direct**
endpoint, per CLAUDE.md).

## Protocol & types

| Event | Before | After |
|-------|--------|-------|
| `note:create` (C→S) payload | `note` with no order field | `note` includes client-computed `rank` |
| `note:move` (C→S) | `{ roomCode, noteIds: string[] }` | `{ roomCode, noteId, rank }` |
| `note:moved` (S→room) | `noteIds: string[]` | `{ noteId, rank }` |

`Note` type (client `client/src/types` and server `server/src/types`): `position: number`
→ `rank: string`.

## Server (`server/src/socket/handlers.ts`)

- `note:create`: remove the advisory-lock transaction. Plain `INSERT … RETURNING *`
  including the client-supplied `rank`. Broadcast `note:created` as today.
- `note:move`: replace the `Promise.all` bulk update with a single
  `UPDATE notes SET rank = $1 WHERE id = $2 AND room_id = $3`, then broadcast
  `{ noteId, rank }`. No lock.
- Room-state queries (`room:create`, `room:join`): `ORDER BY category, rank, id`.

## Client (`client/src/pages/Board.tsx`)

- Add `fractional-indexing` dependency.
- **Sorting:** per-category `useMemo` selectors sort filtered notes by `(rank, id)`.
- **`handleDragEnd`:** within the dragged note's column, use `arrayMove` to get the
  intended order, find the moved note's new neighbors (`prev` / `next`), compute
  `rank = generateKeyBetween(prev?.rank ?? null, next?.rank ?? null)`, optimistically apply,
  emit `{ roomCode, noteId, rank }`.
- **`createNote`:** compute `rank = generateKeyBetween(lastRankInCategory ?? null, null)` to
  append to the column; include in the emitted note and the optimistic add.
- **Reducer:** `move` action becomes `{ noteId, rank }` → set that note's rank (re-sort is
  handled by the selectors). The `note:moved` socket handler dispatches it.
- **Pure helper:** extract the neighbor→rank logic into a pure function (e.g.
  `computeRankForDrop`) so it is unit-testable without the DOM.

## Concurrency correctness

- **Different notes moved concurrently** → two independent single-row updates → no
  interference.
- **Same gap, two notes** → identical rank → `(category, rank, id)` sort converges every
  client to the same order; the next drag of either note re-ranks it cleanly.
- **Same note moved by two users** → last write wins on that row (acceptable).

## Testing

No test infra exists yet (`npm test` is a placeholder).

- Extract the pure rank helpers and add a lightweight unit test covering: append to empty
  column, append to end, move to top, move to bottom, move into middle, and same-gap
  collision (two calls with the same neighbors yield the same key).
- Manual concurrent verification via two browser tabs and/or the socket load-test harness
  (`server/scripts/loadtest.mjs`), confirming all clients converge to the same order.

## Out of scope (YAGNI)

- **Jitter / interleaving mitigation** — deferred; additive later if needed.
- **Cross-category drag** — not currently supported (`restrictToParentElement`); the
  per-category design keeps it easy to add later but it is not part of this work.
- **Rank rebalancing** — fractional keys can grow long after many same-gap inserts; not a
  concern at retro-board scale.
