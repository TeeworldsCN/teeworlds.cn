import type { Handler } from '../protocol/types';

export const handleHelp: Handler = async ({ reply }) =>
	await reply.textLink(
		[
			'目前豆豆可以提供以下查询功能：',
			'  /分数 <玩家名> - 查询分数',
			'  /地图 <地图名> - 查询地图',
			'  /绑定 <玩家名> - 绑定玩家名',
			'更多功能请使用工具箱'
		].join('\n'),
		{
			label: '🔗 DDNet 工具箱',
			prefix: '→ ',
			url: 'https://teeworlds.cn/ddnet'
		}
	);
