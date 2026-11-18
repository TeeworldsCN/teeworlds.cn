import { describe, expect, mock, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 用临时 SQLite 文件, 不碰 ./cache/sqlite.db
const dir = mkdtempSync(join(tmpdir(), 'twcn-recall-'));
mock.module('$env/dynamic/private', () => ({
	env: { ...process.env, SQLITE_PATH: join(dir, 'test.db') }
}));

const {
	addRecallLog,
	clearRecallLogs,
	createRecallKeyword,
	deleteRecallKeywordByUuid,
	findRecallKeyword,
	getRecallKeyword,
	hasRecallKeyword,
	isAutoRecallEnabled,
	listRecallKeywords,
	listRecallLogs,
	setAutoRecallEnabled,
	updateRecallKeywordByUuid
} = await import('./recall');

// 注意: bun test 的所有测试文件共用一个进程, $env 的 mock 和 sqlite 模块
// 只会初始化一次。另一个测试文件也用到这张表, 所以断言前先清空, 也不删临时目录。

describe('recall keywords', () => {
	test('增删改查与去重', () => {
		const created = createRecallKeyword({ keyword: '代刷' });
		expect(created.enabled).toBe(1);
		expect(listRecallKeywords().map((k) => k.keyword)).toContain('代刷');

		// 归一化后相同的关键词算重复
		expect(hasRecallKeyword(' 代 刷 ')).toBe(true);
		expect(hasRecallKeyword(' 代 刷 ', created.uuid)).toBe(false);

		expect(updateRecallKeywordByUuid(created.uuid, { keyword: '广告' })).toBe(true);
		const updated = getRecallKeyword(created.uuid);
		expect(updated?.keyword).toBe('广告');
		expect(updated?.enabled).toBe(1);

		expect(deleteRecallKeywordByUuid(created.uuid)).toBe(true);
		expect(getRecallKeyword(created.uuid)).toBeNull();
	});

	test('停用的关键词不参与匹配', () => {
		const created = createRecallKeyword({ keyword: '外挂' });
		expect(findRecallKeyword('卖外挂啦')?.uuid).toBe(created.uuid);

		updateRecallKeywordByUuid(created.uuid, { enabled: false });
		expect(findRecallKeyword('卖外挂啦')).toBeNull();
	});

	test('匹配时忽略空格和零宽字符', () => {
		const created = createRecallKeyword({ keyword: '敏感词' });
		expect(findRecallKeyword('敏\u200b感 词')?.uuid).toBe(created.uuid);
	});
});

describe('recall switch', () => {
	test('默认开启, 可以关闭再打开', () => {
		expect(isAutoRecallEnabled()).toBe(true);
		setAutoRecallEnabled(false);
		expect(isAutoRecallEnabled()).toBe(false);
		setAutoRecallEnabled(true);
		expect(isAutoRecallEnabled()).toBe(true);
	});
});

describe('recall logs', () => {
	test('记录成功与失败, 并按时间倒序返回', () => {
		clearRecallLogs();

		addRecallLog({
			messageId: 'm1',
			groupOpenid: 'g1',
			userOpenid: 'u1',
			keyword: '广告',
			content: '加群发广告',
			success: true
		});
		addRecallLog({
			messageId: 'm2',
			groupOpenid: 'g1',
			userOpenid: 'u2',
			keyword: '广告',
			content: '广告 again',
			success: false,
			error: '40062003 无操作权限'
		});

		const logs = listRecallLogs();
		expect(logs.length).toBe(2);
		expect(logs[0].message_id).toBe('m2');
		expect(logs[0].success).toBe(0);
		expect(logs[0].error).toBe('40062003 无操作权限');
		expect(logs[1].success).toBe(1);
	});

	test('最多保留 200 条', () => {
		for (let i = 0; i < 205; i++) {
			addRecallLog({
				messageId: `bulk-${i}`,
				groupOpenid: 'g1',
				userOpenid: 'u1',
				keyword: '广告',
				content: 'spam',
				success: true
			});
		}
		expect(listRecallLogs(1000).length).toBe(200);
	});

	test('可以清空', () => {
		clearRecallLogs();
		expect(listRecallLogs().length).toBe(0);
	});
});
