import { createUser, updateUserBindName } from '$lib/server/db/users';
import type { Handler } from '../protocol/types';
import {
	bindErrorMarkdown,
	bindMissingMarkdown,
	bindRemovedMarkdown,
	bindSuccessMarkdown
} from '../markdown';

export const handleBind: Handler = async ({ platform, uid, user, reply, args }) => {
	const playerName = args.trim().slice(0, 16);
	const prefix = platform == 'wechat' ? '' : '/';

	if (!playerName) {
		if (user?.bind_name) {
			const name = user.bind_name;
			updateUserBindName(user.uuid, null);
			return await reply.markdown(bindRemovedMarkdown(name));
		}

		return await reply.markdown(bindMissingMarkdown(prefix, 'https://teeworlds.cn/goto#p'));
	}

	if (!user) {
		const result = await createUser(uid, {}, playerName);
		if (!result.success) {
			return await reply.markdown(bindErrorMarkdown());
		}
	} else {
		updateUserBindName(user.uuid, playerName);
	}
	return await reply.markdown(bindSuccessMarkdown(playerName));
};
