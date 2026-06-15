import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { decodeAsciiURIComponent, encodeAsciiURIComponent } from '$lib/link';
import { uaIsStrict } from '$lib/helpers';

export const load: PageServerLoad = async ({ parent, params }) => {
	const parentData = await parent();
	const param = params.name;

	if (!uaIsStrict(parentData.ua) && param.startsWith('!!')) {
		return redirect(
			302,
			`/ddnet/players/${encodeAsciiURIComponent(decodeAsciiURIComponent(param))}`
		);
	}

	return {};
};