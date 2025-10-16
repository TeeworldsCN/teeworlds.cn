import { persistent } from '$lib/server/db/kv';
import {
	createUser,
	getUserByUsername,
	PERMISSION_LIST,
	updateUserData
} from '$lib/server/db/users';
import type { Permission } from '$lib/types';
import { type Handler } from '../protocol/types';
import { WeChat } from '../protocol/wechat';
import { ArgParser } from '../utils/arg-parser';

export const adminPermissionAdd: Handler = async ({ reply, args }) => {
	const parser = new ArgParser(args);
	const uid = parser.getString(0);
	const permission = parser.getString(1) as Permission;
	if (!uid || !permission) {
		return await reply.text('/give-perm <uid> <permission>');
	}

	if (!PERMISSION_LIST.includes(permission.toUpperCase())) {
		return await reply.text(`Unknown permission "${permission}"`);
	}

	const user = getUserByUsername(uid);
	if (!user) {
		await createUser(uid, { permissions: [permission] });
	} else {
		if (user.data.permissions) {
			user.data.permissions.push(permission);
		} else {
			user.data.permissions = [permission];
		}
		updateUserData(user.uuid, user.data);
	}

	return await reply.text(`Permission "${permission}" has been given to "${uid}"`);
};

export const adminPermissionRemove: Handler = async ({ reply, args }) => {
	const parser = new ArgParser(args);
	const uid = parser.getString(0);
	const permission = parser.getString(1);
	if (!uid || !permission) {
		return await reply.text('/perm-rm <uid> <permission | all>');
	}

	const user = getUserByUsername(uid);
	if (!user) {
		return await reply.text(`User "${uid}" does not exist`);
	}

	if (permission == 'all') {
		if (user.data.permissions) {
			delete user.data.permissions;
		}
		updateUserData(user.uuid, user.data);
		return await reply.text(`All permissions have been removed from "${uid}"`);
	}

	if (user.data.permissions) {
		user.data.permissions = user.data.permissions.filter((perm) => perm !== permission);
		if (user.data.permissions.length == 0) {
			delete user.data.permissions;
		}
	}
	updateUserData(user.uuid, user.data);
	return await reply.text(`Permission "${permission}" has been removed from "${uid}"`);
};

export const adminCheckPermission: Handler = async ({ uid, reply, args }) => {
	const parser = new ArgParser(args);
	const targetUid = parser.getRest(0) || uid;

	const user = getUserByUsername(targetUid);
	if (!user) {
		return await reply.text(`User "${targetUid}" does not exist`);
	}

	if (!user.data.permissions || user.data.permissions.length == 0) {
		return await reply.text(`User "${targetUid}" has no permission.`);
	}

	return await reply.text(
		`User "${targetUid}" has permission ${user.data.permissions?.join(', ')}`
	);
};

export const adminAllowLink: Handler = async ({ platform, group, reply, args, mode }) => {
	const parser = new ArgParser(args);
	const arg = parser.getRest(0);
	if (!arg) {
		return await reply.text('/allow-link <true|false>');
	}

	const allow = arg.toLowerCase() == 'true';

	if (mode == 'DIRECT') {
		persistent.set<boolean>(`bot:allow-link:${platform}:DIRECT`, allow);

		if (allow) {
			return await reply.text(`已允许所有私聊查询链接`);
		} else {
			return await reply.text(`已禁止所有私聊查询链接`);
		}
	}

	if (mode != 'GROUP' || !group || !platform) {
		return await reply.text('仅支持在群里设置');
	}

	const groupOrGuild = group.split(':')[0];
	if (allow) {
		persistent.set<boolean>(`bot:allow-link:${platform}:${groupOrGuild}`, allow);
	} else {
		persistent.delete(`bot:allow-link:${platform}:${groupOrGuild}`);
	}

	if (allow) {
		return await reply.text(`已允许机器人在本群查询链接`);
	} else {
		return await reply.text(`已禁止机器人在本群查询链接`);
	}
};

export const adminRateLimit: Handler = async ({ platform, group, reply, args, mode }) => {
	if (mode != 'GROUP' || !group || !platform) {
		return await reply.text('仅支持在群里设置');
	}

	const parser = new ArgParser(args);
	const arg = parser.getRest(0);
	if (!arg) {
		return await reply.text('/rate-limit <true|false>');
	}

	const limit = arg.toLowerCase() == 'true';

	const groupOrGuild = group.split(':')[0];
	if (limit) {
		persistent.set<boolean>(`bot:rate-limit:${platform}:${groupOrGuild}`, limit);
	} else {
		persistent.delete(`bot:rate-limit:${platform}:${groupOrGuild}`);
	}

	if (limit) {
		return await reply.text(`已限制群组中机器人的查询频率`);
	} else {
		return await reply.text(`已取消限制群组中机器人的查询频率`);
	}
};

export const adminWeChatAccessToken: Handler = async ({ reply, mode }) => {
	if (mode != 'DIRECT') {
		return;
	}

	if (!WeChat) {
		return await reply.text('WeChat 协议未启用');
	}

	const accessToken = await WeChat.getAccessToken();
	return await reply.text(`WeChat Access Token: ${accessToken}`);
};
