import { QQBot } from '$lib/server/bots/protocol/qq';
import { hasPermission } from '$lib/server/db/users';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals }) => {
	if (!hasPermission(locals.user, 'POSTING')) {
		return error(404, 'Not Found');
	}

	if (!QQBot) {
		return error(404, 'QQ Bot is not activated');
	}

	let guilds = await QQBot.getGuilds();
	if (guilds.error) {
		return error(500, guilds.body || guilds.message);
	}

	// Get channels for each guild
	const guildsWithChannels = await Promise.all(
		guilds.data.map(async (guild) => {
			const channelsResult = await QQBot!.getChannels(guild.id);
			return {
				...guild,
				channels: channelsResult.error
					? []
					: channelsResult.data.filter(
							(channel) =>
								// Only show text channels that support threads (type 0 = text channel)
								channel.type === 10007
						)
			};
		})
	);

	return {
		guilds: guildsWithChannels
	};
}) satisfies PageServerLoad;
