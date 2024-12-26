import { queryPlayerPrefix } from '$lib/server/players';
import type { Handler } from '../protocol/types';

export const handlePoints: Handler = async (uid, reply, command, args, mode) => {
	if (!args) {
		reply.link('玩家查询工具', '查看玩家排名与查询玩家信息', 'https://teeworlds.cn/ddnet/players');
		return;
	}

	const points = await queryPlayerPrefix(args);
	if (points == null) {
		// no valid player data. just pretend this doesn't work
		return;
	}

	const player = points[0];

	if (!player) {
		reply.text('未找到相关的玩家信息');
		return;
	}

	reply.link(
		player.name,
		`分数：${player.points}pts [点击查看详情]`,
		`https://teeworlds.cn/ddnet/players/${encodeURIComponent(player.name)}`
	);
	return;
};
