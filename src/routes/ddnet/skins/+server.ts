import { error, type RequestHandler } from '@sveltejs/kit';
import { skins } from '$lib/server/fetches/skins';

export const GET: RequestHandler = async () => {
	try {
		return new Response(JSON.stringify((await skins.fetch()).result.map), {
			headers: {
				'content-type': 'application/json',
				'cache-control': 'public, max-age=1200'
			}
		});
	} catch {
		return error(500);
	}
};
