import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { servers } from '$lib/server/fetches/servers';

export const GET: RequestHandler = async () => {
	try {
		return new Response(await servers.fetch(), {
			headers: {
				'content-type': 'application/json',
				'cache-control': 'public, max-age=10'
			}
		});
	} catch {
		return error(500);
	}
};
