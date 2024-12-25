import Keyv from 'keyv';
import Valkey from '@keyv/valkey';

import { env } from '$env/dynamic/private';

let store: Valkey | undefined = undefined;
if (env.VALKEY) {
	console.log('Using Valkey');
	store = new Valkey(env.VALKEY);
}

export const keyv = new Keyv(store);
