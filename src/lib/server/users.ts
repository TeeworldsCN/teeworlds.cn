import type { Permissions } from './bots/protocol/types';
import { persistent } from './keyv';

export interface User {
	uid: string;
	name?: string;
	permissions?: Permissions;
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
