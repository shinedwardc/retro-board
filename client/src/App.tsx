import { useState } from "react";
import Board from "./pages/Board";
import Home from "./pages/Home";
import type { Session } from "./types/index";

const App = () => {
	const [session, setSession] = useState<Session | null>(null);

	if (session) {
		return <Board session={session} onLeave={() => setSession(null)} />;
	}

	return <Home onJoin={setSession} />;
};

export default App;
