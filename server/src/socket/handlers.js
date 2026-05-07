import "dotenv/config";
import jwt from "jsonwebtoken";
import pool from "../db.js";

// Track users in each room in memory
const roomUsers = new Map();
/* roomUsers : {
/   [roomId]: [userName1, userName2, ...]
*/

// roomCode: a unique code for the room that clients use to join (e.g. "ABCD1234")
// roomDbId: the actual room ID from the database (UUID from postgres) that is used for database operations

export function registerSocketHandlers(io, socket) {
	// Handle client request to join a room
	socket.on("room:join", async ({ roomCode, userName, token = null }) => {
		socket.join(roomCode);
		socket.data.username = userName;
		socket.data.roomCode = roomCode;

		try {
			let roomQuery = await pool.query(`SELECT * FROM rooms WHERE code = $1`, [
				roomCode,
			]);

			if (roomQuery.rows.length === 0) {
				// Create new room and issue a creator JWT if room didn't exist
				roomQuery = await pool.query(
					`INSERT INTO rooms (code) VALUES ($1) RETURNING *`,
					[roomCode],
				);

				const newRoom = roomQuery.rows[0];
				const creatorToken = jwt.sign(
					{ roomId: newRoom.id, roomCode, role: "creator" },
					process.env.JWT_SECRET,
					{ expiresIn: "30d" },
				);

				// Mark this socket connection as the creator of the room
				socket.data.isCreator = true;
				socket.emit("room:created", { token: creatorToken });
			} else {
				// Existing room — check if they have a valid creator token
				if (token) {
					try {
						const decoded = jwt.verify(token, process.env.JWT_SECRET);
						if (decoded.roomCode === roomCode && decoded.role === "creator") {
							socket.data.isCreator = true;
						}
					} catch {
						// Invalid/expired token — treat as regular user
						socket.data.isCreator = false;
					}
				}
			}

			const room = roomQuery.rows[0];
			// Store the actual room ID from the database in socket data for future reference in database operations
			socket.data.roomDbId = room.id;

			// Fetch existing notes for the room from the database
			const notesQuery = await pool.query(
				`SELECT * FROM notes WHERE room_id = $1 ORDER BY position ASC, created_at ASC`,
				[socket.data.roomDbId],
			);
			const notes = notesQuery.rows;

			// Set up in-memory user tracking for the room if it didn't exist in memory
			if (!roomUsers.has(roomCode)) {
				roomUsers.set(roomCode, []);
			}

			// Fetch currently connected users in the room
			const users = roomUsers.get(roomCode);
			if (users.includes(userName)) {
				socket.emit("room:error", {
					message: `"${userName}" is already taken in this room.`,
				});
				return;
			}
			// Add the new user to the room's connected user list
			users.push(userName);

			if (users.length > 1) {
				// Notify existing users in the room that a new user has joined
				socket.to(roomCode).emit("user:joined", { userName });
			}
			// Broadcast the current state of the room to the newly joined user
			socket.emit("room:state", {
				notes,
				users,
				isCreator: socket.data.isCreator ?? false,
			});
		} catch (err) {
			console.error("Error joining room:", err);
		}
	});

	// Handle note creation request from client
	socket.on("note:create", async ({ roomCode, note }) => {
		try {
			const countResult = await pool.query(
				`SELECT COUNT(*) FROM notes WHERE room_id = $1`,
				[socket.data.roomDbId],
			);
			const position = parseInt(countResult.rows[0].count, 10);
			const result = await pool.query(
				`INSERT INTO notes (room_id, content, category, author, votes, position)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *`,
				[
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

	// Handle note update request from client
	socket.on("note:update", async ({ roomCode, noteId, updatedContent }) => {
		try {
			// Update the note's existing content with new content
			await pool.query(
				`UPDATE notes SET content = $1 WHERE id = $2 AND room_id = $3`,
				[updatedContent, noteId, socket.data.roomDbId],
			);

			// Broadcast the updated note to all users in the room, including the sender
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
			const result = await pool.query(
				`SELECT votes FROM notes WHERE id = $1 AND room_id = $2`,
				[noteId, socket.data.roomDbId],
			);
			const votes = result.rows[0].votes;
			const incrementingVote = !votes.includes(socket.data.username);
			let updatedVotes;
			if (incrementingVote) {
				// User is voting for the note, and the user hasn't voted for it yet, so add the user's vote
				updatedVotes = [...votes, socket.data.username];
			} else {
				// User has already voted, remove the vote from the user
				updatedVotes = votes.filter((voter) => voter !== socket.data.username);
			}

			await pool.query(
				`UPDATE notes SET votes = $1 WHERE id = $2 AND room_id = $3`,
				[updatedVotes, noteId, socket.data.roomDbId],
			);

			// Broadcast the updated vote count to all users in the room, including the sender
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

			// Broadcast the note deletion to all users in the room, including the sender
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
