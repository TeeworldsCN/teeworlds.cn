import Keyv from 'keyv';
import Valkey from '@keyv/valkey';

import { env } from '$env/dynamic/private';
import KeyvSqlite from './keyv-sqlite';

let volatileStore: Valkey | KeyvSqlite | undefined = undefined;
if (env.VALKEY) {
	console.log(`keyv: volatile using Valkey ${env.VALKEY}`);
	volatileStore = new Valkey(env.VALKEY);
} else {
	console.log(`keyv: volatile using sqlite ./cache/keyv.db`);
	volatileStore = new KeyvSqlite('sqlite://./cache/keyv.db');
}

export const volatile = new Keyv(volatileStore);
