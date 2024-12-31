import type { SendReply, SendResult } from './protocol/types';
import { AsyncQueue } from '$lib/async-queue';
import { commands } from '.';
import { getUserByUsername, hasPermission, type UserPermissions } from '../db/users';
import { persistent } from '../db/kv';
import { RateLimiter } from './utils/rate-limiter';

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
const limiter = new RateLimiter('bot', {
	threshold: 3,
	interval: 60,
	cooldown: 300
});

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

	const permissions: UserPermissions = [];
	const databaseUser = getUserByUsername(uid);

	if (platform == 'cli') {
		// local cli always has full permissions
		permissions.push('SUPER');
	} else {
		if (databaseUser?.data?.permissions) {
			permissions.push(...databaseUser.data.permissions);
		}
	}

	const cmd = commands.parse(msg, permissions);
	const groupOrGuild = group.split(':')[0] || 'DIRECT';

	if (mode == 'GROUP' && !cmd.fallback) {
		const rateLimited = persistent.get<boolean>(`bot:rate-limit:${platform}:${groupOrGuild}`);
		if (rateLimited && !hasPermission(databaseUser, 'GROUP_SETTINGS')) {
			const { limited, triggered } = await limiter.isLimited(user, group);
			if (triggered) {
				return await reply.textLink('您操作太频繁了！请5分钟后再试。需要大量查询请私聊豆豆。', {
					label: '🔗 DDNet 工具箱',
					prefix: '或者直接用 DDNet 工具箱：',
					url: 'https://teeworlds.cn/ddnet'
				});
			}

			if (limited) {
				return { ignored: true, message: 'rate limited' };
			}
		}
	}

	const allowLink = persistent.get<boolean>(`bot:allow-link:${platform}:${groupOrGuild}`);
	if (!allowLink) {
		const originalReply = reply;
		reply = {
			...originalReply,
			link: (link) => {
				if (link.bypass) return originalReply.link(link);
				return originalReply.text('抱歉，该功能正在维护中。');
			},
			textLink: (msg, link) => {
				if (link.bypass) return originalReply.textLink(msg, link);
				return originalReply.text(msg);
			},
			imageTextLink: (msg, url, link) => {
				if (link.bypass) return originalReply.imageTextLink(msg, url, link);
				return originalReply.imageText(msg, url);
			}
		};
	}

	const handlerArgs = {
		platform,
		uid,
		user: databaseUser,
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
