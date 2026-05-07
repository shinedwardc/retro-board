import { useState } from "react";
import generateRoomCode from "../utils/generateRoomCode";

const Home = ({ onJoin }) => {
	const [username, setUsername] = useState("");
	const [roomCode, setRoomCode] = useState("");

	// Creating a new room
	const handleCreateRoom = () => {
		if (!username.trim()) return;

		onJoin({ roomCode: generateRoomCode(), userName: username.trim() });
	};

	// Joining an existing room
	const handleJoinRoom = () => {
		if (!username.trim() || !roomCode.trim()) return;

		onJoin({ roomCode: roomCode.trim(), userName: username.trim() });
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-50">
			<div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md space-y-4">
				<h1 className="text-2xl font-bold text-gray-800">Retro Board</h1>
				<input
					className="w-full border rounded-lg px-4 py-2 text-sm"
					placeholder="Your name"
					value={username}
					onChange={(e) => setUsername(e.target.value)}
				/>
				<button
					type="button"
					onClick={handleCreateRoom}
					className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700"
				>
					Create New Room
				</button>
				<div className="flex items-center gap-2">
					<input
						className="flex-1 border rounded-lg px-4 py-2 text-sm"
						placeholder="Room Code"
						value={roomCode}
						onChange={(e) => setRoomCode(e.target.value)}
					/>
					<button
						type="button"
						onClick={handleJoinRoom}
						className="bg-gray-800 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-900"
					>
						Join
					</button>
				</div>
			</div>
		</div>
	);
};

export default Home;
