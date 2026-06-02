import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { memo, useState } from "react";
import type { Note, NoteCategory } from "../types/index";
import NoteCard from "./NoteCard";

interface NoteColumnProps {
	notes: Note[];
	category: NoteCategory;
	voteNote: (noteId: string) => void;
	createNote: (input: string, category: NoteCategory) => void;
	updateNote: (noteId: string, content: string) => void;
	deleteNote: (noteId: string) => void;
	userName: string;
}

// Per-column "transit line" styling. Static strings so Tailwind can see them.
const COLUMN_STYLES: Record<NoteCategory, { title: string; line: string; addButton: string }> = {
	positive: { title: "text-line-well", line: "border-line-well", addButton: "bg-line-well" },
	negative: {
		title: "text-line-improve",
		line: "border-line-improve",
		addButton: "bg-line-improve",
	},
	action: { title: "text-line-action", line: "border-line-action", addButton: "bg-line-action" },
};

const NoteColumn = ({
	notes,
	category,
	voteNote,
	createNote,
	updateNote,
	deleteNote,
	userName,
}: NoteColumnProps) => {
	const [input, setInput] = useState("");
	const styles = COLUMN_STYLES[category];

	const { setNodeRef } = useDroppable({
		id: category,
	});

	return (
		<div className="flex h-full flex-col">
			<div className="mb-2 flex items-center justify-center gap-x-2">
				<h2 className={`text-center font-bold text-lg ${styles.title}`}>
					{category === "positive"
						? "What went well"
						: category === "negative"
							? "What to improve"
							: "Action Items"}
				</h2>
			</div>
			<div
				className={`flex min-h-0 flex-1 flex-col gap-y-4 rounded-xl border-t-4 bg-surface-1 p-3 ${styles.line}`}
			>
				<div className="flex flex-row gap-x-2">
					<input
						className="min-w-0 flex-1 rounded-lg border border-rail bg-surface-2 px-4 py-2 text-ink text-sm focus:border-accent focus:outline-none"
						placeholder="Add note..."
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && input.trim()) {
								createNote(input.trim(), category);
								setInput("");
							}
						}}
					/>
					<button
						type="button"
						disabled={!input.trim()}
						onClick={() => {
							createNote(input.trim(), category);
							setInput("");
						}}
						className={`rounded-lg px-4 py-2 font-medium text-sm text-white hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-40 ${styles.addButton}`}
					>
						+
					</button>
				</div>
				<div ref={setNodeRef} className="flex min-h-0 flex-1 flex-col gap-y-2 overflow-y-auto">
					{notes.length > 0 ? (
						<SortableContext
							items={notes.map((note) => note.id)}
							strategy={verticalListSortingStrategy}
						>
							{notes.map((note) => (
								<NoteCard
									key={note.id}
									note={note}
									voteNote={voteNote}
									updateNote={updateNote}
									deleteNote={deleteNote}
									userName={userName}
								/>
							))}
						</SortableContext>
					) : (
						<div>
							{category === "positive" ? (
								<div className="mt-10 text-center text-ink-muted">
									<p>What went well?</p>
									<p>Start by adding some positive notes to celebrate your team's successes!</p>
								</div>
							) : category === "negative" ? (
								<div className="mt-10 text-center text-ink-muted">
									<p>What to improve?</p>
									<p>Start by adding some constructive feedback to help your team grow!</p>
								</div>
							) : (
								<div className="mt-10 text-center text-ink-muted">
									<p>No action items yet.</p>
									<p>Add some tasks to plan ahead and keep the momentum going!</p>
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default memo(NoteColumn);
