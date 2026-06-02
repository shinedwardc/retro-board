import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "./types/index";

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
	import.meta.env.VITE_SERVER_URL || "http://localhost:3000",
	{
		autoConnect: false,
		// The free-tier server (Render) spins down when idle and can take up to
		// ~1 min to cold-start. A generous handshake timeout plus a few retries
		// lets the connection ride out that wake-up instead of failing instantly.
		timeout: 60000,
		reconnectionAttempts: 3,
		reconnectionDelay: 2000,
		reconnectionDelayMax: 5000,
	},
);

export default socket;
