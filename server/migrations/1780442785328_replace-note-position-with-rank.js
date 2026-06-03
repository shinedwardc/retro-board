import { generateNKeysBetween } from "fractional-indexing";

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * Replace the integer `position` column with a fractional-index `rank` (text).
 * Ordering becomes per (room_id, category): notes sort by (category, rank, id).
 *
 * Steps run via pgm.db.query so DDL and the JS-driven backfill execute in order
 * within the migration's transaction (pgm builder calls would be queued and run
 * after this function returns, which would break the add -> backfill -> not-null
 * sequence).
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = async (pgm) => {
	await pgm.db.query("ALTER TABLE notes ADD COLUMN rank text");

	// Backfill: preserve each column's current visible order. Existing position is
	// global per room, but notes are displayed filtered by category, so grouping by
	// (room_id, category) and walking position order reproduces what users see.
	const { rows } = await pgm.db.query(
		"SELECT id, room_id, category FROM notes ORDER BY room_id, category, position, created_at",
	);

	const groups = new Map();
	for (const row of rows) {
		const key = `${row.room_id}:${row.category}`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(row.id);
	}

	for (const ids of groups.values()) {
		const keys = generateNKeysBetween(null, null, ids.length);
		for (let i = 0; i < ids.length; i++) {
			await pgm.db.query("UPDATE notes SET rank = $1 WHERE id = $2", [keys[i], ids[i]]);
		}
	}

	await pgm.db.query("ALTER TABLE notes ALTER COLUMN rank SET NOT NULL");
	await pgm.db.query("ALTER TABLE notes DROP COLUMN position");
	await pgm.db.query("CREATE INDEX notes_room_category_rank ON notes (room_id, category, rank)");
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = async (pgm) => {
	await pgm.db.query("DROP INDEX IF EXISTS notes_room_category_rank");
	await pgm.db.query("ALTER TABLE notes ADD COLUMN position integer");
	await pgm.db.query(`
		WITH ordered AS (
			SELECT id, row_number() OVER (
				PARTITION BY room_id ORDER BY category, rank, id
			) - 1 AS rn
			FROM notes
		)
		UPDATE notes SET position = ordered.rn FROM ordered WHERE notes.id = ordered.id
	`);
	await pgm.db.query("ALTER TABLE notes ALTER COLUMN position SET NOT NULL");
	await pgm.db.query("ALTER TABLE notes ALTER COLUMN position SET DEFAULT 0");
	await pgm.db.query("ALTER TABLE notes DROP COLUMN rank");
};
