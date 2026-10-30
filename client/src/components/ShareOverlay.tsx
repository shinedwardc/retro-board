import { QRCodeSVG } from "qrcode.react";
import { useEffect } from "react";
import toast from "react-hot-toast";
import getUserColor from "../utils/colors";
import { roomPath } from "../utils/session";

interface ShareOverlayProps {
	roomCode: string;
	users: string[];
	onClose: () => void;
}

// Phones scanning the QR can't reach the presenter's own machine via localhost,
// so warn instead of silently showing a code that won't work.
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

const ShareOverlay = ({ roomCode, users, onClose }: ShareOverlayProps) => {
	const joinUrl = `${window.location.origin}${roomPath(roomCode)}`;
	const isLocal = LOCAL_HOSTS.includes(window.location.hostname);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	const handleCopyLink = () => {
		navigator.clipboard.writeText(joinUrl);
		toast.success("Invite link copied");
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			{/* Backdrop is a sibling behind the panel, so clicks inside the panel never reach it */}
			<button
				type="button"
				aria-label="Close invite"
				className="absolute inset-0 cursor-default bg-black/70"
				onClick={onClose}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-label="Invite people to this room"
				className="relative flex w-full max-w-md flex-col items-center gap-y-5 rounded-2xl bg-surface-2 p-6 shadow-xl sm:p-8"
			>
				<h2 className="font-bold text-2xl text-ink-strong">Scan to join</h2>

				{/* Always dark-on-white with a quiet zone, whatever the theme, so phones scan reliably */}
				<div className="rounded-xl bg-white p-3">
					<QRCodeSVG
						value={joinUrl}
						size={256}
						marginSize={2}
						fgColor="#000000"
						bgColor="#ffffff"
						title={`Join room ${roomCode}`}
					/>
				</div>

				<div className="text-center">
					<p className="text-ink-muted text-sm">or enter room code</p>
					<p className="font-bold font-mono text-3xl text-ink-strong tracking-widest">{roomCode}</p>
				</div>

				{isLocal && (
					<p className="rounded-lg bg-surface-1 px-3 py-2 text-center text-ink-muted text-xs">
						You're on localhost, so phones can't open this link. Use the deployed URL or your
						machine's LAN address.
					</p>
				)}

				<div className="flex min-h-8 flex-wrap justify-center gap-1">
					{users.map((user) => (
						<span
							key={user}
							title={user}
							className="flex h-8 w-8 items-center justify-center rounded-full text-white text-xs"
							style={{ backgroundColor: getUserColor(user) }}
						>
							{user[0].toUpperCase()}
						</span>
					))}
				</div>
				<p className="-mt-3 font-mono text-ink-muted text-sm">
					{users.length} {users.length === 1 ? "person" : "people"} here
				</p>

				<div className="flex w-full gap-3">
					<button
						type="button"
						onClick={handleCopyLink}
						className="flex-1 rounded-lg bg-accent p-2 text-sm text-white hover:bg-accent-hover"
					>
						Copy link
					</button>
					<button
						type="button"
						onClick={onClose}
						className="flex-1 rounded-lg bg-surface-1 p-2 text-ink text-sm hover:bg-rail"
					>
						Done
					</button>
				</div>
			</div>
		</div>
	);
};

export default ShareOverlay;
