import { describe, expect, it } from "vitest";
import type { Note } from "../src/types/index";
import { byRank, computeRankForDrop, rankForNewNote } from "../src/utils/ordering";

const note = (id: string, rank: string): Note => ({
	id,
	content: "",
	category: "positive",
	author: "",
	votes: [],
	rank,
});

const sorted = (notes: Note[]): Note[] => [...notes].sort(byRank);

describe("byRank", () => {
	it("orders by rank, then breaks ties by id", () => {
		const a = note("zzz", "a1");
		const b = note("aaa", "a1");
		const c = note("mmm", "a2");
		expect([c, a, b].sort(byRank).map((n) => n.id)).toEqual(["aaa", "zzz", "mmm"]);
	});
});

describe("rankForNewNote", () => {
	it("returns a usable key for an empty column", () => {
		const r = rankForNewNote([]);
		expect(typeof r).toBe("string");
		expect(r.length).toBeGreaterThan(0);
	});

	it("appends after the last note", () => {
		const col = sorted([note("a", "a1"), note("b", "a2")]);
		expect(rankForNewNote(col) > "a2").toBe(true);
	});
});

describe("computeRankForDrop", () => {
	const col = sorted([note("A", "a1"), note("B", "a2"), note("C", "a3")]);

	it("returns null when the active note is not in the column", () => {
		expect(computeRankForDrop(col, "Z", "A")).toBeNull();
	});

	it("moves a note to the top (sorts before the first)", () => {
		const r = computeRankForDrop(col, "C", "A");
		expect(r).not.toBeNull();
		expect((r as string) < "a1").toBe(true);
	});

	it("moves to the bottom when dropped on the column body (overId not a note)", () => {
		const r = computeRankForDrop(col, "A", "positive");
		expect((r as string) > "a3").toBe(true);
	});

	it("moves a note into the middle (sorts between its new neighbors)", () => {
		const r = computeRankForDrop(col, "C", "B") as string;
		expect(r > "a1").toBe(true);
		expect(r < "a2").toBe(true);
	});

	it("produces the same key when two different notes drop into the same gap", () => {
		const col1 = sorted([note("A", "a1"), note("B", "a3"), note("D", "a9")]);
		const col2 = sorted([note("A", "a1"), note("B", "a3"), note("E", "a8")]);
		const r1 = computeRankForDrop(col1, "D", "B");
		const r2 = computeRankForDrop(col2, "E", "B");
		// Identical neighbors -> identical key. This is the collision the
		// (rank, id) tie-break in byRank is designed to resolve deterministically.
		expect(r1).toBe(r2);
	});
});
