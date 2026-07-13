# retro-board — Design System

> **Transit Map.** The board reads like a metro map: each retro column is a color-coded
> transit *line*, notes are the stops along it, and users are colored markers moving
> through the system. Light, calm surfaces; color carries meaning, never decoration.

**Implemented in:** all tokens live in the `@theme` block of `client/src/index.css`
(Tailwind 4, CSS-first — every token generates utilities, e.g. `--color-line-well` →
`bg-line-well` / `text-line-well` / `border-line-well`). Fonts are loaded via Google
Fonts in the same file. This document is the spec — keep it and `index.css` in sync.

---

## 1. Principles

1. **Color is a signal, not a skin.** Every hue on screen means something: which column a
   note belongs to (its line), which user did something (their marker), or the one brand
   accent for primary actions. If a color doesn't encode information, it isn't used.
2. **One line per column, everywhere.** "Went Well" is always the blue line, "To Improve"
   the red line, "Action Items" the green line — in column headers, note edges, and add
   buttons alike. Never mix lines within a column's UI.
3. **Paper on a map.** Notes are white paper (`surface-2`) sitting on muted board surfaces
   (`surface-1` on `surface-0`), connected by rail-grey structure. Soft rounded corners
   and light shadows — this is a friendly team tool, not a terminal.
4. **Two voices.** Humans write in Inter; the machine annotates in JetBrains Mono. Vote
   counts, author tags, and room codes are machine metadata — always mono.
5. **Tokens or nothing.** Components never hardcode hex values. If a color isn't in the
   `@theme` block, it doesn't exist; add the token first, then use the utility.

---

## 2. Color

Tokens are defined once in `client/src/index.css` and consumed as Tailwind utilities.

### Surfaces & structure

| Token | Value | Use |
|---|---|---|
| `surface-0` | `#f8fafc` | App canvas (page background) |
| `surface-1` | `#e2e8f0` | Board / column background |
| `surface-2` | `#ffffff` | Note paper, inputs |
| `rail` | `#cbd5e1` | Dividers, input borders — the "track" lines |

### Ink

| Token | Value | Use |
|---|---|---|
| `ink-strong` | `#0f172a` | Headings, titles |
| `ink` | `#1e293b` | Body text |
| `ink-muted` | `#94a3b8` | Metadata, empty states, disabled-ish text |

### Brand accent (electric blue)

| Token | Value | Use |
|---|---|---|
| `accent` | `#2563eb` | Primary actions (save, join, create) |
| `accent-hover` | `#1d4ed8` | Hover state of the above |
| `accent-soft` | `#dbeafe` | Soft highlight fills |

### Transit lines (one per column)

| Token | Value | Line |
|---|---|---|
| `line-well` | `#0284c7` | Went Well — blue line |
| `line-improve` | `#dc2626` | To Improve — red line |
| `line-action` | `#16a34a` | Action Items — green line |
| `interchange` | `#0f172a` | Action-item interchange nodes |

### User markers

`user-1` … `user-8` (red → pink transit hues). Assigned deterministically by hashing the
username in `client/src/utils/colors.ts` — the same user always gets the same color.
Consume via `getUserColor()`, never by picking a `user-N` token directly.

**Rules**
- Line colors are used as *edges and fills with white text* (`border-l-4`, button fills),
  never as body-text color.
- Destructive actions borrow the red line (`bg-line-improve`); confirmations borrow the
  green line (`bg-line-action`). Neutral/cancel is `ink-muted`.
- Greys are the slate ramp already in the tokens — don't introduce warm or pure greys.

---

## 3. Typography

Two families, each with a job (loaded in `index.css`):

| Role | Family | Notes |
|---|---|---|
| Body, headings, note content | **Inter** (`--font-sans`, default on `body`) | Humans talk here |
| Metadata / machine voice | **JetBrains Mono** (`--font-mono`) | Vote counts, author tags (`— name`), room codes |

Type scale (tokens in `@theme`, used as `text-*`):

