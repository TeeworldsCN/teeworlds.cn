import Keyv from 'keyv';
import Valkey from '@keyv/valkey';
import { VALKEY } from '$env/static/private';

let store: Valkey | undefined = undefined;
if (VALKEY) {
	store = new Valkey(VALKEY);
}

export const keyv = new Keyv(store);
