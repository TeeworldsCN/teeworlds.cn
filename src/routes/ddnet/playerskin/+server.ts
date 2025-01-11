import { getSkin } from '$lib/server/ddtracker';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const name = url.searchParams.get('name');
	const region = url.searchParams.get('region') || null;
	const fallback = url.searchParams.get('fallback');

	if (!name) {
		return new Response('Bad Request', { status: 400 });
	}

	let skin = getSkin(name, region);

	if (!skin && fallback && region) {
		skin = getSkin(name);
	}

	if (!skin) {
		return new Response('Not Found', { status: 404 });
	}

	return new Response(JSON.stringify(skin), {
		headers: {
			'content-type': 'application/json'
		}
	});
};
