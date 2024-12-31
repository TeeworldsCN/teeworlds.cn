import { PERMISSIONS } from '$lib/types';
import { volatile } from '../keyv';
import { sqlite } from '../sqlite';
import crypto from 'crypto';

// user table
sqlite
	.query(
		'CREATE TABLE IF NOT EXISTS user (uuid VARCHAR(36) PRIMARY KEY, username VARCHAR(255) UNIQUE, salt VARCHAR(16), hash TEXT, data TEXT)'
	)
	.run();

export type UserPermissions = Permission[];
export const PERMISSION_LIST = PERMISSIONS as any as string[];
type Permission = (typeof PERMISSION_LIST)[number];

export interface UserData {
	name?: string;
	permissions?: UserPermissions;
}

export type UserUUID = string & { __userUUID: void };

export type User = {
	uuid: UserUUID;
	username: string;
	data: UserData;
};

export interface Token {
	uuid: UserUUID;
	expireAt: number;
}

export const getUserByUuid = (uuid: UserUUID | string) => {
	const user = sqlite
		.query<
			{
				uuid: UserUUID;
				username: string;
				data: string;
			},
			string
		>('SELECT uuid, username, data FROM user WHERE uuid = ?')
		.get(uuid);

	if (!user) {
		return null;
	}

	let userdata: UserData;

	try {
		userdata = JSON.parse(user.data);
	} catch {
		userdata = {};
	}

	return { uuid: user.uuid, username: user.username, data: userdata };
};

export const getUserByUsername = (username: string) => {
	const user = sqlite
		.query<
			{
				uuid: UserUUID;
				username: string;
				data: string;
			},
			string
		>('SELECT uuid, username, data FROM user WHERE username = ?')
		.get(username);

	if (!user) {
		return null;
	}

	let userdata: UserData;

	try {
		userdata = JSON.parse(user.data);
	} catch {
		userdata = {};
	}

	return { uuid: user.uuid, username: user.username, data: userdata };
};

export const updateUserData = (uuid: UserUUID, data: UserData) => {
	const result = sqlite
		.query('UPDATE user SET data = ? WHERE uuid = ?')
		.run(JSON.stringify(data), uuid);
	return result.changes > 0;
};

export const deleteUser = (uuid: UserUUID) => {
	const result = sqlite.query('DELETE FROM user WHERE uuid = ?').run(uuid);
	return result.changes > 0;
};

export const createUser = (username: string, data: UserData) => {
	return createUserWithPass(username, null, data);
};

type CreateUserResult = { success: true; uuid: UserUUID } | { success: false; error: string };
export const createUserWithPass = (username: string, password: string | null, data: UserData) => {
	try {
		const uuid = crypto.randomUUID();

		const salt = password ? crypto.randomBytes(12).toString('base64') : null;
		const hash = password
			? crypto
					.createHash('sha256')
					.update(salt + password)
					.digest('base64')
			: null;

		const result = sqlite
			.query('INSERT INTO user (uuid, username, salt, hash, data) VALUES (?, ?, ?, ?, ?)')
			.run(uuid, username, salt, hash, JSON.stringify(data));

		if (result.changes > 0) {
			return {
				success: true,
				uuid: uuid as unknown as UserUUID
			} as CreateUserResult;
		} else {
			return {
				success: false,
				error: '未知错误'
			} as CreateUserResult;
		}
	} catch (e) {
		const error = e as any;
		if (error?.code == 'SQLITE_CONSTRAINT_UNIQUE') {
			return {
				success: false,
				error: '用户名已被占用'
			} as CreateUserResult;
		}

		return {
			success: false,
			error: `未知错误 (${error.message || error})`
		} as CreateUserResult;
	}
};

export const tokenToUser = async (token: string) => {
	const data = await volatile.get<Token>(`user:token:${token}`);
	if (!data) return null;

	const user = getUserByUuid(data.uuid);
	if (!user) return null;

	// need to refresh the token per day
	const twoDays = 2 * 24 * 60 * 60 * 1000;
	const needRefresh = data.expireAt - Date.now() < twoDays;
	if (needRefresh) {
		await deleteToken(token);
		return {
			user,
			token: await generateToken(user.uuid)
		};
	}
	return { user, token };
};

export const authenticateByUsername = (username: string, password: string) => {
	const user = sqlite
		.query<
			{
				uuid: UserUUID;
				salt: string;
				hash: string;
			},
			string
		>('SELECT uuid, salt, hash FROM user WHERE username = ?')
		.get(username);
	if (!user) return null;
	if (!user.salt || !user.hash) return null;

	const hash = crypto.createHash('sha256');
	hash.update(user.salt + password);
	const hashStr = hash.digest('base64');
	if (hashStr != user.hash) return null;
	return user;
};

export const generateToken = async (uuid: UserUUID) => {
	const token = new Uint8Array(64);
	crypto.getRandomValues(token);
	const tokenStr = Buffer.from(token).toString('hex');
	// token will be available for three days
	const duration = 3 * 24 * 60 * 60 * 1000;
	const tokenExpiration = Date.now() + duration;
	await volatile.set<Token>(
		`user:token:${tokenStr}`,
		{ uuid, expireAt: tokenExpiration },
		duration
	);
	return tokenStr;
};

export const deleteToken = async (token: string) => {
	await volatile.delete(`user:token:${token}`);
};

export const hasPermission = (user: User | null, permission: Permission) => {
	if (!user) return false;
	if (!user.data.permissions) return false;
	if (user.data.permissions.includes('SUPER')) return true;
	return user.data.permissions.includes(permission);
};