| Token | Size | Use |
|---|---|---|
| `text-xs` | 12px | Vote counts, author tags (mono) |
| `text-sm` | 14px | Note body, inputs, metadata |
| `text-base` | 16px | Default body |
| `text-lg` | 18px | Column headers |
| `text-xl` | 24px | Section headers |
| `text-2xl` | 32px | Room / app title |
| `text-3xl` | 44px | Home / landing hero |

**Conventions**
- Anything a human wrote is Inter; anything the system reports is mono. Don't blur the two.
- Author attribution is always the mono em-dash form: `— {author}` in `ink-muted`.

---

## 4. Shape & elevation

- **Corners are soft:** `rounded-xl` for cards and column bodies, `rounded-lg` for
  buttons and inputs, `rounded-full` for pills (votes, small action chips).
- **The line edge:** a note shows its transit line as a `border-l-4` in the column's line
  color; a column body shows it as a `border-t-4`. This is the primary category signal.
- **Shadows are quiet:** `shadow-sm` on note cards. No hard offsets, glows, or heavy
  drop-shadows — elevation whispers.
- Inputs are `surface-2` with a `rail` border that switches to `accent` on focus
  (`focus:border-accent focus:outline-none`).

---

## 5. Spacing & layout

- The board is three equal columns, one per line, each a full-height flex column
  (`flex h-full flex-col`) with its own scrolling note list (`overflow-y-auto`).
- Group spacing uses flex/grid `gap` (`gap-y-2` between notes, `gap-y-4` inside a
  column, `gap-2` inside a card) — never margin chains.
- Cards pad `p-3` (mobile) / `p-4` (`sm:`); column bodies pad `p-3`.
- Empty columns show a centered `ink-muted` message rather than a bare void.

---

## 6. Components

**Note card** (`NoteCard.tsx`)
- `bg-surface-2 rounded-xl shadow-sm border-l-4` in the category's line color.
- Content in `text-ink text-sm` (Inter); author line in mono `text-xs text-ink-muted`.
- Edit-in-place: content becomes a borderless input with only a `rail` bottom border.

**Vote pill**
- Mono `text-xs`, `rounded-full px-2 py-1`. Unvoted: `bg-surface-1 text-ink`
  (hover `bg-rail`); voted by you: `bg-line-action text-white`. Voting is a toggle.

**Column** (`NoteColumn.tsx`)
- Header: `text-lg font-bold` tinted with the column's line color.
- Body: `bg-surface-1 rounded-xl border-t-4` in the line color.
- Add row: `rail`-bordered input + a `rounded-lg` button filled with the line color
  (white text, `hover:brightness-90`, `disabled:opacity-40`).

**Buttons (general)**
- Primary/brand: `bg-accent hover:bg-accent-hover text-white`.
- Per-column actions take the column's line color; destructive = `bg-line-improve`,
  confirm = `bg-line-action`, neutral = `bg-ink-muted hover:bg-ink`. All white-text
  fills, `rounded-lg` or `rounded-full` per §4.

**Presence avatars**
- Small colored markers using `getUserColor(userName)` — the rider dots on the map.

**Feedback & motion**
- Toasts via `react-hot-toast`; loading via `react-loading-skeleton` (Board skeleton
  while the room state loads); celebration via `canvas-confetti` — reserved for genuinely
  celebratory moments, not routine actions.
- Room codes and other copyable identifiers render in mono (`font-mono`).

---

## 7. Don'ts

- ✗ Hardcoded hex colors in components — tokens only (`index.css` is the sole palette).
- ✗ Mixing transit lines within one column's UI, or using line colors as text color.
- ✗ Picking a `user-N` token by hand — always `getUserColor()`.
- ✗ Sans-serif vote counts / author tags, or mono note content — keep the two voices apart.
- ✗ Hard shadows, gradients, dark surfaces — the map stays light and calm.
- ✗ Margin-chain spacing — use flex/grid `gap`.
- ✗ Hand-ordered Tailwind class lists — Biome's `useSortedClasses` owns the order
  (`npm run check:fix`).
