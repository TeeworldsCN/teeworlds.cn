import { primaryAddress, region } from '$lib/ddnet/helpers';
import type { GameInfo, ServerInfo } from '$lib/server/fetches/servers';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, parent }) => {
	const data = (await (await fetch('/ddnet/servers')).json()) as {
		servers: ServerInfo;
		gameInfo: GameInfo;
	};

	const gameInfo = {
		communities: data.gameInfo.communities
	};

	const ddnet = gameInfo.communities.find((community) => community.id == 'ddnet');
	if (ddnet) ddnet.icon.servers = data.gameInfo.servers;
	const kog = gameInfo.communities.find((community) => community.id == 'kog');
	if (kog) kog.icon.servers = data.gameInfo['servers-kog'];

	const servers = data.servers.map((server) => {
		const ip = server.addresses[0].split('://')[1];
		const community = gameInfo.communities.find((community) =>
			community.icon.servers
				?.flatMap((server) => Object.values(server.servers).flatMap((server) => server))
				.includes(ip)
		);
		return {
			key: primaryAddress(server.addresses),
			...server,
			region: region(server.location),
			community: community?.name,
			community_icon: community?.icon.url,
			searchText:
				`${region(server.location)}|${server.info.name}|${server.info.game_type}|${server.info.map.name}|${server.location}|${server.info.clients.map((client) => client.name + '|' + client.clan).join('|')}`.toLowerCase()
		};
	});

	return { servers, gameInfo, ...(await parent()) };
}) satisfies PageLoad;
