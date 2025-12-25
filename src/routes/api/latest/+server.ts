import { latest } from '$lib/server/fetches/latest';

export const GET = async () => {
	const cache = await latest.fetchAsString();
	return new Response(cache.result, {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=3'
		}
	});
};
