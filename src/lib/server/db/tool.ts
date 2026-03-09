import { sqlite } from '../sqlite';

// Create april fools tool table
sqlite
	.query(
		`CREATE TABLE IF NOT EXISTS tool (
            name TEXT PRIMARY KEY,
            count INTEGER
        )`
	)
	.run();

const stmtGet = sqlite.prepare<{ count: number }, [string]>(
	`SELECT count FROM tool WHERE name = ?`
);

const stmtIncrease = sqlite.prepare<{ count: number }, [string]>(
	`INSERT INTO tool (name, count) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET count = count + 1 RETURNING count`
);

const stmtClear = sqlite.prepare<void, []>(`DELETE FROM tool`);

export const getToolCount = (name: string) => {
	const result = stmtGet.get(name);

	if (!result) {
		return 0;
	}

	return result.count;
};

export const increaseToolCount = (name: string) => {
	const result = stmtIncrease.get(name);

	return result?.count ?? 1;
};

export const clearToolCount = () => {
	stmtClear.run();
};
