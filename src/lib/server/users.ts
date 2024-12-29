import { persistent, volatile } from './keyv';
import crypto from 'crypto';

export type Permissions = Permission[];
const _PERMISSION_LIST = [
	// permissions
	'SUPER',
	'REGISTER',
	'WEB_ADMIN'
] as const;
export const PERMISSION_LIST = _PERMISSION_LIST as any as string[];
type Permission = (typeof PERMISSION_LIST)[number];

export interface User {
	uid: string;
	name?: string;
	permissions?: Permissions;
	password?: {
		salt: string;
		hash: string;
	};
}

export interface Token {
	uid: string;
	expireAt: number;
}

export const getUser = async (uid: string) => {
	const user = await persistent.get<Omit<User, 'uid'>>(`user:${uid}`);
	if (!user) {
		return null;
	}

	return { uid, ...user };
};

export const setUser = async (uid: string, user: User) => {
	const userdata: Omit<User, 'uid'> | { uid: undefined } = {
		...user,
		uid: undefined
	};
	delete userdata.uid;
	await persistent.set(`user:${uid}`, userdata);
};

export const deleteUser = async (uid: string) => {
	await persistent.delete(`user:${uid}`);
};

export const tokenToUser = async (token: string) => {
	const data = await volatile.get<Token>(`user:token:${token}`);
	if (!data) return null;

	const user = await getUser(data.uid);
	if (!user) return null;

	// need to refresh the token per day
	const twoDays = 2 * 24 * 60 * 60 * 1000;
	const needRefresh = data.expireAt - Date.now() < twoDays;
	if (needRefresh) {
		await deleteToken(token);
		return {
			user,
			token: await generateToken(user.uid)
		};
	}
	return { user, token };
};

export const authenticate = async (username: string, password: string) => {
	const user = await getUser(username);
	if (!user) return null;
	if (!user.password) return null;
	const hash = crypto.createHash('sha256');
	hash.update(user.password.salt + password);
	const hashStr = hash.digest('base64');
	if (hashStr != user.password.hash) return null;
	return user;
};

export const generateToken = async (uid: string) => {
	const token = new Uint8Array(64);
	crypto.getRandomValues(token);
	const tokenStr = Buffer.from(token).toString('hex');
	// token will be available for three days
	const duration = 3 * 24 * 60 * 60 * 1000;
	const tokenExpiration = Date.now() + duration;
	await volatile.set<Token>(`user:token:${tokenStr}`, { uid, expireAt: tokenExpiration }, duration);
	return tokenStr;
};

export const deleteToken = async (token: string) => {
	await volatile.delete(`user:token:${token}`);
};

export const hasPermission = (user: User | null, permission: Permission) => {
	if (!user) return false;
	if (!user.permissions) return false;
	if (user.permissions.includes('SUPER')) return true;
	return user.permissions.includes(permission);
};
