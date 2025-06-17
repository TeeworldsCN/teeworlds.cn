import { persistent } from '$lib/server/db/kv';
import { volatile } from '$lib/server/keyv';
import type { Handler } from '../protocol/types';
import crypto from 'node:crypto';
import { RateLimiter } from '../utils/rate-limiter';

const reportLimiter = new RateLimiter('report', {
	threshold: 5,
	interval: 10 * 60,
	cooldown: 10 * 60
});

export const handleReport: (type: string) => Handler =
	(type) =>
	async ({ reply, platform, uid, mode }) => {
		if (platform === 'web') return await reply.text('？？？');

		const allow = persistent.get<boolean>(`bot:allow-link:${platform}:DIRECT`);

		if (!allow) {
			return await reply.text(
				`豆豆暂时不能处理${type}，请手动前往 DDNet 工具箱 中寻找举报方式，或直接联系群管理员。`
			);
		}

		if (mode != 'DIRECT') {
			return await reply.text(
				`请私聊豆豆 /${type} 指令获取${type}链接。（点击豆豆头像选择“发消息”或“添加使用”）`
			);
		}

		const { limited, triggered } = await reportLimiter.isLimited(uid);
		if (triggered || limited) {
			return await reply.text(`你请求得太频繁了！请10分钟后再试。`);
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
		return await reply.textLink(
			`为你生成了${type}连接，请点开提供详细信息。有效期 10 分钟。（请不要提供给其他人）`,
			{
				label: `🔗 ${type}链接`,
				prefix: `${type}链接：`,
				url: `https://teeworlds.cn/goto#r${encodeURIComponent(token)}`
			}
		);
	};

export const handleVerify: Handler = async ({ reply, platform, uid, mode }) => {
	if (platform === 'web') return await reply.text('？？？');

	if (mode != 'DIRECT') {
		return await reply.text('账户验证只能在私聊中进行，请加豆豆好友，私聊豆豆 “验证” 指令进行验证');
	}

	const { limited, triggered } = await reportLimiter.isLimited(uid);
	if (triggered || limited) {
		return await reply.text(`你请求得太频繁了！请10分钟后再试。`);
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
