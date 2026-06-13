/**
 * Broadcast-latency load test for the retro-board Socket.IO server.
 *
 * Measures emit -> peer-receive latency: how long after one client emits
 * `note:create` the OTHER clients in the same room observe the resulting
 * `note:created` broadcast. All virtual clients run in this single process so
 * they share one monotonic clock (performance.now()), making cross-connection
 * timing skew-free.
 *
 * Run against a locally running server:
 *   cd server && npm run dev
 *   LT_ROOMS=20 LT_CLIENTS_PER_ROOM=5 npm run loadtest
 *
 * Tunables (env):
 *   LT_SERVER_URL        target server            (default http://localhost:3000)
 *   LT_ROOMS             number of rooms          (default 10)
 *   LT_CLIENTS_PER_ROOM  sockets per room         (default 5)
 *   LT_DURATION_MS       emit phase duration      (default 15000)
 *   LT_EMIT_INTERVAL_MS  per-room emit interval   (default 1000)
 *   LT_TRANSPORTS        comma list               (default websocket,polling)
 *   LT_RUNS              repeat count, samples pooled across runs (default 1)
 */

import "dotenv/config"; // must precede db.js so DATABASE_URL is set before the pool is built
import { randomUUID } from "node:crypto";
import { io as connect, type Socket } from "socket.io-client";
import pool from "../src/db.js";
import type {
	ClientToServerEvents,
	NoteCategory,
	ServerToClientEvents,
} from "../src/types/index.js";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// ---- Config -----------------------------------------------------------------
const SERVER_URL = process.env.LT_SERVER_URL ?? "http://localhost:3000";
const ROOMS = Number(process.env.LT_ROOMS ?? 10);
const CLIENTS_PER_ROOM = Number(process.env.LT_CLIENTS_PER_ROOM ?? 5);
const DURATION_MS = Number(process.env.LT_DURATION_MS ?? 15_000);
const EMIT_INTERVAL_MS = Number(process.env.LT_EMIT_INTERVAL_MS ?? 1_000);
const TRANSPORTS = (process.env.LT_TRANSPORTS ?? "websocket,polling").split(",") as (
	| "websocket"
	| "polling"
)[];

const RUNS = Number(process.env.LT_RUNS ?? 1);
const TOTAL_CLIENTS = ROOMS * CLIENTS_PER_ROOM;
const categories: NoteCategory[] = ["positive", "negative", "action"];

// ---- Per-run measurement state (reset between runs by resetRunState) ---------
let samples: number[] = []; // broadcast-latency samples for the current run, ms
let pending = new Map<string, number>(); // noteId -> send time (performance.now)
let emitted = 0; // note:create emits issued this run
let received = 0; // note:created broadcasts observed this run
let connectFailures = 0; // connection failures this run

/** Zero the per-run accumulators so one run never inherits another's data. */
function resetRunState(): void {
	samples = [];
	pending = new Map();
	emitted = 0;
	received = 0;
	connectFailures = 0;
}

/** Called by the emitter immediately before emitting note:create. */
function markSent(noteId: string): void {
	pending.set(noteId, performance.now());
	emitted++;
}

/**
 * Called by EVERY client's `note:created` listener when a broadcast arrives.
 * Turn the recorded send time into a broadcast-latency sample (ms) in `samples`.
 */
// Fires once per socket that receives note:created
function recordReceive(noteId: string): void {
	if (pending.has(noteId)){
		const send_time = pending.get(noteId);
		if (send_time === undefined) return;
		const latency = performance.now() - send_time;	
		samples.push(latency);
		received++;
	}
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Connect one client and resolve once it is fully in the room. */
function spawnClient(
	roomCode: string,
	userName: string,
	isCreator: boolean,
): Promise<{ socket: ClientSocket; token?: string }> {
	return new Promise((resolve, reject) => {
		// forceNew gives each virtual client its own connection instead of
		// multiplexing over a shared Manager; reconnection off keeps failures loud.
		const socket: ClientSocket = connect(SERVER_URL, {
			transports: TRANSPORTS,
			forceNew: true, // Force seperate connection
			reconnection: false, // Make sure failures are visible and don't silently retry
		});
		let token: string | undefined;

		socket.on("note:created", (note) => recordReceive(note.id));
		socket.on("room:created", (data) => {
			token = data.token;
		});
		socket.on("room:state", () => resolve({ socket, token }));
		socket.on("room:error", (e) => reject(new Error(e.message)));
		socket.on("connect_error", (e) => {
			connectFailures++;
			reject(e);
		});
		socket.on("connect", () => {
			if (isCreator) socket.emit("room:create", { roomCode, userName });
			else socket.emit("room:join", { roomCode, userName });
		});
	});
}

interface Room {
	roomCode: string;
	creator: ClientSocket;
	sockets: ClientSocket[];
	token?: string;
}

/** Create a room (creator first, so the row exists), then join the rest. */
async function buildRoom(roomIdx: number): Promise<Room> {
	const roomCode = `lt${randomUUID().replace(/-/g, "").slice(0, 6)}`; // 8 chars
	const { socket: creator, token } = await spawnClient(roomCode, `u${roomIdx}_0`, true);
	const sockets: ClientSocket[] = [creator];
	for (let c = 1; c < CLIENTS_PER_ROOM; c++) {
		const { socket } = await spawnClient(roomCode, `u${roomIdx}_${c}`, false);
		sockets.push(socket);
	}
	return { roomCode, creator, sockets, token };
}

// ---- Reporting --------------------------------------------------------------
function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return Number.NaN;
	const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
	return sorted[idx];
}

