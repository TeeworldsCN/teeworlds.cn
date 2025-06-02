import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { maps } from '$lib/server/fetches/maps';

export const GET: RequestHandler = async () => {
	try {
		const data = (await maps.fetchAsString()).result;
		return new Response(data, {
			headers: {
				'content-type': 'application/json',
				'cache-control': 'public, max-age=600'
			}
		});
	} catch {
		return error(404);
	}
};
