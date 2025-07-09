import {
	createTicket,
	getTicket,
	getTicketMessages,
	updateTicketStatus,
	getTicketAttachments,
	subscribeToTicket,
	unsubscribeFromTicket,
	isUserSubscribed,
	increaseAttachmentLimit,
	deleteTicket,
	deleteTicketMessage,
	deleteTicketAttachment,
	type CreateTicketData,
	type AddMessageData,
	addTicketMessage,
	MESSAGE_VISIBILITY,
	addAdminOnlyMessage,
	addVisitorOnlyMessage,
	addCopyableMessage,
	TICKET_EXPIRE_TIME,
	banUserFromTickets,
	getUserActiveBan,
	removeBan,
	isUserBanned,
	type BanUserData
} from '$lib/server/db/tickets';
import { hasPermission } from '$lib/server/db/users';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTicketUserInfo } from '$lib/server/auth/ticket-auth';
import { gameInfo } from '$lib/server/fetches/servers';
import { getDDNetBanList } from '$lib/server/bans';
import { ipToNumber, numberToIp } from '$lib/helpers';

const checkServerCommunity = async (ip: string) => {
	const list = (await gameInfo.fetchCache()).result;

	let serverType = '';

	for (const server of list.servers) {
		for (const type in server.servers) {
			if (server.servers[type].includes(ip)) {
				serverType = `DDNet 官方服务器 - ${type} 模式`;
				break;
			}
		}
	}

	for (const server of list['servers-kog']) {
		for (const type in server.servers) {
			if (server.servers[type].includes(ip)) {
				serverType = `KoG 官方服务器 - ${type} 模式`;
				break;
			}
		}
	}

	for (const community of list.communities) {
		for (const server of community.icon.servers || []) {
			for (const type in server.servers) {
				if (server.servers[type].includes(ip)) {
					serverType = `${community.name} 服务器 - ${type} 模式`;
					break;
				}
			}
		}
	}

	return serverType;
};

const addDDNetBanMessage = async (
	ip: string,
	copyableMessages: {
		message: string;
		copy_content: string;
		author_name: string;
		visibility: number;
	}[]
) => {
	try {
		const activeBan = await getDDNetBanList();
		if (!activeBan) {
			return;
		}

		const ipNum = ipToNumber(ip);
		let found = false;
		for (const ban of activeBan) {
			if (ban.type == 'ban') {
				if (ban.ip == ipNum) {
					found = true;
					copyableMessages.push({
						message: `申诉玩家的设备IP：${ip}\n豆豆检测DDNet封禁条目（点击复制解封指令）\nIP: ${numberToIp(ban.ip)}\n原因：${ban.reason}\n管理：${ban.by}\n解封：${new Date(ban.expires * 1000).toLocaleString('zh-CN')}`,
						copy_content: `!unban ${numberToIp(ban.ip)}`,
						author_name: 'System',
						visibility: MESSAGE_VISIBILITY.ADMIN_ONLY
					});
				}
			} else if (ban.type == 'ban_range') {
				if (ban.start <= ipNum && ban.end >= ipNum) {
					found = true;
					copyableMessages.push({
						message: `申诉玩家的设备IP：${ip}\n豆豆检测DDNet范围封禁条目（点击复制解封指令）\nIP: ${numberToIp(ban.start)}-${numberToIp(ban.end)}\n原因：${ban.reason}\n管理：${ban.by}\n解封：${new Date(ban.expires * 1000).toLocaleString('zh-CN')}`,
						copy_content: `!unban ${numberToIp(ban.start)}-${numberToIp(ban.end)}`,
						author_name: 'System',
						visibility: MESSAGE_VISIBILITY.ADMIN_ONLY
					});
				}
			}
		}

		if (!found) {
			copyableMessages.push({
				message: `申诉玩家的设备IP：${ip}\n豆豆没有发现相关的封禁记录\n（点击复制IP）`,
				copy_content: ip,
				author_name: 'System',
				visibility: MESSAGE_VISIBILITY.ADMIN_ONLY
			});
		}
	} catch (err: any) {
		console.error('Failed to check DDNet bans:', err);
		copyableMessages.push({
			message: `申诉玩家的设备IP：${ip}\n豆豆在检查封禁记录时遇到了问题\n（点击复制IP）`,
			copy_content: ip,
			author_name: 'System',
			visibility: MESSAGE_VISIBILITY.ADMIN_ONLY
		});
	}
};

