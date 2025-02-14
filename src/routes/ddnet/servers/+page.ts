import { isAddressValid, primaryAddress, region } from '$lib/ddnet/helpers';
import { decodeAsciiURIComponent } from '$lib/link';
import type { GameInfo, ServerInfo } from '$lib/server/fetches/servers';
import type { PageLoad } from './$types';

/** disabling ssr because it give user a false sense of readiness before hydration */
export const ssr = false;

export const load = (async ({ fetch, parent, url }) => {
	let name = url.searchParams.get('name');
	if (name) {
		name = decodeAsciiURIComponent(name);
	}

	const data = (await (await fetch('/ddnet/servers')).json()) as {
		servers: ServerInfo;
		gameInfo: GameInfo;
	};

	const maps = name
		? await (await fetch(`/ddnet/servers/info?name=${encodeURIComponent(name)}`)).json()
		: null;

	const ddnet = data.gameInfo.communities.find((community) => community.id == 'ddnet');
	if (ddnet) ddnet.icon.servers = data.gameInfo.servers;
	const kog = data.gameInfo.communities.find((community) => community.id == 'kog');
	if (kog) kog.icon.servers = data.gameInfo['servers-kog'];

	const servers = data.servers
		.filter((server) => isAddressValid(server.addresses))
		.map((server) => {
			const ip = server.addresses[0].split('://')[1];
			const community = data.gameInfo.communities.find((community) =>
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

	return { servers, maps, name, ...(await parent()) };
}) satisfies PageLoad;
