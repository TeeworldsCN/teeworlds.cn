import { queryPlayerPrefix } from '$lib/server/players';
import type { Handler } from '../protocol/types';

export const handlePoints: Handler = async (uid, reply, command, args, mode) => {
	if (!args) {
		return await reply.text(
			'玩家查询工具 - 查看玩家排名与查询玩家信息: https://teeworlds.cn/ddnet/players'
		);
	}

	const points = await queryPlayerPrefix(args);
	if (points == null) {
		// no valid player data. just pretend this doesn't work
		return { ignored: true, message: '玩家信息未加载，分数功能未启用' };
	}

	const player = points.top10[0];

	if (!player) {
		return await reply.text('未找到相关的玩家信息');
	}

	return await reply.text(
		`${player.name} - ${player.points}pts\nhttps://teeworlds.cn/ddnet/players/${encodeURIComponent(player.name)}`
	);
};
