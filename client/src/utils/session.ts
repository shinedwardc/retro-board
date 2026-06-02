import type { Session } from "../types/index";

const ROOM_PREFIX = "/room/";

// localStorage key for the remembered display name, so a refresh can rejoin
// without re-prompting.
export const USERNAME_KEY = "retro:userName";

/** Extract the room code from a `/room/CODE` path, or null if it isn't one. */
export function parseRoomFromPath(pathname: string): string | null {
	if (!pathname.startsWith(ROOM_PREFIX)) return null;
	const code = pathname.slice(ROOM_PREFIX.length).split("/")[0];
	return code ? decodeURIComponent(code).toUpperCase() : null;
}

/** Build the canonical path for a room. */
export function roomPath(roomCode: string): string {
	return `${ROOM_PREFIX}${encodeURIComponent(roomCode)}`;
}

// Rebuild the session from the URL on load / history navigation. A room code in
// the path plus a remembered name means we can silently rejoin — the room
// already exists, so intent is always "join". Without a stored name we return
// null and let Home prompt for one (pre-filled with the room code).
export function sessionFromUrl(): Session | null {
	const roomCode = parseRoomFromPath(window.location.pathname);
	if (!roomCode) return null;
	const userName = localStorage.getItem(USERNAME_KEY);
	if (!userName) return null;
	return { roomCode, userName, intent: "join" };
}