export const POST: RequestHandler = async ({ locals, request, cookies }) => {
	const body = await request.json();

	if (!body || !body.action) {
		return error(400, 'Invalid request');
	}

	switch (body.action) {
		case 'create': {
			// Check authentication via ticket JWT token
			const userInfo = getTicketUserInfo(cookies);
			if (!userInfo) {
				return error(403, 'Forbidden');
			}

			if (!body.type || !body.args) {
				return error(400, 'Bad Request');
			}

			const ticketData: CreateTicketData = {
				title: '其他反馈',
				visitor_name: userInfo.playerName || '访客',
				author_uid: userInfo.uid
			};

			let messages: {
				message: string;
				author_type: 'bot' | 'system' | 'sys';
				author_name: string;
				visibility: number;
			}[] = [];

			let copyableMessages: {
				message: string;
				copy_content: string;
				author_name: string;
				visibility: number;
			}[] = [];

			switch (body.type) {
				case 'report':
					{
						if (!body.args.name) {
							return error(400, 'Bad Request');
						}

						ticketData.title = `举报玩家`;

						if (body.args.server) {
							messages.push({
								message: `管理你好，这是一个举报单\n\n发起人：${body.args.name}\n服务器：${body.args.server}`,
								author_type: 'bot',
								author_name: '豆豆',
								visibility: MESSAGE_VISIBILITY.ALL
							});

							messages.push({
								message: `已召唤管理，等待期间建议补充额外信息，例如：\n・举报的玩家名\n・举报的原因`,
								author_type: 'system',
								author_name: 'System',
								visibility: MESSAGE_VISIBILITY.VISITOR_ONLY
							});

							try {
								const result = await checkServerCommunity(body.args.server);
								if (result) {
									copyableMessages.push({
										message: `豆豆检测到服务器地址 ${body.args.server} 为\n${result}\n（点击复制IP）`,
										copy_content: body.args.server,
										author_name: 'System',
										visibility: MESSAGE_VISIBILITY.ADMIN_ONLY
									});
								} else {
									messages.push({
										message: `豆豆检测到服务器地址 ${body.args.server} 不属于任何服务器社区`,
										author_type: 'system',
										author_name: 'System',
										visibility: MESSAGE_VISIBILITY.ADMIN_ONLY
									});
								}
							} catch {}
						} else {
							messages.push({
								message: `管理你好，这是一个举报单\n\n${body.args.name} 发起了举报，但是豆豆没能获取到玩家所在的服务器`,
								author_type: 'bot',
								author_name: '豆豆',
								visibility: MESSAGE_VISIBILITY.ALL
							});

							messages.push({
								message: `已召唤管理，等待期间建议补充额外信息，例如：\n・所在服务器地址\n・举报的玩家名\n・举报的原因`,
								author_type: 'system',
								author_name: 'System',
								visibility: MESSAGE_VISIBILITY.VISITOR_ONLY
							});
						}

						messages.push({
							message: `豆豆温馨提示：关闭窗口后不能再实时收到消息`,
							author_type: 'system',
							author_name: '豆豆',
							visibility: MESSAGE_VISIBILITY.VISITOR_ONLY
						});
					}
					break;
				case 'appeal':
					{
						if (!body.args.name) {
							return error(400, 'Bad Request');
						}

						ticketData.title = `封禁申诉`;

						messages.push({
							message: `管理你好，这是一个封禁申诉单\n\n发起人：${body.args.name}`,
							author_type: 'bot',
							author_name: '豆豆',
							visibility: MESSAGE_VISIBILITY.ALL
						});

						try {
							const requestIP = locals.ip;
							if (requestIP) {
								await addDDNetBanMessage(requestIP, copyableMessages);
							} else {
								throw new Error('Failed to get client address');
							}
						} catch (e) {
							messages.push({
								message: `豆豆没能获取到申诉玩家的设备IP`,
								author_type: 'system',
								author_name: 'System',
								visibility: MESSAGE_VISIBILITY.ADMIN_ONLY
							});
						}

						messages.push({
							message: `已召唤管理，等待期间建议补充额外信息\n例如你是在什么时候被封禁的`,
							author_type: 'system',
							author_name: 'System',
							visibility: MESSAGE_VISIBILITY.VISITOR_ONLY
						});

						messages.push({
							message: `豆豆温馨提示：关闭窗口后不能再实时收到消息`,
							author_type: 'system',
							author_name: '豆豆',
							visibility: MESSAGE_VISIBILITY.VISITOR_ONLY
						});
					}

					break;
				case 'namechange':
					{
						if (!body.args.fromName || !body.args.toName) {
							return error(400, 'Bad Request');
						}

						ticketData.title = `改名申请`;

						messages.push({
							message: `管理你好，这是一个改名申请单：\n\n${body.args.fromName}\n改为\n${body.args.toName}`,
							author_type: 'bot',
							author_name: '豆豆',
							visibility: MESSAGE_VISIBILITY.ALL
						});

						messages.push({
							message: `已召唤管理，管理可能会指导您提交申请材料。感谢配合！`,
							author_type: 'system',
							author_name: 'System',
							visibility: MESSAGE_VISIBILITY.VISITOR_ONLY
						});

						messages.push({
							message: `系统提示，不要忘了检查玩家的证据，让玩家展示游玩记录 demo。如果你不清楚如何提交改名申请，请在管理群询问，不要盲目接单。`,
							author_type: 'system',
							author_name: 'System',
							visibility: MESSAGE_VISIBILITY.ADMIN_ONLY
						});

						messages.push({
							message: `豆豆温馨提示：关闭窗口后不能再实时收到消息。`,
							author_type: 'system',
							author_name: '豆豆',
							visibility: MESSAGE_VISIBILITY.VISITOR_ONLY
						});
					}
					break;
				case 'feedback':
					{
						ticketData.title = `其他反馈`;

						if (!body.args.name) {
							return error(400, 'Bad Request');
						}

						messages.push({
							message: `管理你好，已为 ${body.args.name} 创建好反馈单`,
							author_type: 'bot',
							author_name: '豆豆',
							visibility: MESSAGE_VISIBILITY.ALL
						});

						messages.push({
							message: `如果不是立刻需要解决的问题，留言后退出即可\n（请不要点关闭按钮，否则管理可能会看不到）`,
							author_type: 'system',
							author_name: '豆豆',
							visibility: MESSAGE_VISIBILITY.VISITOR_ONLY
						});
					}
					break;
			}

			const result = createTicket(ticketData);

			if (!result.success || !result.ticket) {
				return error(400, result.error || 'Failed to create ticket');
			}

			for (const message of messages) {
				if (message.visibility === MESSAGE_VISIBILITY.ALL) {
					addTicketMessage({
						ticket_uuid: result.ticket.uuid,
						message: message.message,
						author_type: message.author_type,
						author_name: message.author_name
					});
				} else if (message.visibility === MESSAGE_VISIBILITY.ADMIN_ONLY) {
					addAdminOnlyMessage({
						ticket_uuid: result.ticket.uuid,
						message: message.message,
						author_type: message.author_type,
						author_name: message.author_name
					});
				} else if (message.visibility === MESSAGE_VISIBILITY.VISITOR_ONLY) {
					addVisitorOnlyMessage({
						ticket_uuid: result.ticket.uuid,
						message: message.message,
						author_type: message.author_type,
						author_name: message.author_name
					});
				}
			}

			for (const message of copyableMessages) {
				addCopyableMessage({
					ticket_uuid: result.ticket.uuid,
					message: message.message,
					copy_content: message.copy_content,
					author_name: message.author_name,
					visibility: message.visibility
				});
			}

			return json({ success: true, ticket: result.ticket });
		}

		case 'add_message': {
			const { ticket_uuid, message, as } = body;

			if (!ticket_uuid || !message) {
				return error(400, 'Bad Request');
			}

			if (!as || (as !== 'admin' && as !== 'visitor')) {
				return error(400, 'Invalid or missing "as" parameter. Must be "admin" or "visitor"');
			}

			// Validate message length (4096 characters max)
			if (typeof message !== 'string' || message.length > 4096) {
				return error(400, '消息长度不能超过 4096 个字符');
			}

			// Check if ticket exists
			const ticket = getTicket(ticket_uuid);
			if (!ticket) {
				return error(404, 'Not found');
			}

			// Determine authentication and author info based on 'as' parameter
			let isAdmin: boolean;
			let author_name: string;
			const author_type = as;

			// can't reply to closed tickets after one day
			if (ticket.status === 'closed' && Date.now() - ticket.updated_at > TICKET_EXPIRE_TIME) {
				return error(403, '工单已过期');
			}

			if (as === 'admin') {
				// Use admin authentication (locals.user)
				isAdmin = hasPermission(locals.user, 'TICKETS');
				if (!isAdmin) {
					return error(403, 'Forbidden');
				}
				author_name = locals.user?.username || '管理';
			} else {
				// Use visitor authentication (cookie JWT)
				isAdmin = false;

				// Check authentication via ticket JWT token
				const userInfo = getTicketUserInfo(cookies);
				if (!userInfo || ticket.author_uid !== userInfo.uid) {
					return error(403, 'Forbidden');
				}

				// Check if user is banned from sending messages
				if (isUserBanned(userInfo.uid)) {
					return error(403, '你当前无法发送消息');
				}

				author_name = userInfo.playerName || '访客';
			}

			const messageData: AddMessageData = {
				ticket_uuid,
				message: message.trim(),
				author_type,
				author_name
			};

			if (isAdmin && locals.user?.uuid && ticket.status !== 'closed') {
				// Check if already subscribed before subscribing
				if (!isUserSubscribed(ticket_uuid, locals.user.uuid)) {
					subscribeToTicket(ticket_uuid, locals.user.uuid, author_name);
				}
			}

			const result = addTicketMessage(messageData);

			if (!result.success) {
				return error(500, result.error || 'Failed to add message');
			}

			// Check for IP:Port patterns in the message and respond with server info
			const ipPortRegex =
				/\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?):\d{1,5}\b/g;
			const ipPortMatches = message.match(ipPortRegex);

			if (ipPortMatches && ipPortMatches.length > 0) {
				const ipPort = ipPortMatches[0];

				try {
					const serverType = await checkServerCommunity(ipPort);
					if (serverType) {
						addCopyableMessage({
							ticket_uuid,
							message: `豆豆检测到服务器地址 ${ipPort} 为\n${serverType}\n（点击复制IP）`,
							copy_content: ipPort,
							author_name: 'System',
							visibility: MESSAGE_VISIBILITY.ADMIN_ONLY
						});
					} else {
						addAdminOnlyMessage({
							ticket_uuid,
							message: `豆豆检测到服务器地址 ${ipPort} 不属于任何已知的服务器社区`,
							author_type: 'system',
							author_name: 'System'
						});
					}
				} catch {}
			}

			return json({ success: true, message: result.message });
		}

		case 'update_status': {
			// Only admins can update status
			if (!hasPermission(locals.user, 'TICKETS')) {
				return error(403, 'Forbidden');
			}

			const { ticket_uuid, status } = body;

			if (!ticket_uuid || !status) {
				return error(400, 'Ticket UUID and status are required');
			}

			if (!['open', 'closed', 'in_progress'].includes(status)) {
				return error(400, 'Invalid status');
			}

			// Get current ticket to check old status
			const ticket = getTicket(ticket_uuid);
			if (!ticket) {
				return error(404, 'Ticket not found');
			}

			const oldStatus = ticket.status;

			// Skip if status is the same
			if (oldStatus === status) {
				return json({ success: true });
			}

			// Skip if expired
			if (oldStatus === 'closed' && Date.now() - ticket.updated_at > TICKET_EXPIRE_TIME) {
				return error(401, '工单已过期');
			}

			const adminName = locals.user?.username || '管理';
			const success = updateTicketStatus(ticket_uuid, status, adminName, true);

			if (!success) {
				return error(500, 'Failed to update ticket status');
			}

			return json({ success: true });
		}

		case 'close_ticket': {
			// Anyone can close a ticket (visitors can close their own tickets)
			const { ticket_uuid, as } = body;

			if (!ticket_uuid) {
				return error(400, 'Ticket UUID is required');
			}

			if (!as || (as !== 'admin' && as !== 'visitor')) {
				return error(400, 'Invalid or missing "as" parameter. Must be "admin" or "visitor"');
			}

			// Get current ticket to check status
			const ticket = getTicket(ticket_uuid);
			if (!ticket) {
				return error(404, 'Ticket not found');
			}

			// Skip if already closed
			if (ticket.status === 'closed') {
				return json({ success: true, message: 'Ticket already closed' });
			}

			// Determine authentication and author info based on 'as' parameter
			let isAdmin: boolean;
			let authorName: string;

			if (as === 'admin') {
				// Use admin authentication (locals.user)
				isAdmin = hasPermission(locals.user, 'TICKETS');
				if (!isAdmin) {
					return error(403, 'Forbidden');
				}
				authorName = locals.user?.username || '管理';
			} else {
				// Use visitor authentication (cookie JWT)
				isAdmin = false;

				// Check authentication via ticket JWT token for visitors
				const userInfo = getTicketUserInfo(cookies);
				if (!userInfo || ticket.author_uid !== userInfo.uid) {
					return error(403, 'Forbidden');
				}

				// Check if user is banned from closing tickets
				if (isUserBanned(userInfo.uid)) {
					return error(403, 'Forbidden');
				}

				authorName = userInfo.playerName || '访客';
			}

			const success = updateTicketStatus(ticket_uuid, 'closed', authorName, isAdmin);

			if (!success) {
				return error(500, 'Failed to close ticket');
			}

			return json({ success: true });
		}

		case 'reopen_ticket': {
			// Only admins can reopen tickets
			if (!hasPermission(locals.user, 'TICKETS')) {
				return error(403, 'Forbidden');
			}

			const { ticket_uuid } = body;

			if (!ticket_uuid) {
				return error(400, 'Ticket UUID is required');
			}

			// Get current ticket to check status
			const ticket = getTicket(ticket_uuid);
			if (!ticket) {
				return error(404, 'Ticket not found');
			}

			// Skip if not closed
			if (ticket.status !== 'closed') {
				return json({ success: true, message: 'Ticket is not closed' });
			}

			// Skip if expired
			if (Date.now() - ticket.updated_at > TICKET_EXPIRE_TIME) {
				return error(401, '工单已过期');
			}

			const adminName = locals.user?.username || '管理';
			const userUuid = locals.user?.uuid;

			// Determine new status based on subscription
			const isSubscribed = userUuid ? isUserSubscribed(ticket_uuid, userUuid) : false;
			const newStatus = isSubscribed ? 'in_progress' : 'open';

			const success = updateTicketStatus(ticket_uuid, newStatus, adminName, true);

			if (!success) {
				return error(500, 'Failed to reopen ticket');
			}

			return json({ success: true });
		}

		case 'subscribe': {
			// Only admins can subscribe to tickets
			if (!hasPermission(locals.user, 'TICKETS')) {
				return error(403, 'Forbidden');
			}

			const { ticket_uuid } = body;

			if (!ticket_uuid) {
				return error(400, 'Ticket UUID is required');
			}

			// Check if ticket exists
			const ticket = getTicket(ticket_uuid);
			if (!ticket) {
				return error(404, 'Ticket not found');
			}

			// Can't subscribe to closed tickets
			if (ticket.status === 'closed') {
				return error(403, 'Can not subscribe to closed tickets');
			}

			const adminName = locals.user?.username || '管理';
			const userUuid = locals.user?.uuid;

			if (!userUuid) {
				return error(403, 'Forbidden');
			}

			// Check if already subscribed
			if (isUserSubscribed(ticket_uuid, userUuid)) {
				return json({ success: true, message: 'Already subscribed' });
			}

			const success = subscribeToTicket(ticket_uuid, userUuid, adminName);

			if (!success) {
				return error(500, 'Failed to subscribe to ticket');
			}

			return json({ success: true });
		}

		case 'unsubscribe': {
			// Only admins can unsubscribe from tickets
			if (!hasPermission(locals.user, 'TICKETS')) {
				return error(403, 'Forbidden');
			}

			const { ticket_uuid } = body;

			if (!ticket_uuid) {
				return error(400, 'Ticket UUID is required');
			}

			// Check if ticket exists
			const ticket = getTicket(ticket_uuid);
			if (!ticket) {
				return error(404, 'Ticket not found');
			}

			const adminName = locals.user?.username || '管理';
			const userUuid = locals.user?.uuid;

			if (!userUuid) {
				return error(403, 'Forbidden');
			}

			// Check if actually subscribed
			if (!isUserSubscribed(ticket_uuid, userUuid)) {
				return json({ success: true, message: 'Not subscribed' });
			}

			const success = unsubscribeFromTicket(ticket_uuid, userUuid, adminName);

			if (!success) {
				return error(500, 'Failed to unsubscribe from ticket');
			}

			return json({ success: true });
		}

		case 'increase_attachment_limit': {
			// Only admins can increase attachment limits
			if (!hasPermission(locals.user, 'TICKETS')) {
				return error(403, 'Forbidden');
			}

			const { ticket_uuid } = body;

			if (!ticket_uuid) {
				return error(400, 'Ticket UUID is required');
			}

			// Check if ticket exists
			const ticket = getTicket(ticket_uuid);
			if (!ticket) {
				return error(404, 'Ticket not found');
			}

			// Can't increase limit on expired tickets
			if (ticket.status === 'closed' && Date.now() - ticket.updated_at > TICKET_EXPIRE_TIME) {
				return error(401, '工单已过期');
			}

			const adminName = locals.user?.username || '管理';
			const success = increaseAttachmentLimit(ticket_uuid, adminName);

			if (!success) {
				return error(500, 'Failed to increase attachment limit');
			}

			// Get updated ticket for the new limit
			const updatedTicket = getTicket(ticket_uuid);

			return json({ success: true, newLimit: updatedTicket?.attachment_limit });
		}

		case 'ban_user': {
			// Only admins can ban users
			if (!hasPermission(locals.user, 'TICKETS')) {
				return error(403, 'Forbidden');
			}

			const { author_uid, ban_duration_days, reason } = body;

			if (!author_uid || !ban_duration_days) {
				return error(400, 'Author UID and ban duration are required');
			}

			if (ban_duration_days < 1 || ban_duration_days > 30) {
				return error(400, 'Ban duration must be between 1 and 30 days');
			}

			const banData: BanUserData = {
				author_uid,
				banned_by: locals.user?.username || '管理',
				ban_duration_days,
				reason
			};

			const result = banUserFromTickets(banData);

			if (!result.success) {
				return error(400, result.error);
			}

			return json({
				success: true,
				ban: result.ban,
				closedTicketCount: result.closedTicketCount,
				disconnectedCount: result.disconnectedCount
			});
		}

		case 'unban_user': {
			// Only admins can unban users
			if (!hasPermission(locals.user, 'TICKETS')) {
				return error(403, 'Forbidden');
			}

			const { author_uid } = body;

			if (!author_uid) {
				return error(400, 'Author UID is required');
			}

			// Get the active ban
			const activeBan = getUserActiveBan(author_uid);
			if (!activeBan) {
				return error(404, 'No active ban found for this user');
			}

			const adminName = locals.user?.username || 'Admin';
			const success = removeBan(activeBan.uuid, adminName);

			if (!success) {
				return error(500, 'Failed to remove ban');
			}

			return json({ success: true });
		}

		case 'get_user_ban': {
			// Only admins can check ban status
			if (!hasPermission(locals.user, 'TICKETS')) {
				return error(403, 'Forbidden');
			}

			const { author_uid } = body;

			if (!author_uid) {
				return error(400, 'Author UID is required');
			}

			const activeBan = getUserActiveBan(author_uid);

			return json({ ban: activeBan });
		}

		case 'delete_ticket': {
			// Only users with SUPER permission can delete tickets
			if (!hasPermission(locals.user, 'SUPER')) {
				return error(403, 'Forbidden');
			}

			const { ticket_uuid } = body;

			if (!ticket_uuid) {
				return error(400, 'Ticket UUID is required');
			}

			// Check if ticket exists
			const ticket = getTicket(ticket_uuid);
			if (!ticket) {
				return error(404, 'Ticket not found');
			}

			const adminName = locals.user?.username || 'Admin';
			const success = deleteTicket(ticket_uuid, adminName);

			if (!success) {
				return error(500, 'Failed to delete ticket');
			}

			return json({ success: true });
		}

		case 'delete_message': {
			// Only admins with TICKETS permission can delete messages
			if (!hasPermission(locals.user, 'TICKETS')) {
				return error(403, 'Forbidden');
			}

			const { message_uuid } = body;

			if (!message_uuid) {
				return error(400, 'Message UUID is required');
			}

			const adminUsername = locals.user?.username || 'Admin';
			const isSuperAdmin = hasPermission(locals.user, 'SUPER');
			const result = deleteTicketMessage(message_uuid, adminUsername, isSuperAdmin);

			if (!result.success) {
				return error(400, result.error);
			}

			return json({ success: true });
		}

		case 'delete_attachment': {
			// Only admins with TICKETS permission can delete attachments
			if (!hasPermission(locals.user, 'TICKETS')) {
				return error(403, 'Forbidden');
			}

			const { attachment_uuid } = body;

			if (!attachment_uuid) {
				return error(400, 'Attachment UUID is required');
			}

			const adminUsername = locals.user?.username || 'Admin';
			const result = deleteTicketAttachment(attachment_uuid, adminUsername);

			if (!result.success) {
				return error(400, result.error);
			}

			return json({ success: true });
		}

		default:
			return error(400, 'Unknown action');
	}
};

export const GET: RequestHandler = async ({ locals, url }) => {
	const ticketUuid = url.searchParams.get('uuid');
	const includeMessages = url.searchParams.get('messages') === 'true';

	if (!ticketUuid) {
		return error(400, 'Ticket UUID is required');
	}

	const ticket = getTicket(ticketUuid);
	if (!ticket) {
		return error(404, 'Ticket not found');
	}

	// For admin requests, include banned state of the ticket author
	const isAdmin = hasPermission(locals.user, 'TICKETS');
	const isSuperAdmin = hasPermission(locals.user, 'SUPER');
	if (isAdmin && ticket.author_uid) {
		ticket.author_banned = isUserBanned(ticket.author_uid);
	}

	const response: any = { ticket };

	if (includeMessages) {
		response.messages = getTicketMessages(ticketUuid, isAdmin, isSuperAdmin);
		response.attachments = getTicketAttachments(ticketUuid, isSuperAdmin);
	}

	return json(response);
};
