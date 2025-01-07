import { createUser, updateUserData } from '$lib/server/db/users';
import type { Handler } from '../protocol/types';

export const handleBind: Handler = async ({ uid, user, reply, args }) => {
	const playerName = args.trim();

	if (!playerName) {
		if (user?.data?.name) {
			const data = user.data;
			const name = data.name;
			delete data.name;
			updateUserData(user.uuid, data);
			return await reply.text(`已解绑 ${name}`);
		}

		return await reply.textLink('绑定名字请提供 <玩家名>。或者直接使用 DDNet 工具箱', {
			label: '🔗 排名查询工具',
			prefix: '→ ',
			url: 'https://teeworlds.cn/goto#p'
		});
	}

	if (!user) {
		const result = await createUser(uid, { name: playerName });
		if (!result.success) {
			return await reply.text(
				`豆豆好像出了点问题。。。豆豆也不知道该怎么办了。。。要不等下重试一下？`
			);
		}
	} else {
		user.data.name = playerName;
		updateUserData(user.uuid, user.data);
	}
	return await reply.text(`已记住了你的游戏名 ${playerName}，之后的查询会默认使用这个名字。`);
};
