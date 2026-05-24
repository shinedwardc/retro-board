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
				`SELECT * FROM notes WHERE room_id = $1 ORDER BY position ASC, created_at ASC`,
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
					const decoded = jwt.verify(
						token,
						process.env.JWT_SECRET as string,
					) as { roomCode: string; role: string };
					if (decoded.roomCode === roomCode && decoded.role === "creator") {
						socket.data.isCreator = true;
					}
				} catch {
					socket.data.isCreator = false;
				}
			}

			const notesQuery = await pool.query<Note>(
				`SELECT * FROM notes WHERE room_id = $1 ORDER BY position ASC, created_at ASC`,
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
		try {
			const countResult = await pool.query<{ count: string }>(
				`SELECT COUNT(*) FROM notes WHERE room_id = $1`,
				[socket.data.roomDbId],
			);
			const position = parseInt(countResult.rows[0].count, 10);
			const result = await pool.query<Note>(
				`INSERT INTO notes (id, room_id, content, category, author, votes, position)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *`,
				[
					note.id,
					socket.data.roomDbId,
					note.content,
					note.category,
					note.author,
					[],
					position,
				],
			);

			const savedNote = result.rows[0];
			io.to(roomCode).emit("note:created", savedNote);
			console.log(
				`Note created in room ${roomCode} by ${socket.data.username}`,
			);
		} catch (err) {
			console.error("Error creating note:", err);
		}
	});

	socket.on("note:update", async ({ roomCode, noteId, updatedContent }) => {
		try {
			await pool.query(
				`UPDATE notes SET content = $1 WHERE id = $2 AND room_id = $3`,
				[updatedContent, noteId, socket.data.roomDbId],
			);

			io.to(roomCode).emit("note:updated", { noteId, updatedContent });
			console.log(
				`Note updated in room ${roomCode} by ${socket.data.username}`,
			);
		} catch (err) {
			console.error("Error updating note:", err);
		}
	});

	socket.on("note:vote", async ({ roomCode, noteId }) => {
		try {
			const result = await pool.query<{ votes: string[] }>(
				`SELECT votes FROM notes WHERE id = $1 AND room_id = $2`,
				[noteId, socket.data.roomDbId],
			);
			const votes = result.rows[0].votes;
			const incrementingVote = !votes.includes(socket.data.username as string);
			const updatedVotes = incrementingVote
				? [...votes, socket.data.username as string]
				: votes.filter((voter) => voter !== socket.data.username);

			await pool.query(
				`UPDATE notes SET votes = $1 WHERE id = $2 AND room_id = $3`,
				[updatedVotes, noteId, socket.data.roomDbId],
			);

			io.to(roomCode).emit("note:voted", {
				noteId,
				votes: updatedVotes,
				incrementingVote,
			});
			console.log(`Note voted in room ${roomCode} by ${socket.data.username}`);
		} catch (err) {
			console.error("Error voting for note:", err);
		}
	});

	socket.on("note:delete", async ({ roomCode, noteId }) => {
		try {
			await pool.query(`DELETE FROM notes WHERE id = $1 AND room_id = $2`, [
				noteId,
				socket.data.roomDbId,
			]);

			io.to(roomCode).emit("note:deleted", { noteId });
			console.log(
				`Note deleted in room ${roomCode} by ${socket.data.username}`,
			);
		} catch (err) {
			console.error("Error deleting note:", err);
		}
	});

	socket.on("board:clear", async ({ roomCode }) => {
		if (!socket.data.isCreator) return;
		try {
			await pool.query(`DELETE FROM notes WHERE room_id = $1`, [
				socket.data.roomDbId,
			]);
			io.to(roomCode).emit("board:cleared");
			console.log(
				`Board cleared in room ${roomCode} by ${socket.data.username}`,
			);
		} catch (err) {
			console.error("Error clearing board:", err);
		}
	});

	socket.on("note:move", async ({ roomCode, noteIds }) => {
		try {
			await Promise.all(
				noteIds.map((id, index) =>
					pool.query(
						`UPDATE notes SET position = $1 WHERE id = $2 AND room_id = $3`,
						[index, id, socket.data.roomDbId],
					),
				),
			);

			io.to(roomCode).emit("note:moved", noteIds);
		} catch (err) {
			console.error("Error moving notes:", err);
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
