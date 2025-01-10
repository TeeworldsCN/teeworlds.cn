import { normalizeMapname } from '$lib/ddnet/helpers';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { convert } from '$lib/server/imgproxy';

export const GET: RequestHandler = async ({ params }) => {
	const name = params.name;
	const url = `https://ddnet.org/ranks/maps/${normalizeMapname(name)}.png`;
	const converted = await convert(url);
	return redirect(302, converted);
};
