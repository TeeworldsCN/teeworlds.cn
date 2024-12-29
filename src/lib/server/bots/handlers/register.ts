import { setUser } from '$lib/server/users';
import type { Handler } from '../protocol/types';
import crypto from 'crypto';

export const handleRegister: Handler = async ({ user, reply, args, mode }) => {
	if (mode == 'GROUP') {
		return await reply.text('请不要在群里注册，注册功能请私聊豆豆。');
	}

	if (!user) {
		return;
	}

	if (!args) {
		return await reply.text('注册密码不能为空');
	}

	const salt = crypto.randomBytes(16).toString('base64');
	const hash = crypto
		.createHash('sha256')
		.update(salt + args)
		.digest('base64');

	const password = {
		salt,
		hash
	};

	user.password = password;
	await setUser(user.uid, user);

	return await reply.text(
		`已将你的密码设置为 ${args}。你的用户名为 ${user.uid}，请妥善保管。忘记用户名可以通过 __uid__ 指令来找回。`
	);
};
