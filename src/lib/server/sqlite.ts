import { env } from '$env/dynamic/private';
import { Database } from 'bun:sqlite';

const sqlitePath = env.SQLITE_PATH || './cache/sqlite.db';
console.log(`sqlite: persistent using ${sqlitePath}`);

export const sqlite = new Database(sqlitePath);
sqlite.query('PRAGMA journal_mode = WAL;').run();
