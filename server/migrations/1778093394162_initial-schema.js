export const up = (pgm) => {
	pgm.createTable("rooms", {
		id: {
			type: "uuid",
			primaryKey: true,
			default: pgm.func("gen_random_uuid()"),
		},
		code: {
			type: "varchar(8)",
			notNull: true,
			unique: true,
		},
		created_at: {
			type: "timestamptz",
			default: pgm.func("NOW()"),
		},
	});

	pgm.createTable("notes", {
		id: {
			type: "uuid",
			primaryKey: true,
			default: pgm.func("gen_random_uuid()"),
		},
		// Reference key to rooms table
		room_id: {
			type: "uuid",
			notNull: true,
			references: "rooms(id)",
			onDelete: "CASCADE",
		},
		content: { type: "text", notNull: true },
		category: { type: "varchar(20)", notNull: true },
		author: { type: "varchar(50)", notNull: true },
		votes: { type: "text[]", default: "{}" },
		position: { type: "integer", default: 0 },
		created_at: {
			type: "timestamptz",
			default: pgm.func("NOW()"),
		},
	});
};

export const down = (pgm) => {
	pgm.dropTable("notes");
	pgm.dropTable("rooms");
};
