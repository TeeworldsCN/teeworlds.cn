import { numberToSub } from '$lib/helpers';
import { encodeAsciiURIComponent } from '$lib/link';
import { allowedText } from '$lib/server/filter';
import { getPlayer } from '$lib/server/players';
import type { Handler } from '../protocol/types';

export const handlePoints: Handler = async ({ user, reply, args }) => {
	let playerName = args.trim();

	// check binds
	if (!playerName) {
		playerName = user?.data?.name || '';
	}

	if (!playerName) {
		return await reply.textLink('查分请提供 <玩家名>。或者使用 DDNet 工具箱', {
			label: '🔗 排名查询工具',
			prefix: '→ ',
			url: 'https://teeworlds.cn/ddnet/players'
		});
	}

	const player = await getPlayer(playerName);
	if (player == null) {
		// no valid player data. just pretend this doesn't work
		return { ignored: true, message: '玩家信息未加载，分数功能未启用' };
	}

	if (!player.name || !allowedText(player.name)) {
		return await reply.text('未找到相关的玩家信息');
	}

	const ranks = [
		{ name: '🌎 总通过分', rank: player.points, always: true },
		{ name: '📅 去年获得', rank: player.yearly, always: true },
		{ name: '👤 个人排位', rank: player.rank, always: false },
		{ name: '👥 团队排位', rank: player.team, always: false }
	];

	const lines = [
		player.name,
		...ranks
			.filter((rank) => rank.always || rank.rank.rank)
			.map((rank) => {
				if (rank.rank.rank) {
					return `${rank.name}: ${rank.rank.points}pts ₍ₙₒ.${numberToSub(rank.rank.rank)}₎`;
				} else {
					return `${rank.name}: 无记录`;
				}
			})
	];

	return await reply.textLink(lines.join('\n'), {
		label: `🔗 玩家详情`,
		prefix: '详情点击：',
		url: `https://teeworlds.cn/ddnet/p?n=${encodeAsciiURIComponent(player.name, true)}`
	});
};
