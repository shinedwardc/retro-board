const COLORS = [
	"#f87171", // red
	"#fb923c", // orange
	"#a3e635", // lime
	"#34d399", // emerald
	"#22d3ee", // cyan
	"#818cf8", // indigo
	"#e879f9", // fuchsia
	"#f472b6", // pink
];

export const getUserColor = (userName) => {
	let hash = 5381; // Prime number starting point
	for (let i = 0; i < userName.length; i++) {
		// Bitwise hash function (djb2)
		hash = (hash * 33) ^ userName.charCodeAt(i);
	}
	return COLORS[(hash >>> 0) % COLORS.length];
};
