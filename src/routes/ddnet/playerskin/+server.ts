import { getSkin } from '$lib/server/ddtracker';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const name = url.searchParams.get('name');
	const region = url.searchParams.get('region') || null;
	const frequent = url.searchParams.get('frequent');

	if (!name) {
		return new Response('Bad Request', { status: 400 });
	}

	const skin = getSkin(name, region);

	if (!skin) {
		return new Response('Not Found', { status: 404 });
	}

	return new Response(JSON.stringify(skin), {
		headers: {
			'content-type': 'application/json'
		}
	});
};
