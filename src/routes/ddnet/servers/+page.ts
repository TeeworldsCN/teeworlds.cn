import type { GameInfo, ServerInfo } from '$lib/server/fetches/servers';
import type { PageLoad } from './$types';

const REGION_MAP: { [key: string]: string } = {
	'as:cn': '中国',
	as: '亚洲',
	eu: '欧洲',
	na: '北美',
	oc: '南美',
	sa: '南非',
	af: '非洲'
};

const region = (region: string) => {
	return REGION_MAP[region] || REGION_MAP[region.split(':')[0]] || region;
};

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
			community.icon.servers?.flatMap((server) => Object.values(server.servers).flatMap((server) => server)).includes(ip)
		);
		return {
			key: server.addresses[0],
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
