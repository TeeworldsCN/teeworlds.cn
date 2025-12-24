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
		// enabled cors
		headers: {
			'content-type': 'application/json',
			'access-control-allow-origin': '*',
			'access-control-allow-methods': 'GET, HEAD, POST',
			'access-control-max-age': '86400',
			'cache-control': 'public, max-age=300'
		}
	});
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { names, region, fallback } = body;

		if (!names || !Array.isArray(names) || names.length === 0) {
			return new Response('Bad Request: names array is required', { status: 400 });
		}

		if (names.length > 64) {
			return new Response('Bad Request: names array length cannot exceed 64', { status: 400 });
		}

		const skins: any[] = [];

		for (const name of names) {
			if (typeof name !== 'string') {
				continue;
			}

			let skin = getSkin(name, region || null);

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
				'access-control-allow-methods': 'GET, HEAD, POST',
				'access-control-max-age': '86400'
			}
		});
	} catch (error) {
		return new Response('Bad Request: Invalid JSON', { status: 400 });
	}
};