/**
 * Print the pooled report. `pooledSamples` holds every latency from every run
 * (tail percentiles are computed once over the union); `runP50s` holds each
 * run's own p50 so we can show the run-to-run spread of the stable median.
 */
function report(
	pooledSamples: number[],
	runP50s: number[],
	totalEmitted: number,
	totalReceived: number,
	totalFailures: number,
): void {
	const sorted = [...pooledSamples].sort((a, b) => a - b);
	const fmt = (n: number) => (Number.isNaN(n) ? "n/a" : `${n.toFixed(1)}ms`);
	const seconds = (DURATION_MS / 1000) * RUNS;

	console.log("\n=== Broadcast-latency baseline ===");
	console.log(`runs                ${RUNS}`);
	console.log(`transports          ${TRANSPORTS.join("+")}`);
	console.log(`rooms x clients     ${ROOMS} x ${CLIENTS_PER_ROOM} = ${TOTAL_CLIENTS} sockets`);
	console.log(`connect failures    ${totalFailures}`);
	console.log(`note:create emitted ${totalEmitted}`);
	console.log(`broadcasts received ${totalReceived}`);
	console.log(`pooled samples      ${pooledSamples.length}`);
	if (runP50s.length > 1) {
		console.log(`per-run p50 spread  ${fmt(Math.min(...runP50s))} – ${fmt(Math.max(...runP50s))}`);
	}
	console.log("pooled latency:");
	console.log(`  p50  ${fmt(percentile(sorted, 50))}`);
	console.log(`  p95  ${fmt(percentile(sorted, 95))}`);
	console.log(`  p99  ${fmt(percentile(sorted, 99))}`);
	console.log(`  max  ${fmt(sorted[sorted.length - 1] ?? Number.NaN)}`);
	console.log(`broadcast throughput ${(totalReceived / seconds).toFixed(1)}/s`);
}

async function cleanup(rooms: Room[]): Promise<void> {
	for (const { sockets } of rooms) for (const s of sockets) s.disconnect();

	const roomCodes = rooms.map((r) => r.roomCode);
	if (roomCodes.length === 0) return; // Empty guard
	try {
		await pool.query("DELETE FROM rooms WHERE code = ANY($1)", [roomCodes]);
	} catch (err) {
		console.error("Cleanup DB delete failed:", (err as Error).message);
	}
	// NOTE: the pool is shared across all runs, so it is closed once in main()
	// after the final run — never here, or run N+1 would hit a dead pool.
}

// ---- Run lifecycle ----------------------------------------------------------
interface RunResult {
	samples: number[];
	emitted: number;
	received: number;
	connectFailures: number;
}

/** Execute one full load run (build -> emit -> drain -> cleanup) and return its data. */
async function runOnce(): Promise<RunResult> {
	resetRunState();

	const rooms: Room[] = [];
	for (let r = 0; r < ROOMS; r++) {
		try {
			rooms.push(await buildRoom(r));
		} catch (err) {
			console.error(`Room ${r} setup failed: ${(err as Error).message}`);
		}
	}
	console.log(`${rooms.length}/${ROOMS} rooms ready. Emitting for ${DURATION_MS}ms...`);

	const timers = rooms.map(({ creator, roomCode }, i) =>
		setInterval(() => {
			const id = randomUUID();
			markSent(id);
			creator.emit("note:create", {
				roomCode,
				note: {
					id,
					content: `lt-${id.slice(0, 8)}`,
					category: categories[i % categories.length],
					author: `u${i}_0`,
					votes: [],
					rank: "a0",
				},
			});
		}, EMIT_INTERVAL_MS),
	);

	await sleep(DURATION_MS);
	for (const t of timers) clearInterval(t);
	await sleep(500); // drain in-flight broadcasts

	await cleanup(rooms);
	return { samples, emitted, received, connectFailures };
}

// ---- Main -------------------------------------------------------------------
async function main(): Promise<void> {
	console.log(
		`Load test: ${RUNS} run(s) of ${TOTAL_CLIENTS} clients across ${ROOMS} rooms via ${TRANSPORTS.join("+")}.`,
	);

	const pooledSamples: number[] = []; // every latency sample from every counted run
	const runP50s: number[] = []; // each counted run's own p50, for run-to-run spread
	let totalEmitted = 0;
	let totalReceived = 0;
	let totalFailures = 0;

	for (let run = 1; run <= RUNS; run++) {
		console.log(`\n--- Run ${run}/${RUNS} ---`);
		const result = await runOnce();
		totalEmitted += result.emitted;
		totalReceived += result.received;
		totalFailures += result.connectFailures;

		for (let i = 0; i < result.samples.length; i++) {
			pooledSamples.push(result.samples[i]);
		}
		const runSorted = [...result.samples].sort((a,b) => a - b);
		const p50 = percentile(runSorted, 50);
		runP50s.push(p50);
	}

	await pool.end(); // shared pool: close once, only after the final run
	report(pooledSamples, runP50s, totalEmitted, totalReceived, totalFailures);
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
