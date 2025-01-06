import { primaryAddress } from '$lib/ddnet/helpers';
import { addrToBase64 } from '$lib/helpers';
import { servers } from '$lib/server/fetches/servers';
import type { Handler } from '../protocol/types';

const regionLevel = (location: string) => {
	if (location == 'as:cn') return 0;
	if (location.startsWith('as')) return 1;
	return 2;
};

export const handleFind: Handler = async ({ user, reply, args }) => {
	let name = args.trim();
	if (!name) {
		name = user?.data?.name || '';
	}

	let findingSelf = false;

	if (!name) {
		findingSelf = true;
		return await reply.textLink('找人请提供 <玩家名>。或者使用 DDNet 工具箱直接搜索', {
			label: '🔗 服务器列表',
			prefix: '→ ',
			url: 'https://teeworlds.cn/ddnet/servers'
		});
	}

	const serverList = await servers.fetch();
	const playerServers = serverList.servers.filter((server) =>
		server.info.clients.some((client) => client.name == name)
	);

	if (playerServers.length == 0) {
		return await reply.text(`玩家 ${name} 似乎不在线`);
	}

	playerServers.sort((a, b) => {
		const aLevel = regionLevel(a.location);
		const bLevel = regionLevel(b.location);
		return aLevel - bLevel;
	});

	const server = playerServers[0];
	const others = playerServers.length - 1;

	if (findingSelf) {
		return await reply.textLink(
			`${name} 在 ${server.info.name} 玩 ${server.info.game_type} - ${server.info.map.name}。快来加入吧！${others ? `\n（另有${others}个同名玩家在其他服务器，还请注意}` : ''}`,
			{
				label: '🔗 服务器信息',
				prefix: '服务器信息：',
				url: `https://teeworlds.cn/ddnet/servers#${addrToBase64(primaryAddress(server.addresses))}`
			}
		);
	}

	return await reply.textLink(
		`玩家 ${name} 在 ${server.info.name} 玩 ${server.info.game_type} - ${server.info.map.name}${others ? `\n（另有${others}个同名玩家在其他服务器，还请注意}` : ''}`,
		{
			label: '🔗 服务器信息',
			prefix: '服务器信息：',
			url: `https://teeworlds.cn/ddnet/servers#${addrToBase64(primaryAddress(server.addresses))}`
		}
	);
};
