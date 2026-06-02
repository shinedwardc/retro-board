import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo, useState } from "react";
import type { Note, NoteCategory } from "../types/index";

interface NoteCardProps {
	note: Note;
	voteNote: (noteId: string) => void;
	updateNote: (noteId: string, content: string) => void;
	deleteNote: (noteId: string) => void;
	userName: string;
}

// Left edge marks which "line" (column) the note belongs to.
const CATEGORY_BORDER: Record<NoteCategory, string> = {
	positive: "border-line-well",
	negative: "border-line-improve",
	action: "border-line-action",
};

const NoteCard = ({ note, voteNote, updateNote, deleteNote, userName }: NoteCardProps) => {
	const [editedContent, setEditedContent] = useState(note.content);
	const [isEditing, setIsEditingState] = useState(false);

	const {
		attributes,
		listeners,
		setNodeRef: setDraggableNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: note.id,
		disabled: isEditing,
	});

	const style = transform
		? {
				transform: CSS.Transform.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : 1,
				zIndex: isDragging ? 999 : undefined,
			}
		: undefined;

	return (
		<div
			ref={setDraggableNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			className={`flex flex-col gap-2 rounded-xl border-l-4 bg-surface-2 p-3 shadow-sm sm:p-4 ${CATEGORY_BORDER[note.category]}`}
		>
			{isEditing ? (
				<textarea
					value={editedContent}
					onChange={(e) => setEditedContent(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							updateNote(note.id, editedContent);
						}
					}}
					className="flex-1 border-rail border-b bg-transparent text-ink text-sm focus:outline-none"
				/>
			) : (
				<p className="wrap-break-word text-ink text-sm">{note.content}</p>
			)}
			<p className="font-mono text-ink-muted text-xs">— {note.author}</p>
			<div className="mt-1 flex items-center justify-between">
				<button
					type="button"
					onPointerDown={(e) => e.stopPropagation()}
					onClick={() => voteNote(note.id)}
					className={`font-mono text-xs ${note.votes.includes(userName) ? "bg-line-action text-white" : "bg-surface-1 text-ink hover:bg-rail"} rounded-full px-2 py-1`}
				>
					👍 {note.votes.length}
				</button>
				{note.author === userName &&
					(!isEditing ? (
						<div className="flex flex-row items-center gap-x-2">
							<button
								type="button"
								onPointerDown={(e) => e.stopPropagation()}
								onClick={() => {
									setIsEditingState(true);
								}}
								className="rounded-full bg-accent px-2 py-1 text-white text-xs hover:bg-accent-hover"
							>
								Edit
							</button>
							<button
								type="button"
								onPointerDown={(e) => e.stopPropagation()}
								onClick={() => deleteNote(note.id)}
								className="rounded-full bg-line-improve px-2 py-1 text-white text-xs hover:brightness-90"
							>
								Delete
							</button>
						</div>
					) : (
						<div className="flex flex-row items-center gap-x-2">
							<button
								type="button"
								onPointerDown={(e) => e.stopPropagation()}
								onClick={() => {
									updateNote(note.id, editedContent);
									setIsEditingState(false);
								}}
								className="rounded-full bg-line-action px-2 py-1 text-white text-xs hover:brightness-90"
							>
								Save
							</button>
							<button
								type="button"
								onPointerDown={(e) => e.stopPropagation()}
								onClick={() => {
									setEditedContent(note.content);
									setIsEditingState(false);
								}}
								className="rounded-full bg-ink-muted px-2 py-1 text-white text-xs hover:bg-ink"
							>
								Cancel
							</button>
						</div>
					))}
			</div>
		</div>
	);
};

export default memo(NoteCard);
