import {
	getCurrentSkin,
	getCurrentSkinInRegion,
	getFrequentSkin,
	getFrequentSkinInRegion
} from '$lib/server/ddtracker';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const name = url.searchParams.get('name');
	const region = url.searchParams.get('region');
	const frequent = url.searchParams.get('frequent');

	if (!name) {
		return new Response('Bad Request', { status: 400 });
	}

	if (!region) {
		const skin = frequent ? getFrequentSkin(name) : getCurrentSkin(name);
		if (!skin) {
			return new Response('Not Found', { status: 404 });
		}
		return new Response(JSON.stringify(skin), {
			headers: {
				'content-type': 'application/json'
			}
		});
	}

	const skin = frequent
		? getFrequentSkinInRegion(name, region)
		: getCurrentSkinInRegion(name, region);

	if (!skin) {
		return new Response('Not Found', { status: 404 });
	}

	return new Response(JSON.stringify(skin), {
		headers: {
			'content-type': 'application/json'
		}
	});
};
