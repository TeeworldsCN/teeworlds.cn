import { maps } from '$lib/server/fetches/maps';
import type { RequestHandler } from './$types';

// Special HEAD request check for whether a map exists
export const HEAD: RequestHandler = async ({ params }) => {
	const mapList = (await maps.fetchCache()).result;
	const found = mapList.findIndex((map) => map.name == params.name);
	if (found < 0) {
		return new Response(null, { status: 404 });
	} else {
		return new Response(null, {
			status: 200,
			headers: { 'cache-control': 'public, max-age=2592000' }
		});
	}
};
