import { useEffect, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import Board from "./pages/Board";
import Home from "./pages/Home";
import type { Session } from "./types/index";
import { parseRoomFromPath, roomPath, sessionFromUrl, USERNAME_KEY } from "./utils/session";

const App = () => {
	const [session, setSession] = useState<Session | null>(sessionFromUrl);

	// Keep state in sync with browser back/forward navigation.
	useEffect(() => {
		const onPopState = () => setSession(sessionFromUrl());
		window.addEventListener("popstate", onPopState);
		return () => window.removeEventListener("popstate", onPopState);
	}, []);

	const handleJoin = (next: Session) => {
		localStorage.setItem(USERNAME_KEY, next.userName);
		window.history.pushState(null, "", roomPath(next.roomCode));
		setSession(next);
	};

	const handleCodeError = () => {
		toast.error("Invalid room code!");
	};

	const handleLeave = () => {
		window.history.pushState(null, "", "/");
		setSession(null);
	};

	// When there's no session but the URL points at a room (e.g. a shared link
	// opened without a remembered name), pre-fill the join form with that code.
	const pendingRoomCode = session ? null : parseRoomFromPath(window.location.pathname);

	return (
		<>
			<Toaster position="bottom-right" reverseOrder={false} />
			{session ? (
				<Board session={session} onLeave={handleLeave} />
			) : (
				<Home
					key={pendingRoomCode ?? "home"}
					onJoin={handleJoin}
					onRoomCodeError={handleCodeError}
					initialRoomCode={pendingRoomCode ?? undefined}
				/>
			)}
		</>
	);
};

export default App;
