import { sqlite } from '../sqlite';

// skin data table
sqlite
	.query(
		'CREATE TABLE IF NOT EXISTS skins (name TEXT PRIMARY KEY, grayscale INTEGER, data BLOB, r INTEGER, g INTEGER, b INTEGER)'
	)
	.run();

// indexes
sqlite.query('CREATE INDEX IF NOT EXISTS skins_name_grayscale ON skins (name, grayscale);').run();

export const getSkinData = (name: string, grayscale: boolean) => {
	const result = sqlite
		.query<
			{
				data: Uint8Array;
			},
			[string, number]
		>('SELECT data FROM skins WHERE name = ? AND grayscale = ?')
		.get(name, grayscale ? 1 : 0);

	if (!result) {
		return null;
	}
	return result.data;
};

export const setSkinData = (
	name: string,
	grayscale: boolean,
	data: Uint8Array,
	rgb?: { r: number; g: number; b: number }
) => {
	const result = sqlite
		.query('INSERT OR REPLACE INTO skins (name, grayscale, data, r, g, b) VALUES (?, ?, ?, ?, ?, ?)')
		.run(name, grayscale ? 1 : 0, data, rgb?.r ?? null, rgb?.g ?? null, rgb?.b ?? null);
	return result.changes > 0;
};

export const getSkinColors = () => {
	const result = sqlite
		.query<
			{
				name: string;
				r: number | null;
				g: number | null;
				b: number | null;
			},
			[]
		>('SELECT name, r, g, b FROM skins WHERE r IS NOT NULL AND g IS NOT NULL AND b IS NOT NULL')
		.all();
	return result;
};
