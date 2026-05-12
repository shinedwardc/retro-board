import { useDroppable } from "@dnd-kit/core";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useState } from "react";
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

	const { setNodeRef } = useDroppable({
		id: category,
	});

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center justify-center mb-2 gap-x-2">
				<h2 className="text-lg text-center font-bold text-gray-800">
					{category === "positive"
						? "What went well"
						: category === "negative"
							? "What to improve"
							: "Action Items"}
				</h2>
			</div>
			<div className="flex flex-col gap-y-4 flex-1 min-h-0 p-3 bg-gray-300 rounded-xl">
				<div className="flex flex-row gap-x-2">
					<input
						className="flex-1 min-w-0 border rounded-lg px-4 py-2 text-sm bg-white"
						placeholder="Add note..."
						value={input}
						onChange={(e) => {
							setInput(e.target.value);
						}}
					/>
					<button
						type="button"
						onClick={() => {
							createNote(input, category);
							setInput("");
						}}
						className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
					>
						+
					</button>
				</div>
				<div
					ref={setNodeRef}
					className="flex flex-col gap-y-2 flex-1 min-h-0 overflow-y-auto"
				>
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
								<div className="text-center text-gray-500 mt-10">
									<p>What went well?</p>
									<p>
										Start by adding some positive notes to celebrate your team's
										successes!
									</p>
								</div>
							) : category === "negative" ? (
								<div className="text-center text-gray-500 mt-10">
									<p>What to improve?</p>
									<p>
										Start by adding some constructive feedback to help your team
										grow!
									</p>
								</div>
							) : (
								<div className="text-center text-gray-500 mt-10">
									<p>No action items yet.</p>
									<p>
										Add some tasks to plan ahead and keep the momentum going!
									</p>
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default NoteColumn;
