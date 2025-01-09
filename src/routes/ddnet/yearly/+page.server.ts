import type { PageServerLoad } from './$types';
import { getSkin } from '$lib/server/ddtracker';
import { getPlayer } from '$lib/server/players';
import { decodeAsciiURIComponent } from '$lib/link';

export const load = (async ({ url, parent }) => {
	const year = parseInt(url.searchParams.get('year') || '2024');
	const name = decodeAsciiURIComponent(url.searchParams.get('name') || '');

	if (!name) {
		return { year, ...(await parent()) };
	}

	const player = await getPlayer(name);
	if (!player || !player.name) {
		const error = `未找到名为${name}的玩家`;
		return { year, error, ...(await parent()) };
	}

	const skin = getSkin(name, 'as:cn') || getSkin(name);

	return { year, name, skin, player, ...(await parent()) };
}) satisfies PageServerLoad;
