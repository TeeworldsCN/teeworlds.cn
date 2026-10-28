import type { Handler } from '../protocol/types';
import { identityMarkdown, toolboxMarkdown } from '../markdown';

export const handleToolbox: Handler = async ({ reply }) =>
	await reply.markdown(toolboxMarkdown('https://teeworlds.cn/ddnet'));

export const handleShowUid: Handler = async ({ reply, uid }) => {
	return await reply.markdown(identityMarkdown('你的 UID', uid));
};

export const handleShowGid: Handler = async ({ reply, group }) => {
	return await reply.markdown(identityMarkdown('这里的 GID', group));
};
