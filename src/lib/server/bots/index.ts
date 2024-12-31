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
	adminRateLimit
} from './handlers/admin';
import { handleBind } from './handlers/bind';
import { handleRegister } from './handlers/register';

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
	.add('points', handlePoints)
	.add('point', handlePoints)

	.add('绑定', handleBind)
	.add('bind', handleBind)

	.add('地图', handleMaps)
	.add('map', handleMaps)
	.add('maps', handleMaps)

	.add('工具箱', handleToolbox)

	// super admin only commands
	.add('perm-add', adminPermissionAdd, [])
	.add('perm-rm', adminPermissionRemove, [])
	.add('perm', adminCheckPermission, [])
	.add('allow-link', adminAllowLink, ['GROUP_SETTINGS'])
	.add('rate-limit', adminRateLimit, ['GROUP_SETTINGS'])

	// register
	.add('register', handleRegister, ['REGISTER'])

	// catch all unknown command
	.fallback(handleFallback);
