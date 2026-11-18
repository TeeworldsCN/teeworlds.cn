import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 临时 SQLite, 不碰 ./cache/sqlite.db
const dir = mkdtempSync(join(tmpdir(), 'twcn-recall-bot-'));

mock.module('$env/dynamic/private', () => ({
	env: {
		...process.env,
		SQLITE_PATH: join(dir, 'test.db'),
		QQ_APPID: 'test-app-id',
		QQ_SECRET: 'test-secret'
	}
}));

// 不落盘 keyv (access token 缓存)
mock.module('$lib/server/keyv', () => ({
	volatile: {
		get: async () => undefined,
		set: async () => true,
		delete: async () => true
	}
}));

const { QQBot } = await import('./protocol/qq');
const { createRecallKeyword, listRecallLogs, setAutoRecallEnabled } = await import('../db/recall');
const { maybeRecallGroupMessage } = await import('./recall');

const originalFetch = globalThis.fetch;
let calls: { url: string; method: string }[] = [];
let recallResponse: () => Response = () => new Response('{}', { status: 200 });

globalThis.fetch = (async (input: any, init?: any) => {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
	const method = (init?.method ?? 'GET').toUpperCase();
	calls.push({ url, method });

	if (url.startsWith('https://bots.qq.com/app/getAppAccessToken')) {
		return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 7200 }), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	}

	if (url.startsWith('https://api.sgroup.qq.com/')) {
		return recallResponse();
	}

	throw new Error(`unexpected fetch: ${method} ${url}`);
}) as typeof fetch;

beforeEach(() => {
	calls = [];
	recallResponse = () => new Response('{}', { status: 200 });
});

afterAll(() => {
	globalThis.fetch = originalFetch;
	rmSync(dir, { recursive: true, force: true });
});

describe('maybeRecallGroupMessage', () => {
	test('QQ 机器人已初始化', () => {
		expect(QQBot).not.toBeNull();
	});

	test('命中关键词时调用 DELETE 撤回接口并记录日志', async () => {
		createRecallKeyword({ keyword: '广告' });

		const result = await maybeRecallGroupMessage({
			groupOpenid: 'G123',
			messageId: 'M1',
			content: '大家快加群，发广告啦',
			userOpenid: 'U1',
			userName: '测试群友'
		});

		expect(result).toEqual({ recalled: true, keyword: '广告' });

		const recallCall = calls.find((call) => call.method === 'DELETE');
		expect(recallCall?.url).toBe('https://api.sgroup.qq.com/v2/groups/G123/messages/M1');

		const log = listRecallLogs()[0];
		expect(log.message_id).toBe('M1');
		expect(log.keyword).toBe('广告');
		expect(log.user_name).toBe('测试群友');
		expect(log.success).toBe(1);
	});

	test('没有命中关键词时什么都不做', async () => {
		const result = await maybeRecallGroupMessage({
			groupOpenid: 'G123',
			messageId: 'M2',
			content: '今天服务器状态怎么样',
			userOpenid: 'U1'
		});

		expect(result).toEqual({ recalled: false, reason: 'no-match' });
		expect(calls.length).toBe(0);
	});

	test('QQ 返回错误码时记录失败原因', async () => {
		recallResponse = () =>
			new Response(JSON.stringify({ code: 40062003, message: 'no permission' }), {
				status: 400,
				headers: { 'content-type': 'application/json' }
			});

		const result = await maybeRecallGroupMessage({
			groupOpenid: 'G123',
			messageId: 'M3',
			content: '广告',
			userOpenid: 'U1'
		});

		expect(result).toEqual({
			recalled: false,
			reason: 'failed',
			keyword: '广告',
			error: '40062003 no permission'
		});

		const log = listRecallLogs()[0];
		expect(log.success).toBe(0);
		expect(log.error).toBe('40062003 no permission');
	});

	test('同一消息的重复事件只撤回一次', async () => {
		const input = {
			groupOpenid: 'G123',
			messageId: 'M4',
			content: '广告',
			userOpenid: 'U1'
		};

		expect((await maybeRecallGroupMessage(input)).recalled).toBe(true);
		expect(await maybeRecallGroupMessage(input)).toEqual({
			recalled: false,
			reason: 'duplicate'
		});
		expect(calls.filter((call) => call.method === 'DELETE').length).toBe(1);
	});

	test('总开关关闭时不调用接口', async () => {
		setAutoRecallEnabled(false);
		const result = await maybeRecallGroupMessage({
			groupOpenid: 'G123',
			messageId: 'M5',
			content: '广告',
			userOpenid: 'U1'
		});
		expect(result).toEqual({ recalled: false, reason: 'disabled' });
		expect(calls.length).toBe(0);
		setAutoRecallEnabled(true);
	});
});
