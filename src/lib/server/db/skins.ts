import { sqlite } from '../sqlite';

// skin data table
sqlite
	.query('CREATE TABLE IF NOT EXISTS skins (name TEXT PRIMARY KEY, grayscale INTEGER, data BLOB)')
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

export const setSkinData = (name: string, grayscale: boolean, data: Uint8Array) => {
	const result = sqlite
		.query('INSERT OR REPLACE INTO skins (name, grayscale, data) VALUES (?, ?, ?)')
		.run(name, grayscale ? 1 : 0, data);
	return result.changes > 0;
};
