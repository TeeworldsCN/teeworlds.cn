import { getSkinData, setSkinData } from '$lib/server/db/skins.js';
import { getSkinImageByPath } from '$lib/server/skin-cache';
import { error } from '@sveltejs/kit';
import sharp from 'sharp';

export const GET = async ({ request, url }) => {
	const path = url.pathname;

	if (!path.startsWith('/ddnet/skins/')) {
		return error(500);
	}

	const time = Date.now();

	const name = path.slice(13);
	const grayscale = url.searchParams.get('grayscale') == '1';

	const elapsed = () => Math.ceil(Date.now() - time);
	const { result, hit } = await getSkinImageByPath(name, grayscale);

	if (!result) {
		return error(404);
	}

	return new Response(result, {
		headers: {
			'content-type': 'image/png',
			'cache-control': 'public, max-age=31536000',
			'x-skin-cache': hit ? 'hit' : 'miss',
			'x-skin-time': `${elapsed()}`
		}
	});
};
