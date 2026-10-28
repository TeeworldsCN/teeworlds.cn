import type { Handler } from '../protocol/types';
import { donateMarkdown } from '../markdown';

export const handleDonate: Handler = async ({ reply }) =>
	await reply.markdown(donateMarkdown('https://teeworlds.cn/goto#donate'));
