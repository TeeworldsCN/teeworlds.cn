import { volatile } from '$lib/server/keyv';
import type { ServerInit } from '@sveltejs/kit';

export const init: ServerInit = async () => {
	// initialize the key-value store on launch
	volatile;
	// persistent;
};
