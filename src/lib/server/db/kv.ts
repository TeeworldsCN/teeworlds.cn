import { sqlite } from '../sqlite';

// kv
sqlite.query('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)').run();

export const persistent = {
	get: <T = any>(key: string) => {
		const result = sqlite
			.query<
				{
					key: string;
					value: string;
				},
				string
			>('SELECT value FROM kv WHERE key = ?')
			.get(key);

		if (!result) {
			return null;
		}
		return JSON.parse(result.value) as T;
	},
	set: <T = any>(key: string, value: T) => {
		const result = sqlite
			.query('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)')
			.run(key, JSON.stringify(value));
		return result.changes > 0;
	},
	delete: (key: string) => {
		const result = sqlite.query('DELETE FROM kv WHERE key = ?').run(key);
		return result.changes > 0;
	},
	listPrefix: <T = any>(prefix: string) => {
		const result = sqlite
			.query<
				{
					key: string;
					value: string;
				},
				string
			>('SELECT key, value FROM kv WHERE key LIKE ?')
			.all(prefix + '%');
		return result.map(({ key, value }) => ({
			key: key.slice(prefix.length),
			value: JSON.parse(value) as T
		}));
	}
};
