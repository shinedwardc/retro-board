import { useState } from "react";
import type { Session } from "../types/index";
import generateRoomCode from "../utils/generateRoomCode";
import { USERNAME_KEY } from "../utils/session";

interface HomeProps {
	onJoin: (session: Session) => void;
	initialRoomCode?: string;
}

const Home = ({ onJoin, initialRoomCode }: HomeProps) => {
	const [tab, setTab] = useState<"create" | "join">(initialRoomCode ? "join" : "create");
	const [username, setUsername] = useState(() => localStorage.getItem(USERNAME_KEY) ?? "");
	const [roomCode, setRoomCode] = useState(initialRoomCode ?? "");

	const handleCreate = () => {
		if (!username.trim()) return;
		onJoin({
			roomCode: generateRoomCode(),
			userName: username.trim(),
			intent: "create",
		});
	};

	const handleJoin = () => {
		if (!username.trim() || !roomCode.trim()) return;
		onJoin({
			roomCode: roomCode.trim().toUpperCase(),
			userName: username.trim(),
			intent: "join",
		});
	};

	return (
		<div className="flex min-h-screen items-center justify-center bg-surface-0">
			<div className="w-full max-w-md space-y-5 rounded-xl bg-surface-2 p-8 shadow-md">
				<h1 className="font-bold text-2xl text-ink-strong">Retro Board</h1>

				<div className="flex overflow-hidden rounded-lg border border-rail">
					<button
						type="button"
						onClick={() => setTab("create")}
						className={`flex-1 py-2 font-medium text-sm transition-colors ${
							tab === "create"
								? "bg-accent text-white"
								: "bg-surface-2 text-ink-muted hover:bg-surface-1"
						}`}
					>
						Create Room
					</button>
					<button
						type="button"
						onClick={() => setTab("join")}
						className={`flex-1 py-2 font-medium text-sm transition-colors ${
							tab === "join"
								? "bg-accent text-white"
								: "bg-surface-2 text-ink-muted hover:bg-surface-1"
						}`}
					>
						Join Room
					</button>
				</div>

				<input
					className="w-full rounded-lg border border-rail px-4 py-2 text-ink text-sm focus:border-accent focus:outline-none"
					placeholder="Your name"
					value={username}
					onChange={(e) => setUsername(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && tab === "create") handleCreate();
					}}
				/>

				{tab === "create" ? (
					<button
						type="button"
						disabled={!username.trim()}
						onClick={handleCreate}
						className="w-full rounded-lg bg-accent py-2 font-medium text-sm text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
					>
						Create New Room
					</button>
				) : (
					<div className="space-y-3">
						<input
							className="w-full rounded-lg border border-rail px-4 py-2 text-ink text-sm focus:border-accent focus:outline-none"
							placeholder="Room Code"
							value={roomCode}
							onChange={(e) => setRoomCode(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleJoin();
							}}
						/>
						<button
							type="button"
							disabled={!username.trim() || !roomCode.trim()}
							onClick={handleJoin}
							className="w-full rounded-lg bg-ink py-2 font-medium text-sm text-white hover:bg-ink-strong disabled:cursor-not-allowed disabled:opacity-40"
						>
							Join Room
						</button>
					</div>
				)}
			</div>
		</div>
	);
};

export default Home;
