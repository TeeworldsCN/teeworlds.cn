import { sqlite } from '../sqlite';

// yearly table
sqlite
	.query(
		'CREATE TABLE IF NOT EXISTS yearly (name VARCHAR(255) PRIMARY KEY, year INTEGER, data BLOB)'
	)
	.run();

// indexes
sqlite.query('CREATE INDEX IF NOT EXISTS idx_yearly_name_year ON yearly (name, year);').run();

export const getYearlyData = async (name: string, year: number) => {
	const result = sqlite
		.query<
			{
				data: Uint8Array;
			},
			[string, number]
		>('SELECT data FROM yearly WHERE name = ? AND year = ?')
		.get(name, year);

	if (!result) {
		return null;
	}
	return result.data;
};

export const setYearlyData = async (name: string, year: number, data: Uint8Array) => {
	const result = sqlite
		.query('INSERT OR REPLACE INTO yearly (name, year, data) VALUES (?, ?, ?)')
		.run(name, year, data);
	return result.changes > 0;
};
