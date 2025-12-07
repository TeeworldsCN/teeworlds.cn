import { getSkinImageByPath } from '$lib/server/skin-cache';
import { error } from '@sveltejs/kit';

export const GET = async ({ url }) => {
	const path = url.pathname;

	if (!path.startsWith('/api/skins/')) {
		return error(500);
	}

	const time = Date.now();

	const name = path.slice(11);
	const grayscale = url.searchParams.get('grayscale') == '1';

	const elapsed = () => Math.ceil(Date.now() - time);
	const { result, hit } = await getSkinImageByPath(name, grayscale);

	if (!result) {
		return error(404);
	}

	return new Response(result as Uint8Array<ArrayBuffer>, {
		headers: {
			'access-control-allow-origin': '*',
			'access-control-allow-methods': 'GET',
			'content-type': 'image/png',
			'cache-control': 'public, max-age=31536000',
			'x-skin-cache': hit ? 'hit' : 'miss',
			'x-skin-time': `${elapsed()}`
		}
	});
};

export const OPTIONS = async () => {
	return new Response(null, {
		headers: {
			'access-control-allow-origin': '*',
			'access-control-allow-methods': 'GET'
		}
	});
};
