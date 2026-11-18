import { addRecallLog, findRecallKeyword, isAutoRecallEnabled } from '../db/recall';
import { QQBot } from './protocol/qq';

/**
 * 自动撤回命中关键词的 QQ 群消息。
 *
 * 相关文档: https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_groups_group_openid_messages_message_id.delete.html
 *
 * 注意:
 * - 机器人必须是群管理员才能撤回普通群成员的消息; 普通成员只能撤回自己发的消息。
 * - 消息发出超过 2 分钟后无法撤回。
 * - 需要在群里开启"接收所有消息", 否则只能看到 @ 机器人的消息。
 */

export type AutoRecallResult =
	| { recalled: true; keyword: string }
	| {
			recalled: false;
			reason: 'not-initialized' | 'disabled' | 'no-match' | 'duplicate';
	  }
	| { recalled: false; reason: 'failed'; keyword: string; error: string };

export interface AutoRecallInput {
	groupOpenid: string;
	messageId: string;
	content: string;
	userOpenid: string;
	userName?: string;
}

/** QQ 撤回接口限频 10 QPS, 重复事件也没必要再打一次 */
const DUPLICATE_WINDOW = 10 * 60 * 1000;
const DUPLICATE_LIMIT = 500;
const attempted = new Map<string, number>();

const isDuplicate = (key: string) => {
	const now = Date.now();
	const last = attempted.get(key);
	if (last !== undefined && now - last < DUPLICATE_WINDOW) {
		return true;
	}

	attempted.set(key, now);
	if (attempted.size > DUPLICATE_LIMIT) {
		for (const [id, time] of attempted) {
			if (now - time >= DUPLICATE_WINDOW) attempted.delete(id);
		}
		// still too big (a burst of unique messages), drop the oldest entries
		while (attempted.size > DUPLICATE_LIMIT) {
			const oldest = attempted.keys().next().value;
			if (oldest === undefined) break;
			attempted.delete(oldest);
		}
	}

	return false;
};

const MAX_LOG_CONTENT = 200;

const logContent = (content: string) =>
	content
		.replace(/<@[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_LOG_CONTENT);

export const maybeRecallGroupMessage = async (
	input: AutoRecallInput
): Promise<AutoRecallResult> => {
	const bot = QQBot;
	if (!bot) {
		return { recalled: false, reason: 'not-initialized' };
	}

	if (!isAutoRecallEnabled()) {
		return { recalled: false, reason: 'disabled' };
	}

	const matched = findRecallKeyword(input.content);
	if (!matched) {
		return { recalled: false, reason: 'no-match' };
	}

	if (isDuplicate(`${input.groupOpenid}:${input.messageId}`)) {
		return { recalled: false, reason: 'duplicate' };
	}

	const result = await bot.recallGroupMessage(input.groupOpenid, input.messageId);

	if (result.error) {
		const error = `${result.bizCode ?? result.code} ${result.message}`;
		console.error(
			`[qq-recall] 撤回失败 (${error}) group=${input.groupOpenid} message=${input.messageId} keyword=${matched.keyword}`
		);
		addRecallLog({
			messageId: input.messageId,
			groupOpenid: input.groupOpenid,
			userOpenid: input.userOpenid,
			userName: input.userName,
			keyword: matched.keyword,
			content: logContent(input.content),
			success: false,
			error
		});
		return { recalled: false, reason: 'failed', keyword: matched.keyword, error };
	}

	console.log(
		`[qq-recall] 已撤回 group=${input.groupOpenid} message=${input.messageId} keyword=${matched.keyword}`
	);
	addRecallLog({
		messageId: input.messageId,
		groupOpenid: input.groupOpenid,
		userOpenid: input.userOpenid,
		userName: input.userName,
		keyword: matched.keyword,
		content: logContent(input.content),
		success: true
	});
	return { recalled: true, keyword: matched.keyword };
};
