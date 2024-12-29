import { persistent } from '$lib/server/keyv.js';
import { hasPermission } from '$lib/server/users';
import { error, type ServerLoad } from '@sveltejs/kit';

export const load: ServerLoad = async ({ locals, parent }) => {
	if (!hasPermission(locals.user, 'WEB_ADMIN')) {
		return error(404, 'Not Found');
	}

	const iterator = persistent.iterator;
	const kv: any = {};
	if (iterator) {
		for await (const [key, value] of iterator({})) {
			kv[key] = value;
		}
	}

	return { kv, ...(await parent()) };
};
