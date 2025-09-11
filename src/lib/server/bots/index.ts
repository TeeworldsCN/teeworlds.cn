import { CommandRouter } from './utils/command-router';
import { handleFallback } from './handlers/fallback';
import { handleHelp } from './handlers/help';
import { handleShowGid, handleShowUid, handleToolbox } from './handlers/info';
import { handleMaps } from './handlers/maps';
import { handlePoints } from './handlers/points';
import {
	adminAllowLink,
	adminCheckPermission,
	adminPermissionAdd,
	adminPermissionRemove,
	adminRateLimit,
	adminWeChatAccessToken
} from './handlers/admin';
import { handleBind } from './handlers/bind';
import { handleDeleteUser, handleRegister, handleResetPassword } from './handlers/register';
import { handleStats } from './handlers/stats';
import { handleFind } from './handlers/find';
import { handleDonate } from './handlers/donate';

export const commands = new CommandRouter();
commands
	// add commands here
	.add('__uid__', handleShowUid)
	.add('__gid__', handleShowGid)

	.add('', handleHelp)
	.add('帮助', handleHelp)
	.add('help', handleHelp)
	.add('?', handleHelp)
	.add('？', handleHelp)

	.add('分数', handlePoints)
	.add('里程', handlePoints)
	.add('points', handlePoints)
	.add('point', handlePoints)

	.add('绑定', handleBind)
	.add('bind', handleBind)

	.add('地图', handleMaps)
	.add('map', handleMaps)
	.add('maps', handleMaps)

	.add('找人', handleFind)
	.add('find', handleFind)

	.add('服务器', handleStats)
	.add('状态', handleStats)
	.add('stats', handleStats)
	.add('status', handleStats)
	.add('stat', handleStats)

	.add('工具箱', handleToolbox)

	.add('donate', handleDonate)
	.add('赞助', handleDonate)
	.add('捐赠', handleDonate)

	// super admin only commands
	.add('perm-add', adminPermissionAdd, [])
	.add('perm-rm', adminPermissionRemove, [])
	.add('perm', adminCheckPermission, [])
	.add('allow-link', adminAllowLink, ['GROUP_SETTINGS'])
	.add('rate-limit', adminRateLimit, ['GROUP_SETTINGS'])

	// register
	.add('register', handleRegister, ['REGISTER'])
	.add('reset-pw', handleResetPassword, ['REGISTER'])
	.add('delete-user', handleDeleteUser, ['REGISTER'])

	// wechat
	.add('wechat-token', adminWeChatAccessToken, ['SUPER'])

	// catch all unknown command
	.fallback(handleFallback);
