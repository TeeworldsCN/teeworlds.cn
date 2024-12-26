// Main handler.

import { handlePoints } from './handlers/points';
import type { SendReply, SendResult } from './protocol/types';

let customBody: any = null;
let customToken: string | null = null;
let customError: SendResult | null = null;
let listenToUser: string | null = null;

type Transaction = {
	uid: string;
	msg: any;
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

export const handleChat: (
	platform: string,
	reply: SendReply,
	user: string,
	msg: string,
	mode: 'GROUP' | 'DIRECT'
) => Promise<SendResult> = async (platform, reply, user, msg, mode) => {
	const uid = `${platform}:${user}`;
	const transaction: Transaction = {
		uid,
		msg,
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

	const firstSpace = msg.indexOf(' ');
	if (firstSpace >= 0) {
		if (command.startsWith('/')) {
			command = command.slice(1, firstSpace);
		} else {
			command = command.slice(0, firstSpace);
		}
		args = msg.slice(firstSpace + 1).trim();
	}

	let result = null;

	// TODO: Design a better handler for this
	if (command === '__uid__') {
		result = await reply.text(`您的 UID 是 ${uid}`);
	} else if (command === '分数' || command === 'points') {
		result = await handlePoints(uid, reply, command, args, mode);
	} else if (command === '地图') {
		result = await reply.text('抱歉，地图查询功能正在维护中，请关注群公告了解维护状态。');
	} else if (mode === 'DIRECT') {
		result = await reply.text(
			'Hi, 目前豆豆可以提供以下查询功能：\n - 分数 <玩家名> - 查询分数\n - 地图 <地图名> - 查询地图'
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
