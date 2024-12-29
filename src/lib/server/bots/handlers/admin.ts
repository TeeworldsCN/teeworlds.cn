import { getUser, PERMISSION_LIST, setUser, type User } from '$lib/server/users';
import { type Handler } from '../protocol/types';
import { ArgParser } from '../utils/arg-parser';

export const adminPermissionAdd: Handler = async ({ reply, args }) => {
	const parser = new ArgParser(args);
	const uid = parser.getString(0);
	const permission = parser.getString(1);
	if (!uid || !permission) {
		return await reply.text('/give-perm <uid> <permission>');
	}

	if (!PERMISSION_LIST.includes(permission.toUpperCase())) {
		return await reply.text(`Unknown permission "${permission}"`);
	}

	const user = await getUser(uid);
	if (!user) {
		const newUser: User = {
			uid,
			permissions: [permission]
		};
		await setUser(uid, newUser);
	} else {
		if (user.permissions) {
			user.permissions.push(permission);
		} else {
			user.permissions = [permission];
		}
		await setUser(uid, user);
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

	if (permission == 'all') {
		const user = await getUser(uid);
		if (!user) {
			return await reply.text(`User "${uid}" does not exist`);
		}

		if (user.permissions) {
			delete user.permissions;
		}
		await setUser(uid, user);
		return await reply.text(`All permissions have been removed from "${uid}"`);
	}

	if (!PERMISSION_LIST.includes(permission.toUpperCase())) {
		return await reply.text(`Unknown permission "${permission}"`);
	}

	const user = await getUser(uid);
	if (!user) {
		return await reply.text(`User "${uid}" does not exist`);
	}

	if (user.permissions) {
		user.permissions = user.permissions.filter((perm) => perm !== permission);
		if (user.permissions.length == 0) {
			delete user.permissions;
		}
	}
	await setUser(uid, user);
	return await reply.text(`Permission "${permission}" has been removed from "${uid}"`);
};

export const adminCheckPermission: Handler = async ({ uid, reply, args }) => {
	const parser = new ArgParser(args);
	const targetUid = parser.getRest(0) || uid;

	const user = await getUser(targetUid);
	if (!user) {
		return await reply.text(`User "${targetUid}" does not exist`);
	}

	if (!user.permissions || user.permissions.length == 0) {
		return await reply.text(`User "${targetUid}" has no permission.`);
	}

	return await reply.text(`User "${targetUid}" has permission ${user.permissions?.join(', ')}`);
};
