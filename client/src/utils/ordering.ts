import { generateKeyBetween } from "fractional-indexing";
import type { Note } from "../types/index";

// Pure array move — kept local so this module stays DOM-free and unit-testable
// without pulling in @dnd-kit.
function arrayMove<T>(arr: T[], from: number, to: number): T[] {
	const copy = arr.slice();
	const [item] = copy.splice(from, 1);
	copy.splice(to, 0, item);
	return copy;
}

// Sort comparator for notes within a column: fractional rank first, tie-broken by
// id. Ranks are plain ASCII fractional-index keys, so lexicographic `<` matches
// the ordering generateKeyBetween was built against. The id tie-break makes the
// order deterministic across clients even when two notes share a rank.
export function byRank(a: Note, b: Note): number {
	if (a.rank < b.rank) return -1;
	if (a.rank > b.rank) return 1;
	if (a.id < b.id) return -1;
	if (a.id > b.id) return 1;
	return 0;
}

// Rank that appends a new note to the end of its (already byRank-sorted) column.
export function rankForNewNote(columnSorted: Note[]): string {
	const last = columnSorted[columnSorted.length - 1];
	return generateKeyBetween(last?.rank ?? null, null);
}

// New rank for `activeId` dropped onto `overId` within a column already sorted by
// byRank. `overId` may be a sibling note id, or the column's droppable id when the
// note is dropped on empty space — in that case it goes to the end. Returns null
// if the active note isn't in this column (nothing to do).
export function computeRankForDrop(
	columnSorted: Note[],
	activeId: string,
	overId: string,
): string | null {
	const oldIndex = columnSorted.findIndex((n) => n.id === activeId);
	if (oldIndex === -1) return null;

	let newIndex = columnSorted.findIndex((n) => n.id === overId);
	if (newIndex === -1) newIndex = columnSorted.length - 1;

	const reordered = arrayMove(columnSorted, oldIndex, newIndex);
	const pos = reordered.findIndex((n) => n.id === activeId);
	const prev = reordered[pos - 1] ?? null;
	const next = reordered[pos + 1] ?? null;
	return generateKeyBetween(prev?.rank ?? null, next?.rank ?? null);
}
