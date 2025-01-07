import type { RequestHandler } from './$types';
import { convert } from '$lib/server/imgproxy';

export const GET: RequestHandler = async ({ url }) => {
	const paths = url.pathname.split('/');

	const iconPath = await convert(
		`https://ddnet.org/ranks/maps/${paths.slice(3).join('/')}`,
		'icon'
	);

	// save the icon and serve as picture directly
	const data = await fetch(iconPath.toString());
	return new Response(data.body, {
		headers: {
			'content-type': data.headers.get('content-type') || 'image/png'
		}
	});
};
