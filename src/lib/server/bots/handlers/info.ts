import type { Handler } from '../protocol/types';

export const handleToolbox: Handler = async ({ reply }) =>
	await reply.link({
		label: '🔗 DDNet 工具箱',
		prefix: 'DDNet 工具箱 → ',
		url: 'https://teeworlds.cn/ddnet'
	});

export const handleShowUid: Handler = async ({ reply, uid }) => {
	return await reply.text(`您的 UID 是 ${uid}`);
};
