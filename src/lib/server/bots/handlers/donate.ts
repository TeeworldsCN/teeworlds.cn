import type { Handler } from '../protocol/types';

export const handleDonate: Handler = async ({ user, reply, args }) => {
	return await reply.textLink(`DDNet官服由玩家赞助以支撑服务器成本`, {
		label: '🔗 赞助渠道',
		prefix: '赞助渠道：',
		url: `https://teeworlds.cn/goto#donate`
	});
};
