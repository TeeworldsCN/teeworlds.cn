import { deleteUser, getUserByUsername } from '$lib/server/db/users';
import { volatile } from '$lib/server/keyv';
import type { Handler } from '../protocol/types';
import nodeCrypto from 'crypto';

export const handleRegister: Handler = async ({ user, reply, args, mode }) => {
	if (mode == 'GROUP') {
		return await reply.text('请不要在群里生成注册链接。');
	}

	const registerToken = nodeCrypto.randomBytes(12).toString('base64url');
	await volatile.set(`register:${registerToken}`, user?.bind_name || '神秘人', 12 * 60 * 60 * 1000);

	const registerUrl = `https://teeworlds.cn/login/register?token=${encodeURIComponent(registerToken)}`;
	await reply.text(`注册链接生成完成，有效期 12 小时，请发送给被邀请的人：\n${registerUrl}`);
};

export const handleResetPassword: Handler = async ({ reply, args, mode }) => {
	if (mode == 'GROUP') {
		return await reply.text('请不要在群里使用，注册相关功能请私聊豆豆。');
	}

	const username = args.trim();

	if (!username) {
		return await reply.text('请输入需要修改密码的用户名。');
	}

	const targetUser = getUserByUsername(username);
	if (!targetUser) {
		return await reply.text(`用户 ${username} 不存在。`);
	}

	const resetToken = nodeCrypto.randomBytes(12).toString('base64url');
	await volatile.set(`reset-pw:${resetToken}`, targetUser.uuid, 12 * 60 * 60 * 1000);

	const resetUrl = `https://teeworlds.cn/login/reset?token=${encodeURIComponent(resetToken)}`;
	await reply.text(`重置密码链接生成完成，有效期 12 小时，请发送给需要重置密码的人：\n${resetUrl}`);
};

export const handleDeleteUser: Handler = async ({ reply, args }) => {
	const username = args.trim();

	if (!username) {
		return await reply.text('请输入需要删除的用户名。');
	}

	const targetUser = getUserByUsername(username);
	if (!targetUser) {
		return await reply.text(`用户 ${username} 不存在。`);
	}

	deleteUser(targetUser.uuid);
	return await reply.text(`已删除用户 ${username}。`);
};
