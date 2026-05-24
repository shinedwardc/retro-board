import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import { arrayMove } from "@dnd-kit/sortable";
import canvasConfetti from "canvas-confetti";
import {
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import toast from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";
import ConfirmDialog from "../components/confirmDialog";
import NoteColumn from "../components/NoteColumn";
import socket from "../socket";
import type { Note, NoteCategory, Session } from "../types/index";
import { getUserColor } from "../utils/colors";

interface BoardProps {
	session: Session;
	onLeave: () => void;
}

const CATEGORIES: NoteCategory[] = ["positive", "negative", "action"];

const categoryLabel = (cat: NoteCategory) =>
	cat === "positive"
		? "Went Well"
		: cat === "negative"
			? "To Improve"
			: "Actions";

type NotesAction =
	| { type: "set"; notes: Note[] }
	| { type: "add"; note: Note }
	| { type: "update"; noteId: string; updatedContent: string }
	| { type: "vote_toggle"; noteId: string; userName: string }
	| { type: "vote_set"; noteId: string; votes: string[] }
	| { type: "delete"; noteId: string }
	| { type: "move"; noteIds: string[] }
	| { type: "clear" };

function notesReducer(state: Note[], action: NotesAction): Note[] {
	switch (action.type) {
		case "set":
			return action.notes;
		case "add":
			return state.some((n) => n.id === action.note.id)
				? state
				: [...state, action.note];
		case "update":
			return state.map((n) =>
				n.id === action.noteId ? { ...n, content: action.updatedContent } : n,
			);
		case "vote_toggle":
			return state.map((n) => {
				if (n.id !== action.noteId) return n;
				const hasVoted = n.votes.includes(action.userName);
				return {
					...n,
					votes: hasVoted
						? n.votes.filter((v) => v !== action.userName)
						: [...n.votes, action.userName],
				};
			});
		case "vote_set":
			return state.map((n) =>
				n.id === action.noteId ? { ...n, votes: action.votes } : n,
			);
		case "delete":
			return state.filter((n) => n.id !== action.noteId);
		case "move":
			return action.noteIds
				.map((id) => state.find((n) => n.id === id))
				.filter(Boolean) as Note[];
		case "clear":
			return [];
	}
}

const Board = ({ session, onLeave }: BoardProps) => {
	const { roomCode, userName } = session;
	const onLeaveRef = useRef(onLeave);
	onLeaveRef.current = onLeave;

	const [users, setUsers] = useState<string[]>([]);
	const [notes, dispatch] = useReducer(notesReducer, []);
	const [isCreator, setIsCreator] = useState(false);
	const [showConfirm, setShowConfirm] = useState(false);
	const [activeTab, setActiveTab] = useState<NoteCategory>("positive");
	const [isReady, setIsReady] = useState(false);

	// Lets handleDragEnd read the latest notes without being in its dep array
	const notesRef = useRef(notes);
	notesRef.current = notes;

	useEffect(() => {
		socket.once("connect", () => {
			if (session.intent === "create") {
				socket.emit("room:create", { roomCode, userName });
			} else {
				const token = localStorage.getItem(`creator-token:${roomCode}`);
				socket.emit("room:join", {
					roomCode,
					userName,
					token: token ?? undefined,
				});
			}
		});

		socket.on("connect_error", () => {
			onLeaveRef.current();
			toast.error("Could not connect to server. Please try again.");
		});

		socket.connect();

		socket.on("room:error", ({ message }) => {
			onLeaveRef.current();
			toast.error(message);
		});

		socket.on("room:created", ({ token }) => {
			localStorage.setItem(`creator-token:${roomCode}`, token);
		});

		socket.on("room:state", ({ notes, users, isCreator }) => {
			dispatch({ type: "set", notes });
			setUsers(users);
			setIsCreator(isCreator);
			setIsReady(true);
		});

		socket.on("user:joined", ({ userName }) => {
			setUsers((prev) =>
				prev.includes(userName) ? prev : [...prev, userName],
			);
			toast(`${userName} joined the room!`, { icon: "👋" });
		});
		socket.on("user:left", ({ userName }) => {
			setUsers((prevUsers) => prevUsers.filter((user) => user !== userName));
		});
		socket.on("note:created", (note) => dispatch({ type: "add", note }));
		socket.on("note:updated", ({ noteId, updatedContent }) =>
			dispatch({ type: "update", noteId, updatedContent }),
		);
		socket.on("note:voted", ({ noteId, votes, incrementingVote }) => {
			if (incrementingVote) {
				canvasConfetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
			}
			dispatch({ type: "vote_set", noteId, votes });
		});
		socket.on("note:deleted", ({ noteId }) =>
			dispatch({ type: "delete", noteId }),
		);
		socket.on("note:moved", (noteIds) => dispatch({ type: "move", noteIds }));
		socket.on("board:cleared", () => dispatch({ type: "clear" }));

		return () => {
			socket.off("connect_error");
			socket.off("room:error");
			socket.off("room:created");
			socket.off("room:state");
			socket.off("user:joined");
			socket.off("user:left");
			socket.off("note:created");
			socket.off("note:updated");
			socket.off("note:voted");
			socket.off("note:deleted");
			socket.off("note:moved");
			socket.off("board:cleared");
			socket.disconnect();
		};
	}, [roomCode, userName, session.intent]);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			if (!over || active.id === over.id) return;

			const current = notesRef.current;
			const oldIndex = current.findIndex((n) => n.id === active.id);
			const newIndex = current.findIndex((n) => n.id === over.id);
			const reordered = arrayMove(current, oldIndex, newIndex);
			const noteIds = reordered.map((n) => n.id);

			dispatch({ type: "move", noteIds });
			socket.emit("note:move", { roomCode, noteIds });
		},
		[roomCode],
	);

	const handleCopyRoomId = useCallback(() => {
		navigator.clipboard.writeText(roomCode);
		toast.success("Room ID copied to clipboard", {
			position: "top-center",
			style: {
				border: "1px solid #6b7280",
				padding: "12px",
				color: "#6b7280",
			},
			iconTheme: {
				primary: "#6b7280",
				secondary: "#FFFAEE",
			},
		});
	}, [roomCode]);

	const createNote = useCallback(
		(input: string, category: NoteCategory) => {
			const note: Omit<Note, "room_id" | "position" | "created_at"> = {
				id: uuidv4(),
				content: input.trim(),
				category,
				author: userName,
				votes: [],
			};
			dispatch({ type: "add", note: { ...note, room_id: "", position: 0 } });
			socket.emit("note:create", { roomCode, note });
		},
		[roomCode, userName],
	);

	const voteNote = useCallback(
		(noteId: string) => {
			dispatch({ type: "vote_toggle", noteId, userName });
			socket.emit("note:vote", { roomCode, noteId });
		},
		[roomCode, userName],
	);

	const updateNote = useCallback(
		(noteId: string, updatedContent: string) => {
			dispatch({ type: "update", noteId, updatedContent });
			socket.emit("note:update", { roomCode, noteId, updatedContent });
		},
		[roomCode],
	);

	const deleteNote = useCallback(
		(noteId: string) => {
			dispatch({ type: "delete", noteId });
			socket.emit("note:delete", { roomCode, noteId });
		},
		[roomCode],
	);

	const handleConfirmClear = useCallback(() => {
		socket.emit("board:clear", { roomCode });
		setShowConfirm(false);
	}, [roomCode]);

	const positiveNotes = useMemo(
		() => notes.filter((n) => n.category === "positive"),
		[notes],
	);
	const negativeNotes = useMemo(
		() => notes.filter((n) => n.category === "negative"),
		[notes],
	);
	const actionNotes = useMemo(
		() => notes.filter((n) => n.category === "action"),
		[notes],
	);

	const notesByCategory = {
		positive: positiveNotes,
		negative: negativeNotes,
		action: actionNotes,
	};

	if (!isReady) {
		return (
			<div className="h-screen bg-yellow-50 p-3 sm:p-6 flex flex-col">
				<div className="flex items-center justify-between mb-3 sm:mb-6">
					<div className="flex gap-x-4 items-center">
						<div className="h-7 w-28 bg-gray-200 rounded animate-pulse" />
						<div className="h-6 w-32 bg-gray-200 rounded-lg animate-pulse" />
					</div>
					<div className="flex gap-x-4 items-center">
						<div className="h-8 w-24 bg-gray-200 rounded-lg animate-pulse" />
						<div className="h-8 w-16 bg-gray-200 rounded-lg animate-pulse" />
					</div>
				</div>
				<div className="flex-1 min-h-0 flex justify-center w-full">
					<div className="hidden md:grid grid-cols-3 gap-x-4 w-full max-w-6xl h-full">
						{[0, 1, 2].map((i) => (
							<div key={i} className="bg-gray-200 rounded-xl animate-pulse" />
						))}
					</div>
					<div className="md:hidden w-full h-full bg-gray-200 rounded-xl animate-pulse" />
				</div>
			</div>
		);
	}

	return (
		<DndContext onDragEnd={handleDragEnd} modifiers={[restrictToParentElement]}>
			{showConfirm && (
				<ConfirmDialog
					isOpen={showConfirm}
					title="Clear Board"
					message="⚠️ Are you sure you want to clear the board? This action cannot be undone."
					onConfirm={handleConfirmClear}
					onCancel={() => setShowConfirm(false)}
				/>
			)}
			<div className="h-screen bg-yellow-50 p-3 sm:p-6 flex flex-col">
				<div className="flex items-center justify-between mb-3 sm:mb-6 flex-wrap gap-y-2">
					<div className="grid grid-flow-col gap-x-4 items-center">
						<h1 className="text-xl font-bold text-gray-800">Retro Board</h1>
						<p className="text-sm text-gray-500 bg-gray-200 px-2 py-1 rounded-lg">
							Room ID: <span className="font-mono">{roomCode}</span>
						</p>
					</div>
					<div className="grid grid-flow-col gap-x-4 items-center">
						{users && users.length > 0 && (
							<div className="flex flex-row px-2 py-1 rounded-lg items-center">
								<div className="flex flex-row gap-x-0.75">
									{users.map((user) => (
										<p
											key={user}
											className="w-8 h-8 flex items-center justify-center text-xs text-white rounded-full p-2"
											style={{ backgroundColor: getUserColor(user) }}
										>
											{user[0].toUpperCase()}
										</p>
									))}
								</div>
								<h3 className="ml-2 hidden sm:inline">
									{users.length} {users.length === 1 ? "person" : "people"}{" "}
									online
								</h3>
							</div>
						)}
						<button
							type="button"
							onClick={handleCopyRoomId}
							className="text-sm text-white p-2 bg-gray-500 rounded-lg hover:bg-gray-800"
						>
							Copy Room ID
						</button>
						<button
							type="button"
							onClick={onLeave}
							className="text-sm text-white p-2 bg-orange-500 rounded-lg hover:bg-gray-800"
						>
							Leave
						</button>
						{isCreator && (
							<button
								type="button"
								onClick={() => setShowConfirm(true)}
								className="text-sm text-white p-2 bg-red-500 rounded-lg hover:bg-orange-700"
							>
								Clear Board
							</button>
						)}
					</div>
				</div>

				{/* Mobile tab bar */}
				<div className="flex md:hidden gap-x-1 mb-2 shrink-0">
					{CATEGORIES.map((cat) => {
						const count = notesByCategory[cat].length;
						return (
							<button
								key={cat}
								type="button"
								onClick={() => setActiveTab(cat)}
								className={`flex-1 py-2 text-sm font-medium rounded-lg ${activeTab === cat ? "bg-gray-800 text-white" : "bg-gray-200 text-gray-600"}`}
							>
								{categoryLabel(cat)}
								{count > 0 && ` (${count})`}
							</button>
						);
					})}
				</div>

				<div className="flex-1 min-h-0 flex justify-center w-full">
					{/* Mobile: one column at a time */}
					<div className="md:hidden w-full h-full">
						{CATEGORIES.map((cat) => (
							<div
								key={cat}
								className={`h-full ${activeTab === cat ? "block" : "hidden"}`}
							>
								<NoteColumn
									notes={notesByCategory[cat]}
									category={cat}
									voteNote={voteNote}
									createNote={createNote}
									updateNote={updateNote}
									deleteNote={deleteNote}
									userName={userName}
								/>
							</div>
						))}
					</div>

					{/* Desktop: 3-column grid */}
					<div className="hidden md:grid grid-cols-3 gap-x-4 w-full max-w-6xl h-full">
						<NoteColumn
							notes={positiveNotes}
							category="positive"
							voteNote={voteNote}
							createNote={createNote}
							updateNote={updateNote}
							deleteNote={deleteNote}
							userName={userName}
						/>
						<NoteColumn
							notes={negativeNotes}
							category="negative"
							voteNote={voteNote}
							createNote={createNote}
							updateNote={updateNote}
							deleteNote={deleteNote}
							userName={userName}
						/>
						<NoteColumn
							notes={actionNotes}
							category="action"
							voteNote={voteNote}
							createNote={createNote}
							updateNote={updateNote}
							deleteNote={deleteNote}
							userName={userName}
						/>
					</div>
				</div>
			</div>
		</DndContext>
	);
};

export default Board;
