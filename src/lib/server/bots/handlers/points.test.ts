import { beforeEach, describe, expect, mock, test } from 'bun:test';

// 查分只看名字从哪来, 玩家数据/国服排行/回放都替换成固定结果
let queried: string[] = [];
let lookup: (name: string) => any = (name) => ({
	name,
	points: { points: 1, rank: 2 }
});

mock.module('$lib/server/players', () => ({
	getPlayer: async (name: string) => {
		queried.push(name);
		return lookup(name);
	}
}));

mock.module('$lib/server/fetches/ranks', () => ({
	regionalRanks: async () => null
}));

mock.module('$lib/server/fetches/watchable', () => ({
	findPlayerLatestDemo: async () => null
}));

mock.module('$lib/server/filter', () => ({
	allowedText: () => true
}));

const { handlePoints } = await import('./points');

const run = async (options: { args?: string; bind?: string; nickname?: string } = {}) => {
	const replies: string[] = [];
	const user = options.bind
		? ({ uuid: 'u', username: 'qq:u', version: 1, bind_name: options.bind, data: {} } as any)
		: null;

	await handlePoints({
		platform: 'qq',
		uid: 'qq:u',
		user,
		group: 'g',
		permissions: [],
		reply: {
			markdown: (msg: string) => {
				replies.push(msg);
				return {};
			}
		} as any,
		command: '分数',
		args: options.args ?? '',
		mode: 'GROUP',
		nickname: options.nickname,
		fetch: globalThis.fetch
	});

	return replies.join('\n');
};

beforeEach(() => {
	queried = [];
	lookup = (name) => ({ name, points: { points: 1, rank: 2 } });
});

describe('handlePoints 默认玩家名', () => {
	test('没写名字也没绑定时用群名片', async () => {
		const reply = await run({ nickname: 'TsFreddie' });

		expect(queried).toEqual(['TsFreddie']);
		expect(reply).toContain('# 🏆 TsFreddie');
	});

	test('绑定名优先于群名片', async () => {
		const reply = await run({ bind: 'Bound', nickname: 'Card' });

		expect(queried).toEqual(['Bound']);
		expect(reply).toContain('# 🏆 Bound');
	});

	test('写了名字时忽略群名片', async () => {
		const reply = await run({ args: 'Explicit', nickname: 'Card' });

		expect(queried).toEqual(['Explicit']);
		expect(reply).toContain('# 🏆 Explicit');
	});

	test('什么都没有时提示用法', async () => {
		const reply = await run();

		expect(queried).toEqual([]);
		expect(reply).toContain('查分');
		expect(reply).toContain('请提供玩家名');
	});

	test('群名片查不到时提示改绑', async () => {
		lookup = () => ({ name: null });
		const reply = await run({ nickname: 'Not a player' });

		expect(queried).toEqual(['Not a player']);
		expect(reply).toContain('群名片');
		expect(reply).toContain('/绑定');
	});

	test('显式名字查不到时保持原来的提示', async () => {
		lookup = () => ({ name: null });
		const reply = await run({ args: 'Not a player', nickname: 'Card' });

		expect(reply).toContain('未找到玩家');
		expect(reply).not.toContain('群名片');
	});
});
