import { PERMISSIONS } from '$lib/types';
import { volatile } from '../keyv';
import { sqlite } from '../sqlite';

// user table
sqlite
	.query(
		'CREATE TABLE IF NOT EXISTS user (uuid VARCHAR(36) PRIMARY KEY, username VARCHAR(255) UNIQUE, version INTEGER, hash TEXT, data TEXT, bind_name VARCHAR(255))'
	)
	.run();

// Add bind_name column if it doesn't exist (for existing databases)
try {
	sqlite.query('ALTER TABLE user ADD COLUMN bind_name VARCHAR(255)').run();
} catch (error) {
	// Column might already exist, ignore error
}

// indexes
sqlite.query('CREATE INDEX IF NOT EXISTS user_username ON user (username);').run();
sqlite.query('CREATE INDEX IF NOT EXISTS hash_username ON user (hash);').run();
sqlite.query('CREATE INDEX IF NOT EXISTS user_bind_name ON user (bind_name);').run();

// Migrate existing bind names from JSON data to bind_name column
const migrateBindNames = () => {
	try {
		const usersToMigrate = sqlite
			.query<
				{ uuid: string; data: string },
				[]
			>('SELECT uuid, data FROM user WHERE bind_name IS NULL AND data IS NOT NULL')
			.all();

		for (const user of usersToMigrate) {
			try {
				const userData = JSON.parse(user.data);
				if (userData.name && typeof userData.name === 'string') {
					// Store the bind_name before deleting it
					const bindName = userData.name;
					// Update bind_name column and remove name from JSON data
					delete userData.name;
					sqlite
						.query('UPDATE user SET bind_name = ?, data = ? WHERE uuid = ?')
						.run(bindName, JSON.stringify(userData), user.uuid);
				}
			} catch (error) {
				// Skip invalid JSON data
				console.warn(`Failed to migrate bind_name for user ${user.uuid}:`, error);
			}
		}
		console.log(`Migrated bind_name for ${usersToMigrate.length} users`);
	} catch (error) {
		console.error('Error during bind_name migration:', error);
	}
};

// Run migration on startup
migrateBindNames();

export type UserPermissions = Permission[];
export const PERMISSION_LIST = PERMISSIONS as any as string[];
type Permission = (typeof PERMISSION_LIST)[number];

export interface UserData {
	permissions?: UserPermissions;
}

export type UserUUID = string & { __userUUID: void };

export type User = {
	uuid: UserUUID;
	username: string;
	version: number;
	bind_name: string | null;
	data: UserData;
};

export interface Token {
	uuid: UserUUID;
	version: number;
	expireAt: number;
}

export const getUserByUuid = (uuid: UserUUID | string): User | null => {
	const user = sqlite
		.query<
			{
				uuid: UserUUID;
				username: string;
				version: number;
				bind_name: string | null;
				data: string;
			},
			string
		>('SELECT uuid, username, version, bind_name, data FROM user WHERE uuid = ?')
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

	return {
		uuid: user.uuid,
		username: user.username,
		version: user.version,
		bind_name: user.bind_name,
		data: userdata
	};
};

export const getUserByUsername = (username: string): User | null => {
	const user = sqlite
		.query<
			{
				uuid: UserUUID;
				username: string;
				version: number;
				bind_name: string | null;
				data: string;
			},
			string
		>('SELECT uuid, username, version, bind_name, data FROM user WHERE username = ?')
		.get(username);

	if (!user) {
		return null;
	}

	let userdata: UserData;

	try {
		if (!user.data) {
			userdata = {};
		} else {
			userdata = JSON.parse(user.data);
		}
	} catch {
		userdata = {};
	}

	return {
		uuid: user.uuid,
		username: user.username,
		version: user.version,
		bind_name: user.bind_name,
		data: userdata
	};
};

export const updateUserData = (uuid: UserUUID, data: UserData) => {
	const result = sqlite
		.query('UPDATE user SET data = ? WHERE uuid = ?')
		.run(JSON.stringify(data), uuid);
	return result.changes > 0;
};

export const updateUserBindName = (uuid: UserUUID, bindName: string | null) => {
	const result = sqlite.query('UPDATE user SET bind_name = ? WHERE uuid = ?').run(bindName, uuid);
	return result.changes > 0;
};

export const getUserByBindName = (bindName: string): User | null => {
	const user = sqlite
		.query<
			{
				uuid: UserUUID;
				username: string;
				version: number;
				bind_name: string | null;
				data: string;
			},
			string
		>('SELECT uuid, username, version, bind_name, data FROM user WHERE bind_name = ?')
		.get(bindName);

	if (!user) {
		return null;
	}

	let userdata: UserData;

	try {
		userdata = JSON.parse(user.data);
	} catch {
		userdata = {};
	}

	return {
		uuid: user.uuid,
		username: user.username,
		version: user.version,
		bind_name: user.bind_name,
		data: userdata
	};
};

