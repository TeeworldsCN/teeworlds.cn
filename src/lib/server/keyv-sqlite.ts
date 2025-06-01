import EventEmitter from 'events';
import Keyv, { type KeyvStoreAdapter, type StoredData } from 'keyv';
import { Database } from 'bun:sqlite';
import { Cron } from 'croner';
import { DevReload } from './dev';

// Type definitions
interface KeyvSqliteOptions {
	dialect?: string;
	uri?: string;
	db?: string;
	table?: string;
	keySize?: number;
	busyTimeout?: number;
	iterationLimit?: number | string;
}

interface DbRow {
	key: string;
	value: string;
	expire_at?: number;
}

type DbQuery = (sql: string, ...params: any[]) => Promise<DbRow[]>;
type DbClose = () => Promise<void>;

const toString = (input: string) => (String(input).search(/^[a-zA-Z]+$/) < 0 ? '_' + input : input);

export class KeyvSqlite extends EventEmitter implements KeyvStoreAdapter {
	ttlSupport: boolean;
	opts: KeyvSqliteOptions;
	namespace?: string;
	private database: Database;
	private cleanupCron?: Cron;
	close: DbClose;
	query: DbQuery;

	constructor(keyvOptions?: KeyvSqliteOptions | string) {
		super();
		this.ttlSupport = true;
		let options: KeyvSqliteOptions = {
			dialect: 'sqlite',
			uri: 'sqlite://:memory:'
		};

		if (typeof keyvOptions === 'string') {
			options.uri = keyvOptions;
		} else {
			options = {
				...options,
				...keyvOptions
			};
		}

		this.opts = {
			table: 'keyv',
			keySize: 255,
			...options
		};

		this.opts.table = toString(this.opts.table!);

		// Initialize Bun SQLite database
		const dbPath = options.uri!.replace(/^sqlite:\/\//, '');
		this.database = new Database(dbPath === ':memory:' ? ':memory:' : dbPath);

		// Enable WAL mode and optimizations for better performance
		this.database.query('PRAGMA journal_mode = WAL;').run();
		this.database.query('PRAGMA synchronous = NORMAL;').run();
		this.database.query('PRAGMA cache_size = 1000;').run();
		this.database.query('PRAGMA temp_store = memory;').run();
		this.database.query('PRAGMA mmap_size = 268435456;').run(); // 256MB

		// Create table with expire_at column
		const createTable = `CREATE TABLE IF NOT EXISTS ${this.opts.table}(
			key TEXT PRIMARY KEY,
			value TEXT,
			expire_at INTEGER
		)`;
		this.database.query(createTable).run();

		// Create index on expire_at for efficient cleanup
		const createIndex = `CREATE INDEX IF NOT EXISTS idx_${this.opts.table}_expire_at ON ${this.opts.table}(expire_at)`;
		this.database.query(createIndex).run();

		// Set up query and close methods
		this.query = async (sqlString: string, ...parameters: any[]): Promise<DbRow[]> => {
			try {
				const stmt = this.database.query<DbRow, any[]>(sqlString);
				if (sqlString.trim().toUpperCase().startsWith('SELECT')) {
					return stmt.all(...parameters);
				} else {
					stmt.run(...parameters);
					return [];
				}
			} catch (error) {
				this.emit('error', error);
				throw error;
			}
		};

		this.close = async (): Promise<void> => {
			try {
				// Stop cleanup cron job
				if (this.cleanupCron) {
					this.cleanupCron.stop();
				}
				this.database.close();
			} catch (error) {
				this.emit('error', error);
				throw error;
			}
		};

		// Start daily cleanup routine (runs at 2 AM every day)
		this.cleanupCron = new Cron('0 2 * * *', () => {
			console.log('Running Keyv cleanup...');
			this.cleanup().catch((error: any) => {
				console.error('Keyv cleanup error:', error);
				this.emit('error', error);
			});
		});

		new DevReload(import.meta.file, () => {
			console.log('Cleaning up KeyvSqlite Cron...');
			this.cleanupCron?.stop();
		});
	}

	async get<Value>(key: string) {
		const now = Date.now();
		const select = `SELECT * FROM ${this.opts.table!} WHERE key = ?`;
		const rows = await this.query(select, key);
		const row = rows[0];
		if (row === undefined) {
			return undefined;
		}

		// Check if the key has expired
		if (row.expire_at && row.expire_at <= now) {
			// Delete expired key
			await this.delete(key);
			return undefined;
		}

		return row.value as Value;
	}

	async getMany<Value>(keys: string[]) {
		const now = Date.now();
		const select = `SELECT * FROM ${this.opts.table!} WHERE key IN (SELECT value FROM json_each(?))`;
		const rows = await this.query(select, JSON.stringify(keys));

		// Filter out expired rows and collect expired keys for deletion
		const expiredKeys: string[] = [];
		const validRows = rows.filter((row) => {
			if (row.expire_at && row.expire_at <= now) {
				expiredKeys.push(row.key);
				return false;
			}
			return true;
		});

		// Delete expired keys if any
		if (expiredKeys.length > 0) {
			await this.deleteMany(expiredKeys);
		}

		return keys.map((key) => {
			const row = validRows.find((row: DbRow) => row.key === key);
			return (row ? row.value : undefined) as StoredData<Value | undefined>;
		});
	}

	async set(key: string, value: any, ttl?: number) {
		const expireAt = ttl ? Date.now() + ttl : null;
		const upsert = `INSERT INTO ${this.opts.table!} (key, value, expire_at)
			VALUES(?, ?, ?)
			ON CONFLICT(key)
			DO UPDATE SET value=excluded.value, expire_at=excluded.expire_at;`;
		return this.query(upsert, key, value, expireAt);
	}

	async delete(key: string) {
		const select = `SELECT * FROM ${this.opts.table!} WHERE key = ?`;
		const del = `DELETE FROM ${this.opts.table!} WHERE key = ?`;

		const rows = await this.query(select, key);
		const row = rows[0];
		if (row === undefined) {
			return false;
		}

		await this.query(del, key);
		return true;
	}

	async deleteMany(keys: string[]) {
		const del = `DELETE FROM ${this.opts.table!} WHERE key IN (SELECT value FROM json_each(?))`;

		// Check if any keys exist before deletion (without calling getMany to avoid circular dependency)
		const select = `SELECT key FROM ${this.opts.table!} WHERE key IN (SELECT value FROM json_each(?))`;
		const existingKeys = await this.query(select, JSON.stringify(keys));

		if (existingKeys.length === 0) {
			return false;
		}

		await this.query(del, JSON.stringify(keys));
		return true;
	}

	async clear() {
		const del = `DELETE FROM ${this.opts.table!} WHERE key LIKE ?`;
		await this.query(del, this.namespace ? `${this.namespace}:%` : '%');
	}

	async *iterator(namespace?: string): AsyncGenerator<[string, string], void, unknown> {
		const limit = Number.parseInt(this.opts.iterationLimit! as string, 10) || 10;
		const now = Date.now();

		async function* iterate(
			offset: number,
			options: KeyvSqliteOptions,
			query: DbQuery,
			currentTime: number
		): AsyncGenerator<[string, string], void, unknown> {
			const select = `SELECT * FROM ${options.table!} WHERE key LIKE ? AND (expire_at IS NULL OR expire_at > ?) LIMIT ? OFFSET ?`;
			const iterator = await query(select, [
				`${namespace ? namespace + ':' : ''}%`,
				currentTime,
				limit,
				offset
			]);
			const entries = [...iterator];
			if (entries.length === 0) {
				return;
			}

			for (const entry of entries) {
				offset += 1;
				yield [entry.key, entry.value];
			}

			yield* iterate(offset, options, query, currentTime);
		}

		yield* iterate(0, this.opts, this.query, now);
	}

	async has(key: string) {
		const now = Date.now();
		const exists = `SELECT EXISTS ( SELECT * FROM ${this.opts.table!} WHERE key = ? AND (expire_at IS NULL OR expire_at > ?) )`;
		const result = await this.query(exists, key, now);
		return Object.values(result[0])[0] === 1;
	}

	async cleanup() {
		const now = Date.now();
		const deleteExpired = `DELETE FROM ${this.opts.table!} WHERE expire_at IS NOT NULL AND expire_at <= ?`;
		await this.query(deleteExpired, now);
		console.log(`Keyv cleanup completed for table ${this.opts.table}`);
	}

	async disconnect() {
		await this.close();
	}
}

export default KeyvSqlite;
