import { createClient } from "redis";

// Who is in each room right now. Backed by Redis (mini-redis) when REDIS_URL is set,
// otherwise by an in-memory Map that is lost on restart — so prod runs without Redis.

// A room's user set dies this long after its last renewal, so users left behind by a
// crashed server get cleaned up without that server having to do anything.
const TTL_SECONDS = 30;
// Renew well inside the TTL so one late tick doesn't drop a live room.
const RENEW_INTERVAL_MS = 10_000;

// RESP: 2 because mini-redis doesn't speak RESP3 (node-redis would otherwise send HELLO 3)
const redis = process.env.REDIS_URL ? createClient({ url: process.env.REDIS_URL, RESP: 2 }) : null;
const memory = new Map<string, Set<string>>();

const key = (roomCode: string) => `room:${roomCode}:users`;

export async function connectPresence() {
	if (!redis) return;
	// Without an error listener, node-redis crashes the process on connection errors
	redis.on("error", (err) => console.error("Redis error:", err));
	await redis.connect();
	console.log("Presence: using Redis");
}

// Returns false if userName is already in the room.
export async function addUser(roomCode: string, userName: string): Promise<boolean> {
	if (!redis) {
		if (!memory.has(roomCode)) memory.set(roomCode, new Set());
		const users = memory.get(roomCode) as Set<string>;
		if (users.has(userName)) return false;
		users.add(userName);
		return true;
	}
	const added = await redis.sAdd(key(roomCode), userName);
	// Set the TTL right away so the set never exists without one, even before the first renewal
	await redis.expire(key(roomCode), TTL_SECONDS);
	return added === 1;
}

export async function removeUser(roomCode: string, userName: string) {
	if (!redis) {
		memory.get(roomCode)?.delete(userName);
		return;
	}
	await redis.sRem(key(roomCode), userName);
}

export async function getUsers(roomCode: string): Promise<string[]> {
	if (!redis) return [...(memory.get(roomCode) ?? [])];
	return redis.sMembers(key(roomCode));
}

// Heartbeat: keep pushing back the TTL of every room this server has users in.
// If this server dies, the renewals stop and its rooms' user sets expire on their own.
export function startRenewing(getActiveRooms: () => Iterable<string>) {
	if (!redis) return;
	setInterval(async () => {
		for (const roomCode of getActiveRooms()) {
			try {
				await redis.expire(key(roomCode), TTL_SECONDS);
			} catch (err) {
				console.error(`Error renewing presence for room ${roomCode}:`, err);
			}
		}
	}, RENEW_INTERVAL_MS);
}
