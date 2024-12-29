import { CommandRouter } from './utils/command-router';
import { adminCheckPermission, adminPermissionAdd, adminPermissionRemove } from './handlers/admin';
import { handleBind } from './handlers/bind';
import { handleFallback } from './handlers/fallback';
import { handleHelp } from './handlers/help';
import { handleShowUid, handleToolbox } from './handlers/info';
import { handleMaps } from './handlers/maps';
import { handlePoints } from './handlers/points';

export const commands = new CommandRouter();
commands
	// add commands here 
	.add('__uid__', handleShowUid)

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

	// catch all unknown command
	.fallback(handleFallback);
