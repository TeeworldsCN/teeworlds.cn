import type { Handler } from '../protocol/types';
import { helpMarkdown } from '../markdown';

export const handleHelp: Handler = async ({ reply, platform }) => {
	const prefix = platform == 'wechat' ? '' : '/';

	await reply.markdown(helpMarkdown(prefix, 'https://teeworlds.cn/ddnet'));
};
