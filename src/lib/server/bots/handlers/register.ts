import { deleteUser, getUserByUsername } from '$lib/server/db/users';
import { volatile } from '$lib/server/keyv';
import type { Handler } from '../protocol/types';
import nodeCrypto from 'crypto';
import {
	deleteUserMarkdown,
	errorMarkdown,
	registerLinkMarkdown,
	resetPasswordMarkdown,
	usageMarkdown
} from '../markdown';
import { escapeMarkdown } from '../utils/markdown';

export const handleRegister: Handler = async ({ user, reply, mode }) => {
	if (mode == 'GROUP') {
		return await reply.markdown(errorMarkdown('请不要在群里生成注册链接。'));
	}

	const registerToken = nodeCrypto.randomBytes(12).toString('base64url');
	await volatile.set(`register:${registerToken}`, user?.bind_name || '神秘人', 12 * 60 * 60 * 1000);

	const registerUrl = `https://teeworlds.cn/login/register?token=${encodeURIComponent(registerToken)}`;
	await reply.markdown(registerLinkMarkdown(registerUrl));
};

export const handleResetPassword: Handler = async ({ reply, args, mode }) => {
	if (mode == 'GROUP') {
		return await reply.markdown(errorMarkdown('请不要在群里使用，注册相关功能请私聊豆豆。'));
	}

	const username = args.trim();

	if (!username) {
		return await reply.markdown(usageMarkdown('请输入需要修改密码的用户名。'));
	}

	const targetUser = getUserByUsername(username);
	if (!targetUser) {
		return await reply.markdown(errorMarkdown(`用户 **${escapeMarkdown(username)}** 不存在。`));
	}

	const resetToken = nodeCrypto.randomBytes(12).toString('base64url');
	await volatile.set(`reset-pw:${resetToken}`, targetUser.uuid, 12 * 60 * 60 * 1000);

	const resetUrl = `https://teeworlds.cn/login/reset?token=${encodeURIComponent(resetToken)}`;
	await reply.markdown(resetPasswordMarkdown(resetUrl));
};

export const handleDeleteUser: Handler = async ({ reply, args }) => {
	const username = args.trim();

	if (!username) {
		return await reply.markdown(usageMarkdown('请输入需要删除的用户名。'));
	}

	const targetUser = getUserByUsername(username);
	if (!targetUser) {
		return await reply.markdown(errorMarkdown(`用户 **${escapeMarkdown(username)}** 不存在。`));
	}

	deleteUser(targetUser.uuid);
	return await reply.markdown(deleteUserMarkdown(username));
};
