import {
	createUser,
	getUserByUsername,
	PERMISSION_LIST,
	updateUserData,
	type User
} from '$lib/server/db/users';
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

	const user = getUserByUsername(uid);
	if (!user) {
		createUser(uid, { permissions: [permission] });
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

	if (!PERMISSION_LIST.includes(permission.toUpperCase())) {
		return await reply.text(`Unknown permission "${permission}"`);
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
