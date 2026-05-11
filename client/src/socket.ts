import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "./types/index";

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
	import.meta.env.VITE_SERVER_URL || "http://localhost:3000",
	{ autoConnect: false },
);

export default socket;
