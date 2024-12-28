// This is a custom Keyv store implementation for bun's built-in sqlite

import EventEmitter from 'events';
import Keyv, { type KeyvStoreAdapter, type StoredData } from 'keyv';
import * as sqlite3 from 'bun:sqlite';
import { type Db, type DbClose, type DbQuery, type KeyvSqliteOptions } from './types';

const toString = (input: string) => (String(input).search(/^[a-zA-Z]+$/) < 0 ? '_' + input : input);

export class KeyvSqlite extends EventEmitter implements KeyvStoreAdapter {
	ttlSupport: boolean;
	opts: KeyvSqliteOptions;
	namespace?: string;
	close: DbClose;
	query: DbQuery;

	constructor(keyvOptions?: KeyvSqliteOptions | string) {
		super();
		this.ttlSupport = false;
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

		options.db = options.uri!.replace(/^sqlite:\/\//, '');

		options.connect = () => {
			const database = new sqlite3.Database(options.db!);
			return {
				query: (sqlString, ...parameter) => database.query(sqlString).all(...parameter),
				close: database.close
			};
		};

		this.opts = {
			table: 'keyv',
			keySize: 255,
			...options
		};

		this.opts.table = toString(this.opts.table!);

		const createTable = `CREATE TABLE IF NOT EXISTS ${this.opts.table}(key VARCHAR(${Number(this.opts.keySize)}) PRIMARY KEY, value TEXT )`;

		const database: Db = this.opts.connect!();
		try {
			database.query(createTable);
		} catch (error) {
			this.emit('error', error);
		}

		this.query = database.query;
		this.close = database.close;
	}

	async get<Value>(key: string) {
		const select = `SELECT * FROM ${this.opts.table!} WHERE key = ?`;
		const rows = this.query(select, key);
		const row = rows[0];
		if (row == null) {
			return undefined;
		}

		return (row as any).value as Value;
	}

	async getMany<Value>(keys: string[]) {
		const select = `SELECT * FROM ${this.opts.table!} WHERE key IN (SELECT value FROM json_each(?))`;
		const rows = this.query(select, JSON.stringify(keys)) as any;

		return keys.map((key) => {
			const row = rows.find((row: { key: string; value: Value }) => row.key === key);
			return (row ? row.value : undefined) as StoredData<Value | undefined>;
		});
	}

	async set(key: string, value: any) {
		const upsert = `INSERT INTO ${this.opts.table!} (key, value)
			VALUES(?, ?) 
			ON CONFLICT(key) 
			DO UPDATE SET value=excluded.value;`;
		return this.query(upsert, key, value);
	}

	async delete(key: string) {
		const select = `SELECT * FROM ${this.opts.table!} WHERE key = ?`;
		const del = `DELETE FROM ${this.opts.table!} WHERE key = ?`;

		const rows = this.query(select, key);
		const row = rows[0];
		if (row === undefined) {
			return false;
		}

		this.query(del, key);
		return true;
	}

	async deleteMany(keys: string[]) {
		const del = `DELETE FROM ${this.opts.table!} WHERE key IN (SELECT value FROM json_each(?))`;

		const results = await this.getMany(keys);
		if (results.every((x) => x === undefined)) {
			return false;
		}

		this.query(del, JSON.stringify(keys));
		return true;
	}

	async clear() {
		const del = `DELETE FROM ${this.opts.table!} WHERE key LIKE ?`;
		this.query(del, this.namespace ? `${this.namespace}:%` : '%');
	}

	async *iterator(namespace?: string) {
		const limit = Number.parseInt(this.opts.iterationLimit! as string, 10) || 10;

		// @ts-expect-error - iterate
		async function* iterate(offset: number, options: KeyvSqliteOptions, query: any) {
			const select = `SELECT * FROM ${options.table!} WHERE key LIKE ? LIMIT ? OFFSET ?`;
			const iterator = query(select, [`${namespace ? namespace + ':' : ''}%`, limit, offset]);
			const entries = [...iterator];
			if (entries.length === 0) {
				return;
			}

			for (const entry of entries) {
				offset += 1;
				yield [entry.key, entry.value];
			}

			yield* iterate(offset, options, query);
		}

		yield* iterate(0, this.opts, this.query);
	}

	async has(key: string) {
		const exists = `SELECT EXISTS ( SELECT * FROM ${this.opts.table!} WHERE key = ? )`;
		const result = this.query(exists, key) as any;
		return Object.values(result[0])[0] === 1;
	}

	async disconnect() {
		this.close();
	}
}

export const createKeyv = (keyvOptions?: KeyvSqliteOptions | string) =>
	new Keyv({ store: new KeyvSqlite(keyvOptions) });

export default KeyvSqlite;
export type { KeyvSqliteOptions } from './types';
