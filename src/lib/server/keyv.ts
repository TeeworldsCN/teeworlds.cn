import Keyv from 'keyv';
import Valkey from '@keyv/valkey';

import { env } from '$env/dynamic/private';
import KeyvSqlite from './keyv-bun-sqlite';

let volatileStore: Valkey | undefined = undefined;
if (env.VALKEY) {
	console.log(`keyv: volatile using Valkey ${env.VALKEY}`);
	volatileStore = new Valkey(env.VALKEY);
} else {
	console.log(`keyv: volatile using memory`);
}

export const volatile = new Keyv(volatileStore);

const sqlitePath = env.SQLITE_PATH || 'sqlite://./cache/sqlite.db';
console.log(`keyv: persistent using sqlite ${sqlitePath}`);

const sqlite = new KeyvSqlite({ uri: sqlitePath });
export const persistent = new Keyv(sqlite);
