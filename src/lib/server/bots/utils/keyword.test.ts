import { describe, expect, test } from 'bun:test';
import { matchKeyword, normalizeForMatch } from './keyword';

const items = (...keywords: string[]) => keywords.map((keyword) => ({ keyword }));

describe('normalizeForMatch', () => {
	test('全角转半角并转小写', () => {
		expect(normalizeForMatch('ＡＢＣ１２３')).toBe('abc123');
	});

	test('去掉零宽字符和空格', () => {
		expect(normalizeForMatch('代\u200b刷 广\u2060告')).toBe('代刷广告');
	});
});

describe('matchKeyword', () => {
	test('普通子串匹配', () => {
		const matched = matchKeyword(items('代刷'), '有人要代刷吗');
		expect(matched?.keyword).toBe('代刷');
	});

	test('忽略大小写', () => {
		expect(matchKeyword(items('Spam'), 'look at this SPAM message')?.keyword).toBe('Spam');
	});

	test('命中全角形式和零宽字符', () => {
		expect(matchKeyword(items('abc'), 'ａ\u200bｂｃ')?.keyword).toBe('abc');
	});

	test('去掉空格后仍然命中', () => {
		expect(matchKeyword(items('敏感词'), '敏 感 词')?.keyword).toBe('敏感词');
	});

	test('空关键词不会匹配所有消息', () => {
		expect(matchKeyword(items('', '   '), '任何消息')).toBeNull();
	});

	test('空消息不匹配', () => {
		expect(matchKeyword(items('广告'), '')).toBeNull();
	});

	test('按顺序返回第一个命中的关键词', () => {
		const matched = matchKeyword(items('广告', '代刷广告'), '代刷广告');
		expect(matched?.keyword).toBe('广告');
	});

	test('没有命中返回 null', () => {
		expect(matchKeyword(items('广告'), '今天的服务器状态怎么样')).toBeNull();
	});
});
