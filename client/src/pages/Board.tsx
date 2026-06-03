import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import canvasConfetti from "canvas-confetti";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import toast from "react-hot-toast";
import Skeleton from "react-loading-skeleton";
import { v4 as uuidv4 } from "uuid";
import ConfirmDialog from "../components/confirmDialog";
import NoteColumn from "../components/NoteColumn";
import socket from "../socket";
import type { Note, NoteCategory, Session } from "../types/index";
import { getUserColor } from "../utils/colors";
import { byRank, computeRankForDrop, rankForNewNote } from "../utils/ordering";
import "react-loading-skeleton/dist/skeleton.css";

interface BoardProps {
	session: Session;
	onLeave: () => void;
}

const CATEGORIES: NoteCategory[] = ["positive", "negative", "action"];

const categoryLabel = (cat: NoteCategory) =>
	cat === "positive" ? "Went Well" : cat === "negative" ? "To Improve" : "Actions";

type NotesAction =
	| { type: "set"; notes: Note[] }
	| { type: "add"; note: Note }
	| { type: "update"; noteId: string; updatedContent: string }
	| { type: "vote_toggle"; noteId: string; userName: string }
	| { type: "vote_set"; noteId: string; votes: string[] }
	| { type: "delete"; noteId: string }
	| { type: "move"; noteId: string; rank: string }
	| { type: "clear" };

