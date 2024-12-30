import { volatile } from '$lib/server/keyv';
import type { Handler } from '../protocol/types';
import crypto from 'crypto';

export const handleRegister: Handler = async ({ user, reply, args, mode }) => {
	if (mode == 'GROUP') {
		return await reply.text('请不要在群里生成注册链接。');
	}

	const registerToken = crypto.randomBytes(12).toString('base64url');
	await volatile.set(
		`register:${registerToken}`,
		user?.data.name || user?.uuid.toString() || '神秘人',
		12 * 60 * 60 * 1000
	);

	const registerUrl = `https://teeworlds.cn/login/register?token=${encodeURIComponent(registerToken)}`;
	await reply.text(`注册链接生成完成，有效期 12 小时，请发送给被邀请的人：\n${registerUrl}`);
};
