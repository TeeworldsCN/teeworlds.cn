import { encodeAsciiURIComponent } from '$lib/link';
import { persistent } from '$lib/server/keyv';
import { getPlayer } from '$lib/server/players';
import type { Handler } from '../protocol/types';

export const handlePoints: Handler = async ({ uid, reply, args }) => {
	let playerName = args.trim();

	// check binds
	if (!playerName) {
		playerName = (await persistent.get<string>(`bind:${uid}`)) || '';
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

	if (!player.name) {
		return await reply.text('未找到相关的玩家信息');
	}

	const ranks = [
		{ name: '总通过分', rank: player.points, fallback: '无记录' },
		{ name: '团队排位', rank: player.team, fallback: '未上榜' },
		{ name: '个人排位', rank: player.rank, fallback: '未上榜' },
		{ name: '去年获得', rank: player.yearly, fallback: '无记录' }
	];

	const lines = [
		player.name,
		...ranks.map((rank) => {
			const fallback = rank.fallback;
			if (rank.rank.rank) {
				return `${rank.name}: ${rank.rank.points}pts [No.${rank.rank.rank}]`;
			} else {
				return `${rank.name}: ${fallback}`;
			}
		})
	];

	return await reply.textLink(lines.join('\n'), {
		label: `🔗 玩家详情`,
		prefix: '详情点击：',
		url: `https://teeworlds.cn/ddnet/players/${encodeAsciiURIComponent(player.name)}`
	});
};
