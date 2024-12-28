import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { maps } from '$lib/server/fetches/maps';

export const GET: RequestHandler = async ({ url }) => {
	const json = url.searchParams.get('json');
	if (!json) {
		return new Response('Not Found', { status: 404 });
	}

	try {
		const data = await maps.fetchAsString();
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
