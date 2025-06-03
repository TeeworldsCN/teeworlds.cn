export const SUBSCRIPTION_KEYS = [
	// subscription keys
	'map'
] as const;

export const PERMISSIONS_SETTINGS = [
	// permissions
	['SUPER', '超级管理员'],
	['GROUP_SETTINGS', '群组管理权限'],
	['REGISTER', '用户邀请权限'],
	['CHANNEL_SETTINGS', '频道管理权限'],
	['TICKETS', '工单系统权限'],
	['POSTING', '发帖权限'],
	['DDNET_MOD', 'DDNet 管理权限']
] as const;

export const PERMISSIONS = PERMISSIONS_SETTINGS.map((p) => p[0]);
export type Permission = (typeof PERMISSIONS)[number];
