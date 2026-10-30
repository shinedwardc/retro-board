import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "./types/index";

// In production builds with no VITE_SERVER_URL, io() connects to the page's own origin
// (Caddy serves the app and proxies /socket.io on the same domain), so one build works anywhere
const serverUrl =
	import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? "http://localhost:3000" : undefined);

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl, {
	autoConnect: false,
	transports: ["websocket", "polling"], // Try websocket protocol first
	timeout: 60000,
	reconnectionAttempts: 3,
	reconnectionDelay: 2000,
	reconnectionDelayMax: 5000,
});

export default socket;
