import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { convert } from '$lib/server/imgproxy';

const IMAGE_PROVIDERS: { [key: string]: string } = {
	ddnet: 'https://ddnet.org/'
};

export const GET: RequestHandler = async ({ url }) => {
	const paths = url.pathname.split('/');
	const provider = paths[2];
	if (!provider) return error(404);

	const providerUrl = IMAGE_PROVIDERS[provider];

	if (providerUrl)
		return redirect(301, (await convert(`${providerUrl}${paths.slice(3).join('/')}`)).toString());

	return error(404);
};
