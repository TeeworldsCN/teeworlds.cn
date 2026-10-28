import { primaryAddress } from '$lib/ddnet/helpers';
import { addrToBase64 } from '$lib/helpers';
import { servers } from '$lib/server/fetches/servers';
import type { Handler } from '../protocol/types';
import { findMarkdown, findMissingMarkdown, findOfflineMarkdown } from '../markdown';

const regionLevel = (location?: string) => {
	if (!location) return 3;
	if (location == 'as:cn') return 0;
	if (location.startsWith('as')) return 1;
	return 2;
};

export const handleFind: Handler = async ({ platform, user, reply, args }) => {
	let name = args.trim();
	let findingSelf = false;
	const prefix = platform == 'wechat' ? '' : '/';

	if (!name) {
		findingSelf = true;
		name = user?.bind_name || '';
	}

	if (!name) {
		return await reply.markdown(findMissingMarkdown(prefix, 'https://teeworlds.cn/goto#s'));
	}

	const serverList = (await servers.fetchCache()).result;
	const playerServers = serverList.servers.filter((server) =>
		server.info.clients.some((client) => client.name == name)
	);

	if (playerServers.length == 0) {
		return await reply.markdown(findOfflineMarkdown(name));
	}

	playerServers.sort((a, b) => {
		const aLevel = regionLevel(a.location);
		const bLevel = regionLevel(b.location);
		return aLevel - bLevel;
	});

	const server = playerServers[0];
	const others = playerServers.length - 1;

	return await reply.markdown(
		findMarkdown({
			name,
			server: server.info.name,
			gameType: server.info.game_type || '未知',
			map: server.info.map.name,
			others,
			self: findingSelf,
			url: `https://teeworlds.cn/goto#s${addrToBase64(primaryAddress(server.addresses))}`
		})
	);
};
