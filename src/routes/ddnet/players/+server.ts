import { queryPlayerPrefix } from '$lib/server/players';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('query');

	if (!query) {
		return new Response('', { status: 400 });
	}

	const data = await queryPlayerPrefix(query);
	return new Response(JSON.stringify(data), {
		headers: {
			'content-type': 'application/json'
		}
	});
};
