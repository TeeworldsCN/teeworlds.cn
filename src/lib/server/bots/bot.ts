import type { Permissions, SendReply, SendResult } from './protocol/types';
import { AsyncQueue } from '$lib/async-queue';
import { commands } from '.';
import { getUser } from '../users';

let customBody: any = null;
let customToken: string | null = null;
let customError: SendResult | null = null;
let listenToUser: string | null = null;

type Transaction = {
	uid: string;
	msg: string;
	raw: any;
	mode: 'GROUP' | 'DIRECT';
	time: number;
	result: SendResult | null;
} | null;

let lastTransaction: Transaction = null;

export const getListenToUser = () => {
	return listenToUser;
};

export const setListenToUser = (user: string) => {
	listenToUser = user;
};

export const getLastTransaction = () => {
	return lastTransaction;
};

export const getCustomError = () => {
	const result = customError;
	return result;
};

export const registerCustom = (body: any) => {
	if (!body) {
		return {
			error: true,
			message: 'custom command must have a body'
		};
	}

	const buffer = new Uint8Array(12);
	customToken = Buffer.from(crypto.getRandomValues(buffer)).toString('hex');
	customBody = body;

	return {
		token: customToken
	};
};

const queue = new AsyncQueue();
// const limiter = new RateLimiter('bot', {
// 	threshold: 3,
// 	interval: 60,
// 	cooldown: 300
// });

const handle = async (
	fetch: typeof global.fetch,
	platform: string,
	reply: SendReply,
	user: string,
	group: string,
	msg: string,
	raw: any,
	mode: 'GROUP' | 'DIRECT'
) => {
	// TODO: don't need to trigger rate limit if the command does not exist
	// consider move this after we implemented a better command parser
	// rate limit in group mode
	// if (mode == 'GROUP') {
	// 	const { limited, triggered } = await limiter.isLimited(user);
	// 	if (triggered) {
	// 		return await reply.text(
	// 			'您操作太频繁了！请5分钟后再试。需要大量查询请私聊豆豆。\n或直接用工具箱查询：https://teeworlds.cn/ddnet'
	// 		);
	// 	}

	// 	if (limited) {
	// 		return { ignored: true, message: 'rate limited' };
	// 	}
	// }

	const uid = `${platform}:${user}`;
	const transaction: Transaction = {
		uid,
		msg,
		raw,
		mode,
		time: Date.now(),
		result: null
	};

	msg = msg.trim();

	// trigger custom message
	if (customBody && msg === customToken) {
		const body = customBody;
		customBody = null;
		customToken = null;
		customError = await reply.custom(body);
		transaction.result = customError;
		if (!listenToUser || listenToUser == uid) {
			lastTransaction = transaction;
		}
		return customError;
	}

	const permissions: Permissions = [];
	const userData = await getUser(uid);

	if (platform == 'cli') {
		// local cli always has full permissions
		permissions.push('SUPER');
	} else {
		if (userData && userData.permissions) {
			permissions.push(...userData.permissions);
		}
	}

	const cmd = commands.parse(msg, permissions);

	const handlerArgs = {
		uid,
		user: userData,
		reply,
		command: cmd.cmd,
		args: cmd.args,
		mode,
		fetch,
		group,
		permissions
	};

	const result = await commands.run(cmd, handlerArgs);
	transaction.result = result;
	if (!listenToUser || listenToUser == uid) {
		lastTransaction = transaction;
	}
	return result;
};

export const handleChat: (
	fetch: typeof global.fetch,
	platform: string,
	reply: SendReply,
	user: string,
	group: string,
	msg: string,
	raw: any,
	mode: 'GROUP' | 'DIRECT'
) => Promise<SendResult> = async (...args) => {
	return await queue.push(() => handle(...args));
};
