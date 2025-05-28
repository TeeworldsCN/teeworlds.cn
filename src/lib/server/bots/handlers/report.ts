import { persistent } from '$lib/server/db/kv';
import { volatile } from '$lib/server/keyv';
import type { Handler } from '../protocol/types';
import crypto from 'node:crypto';

export const handleReport: Handler = async ({ reply, platform, uid, mode }) => {
	if (platform === 'web') return await reply.text('？？？');

	const allow = persistent.get<boolean>(`bot:allow-link:${platform}:DIRECT`);

	if (!allow) {
		return await reply.text(
			'豆豆暂时不能处理举报，请手动前往 DDNet 工具箱 中寻找举报方式，或直接联系群管理员。'
		);
	}

	if (mode != 'DIRECT') {
		return await reply.textLink('请添加豆豆为好友，并私聊向豆豆发送 “举报” 指令进入举报系统', {
			label: '🔗 或用电脑点此',
			prefix: '也可以用电脑直接打开举报系统 ->',
			url: 'https://teeworlds.cn/ddnet/tickets'
		});
	}

	const bytes = crypto.randomBytes(20);
	const token = bytes.toString('hex');
	await volatile.set(
		`ticket-token:${token}`,
		{
			platform,
			uid,
			valid_until: Date.now() + 10 * 60 * 1000
		},
		10 * 60 * 1000
	);
	return await reply.textLink(`为你生成了举报连接，请点开提供详细信息`, {
		label: '🔗 举报链接',
		prefix: '举报链接：',
		url: `https://teeworlds.cn/goto#r${encodeURIComponent(token)}`
	});
};

export const handleVerify: Handler = async ({ reply, platform, uid, mode }) => {
	if (platform === 'web') return await reply.text('？？？');

	if (mode != 'DIRECT') {
		return await reply.text('账户验证只能在私聊中进行，请加豆豆好友，私聊豆豆 “验证” 指令进行验证');
	}

	const code = crypto.randomInt(0, 100000000).toString().padStart(8, '0');
	const existing = await volatile.get(`verify-code:${code}`);
	if (existing) {
		return await reply.text('生成验证码失败，请稍后再试');
	}

	await volatile.set(
		`verify-code:${code}`,
		{
			platform,
			uid,
			valid_until: Date.now() + 2 * 60 * 1000
		},
		2 * 60 * 1000
	);
	return await reply.text(`你的验证码为：${code}\n请在 2 分钟内完成验证`);
};
