import type { Handler } from '../protocol/types';

export const handleToolbox: Handler = async ({ reply }) =>
	await reply.link({
		label: '🔗 DDNet 工具箱',
		prefix: 'DDNet 工具箱 → ',
		url: 'https://teeworlds.cn/ddnet'
	});

export const handleReport: Handler = async ({ reply }) => {
	return await reply.textLink(
		'请前往QQ频道的 “举报恶意行为” 讨论组提供信息，将会有群管理协助你',
		{
			label: '举报恶意行为',
			prefix: '→ ',
			url: 'https://pd.qq.com/s/2hcgw9j3j?businessType=7',
			bypass: true
		}
	);
};

export const handleShowUid: Handler = async ({ reply, uid }) => {
	return await reply.text(`您的 UID 是 ${uid}`);
};

export const handleShowGid: Handler = async ({ reply, group }) => {
	return await reply.text(`这里的 GID 是 ${group}`);
};
