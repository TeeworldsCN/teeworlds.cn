import { QQBot } from '$lib/server/bots/protocol/qq';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { hasPermission } from '$lib/server/db/users';

export const load = (async ({ locals, parent }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	if (!QQBot) {
		return error(404);
	}

	let guilds = await QQBot.getGuilds();
	if (guilds.error) {
		return error(500, guilds.body || guilds.message);
	}

	return {
		guilds: guilds.data
	};
}) satisfies PageServerLoad;
