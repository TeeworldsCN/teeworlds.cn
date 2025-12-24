import { getSkin } from '$lib/server/ddtracker';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const names = url.searchParams.getAll('n');
	const region = url.searchParams.get('region') || null;
	const fallback = url.searchParams.get('fallback');

	if (!names) {
		return new Response('Bad Request: names parameter is required', { status: 400 });
	}

	if (names.length === 0) {
		return new Response('Bad Request: names array cannot be empty', { status: 400 });
	}

	if (names.length > 64) {
		return new Response('Bad Request: names array length cannot exceed 64', { status: 400 });
	}

	const skins: any[] = [];

	for (const name of names) {
		let skin = getSkin(name, region);

		if (!skin && fallback && region) {
			skin = getSkin(name);
		}

		if (skin) {
			skins.push(skin);
		} else {
			skins.push({});
		}
	}

	return new Response(JSON.stringify(skins), {
		headers: {
			'content-type': 'application/json',
			'access-control-allow-origin': '*',
			'access-control-allow-methods': 'GET, HEAD',
			'access-control-max-age': '86400',
			'cache-control': 'public, max-age=6000'
		}
	});
};
