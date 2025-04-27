import { QQBot, type QQChannel, type QQGuild } from '$lib/server/bots/protocol/qq';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listSubscriptions } from '$lib/server/db/subs';
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

	const result: (QQGuild & { channels?: QQChannel[] })[] = [];

	for (const guild of guilds.data) {
		const data: QQGuild & { channels?: QQChannel[] } = { ...guild };
		result.push(data);
		const channels = await QQBot.getChannels(guild.id);
		if (channels.error) {
			continue;
		}
		data.channels = channels.data.filter((channel) => channel.type != 4);
		data.channels.sort((a, b) =>
			a.type == b.type
				? a.position == b.position
					? a.name.localeCompare(b.name)
					: a.position - b.position
				: a.type - b.type
		);
	}

	const subs = listSubscriptions();
	result.sort((a, b) => a.id.localeCompare(b.id));

	return { subs, guilds: result, ...(await parent()) };
}) satisfies PageServerLoad;
