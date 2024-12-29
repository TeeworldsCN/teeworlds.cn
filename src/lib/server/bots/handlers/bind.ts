import { persistent } from '$lib/server/keyv';
import { getUser, setUser } from '$lib/server/users';
import type { Handler } from '../protocol/types';

export const handleBind: Handler = async ({ uid, reply, args }) => {
	const playerName = args.trim();
	let user = await getUser(uid);

	if (!playerName) {
		if (user?.name) {
			const name = user.name;
			delete user.name;
			await setUser(uid, user);
			return await reply.text(`已解绑 ${name}`);
		}

		return await reply.textLink('绑定名字请提供 <玩家名>。或者直接使用 DDNet 工具箱', {
			label: '🔗 排名查询工具',
			prefix: '→ ',
			url: 'https://teeworlds.cn/ddnet/players'
		});
	}

	if (!user) {
		user = { uid, name: playerName };
	} else {
		user.name = playerName;
	}
	await setUser(uid, user);
	return await reply.text(`已记住了你的游戏名 ${playerName}，之后的查询会默认使用这个名字。`);
};
