// Avatar palette — references the --color-user-* tokens defined in index.css.
const COLORS: string[] = [
	"var(--color-user-1)",
	"var(--color-user-2)",
	"var(--color-user-3)",
	"var(--color-user-4)",
	"var(--color-user-5)",
	"var(--color-user-6)",
	"var(--color-user-7)",
	"var(--color-user-8)",
];

const getUserColor = (userName: string): string => {
	if (!userName.length) {
		throw new Error("Username cannot be empty");
	}
	let hash = 5381;
	for (let i = 0; i < userName.length; i++) {
		hash = (hash * 33) ^ userName.charCodeAt(i);
	}
	return COLORS[(hash >>> 0) % COLORS.length];
};

export default getUserColor;