import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { donate } from '$lib/server/fetches/donate';

export const GET: RequestHandler = async () => {
	try {
		const donateData = await donate.fetchCache();

		return new Response(JSON.stringify(donateData.result), {
			headers: {
				'content-type': 'application/json',
				'cache-control': 'public, max-age=3600' // Cache for 1 hour
			}
		});
	} catch {
		return error(500);
	}
};
