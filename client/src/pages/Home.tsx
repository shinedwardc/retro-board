import { useState } from "react";
import type { Session } from "../types/index";
import generateRoomCode from "../utils/generateRoomCode";

interface HomeProps {
	onJoin: (session: Session) => void;
}

const Home = ({ onJoin }: HomeProps) => {
	const [tab, setTab] = useState<"create" | "join">("create");
	const [username, setUsername] = useState("");
	const [roomCode, setRoomCode] = useState("");

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
		<div className="min-h-screen flex items-center justify-center bg-gray-50">
			<div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md space-y-5">
				<h1 className="text-2xl font-bold text-gray-800">Retro Board</h1>

				<div className="flex rounded-lg overflow-hidden border border-gray-200">
					<button
						type="button"
						onClick={() => setTab("create")}
						className={`flex-1 py-2 text-sm font-medium transition-colors ${
							tab === "create"
								? "bg-blue-600 text-white"
								: "bg-white text-gray-600 hover:bg-gray-50"
						}`}
					>
						Create Room
					</button>
					<button
						type="button"
						onClick={() => setTab("join")}
						className={`flex-1 py-2 text-sm font-medium transition-colors ${
							tab === "join"
								? "bg-blue-600 text-white"
								: "bg-white text-gray-600 hover:bg-gray-50"
						}`}
					>
						Join Room
					</button>
				</div>

				<input
					className="w-full border rounded-lg px-4 py-2 text-sm"
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
						className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
					>
						Create New Room
					</button>
				) : (
					<div className="space-y-3">
						<input
							className="w-full border rounded-lg px-4 py-2 text-sm"
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
							className="w-full bg-gray-800 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
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
