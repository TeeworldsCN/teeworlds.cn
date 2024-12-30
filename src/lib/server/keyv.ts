import Keyv from 'keyv';
import Valkey from '@keyv/valkey';

import { env } from '$env/dynamic/private';

let volatileStore: Valkey | undefined = undefined;
if (env.VALKEY) {
	console.log(`keyv: volatile using Valkey ${env.VALKEY}`);
	volatileStore = new Valkey(env.VALKEY);
} else {
	console.log(`keyv: volatile using memory`);
}

export const volatile = new Keyv(volatileStore);
