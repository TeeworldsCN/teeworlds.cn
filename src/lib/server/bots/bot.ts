import { handlePoints } from './handlers/points';
import type { SendReply, SendResult } from './protocol/types';
import { AsyncQueue } from '$lib/async-queue';
import { RateLimiter } from './rate-limiter';
import { handleMaps } from './handlers/maps';
import { handleBind } from './handlers/bind';

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

	let command = msg;
	let args = '';

	// handle at message in channel
	if (msg.startsWith('<@!')) {
		msg = msg.split(' ').slice(1).join(' ');
	}

	const firstSpace = msg.indexOf(' ');
	if (firstSpace >= 0) {
		command = msg.slice(0, firstSpace);
		args = msg.slice(firstSpace + 1).trim();
	}

	if (command.startsWith('/')) {
		command = command.slice(1);
	}

	let result = null;

	const handlerArgs = { uid, reply, command, args, mode, fetch };

	// TODO: Design a better handler for this
	if (command === '__uid__') {
		result = await reply.text(`您的 UID 是 ${uid}`);
	} else if (command === '分数' || command == 'point' || command === 'points') {
		result = await handlePoints(handlerArgs);
	} else if (command === '地图' || command === 'map' || command === 'maps') {
		result = await handleMaps(handlerArgs);
	} else if (command === '绑定' || command === 'bind') {
		result = await handleBind(handlerArgs);
	}
	// add more commands here ^
	else if (command === '工具箱') {
		result = await reply.link({
			label: '🔗 DDNet 工具箱',
			prefix: 'DDNet 工具箱 → ',
			url: 'https://teeworlds.cn/ddnet'
		});
	} else if (mode === 'DIRECT' || command === '' || command === '帮助' || command === 'help') {
		// help message
		result = await reply.textLink(
			[
				'目前豆豆可以提供以下查询功能：',
				'  /分数 <玩家名> - 查询分数',
				'  /地图 <地图名> - 查询地图',
				'  /绑定 <玩家名> - 绑定玩家名',
				'更多功能请使用工具箱'
			].join('\n'),
			{
				label: '🔗 DDNet 工具箱',
				prefix: '→ ',
				url: 'https://teeworlds.cn/ddnet'
			}
		);
	}

	if (!result) {
		result = { ignored: true, message: '未知指令' };
	}

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
	msg: string,
	raw: any,
	mode: 'GROUP' | 'DIRECT'
) => Promise<SendResult> = async (fetch, platform, reply, user, msg, raw, mode) => {
	return await queue.push(() => handle(fetch, platform, reply, user, msg, raw, mode));
};
