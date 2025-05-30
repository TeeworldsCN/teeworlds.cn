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
import { handleReport, handleVerify } from './handlers/report';

const handleReporting = handleReport('举报');
const handleRename = handleReport('改名');
const handleFeedback = handleReport('反馈');
const handleAppeal = handleReport('申诉');

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

	.add('举报', handleReporting)
	.add('report', handleReporting)
	.add('举报游戏行为', handleReporting)

	.add('改名', handleRename)
	.add('转分', handleRename)
	.add('namechange', handleRename)

	.add('反馈', handleFeedback)
	.add('feedback', handleFeedback)

	.add('申诉', handleAppeal)
	.add('appeal', handleAppeal)
	.add('封禁申诉', handleAppeal)

	.add('验证', handleVerify)
	.add('yz', handleVerify)
	.add('yanzheng', handleVerify)
	.add('获取验证码', handleVerify)

	.add('找人', handleFind)
	.add('find', handleFind)

	.add('服务器', handleStats)
	.add('状态', handleStats)
	.add('stats', handleStats)
	.add('status', handleStats)
	.add('stat', handleStats)

	.add('工具箱', handleToolbox)

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
