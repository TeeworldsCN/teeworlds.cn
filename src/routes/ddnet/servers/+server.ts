import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { servers } from '$lib/server/fetches/servers';

export const GET: RequestHandler = async () => {
	try {
		const data = servers.fetch();
		const fetchAsString = await servers.fetchAsString();
		const result = JSON.parse(fetchAsString);

		return new Response(result, {
			headers: {
				'content-type': 'application/json',
				'cache-control': 'public, max-age=10'
			}
		});
	} catch {
		return error(500);
	}
};
