import Keyv from 'keyv';
import Valkey from '@keyv/valkey';

import { env } from '$env/dynamic/private';
import KeyvSqlite from './keyv-bun-sqlite';
import { building } from '$app/environment';

let volatileStore: Valkey | undefined = undefined;
if (env.VALKEY) {
	console.log(`keyv: volatile using Valkey ${env.VALKEY}`);
	volatileStore = new Valkey(env.VALKEY);
} else {
	console.log(`keyv: volatile using memory`);
}

export const volatile = new Keyv(volatileStore);

let sqliteStore: KeyvSqlite | undefined = undefined;

if (!building) {
	const sqlitePath = env.SQLITE_PATH || './cache/sqlite.db';

	sqliteStore = new KeyvSqlite(sqlitePath);
	console.log(`keyv: persistent using sqlite ${sqlitePath}`);
} else {
	console.log(`keyv: persistent using memory, should only happen in build time`);
}

export const persistent = new Keyv(sqliteStore);
