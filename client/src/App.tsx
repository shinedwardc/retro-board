import { useState } from "react";
import { Toaster } from "react-hot-toast";
import Board from "./pages/Board";
import Home from "./pages/Home";
import type { Session } from "./types/index";

const App = () => {
	const [session, setSession] = useState<Session | null>(null);

	return (
		<>
			<Toaster position="bottom-right" reverseOrder={false} />
			{session ? (
				<Board session={session} onLeave={() => setSession(null)} />
			) : (
				<Home onJoin={setSession} />
			)}
		</>
	);
};

export default App;
