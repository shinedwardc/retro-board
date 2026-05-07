import { DndContext } from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import { arrayMove } from "@dnd-kit/sortable";
import canvasConfetti from "canvas-confetti";
import { useEffect, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";
import ConfirmDialog from "../components/confirmDialog";
import NoteColumn from "../components/NoteColumn";
import socket from "../socket";
import { getUserColor } from "../utils/colors";

const Board = ({ session, onLeave }) => {
	const { roomCode, userName } = session;
	const [users, setUsers] = useState([]);
	const [notes, setNotes] = useState([]);
	const [isCreator, setIsCreator] = useState(false);
	const [showConfirm, setShowConfirm] = useState(false);

	// Set up socket event listeners and join room on component mount
	useEffect(() => {
		socket.connect();

		// Send creator token if we have one stored for this room
		const token = localStorage.getItem(`creator-token:${roomCode}`);
		socket.emit("room:join", { roomCode, userName, token });

		// If we just created the room, store the creator token
		socket.on("room:created", ({ token }) => {
			localStorage.setItem(`creator-token:${roomCode}`, token);
		});

		// Handle initial room state and updates
		socket.on("room:state", ({ notes, users, isCreator }) => {
			setNotes(notes);
			setUsers(users);
			setIsCreator(isCreator);
		});

		/* Handle user join/leave and note events */
		socket.on("user:joined", ({ userName }) => {
			setUsers((prev) =>
				prev.includes(userName) ? prev : [...prev, userName],
			);
			toast(`${userName} joined the room!`, {
				icon: "👋",
			});
		});
		socket.on("user:left", ({ userName }) => {
			setUsers((prevUsers) => prevUsers.filter((user) => user !== userName));
		});
		socket.on("note:created", (note) =>
			setNotes((prevNotes) => [...prevNotes, note]),
		);
		socket.on("note:updated", ({ noteId, updatedContent }) =>
			setNotes((prevNotes) =>
				prevNotes.map((note) =>
					note.id === noteId ? { ...note, content: updatedContent } : note,
				),
			),
		);
		socket.on("note:voted", ({ noteId, votes, incrementingVote }) => {
			incrementingVote &&
				canvasConfetti({
					particleCount: 60,
					spread: 70,
					origin: { y: 0.6 },
				}); // Trigger confetti animation on upvote
			setNotes((prevNotes) =>
				prevNotes.map((note) =>
					note.id === noteId ? { ...note, votes } : note,
				),
			);
		});
		socket.on("note:deleted", ({ noteId }) =>
			setNotes((prevNotes) => prevNotes.filter((note) => note.id !== noteId)),
		);
		socket.on("note:moved", (noteIds) => {
			setNotes((prev) =>
				noteIds.map((id) => prev.find((n) => n.id === id)).filter(Boolean),
			);
		});
		socket.on("board:cleared", () => setNotes([]));

		return () => {
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
	}, [roomCode, userName]);

	// Drag and drop handler for reordering notes
	const handleDragEnd = (event) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const oldIndex = notes.findIndex((n) => n.id === active.id);
		const newIndex = notes.findIndex((n) => n.id === over.id);
		const reordered = arrayMove(notes, oldIndex, newIndex);

		setNotes(reordered);
		socket.emit("note:move", {
			roomCode,
			noteIds: reordered.map((n) => n.id),
		});
	};

	const handleCopyRoomId = () => {
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
	};

	const createNote = (input, category) => {
		socket.emit("note:create", {
			roomCode,
			note: {
				id: uuidv4(),
				content: input.trim(),
				category: category,
				author: userName,
				votes: [],
			},
		});
	};

	const voteNote = (noteId) => {
		socket.emit("note:vote", { roomCode, noteId });
	};

	const updateNote = (noteId, updatedContent) => {
		socket.emit("note:update", { roomCode, noteId, updatedContent });
	};

	const deleteNote = (noteId) => {
		socket.emit("note:delete", { roomCode, noteId });
	};

	const clearBoard = () => {
		setShowConfirm(true);
	};

	const handleConfirmClear = () => {
		socket.emit("board:clear", { roomCode });
		setShowConfirm(false);
	};

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
			<div className="h-screen bg-yellow-50 p-6 flex flex-col">
				{/* Header */}
				<div className="flex items-center justify-between mb-6">
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
											className={`w-8 h-8 flex items-center justify-center text-xs text-white rounded-full p-2`}
											style={{ backgroundColor: getUserColor(user) }}
										>
											{user[0].toUpperCase()}
										</p>
									))}
								</div>
								<h3 className="ml-2">
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
								onClick={clearBoard}
								className="text-sm text-white p-2 bg-red-500 rounded-lg hover:bg-orange-700"
							>
								Clear Board
							</button>
						)}
					</div>
				</div>

				{/* Notes grid */}
				<div className="flex justify-center w-full">
					<div className="grid grid-cols-3 gap-x-4 w-full max-w-6xl">
						<NoteColumn
							notes={notes.filter((note) => note.category === "positive")}
							category="positive"
							voteNote={voteNote}
							createNote={createNote}
							updateNote={updateNote}
							deleteNote={deleteNote}
							userName={userName}
						/>
						<NoteColumn
							notes={notes.filter((note) => note.category === "negative")}
							category="negative"
							voteNote={voteNote}
							createNote={createNote}
							updateNote={updateNote}
							deleteNote={deleteNote}
							userName={userName}
						/>
						<NoteColumn
							notes={notes.filter((note) => note.category === "action")}
							category="action"
							voteNote={voteNote}
							createNote={createNote}
							updateNote={updateNote}
							deleteNote={deleteNote}
							userName={userName}
						/>
					</div>
				</div>
				<Toaster position="bottom-right" reverseOrder={false} />
			</div>
		</DndContext>
	);
};

export default Board;
