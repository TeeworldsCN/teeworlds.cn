// Main handler.

import { handlePoints } from './handlers/points';
import type { SendReply } from './protocol/types';

export const handleChat: (
	reply: SendReply,
	uid: string,
	msg: string,
	mode: 'GROUP' | 'DIRECT'
) => Promise<void> | void = async (reply, uid, msg, mode) => {
	msg = msg.trim();
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

	// TODO: Design a better handler for this
	if (command === '分数' || command === 'points') {
		await handlePoints(uid, reply, command, args, mode);
	} else if (command === '地图') {
		reply.text('抱歉，地图查询功能正在维护中，请关注群公告了解维护状态。');
	} else if (mode === 'DIRECT') {
		reply.text(
			'Hi, 目前豆豆可以提供以下查询功能：\n - 分数 <玩家名> - 查询分数\n - 地图 <地图名> - 查询地图'
		);
	}
};