function notesReducer(state: Note[], action: NotesAction): Note[] {
	switch (action.type) {
		case "set":
			return action.notes;
		case "add":
			return state.some((n) => n.id === action.note.id) ? state : [...state, action.note];
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
			return state.map((n) => (n.id === action.noteId ? { ...n, votes: action.votes } : n));
		case "delete":
			return state.filter((n) => n.id !== action.noteId);
		case "move":
			return state.map((n) => (n.id === action.noteId ? { ...n, rank: action.rank } : n));
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
	const [isWaking, setIsWaking] = useState(false);

	// Lets handleDragEnd read the latest notes without being in its dep array
	const notesRef = useRef(notes);
	notesRef.current = notes;

	useEffect(() => {
		socket.once("connect", () => {
			setIsWaking(false);
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

		// A failed attempt usually just means the free-tier server is cold-starting.
		// Keep retrying (see reconnection config in socket.ts) and surface a
		// "waking up" state instead of bouncing the user on the first error.
		socket.on("connect_error", () => {
			setIsWaking(true);
		});

		// Only give up once Socket.IO has exhausted its reconnection attempts.
		socket.io.on("reconnect_failed", () => {
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
			setUsers((prev) => (prev.includes(userName) ? prev : [...prev, userName]));
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
		socket.on("note:deleted", ({ noteId }) => dispatch({ type: "delete", noteId }));
		socket.on("note:moved", ({ noteId, rank }) => dispatch({ type: "move", noteId, rank }));
		socket.on("board:cleared", () => dispatch({ type: "clear" }));

		return () => {
			socket.off("connect_error");
			socket.io.off("reconnect_failed");
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

			const activeId = String(active.id);
			const overId = String(over.id);
			const note = notesRef.current.find((n) => n.id === activeId);
			if (!note) return;

			// Only the dragged note's rank changes — computed from its new neighbors
			// within its own column.
			const column = notesRef.current.filter((n) => n.category === note.category).sort(byRank);
			const rank = computeRankForDrop(column, activeId, overId);
			if (rank === null) return;

			dispatch({ type: "move", noteId: activeId, rank });
			socket.emit("note:move", { roomCode, noteId: activeId, rank });
		},
		[roomCode],
	);

	const handleCopyRoomId = useCallback(() => {
		navigator.clipboard.writeText(roomCode);
		toast.success("Room ID copied to clipboard", {
			position: "top-center",
			style: {
				border: "1px solid var(--color-ink-muted)",
				padding: "12px",
				color: "var(--color-ink-muted)",
			},
			iconTheme: {
				primary: "var(--color-ink-muted)",
				secondary: "var(--color-surface-2)",
			},
		});
	}, [roomCode]);

	const createNote = useCallback(
		(input: string, category: NoteCategory) => {
			const column = notesRef.current.filter((n) => n.category === category).sort(byRank);
			const note: Omit<Note, "created_at"> = {
				id: uuidv4(),
				content: input.trim(),
				category,
				author: userName,
				votes: [],
				rank: rankForNewNote(column),
			};
			dispatch({ type: "add", note });
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
		() => notes.filter((n) => n.category === "positive").sort(byRank),
		[notes],
	);
	const negativeNotes = useMemo(
		() => notes.filter((n) => n.category === "negative").sort(byRank),
		[notes],
	);
	const actionNotes = useMemo(
		() => notes.filter((n) => n.category === "action").sort(byRank),
		[notes],
	);

	const notesByCategory = {
		positive: positiveNotes,
		negative: negativeNotes,
		action: actionNotes,
	};

	if (!isReady) {
		return (
			<div className="flex h-screen flex-col bg-surface-0 p-3 sm:p-6">
				{isWaking && (
					<div className="mb-3 rounded-lg bg-surface-1 px-3 py-2 text-center text-ink-muted text-sm">
						Waking up the server — this can take up to a minute…
					</div>
				)}
				<div className="mb-3 flex items-center justify-between sm:mb-6">
					<div className="flex items-center gap-x-4">
						<Skeleton width={112} height={28} />
						<Skeleton width={128} height={24} borderRadius={8} />
					</div>
					<div className="flex items-center gap-x-4">
						<Skeleton width={96} height={32} borderRadius={8} />
						<Skeleton width={64} height={32} borderRadius={8} />
					</div>
				</div>
				<div className="flex min-h-0 w-full flex-1 justify-center">
					<div className="hidden h-full w-full max-w-6xl grid-cols-3 gap-x-4 md:grid">
						{[0, 1, 2].map((i) => (
							<div key={i} className="h-full">
								<Skeleton height="100%" borderRadius={12} />
							</div>
						))}
					</div>
					<div className="h-full w-full md:hidden">
						<Skeleton height="100%" borderRadius={12} />
					</div>
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
			<div className="flex h-screen flex-col bg-surface-0 p-3 sm:p-6">
				<div className="mb-3 flex flex-wrap items-center justify-between gap-y-2 sm:mb-6">
					<div className="grid grid-flow-col items-center gap-x-4">
						<h1 className="font-bold text-ink-strong text-xl">Retro Board</h1>
						<p className="rounded-lg bg-surface-1 px-2 py-1 text-ink-muted text-sm">
							Room ID: <span className="font-mono">{roomCode}</span>
						</p>
					</div>
					<div className="grid grid-flow-col items-center gap-x-4">
						{users && users.length > 0 && (
							<div className="flex flex-row items-center rounded-lg px-2 py-1">
								<div className="flex flex-row gap-x-0.75">
									{users.map((user) => (
										<p
											key={user}
											className="flex h-8 w-8 items-center justify-center rounded-full p-2 text-white text-xs"
											style={{ backgroundColor: getUserColor(user) }}
										>
											{user[0].toUpperCase()}
										</p>
									))}
								</div>
								<h3 className="ml-2 hidden sm:inline">
									{users.length} {users.length === 1 ? "person" : "people"} online
								</h3>
							</div>
						)}
						<button
							type="button"
							onClick={handleCopyRoomId}
							className="rounded-lg bg-accent p-2 text-sm text-white hover:bg-accent-hover"
						>
							Copy Room ID
						</button>
						<button
							type="button"
							onClick={onLeave}
							className="rounded-lg bg-ink-muted p-2 text-sm text-white hover:bg-ink"
						>
							Leave
						</button>
						{isCreator && (
							<button
								type="button"
								onClick={() => setShowConfirm(true)}
								className="rounded-lg bg-line-improve p-2 text-sm text-white hover:brightness-90"
							>
								Clear Board
							</button>
						)}
					</div>
				</div>

				{/* Mobile tab bar */}
				<div className="mb-2 flex shrink-0 gap-x-1 md:hidden">
					{CATEGORIES.map((cat) => {
						const count = notesByCategory[cat].length;
						return (
							<button
								key={cat}
								type="button"
								onClick={() => setActiveTab(cat)}
								className={`flex-1 rounded-lg py-2 font-medium text-sm ${activeTab === cat ? "bg-accent text-white" : "bg-surface-1 text-ink-muted"}`}
							>
								{categoryLabel(cat)}
								{count > 0 && ` (${count})`}
							</button>
						);
					})}
				</div>

				<div className="flex min-h-0 w-full flex-1 justify-center">
					{/* Mobile: one column at a time */}
					<div className="h-full w-full md:hidden">
						{CATEGORIES.map((cat) => (
							<div key={cat} className={`h-full ${activeTab === cat ? "block" : "hidden"}`}>
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
					<div className="hidden h-full w-full max-w-6xl grid-cols-3 gap-x-4 md:grid">
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