export const searchUsersByBindName = (
	bindName: string,
	limit: number = 50,
	offset: number = 0
): User[] => {
	try {
		const searchPattern = `*${bindName}*`;
		const users = sqlite
			.query<
				{
					uuid: UserUUID;
					username: string;
					version: number;
					bind_name: string | null;
					data: string;
				},
				[string, number, number]
			>(
				'SELECT uuid, username, version, bind_name, data FROM user WHERE bind_name GLOB ? ORDER BY bind_name LIMIT ? OFFSET ?'
			)
			.all(searchPattern, limit, offset);

		return users.map((user) => {
			let userdata: UserData;
			try {
				userdata = JSON.parse(user.data);
			} catch {
				userdata = {};
			}
			return {
				uuid: user.uuid,
				username: user.username,
				version: user.version,
				bind_name: user.bind_name,
				data: userdata
			};
		});
	} catch (error) {
		console.error('Error searching users by bind_name:', error);
		return [];
	}
};

export const deleteUser = (uuid: UserUUID) => {
	const result = sqlite.query('DELETE FROM user WHERE uuid = ?').run(uuid);
	return result.changes > 0;
};

export const createUser = (username: string, data: UserData, bindName?: string) => {
	return createUserWithPass(username, null, data, bindName);
};

type CreateUserResult = { success: true; uuid: UserUUID } | { success: false; error: string };
export const createUserWithPass = async (
	username: string,
	password: string | null,
	data: UserData,
	bindName?: string
) => {
	try {
		const uuid = crypto.randomUUID();
		const hash = password ? await Bun.password.hash(password) : null;

		const result = sqlite
			.query(
				'INSERT INTO user (uuid, username, hash, data, version, bind_name) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.run(uuid, username, hash, JSON.stringify(data), 1, bindName || null);

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
	if (!user || user.version != data.version) return null;

	// need to refresh the token per day
	const twoDays = 2 * 24 * 60 * 60 * 1000;
	const needRefresh = data.expireAt - Date.now() < twoDays;
	if (needRefresh) {
		await deleteToken(token);
		return {
			user,
			token: await generateToken(user)
		};
	}
	return { user, token };
};

export const authenticateByUsername = async (username: string, password: string) => {
	const user = sqlite
		.query<
			{
				uuid: UserUUID;
				username: string;
				version: number;
				hash: string;
			},
			string
		>('SELECT uuid, username, version, hash FROM user WHERE username = ?')
		.get(username);
	if (!user) return null;
	if (!user.hash) return null;

	if (await Bun.password.verify(password, user.hash)) {
		return user;
	}
	return null;
};

export const generateToken = async (user: Omit<User, 'data'>) => {
	const token = new Uint8Array(16);
	crypto.getRandomValues(token);
	const tokenStr = Buffer.from(token).toString('base64url');
	// token will be available for three days
	const duration = 3 * 24 * 60 * 60 * 1000;
	const tokenExpiration = Date.now() + duration;
	await volatile.set<Token>(
		`user:token:${tokenStr}`,
		{ uuid: user.uuid, version: user.version, expireAt: tokenExpiration },
		duration
	);
	return tokenStr;
};

export const changePassword = async (uuid: UserUUID, password: string) => {
	const user = getUserByUuid(uuid);
	if (!user) return null;

	const hash = await Bun.password.hash(password);
	const result = sqlite
		.query('UPDATE user SET (hash, version) = (?, COALESCE(version + 1, 0)) WHERE uuid = ?')
		.run(hash, uuid);
	return result.changes > 0;
};

export const renameUser = (uuid: UserUUID, newUsername: string) => {
	try {
		const result = sqlite
			.query('UPDATE user SET (username, version) = (?, COALESCE(version + 1, 0)) WHERE uuid = ?')
			.run(newUsername, uuid);
		return { success: result.changes > 0, error: null };
	} catch (e) {
		const error = e as any;
		if (error?.code == 'SQLITE_CONSTRAINT_UNIQUE') {
			return { success: false, error: '用户名已被占用' };
		}
		return { success: false, error: `未知错误 (${error.message || error})` };
	}
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

// Prepared statements for user searching
const searchUsersQuery = sqlite.query<
	{
		uuid: UserUUID;
		username: string;
		version: number;
		bind_name: string | null;
		data: string;
	},
	[string, number, number]
>(
	'SELECT uuid, username, version, bind_name, data FROM user WHERE username GLOB ? ORDER BY username LIMIT ? OFFSET ?'
);

const searchUserCountQuery = sqlite.query<{ count: number }, [string]>(
	'SELECT COUNT(*) as count FROM user WHERE username GLOB ?'
);

export const searchUsers = (searchTerm: string, limit: number = 50, offset: number = 0): User[] => {
	try {
		const searchPattern = `*${searchTerm}*`;
		const users = searchUsersQuery.all(searchPattern, limit, offset);
		return users.map((user) => {
			let userdata: UserData;
			try {
				userdata = JSON.parse(user.data);
			} catch {
				userdata = {};
			}
			return {
				uuid: user.uuid,
				username: user.username,
				version: user.version,
				bind_name: user.bind_name,
				data: userdata
			};
		});
	} catch (error) {
		console.error('Error searching users:', error);
		return [];
	}
};

export const getUserCountBySearch = (searchTerm: string): number => {
	try {
		const searchPattern = `*${searchTerm}*`;
		const result = searchUserCountQuery.get(searchPattern);
		return result?.count || 0;
	} catch (error) {
		console.error('Error getting search user count:', error);
		return 0;
	}
};

// Prepared statements for users with passwords (admin users)
const getUsersWithPasswordQuery = sqlite.query<
	{
		uuid: UserUUID;
		username: string;
		version: number;
		bind_name: string | null;
		data: string;
	},
	[number, number]
>(
	'SELECT uuid, username, version, bind_name, data FROM user WHERE hash IS NOT NULL ORDER BY username LIMIT ? OFFSET ?'
);

const getUsersWithPasswordCountQuery = sqlite.query<{ count: number }, []>(
	'SELECT COUNT(*) as count FROM user WHERE hash IS NOT NULL'
);

// Prepared statements for users without passwords (regular users)
const getUsersWithoutPasswordQuery = sqlite.query<
	{
		uuid: UserUUID;
		username: string;
		version: number;
		bind_name: string | null;
		data: string;
	},
	[number, number]
>(
	'SELECT uuid, username, version, bind_name, data FROM user WHERE hash IS NULL ORDER BY username LIMIT ? OFFSET ?'
);

const getUsersWithoutPasswordCountQuery = sqlite.query<{ count: number }, []>(
	'SELECT COUNT(*) as count FROM user WHERE hash IS NULL'
);

// Prepared statements for users without passwords with platform filtering
const getUsersWithoutPasswordByPlatformQuery = sqlite.query<
	{
		uuid: UserUUID;
		username: string;
		version: number;
		bind_name: string | null;
		data: string;
	},
	[string, number, number]
>(
	'SELECT uuid, username, version, bind_name, data FROM user WHERE hash IS NULL AND username GLOB ? ORDER BY username LIMIT ? OFFSET ?'
);

const getUsersWithoutPasswordByPlatformCountQuery = sqlite.query<{ count: number }, [string]>(
	'SELECT COUNT(*) as count FROM user WHERE hash IS NULL AND username GLOB ?'
);

// Helper function to map database results to User objects
const mapUserResults = (
	users: Array<{
		uuid: UserUUID;
		username: string;
		version: number;
		bind_name: string | null;
		data: string;
	}>
): User[] => {
	return users.map((user) => {
		let userdata: UserData;
		try {
			userdata = JSON.parse(user.data);
		} catch {
			userdata = {};
		}
		return {
			uuid: user.uuid,
			username: user.username,
			version: user.version,
			bind_name: user.bind_name,
			data: userdata
		};
	});
};

// Functions for users with passwords (admin users)
export const getUsersWithPassword = (limit: number = 50, offset: number = 0): User[] => {
	try {
		const users = getUsersWithPasswordQuery.all(limit, offset);
		return mapUserResults(users);
	} catch (error) {
		console.error('Error getting users with password:', error);
		return [];
	}
};

export const getUsersWithPasswordCount = (): number => {
	try {
		const result = getUsersWithPasswordCountQuery.get();
		return result?.count || 0;
	} catch (error) {
		console.error('Error getting users with password count:', error);
		return 0;
	}
};

// Functions for users without passwords (regular users)
export const getUsersWithoutPassword = (limit: number = 50, offset: number = 0): User[] => {
	try {
		const users = getUsersWithoutPasswordQuery.all(limit, offset);
		return mapUserResults(users);
	} catch (error) {
		console.error('Error getting users without password:', error);
		return [];
	}
};

export const getUsersWithoutPasswordCount = (): number => {
	try {
		const result = getUsersWithoutPasswordCountQuery.get();
		return result?.count || 0;
	} catch (error) {
		console.error('Error getting users without password count:', error);
		return 0;
	}
};

// Functions for users without passwords with platform filtering
export const getUsersWithoutPasswordByPlatform = (
	platform: string,
	limit: number = 50,
	offset: number = 0
): User[] => {
	try {
		// Users with specific platform prefix - use GLOB for index efficiency
		const platformPattern = `${platform}:*`;
		const users = getUsersWithoutPasswordByPlatformQuery.all(platformPattern, limit, offset);
		return mapUserResults(users);
	} catch (error) {
		console.error('Error getting users without password by platform:', error);
		return [];
	}
};

export const getUsersWithoutPasswordByPlatformCount = (platform: string): number => {
	try {
		// Use GLOB for index efficiency
		const platformPattern = `${platform}:*`;
		const result = getUsersWithoutPasswordByPlatformCountQuery.get(platformPattern);
		return result?.count || 0;
	} catch (error) {
		console.error('Error getting users without password by platform count:', error);
		return 0;
	}
};
