import type { Handler } from '../protocol/types';

export const handleToolbox: Handler = async ({ reply }) =>
	await reply.link({
		label: '🔗 DDNet 工具箱',
		prefix: 'DDNet 工具箱 → ',
		url: 'https://teeworlds.cn/ddnet'
	});

export const handleReport: Handler = async ({ reply }) => {
	return await reply.text('请前往QQ频道的 “举报恶意行为” 讨论组提供信息，将会有群管理协助你');
};

export const handleShowUid: Handler = async ({ reply, uid }) => {
	return await reply.text(`您的 UID 是 ${uid}`);
};

export const handleShowGid: Handler = async ({ reply, group }) => {
	return await reply.text(`这里的 GID 是 ${group}`);
};
