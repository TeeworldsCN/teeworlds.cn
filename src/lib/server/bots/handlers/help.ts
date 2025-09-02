import type { Handler } from '../protocol/types';

export const handleHelp: Handler = async ({ reply, platform }) => {
	const prefix = platform == 'wechat' ? '' : '/';

	await reply.textLink(
		[
			'目前豆豆可以提供以下查询功能：',
			`  ${prefix}分数 <玩家名> - 查询分数`,
			`  ${prefix}地图 <地图名> - 查询地图`,
			`  ${prefix}找人 <玩家名> - 查询玩家在线状态`,
			`  ${prefix}状态 - 查询服务器运行状态`,
			`  ${prefix}绑定 <玩家名> - 绑定玩家名`,
			`  ${prefix}赞助 - 了解如何赞助服务器`,
			'更多功能请使用工具箱'
		].join('\n'),
		{
			label: '🔗 DDNet 工具箱',
			prefix: '→ ',
			url: 'https://teeworlds.cn/ddnet'
		}
	);
};
