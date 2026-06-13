import "dotenv/config";
import jwt from "jsonwebtoken";
import type { Server, Socket } from "socket.io";
import pool from "../db.js";
import type {
	ClientToServerEvents,
	Note,
	ServerToClientEvents,
	SocketData,
} from "../types/index.js";

// Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
type AppServer = Server<
	ClientToServerEvents,
	ServerToClientEvents,
	Record<string, never>,
	SocketData
>;
type AppSocket = Socket<
	ClientToServerEvents,
	ServerToClientEvents,
	Record<string, never>,
	SocketData
>;

const roomUsers = new Map<string, string[]>();

export function registerSocketHandlers(io: AppServer, socket: AppSocket) {
	socket.on("room:create", async ({ roomCode, userName }) => {
		socket.join(roomCode);
		socket.data.username = userName;
		socket.data.roomCode = roomCode;

		try {
			const insertResult = await pool.query<{ id: string; code: string }>(
				`INSERT INTO rooms (code) VALUES ($1) ON CONFLICT (code) DO NOTHING RETURNING *`,
				[roomCode],
			);

			if (insertResult.rows.length === 0) {
				socket.emit("room:error", {
					message: "Room code already taken. Please try again.",
				});
				return;
			}

			const room = insertResult.rows[0];

			socket.data.roomDbId = room.id;
			socket.data.isCreator = true;

			const creatorToken = jwt.sign(
				{ roomId: room.id, roomCode, role: "creator" },
				process.env.JWT_SECRET as string,
				{ expiresIn: "30d" },
			);
			socket.emit("room:created", { token: creatorToken });

			if (!roomUsers.has(roomCode)) roomUsers.set(roomCode, []);
			const users = roomUsers.get(roomCode) as string[];
			if (!users.includes(userName)) users.push(userName);

			const notesQuery = await pool.query<Note>(
				`SELECT * FROM notes WHERE room_id = $1 ORDER BY category ASC, rank ASC, id ASC`,
				[socket.data.roomDbId],
			);
			socket.emit("room:state", {
				notes: notesQuery.rows,
				users,
				isCreator: true,
			});
			console.log(`Room ${roomCode} created by ${userName}`);
		} catch (err) {
			console.error("Error creating room:", err);
			socket.emit("room:error", {
				message: "Failed to create room. Please try again.",
			});
		}
	});

	socket.on("room:join", async ({ roomCode, userName, token }) => {
		socket.join(roomCode);
		socket.data.username = userName;
		socket.data.roomCode = roomCode;

		try {
			const result = await pool.query<{ id: string; code: string }>(
				`SELECT * FROM rooms WHERE code = $1`,
				[roomCode],
			);

			if (result.rows.length === 0) {
				socket.emit("room:error", {
					message: "Room not found. Check the code and try again.",
				});
				return;
			}

			const room = result.rows[0];
			socket.data.roomDbId = room.id;

			if (token) {
				try {
					const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
						roomCode: string;
						role: string;
					};
					if (decoded.roomCode === roomCode && decoded.role === "creator") {
						socket.data.isCreator = true;
					}
				} catch {
					socket.data.isCreator = false;
				}
			}

			const notesQuery = await pool.query<Note>(
				`SELECT * FROM notes WHERE room_id = $1 ORDER BY category ASC, rank ASC, id ASC`,
				[socket.data.roomDbId],
			);
			const notes = notesQuery.rows;

			if (!roomUsers.has(roomCode)) roomUsers.set(roomCode, []);
			const users = roomUsers.get(roomCode) as string[];

			if (users.includes(userName)) {
				socket.emit("room:error", {
					message: `"${userName}" is already taken in this room.`,
				});
				return;
			}
			users.push(userName);

			if (users.length > 1) {
				socket.to(roomCode).emit("user:joined", { userName });
			}
			socket.emit("room:state", {
				notes,
				users,
				isCreator: socket.data.isCreator ?? false,
			});
			console.log(`${userName} joined room ${roomCode}`);
		} catch (err) {
			console.error("Error joining room:", err);
			socket.emit("room:error", {
				message: "Failed to join room. Please try again.",
			});
		}
	});

	socket.on("note:create", async ({ roomCode, note }) => {
		const savedNote: Note = {
			id: note.id,
			room_id: socket.data.roomDbId as string,
			content: note.content,
			category: note.category,
			author: note.author,
			votes: [],
			rank: note.rank,
			created_at: new Date().toISOString(),
		};
		io.to(roomCode).emit("note:created", savedNote);
		console.log(`Note created in room ${roomCode} by ${socket.data.username}`);

		try {
			await pool.query(
				`INSERT INTO notes (id, room_id, content, category, author, votes, rank)
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
				[note.id, socket.data.roomDbId, note.content, note.category, note.author, [], note.rank],
			);
		} catch (err) {
			console.error("Error creating note:", err);
			// Compensating broadcast: the optimistic note:created already put this note
			// on every board, but the INSERT failed. Roll it back, flagged so clients
			// can distinguish this from a real user-initiated delete.
			io.to(roomCode).emit("note:deleted", { noteId: note.id, reason: "save-failed" });
		}
	});

	socket.on("note:update", async ({ roomCode, noteId, updatedContent }) => {
		// Optimistic broadcast: emit before persisting (payload is fully known from input).
		io.to(roomCode).emit("note:updated", { noteId, updatedContent });
		console.log(`Note updated in room ${roomCode} by ${socket.data.username}`);

		try {
			await pool.query(`UPDATE notes SET content = $1 WHERE id = $2 AND room_id = $3`, [
				updatedContent,
				noteId,
				socket.data.roomDbId,
			]);
		} catch (err) {
			console.error("Error updating note:", err);
		}
	});

	socket.on("note:vote", async ({ roomCode, noteId }) => {
		const username = socket.data.username as string;
		try {
			// Atomic toggle: one UPDATE reads and rewrites the votes array under a row
			// lock, so concurrent votes on the same note serialize instead of racing
			// (no lost updates). RETURNING hands back the authoritative new state.
			const result = await pool.query<{ votes: string[]; incrementing: boolean }>(
				`UPDATE notes 
				SET votes = 
				CASE
					WHEN $3 = ANY(votes) THEN array_remove(votes, $3)
					ELSE array_append(votes, $3)
				END
				WHERE id = $1 AND room_id = $2
				RETURNING votes, ($3 = ANY(votes)) AS incrementing
				`,
				[noteId, socket.data.roomDbId, username],
			);

			const { votes, incrementing } = result.rows[0];
			io.to(roomCode).emit("note:voted", {
				noteId,
				votes,
				incrementingVote: incrementing,
			});
			console.log(`Note voted in room ${roomCode} by ${username}`);
		} catch (err) {
			console.error("Error voting for note:", err);
		}
	});

	socket.on("note:delete", async ({ roomCode, noteId }) => {
		// Optimistic broadcast: emit before persisting (payload is fully known from input).
		io.to(roomCode).emit("note:deleted", { noteId });
		console.log(`Note deleted in room ${roomCode} by ${socket.data.username}`);

		try {
			await pool.query(`DELETE FROM notes WHERE id = $1 AND room_id = $2`, [
				noteId,
				socket.data.roomDbId,
			]);
		} catch (err) {
			console.error("Error deleting note:", err);
		}
	});

	socket.on("board:clear", async ({ roomCode }) => {
		if (!socket.data.isCreator) return;
		// Optimistic broadcast: emit before persisting (creator already authorized above).
		io.to(roomCode).emit("board:cleared");
		console.log(`Board cleared in room ${roomCode} by ${socket.data.username}`);

		try {
			await pool.query(`DELETE FROM notes WHERE room_id = $1`, [socket.data.roomDbId]);
		} catch (err) {
			console.error("Error clearing board:", err);
		}
	});

	socket.on("note:move", async ({ roomCode, noteId, rank }) => {
		io.to(roomCode).emit("note:moved", { noteId, rank });
		try {
			await pool.query(`UPDATE notes SET rank = $1 WHERE id = $2 AND room_id = $3`, [
				rank,
				noteId,
				socket.data.roomDbId,
			]);
		} catch (err) {
			console.error("Error moving note:", err);
		}
	});

	socket.on("disconnect", async () => {
		const { username, roomCode } = socket.data;
		if (!username || !roomCode) return;

		const users = roomUsers.get(roomCode);
		if (!users) return;

		roomUsers.set(
			roomCode,
			users.filter((u) => u !== username),
		);
		socket.to(roomCode).emit("user:left", { userName: username });
		console.log(`${username} left room ${roomCode}`);
	});
}
