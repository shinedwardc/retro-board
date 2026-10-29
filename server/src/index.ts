import { createServer } from "node:http";
import cors from "cors";
import "dotenv/config";
import express from "express";
import { Server } from "socket.io";
import { connectPresence, startRenewing } from "./presence.js";
import { registerSocketHandlers } from "./socket/handlers.js";
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from "./types/index.js";

const app = express();
const httpServer = createServer(app);

const io = new Server<
	ClientToServerEvents,
	ServerToClientEvents,
	Record<string, never>,
	SocketData
>(httpServer, {
	cors: {
		origin: process.env.CLIENT_URL || "http://localhost:5173",
		methods: ["GET", "POST"],
	},
	transports: ["websocket", "polling"],
});

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

io.on("connection", (socket) => {
	console.log(`Client connected: ${socket.id}`);
	registerSocketHandlers(io, socket);
	socket.on("disconnect", () => console.log(`Client disconnected: ${socket.id}`));
});

await connectPresence();
// Rooms that have at least one joined user on this server
startRenewing(() => {
	const rooms = new Set<string>();
	for (const s of io.sockets.sockets.values()) {
		if (s.data.roomCode) rooms.add(s.data.roomCode);
	}
	return rooms;
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
