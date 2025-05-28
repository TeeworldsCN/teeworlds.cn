import type {
	Ticket,
	TicketMessage,
	TicketAttachment,
	TicketAttachmentClient,
	TicketStatus
} from '../db/tickets';
import {
	addVisitorConnectedMessage,
	addVisitorDisconnectedMessage,
	getTicket,
	MESSAGE_VISIBILITY
} from '../db/tickets';

// Type for the emit function from sveltekit-sse
type EmitFunction = (eventName: string, data: string) => { error?: false | Error };

// Type for the lock store from sveltekit-sse
type LockStore = { set: (value: boolean) => void };

// Store active SSE connections
const adminConnections = new Map<EmitFunction, string>();
const ticketConnections = new Map<string, Set<EmitFunction>>();

// Store visitor connection mapping for tracking
const visitorConnectionMap = new Map<
	EmitFunction,
	{ ticketUuid: string; visitorName?: string; uid?: string; lock?: LockStore }
>(); // emit -> ticket info

// Store uid to connections mapping for forceful disconnection
const uidConnectionMap = new Map<string, Set<EmitFunction>>(); // uid -> set of emit functions

export type TicketEvent =
	| TicketCreateEvent
	| TicketUpdateEvent
	| MessageAddedEvent
	| StatusChangedEvent
	| AttachmentAddedEvent
	| AdminConnectionCountUpdatedEvent
	| AdminSubscriptionChangedEvent
	| UserBannedEvent
	| UserUnbannedEvent;

export interface TicketCreateEvent {
	type: 'ticket_created';
	data: {
		ticket: Ticket;
	};
}

export interface TicketUpdateEvent {
	type: 'ticket_updated';
	data: {
		old_status?: string;
		new_status?: string;
	};
}

export interface MessageAddedEvent {
	type: 'message_added';
	data: {
		message: TicketMessage;
		ticket: Ticket;
		updated: boolean;
	};
}

export interface StatusChangedEvent {
	type: 'status_changed';
	data: {
		ticket_uuid: string;
		old_status: TicketStatus;
		new_status: TicketStatus;
		actor: string;
		admin: boolean;
	};
}

export interface AttachmentAddedEvent {
	type: 'attachment_added';
	data: {
		attachment: TicketAttachmentClient;
		ticket: Ticket;
	};
}

export interface AdminConnectionCountUpdatedEvent {
	type: 'admin_connection_count_updated';
	data: {
		adminConnectionCount: number;
	};
}

export interface AdminSubscriptionChangedEvent {
	type: 'admin_subscription_changed';
	data: {
		ticket_uuid: string;
		user_uuid: string;
		subscribed: boolean;
	};
}

export interface UserBannedEvent {
	type: 'user_banned';
	data: {
		author_uid: string;
		banned_by: string;
		ban_duration_days: number;
		reason?: string;
	};
}

export interface UserUnbannedEvent {
	type: 'user_unbanned';
	data: {
		author_uid: string;
		unbanned_by: string;
	};
}

export const addAdminConnection = (emit: EmitFunction, userUuid: string) => {
	adminConnections.set(emit, userUuid);

	// Notify about connection count update
	notifyAdminConnectionCountUpdated();

	// Clean up when connection closes
	const cleanup = () => {
		adminConnections.delete(emit);
		// Notify about connection count update after cleanup
		notifyAdminConnectionCountUpdated();
	};

	return cleanup;
};

export const addTicketConnection = (
	ticketUuid: string,
	emit: EmitFunction,
	visitorName?: string,
	uid?: string,
	lock?: LockStore
) => {
	if (!ticketConnections.has(ticketUuid)) {
		ticketConnections.set(ticketUuid, new Set());
	}

	ticketConnections.get(ticketUuid)!.add(emit);

	// Track visitor connection for disconnect notifications
	visitorConnectionMap.set(emit, { ticketUuid, visitorName, uid, lock });

	// Track uid to connection mapping for forceful disconnection
	if (uid) {
		if (!uidConnectionMap.has(uid)) {
			uidConnectionMap.set(uid, new Set());
		}
		uidConnectionMap.get(uid)!.add(emit);
	}

	// Add visitor connected system message
	const ticket = getTicket(ticketUuid);
	if (ticket) {
		addVisitorConnectedMessage(ticketUuid, visitorName || ticket.visitor_name);
	}

	// Clean up when connection closes
	const cleanup = () => {
		const connections = ticketConnections.get(ticketUuid);
		if (connections) {
			connections.delete(emit);
			if (connections.size === 0) {
				ticketConnections.delete(ticketUuid);
			}
		}

		// Handle visitor disconnection
		const visitorInfo = visitorConnectionMap.get(emit);
		if (visitorInfo) {
			visitorConnectionMap.delete(emit);

			// Clean up uid connection mapping
			if (visitorInfo.uid) {
				const uidConnections = uidConnectionMap.get(visitorInfo.uid);
				if (uidConnections) {
					uidConnections.delete(emit);
					if (uidConnections.size === 0) {
						uidConnectionMap.delete(visitorInfo.uid);
					}
				}
			}

			// Add visitor disconnected system message
			const ticket = getTicket(visitorInfo.ticketUuid);
			if (ticket) {
				addVisitorDisconnectedMessage(
					visitorInfo.ticketUuid,
					visitorInfo.visitorName || ticket.visitor_name
				);
			}
		}
	};

	return cleanup;
};

export const broadcastToAdmins = (event: TicketEvent) => {
	const eventData = JSON.stringify(event);

	// Send to all admin connections
	let deletingKeys: EmitFunction[] | undefined;

	for (const emit of adminConnections.keys()) {
		const result = emit('message', eventData);
		if (result.error) {
			deletingKeys ??= [];
			deletingKeys.push(emit);
		}
	}

	if (deletingKeys) {
		for (const key of deletingKeys) {
			adminConnections.delete(key);
		}
	}
};

export const broadcastToSpecificAdmin = (userUuid: string, event: TicketEvent) => {
	const eventData = JSON.stringify(event);

	// Send to all connections for this specific admin user
	let deletingKeys: EmitFunction[] | undefined;

	for (const [emit, uuid] of [...adminConnections]) {
		if (uuid === userUuid) {
			const result = emit('message', eventData);
			if (result.error) {
				deletingKeys ??= [];
				deletingKeys.push(emit);
			}
		}
	}

	if (deletingKeys) {
		for (const key of deletingKeys) {
			adminConnections.delete(key);
		}
	}
};

export const broadcastToTicket = (ticketUuid: string, event: TicketEvent) => {
	const connections = ticketConnections.get(ticketUuid);
	if (!connections) return;

	const eventData = JSON.stringify(event);

	// Send to all connections for this specific admin user
	let deletingKeys: EmitFunction[] | undefined;

	// Send to all connections for this ticket
	for (const emit of connections) {
		const result = emit('message', eventData);
		if (result.error) {
			deletingKeys ??= [];
			deletingKeys.push(emit);
		}
	}

	if (deletingKeys) {
		for (const key of deletingKeys) {
			connections.delete(key);
		}
	}

	// Clean up empty connection sets
	if (connections.size === 0) {
		ticketConnections.delete(ticketUuid);
	}
};

export const notifyTicketCreated = (ticket: Ticket) => {
	const event: TicketEvent = {
		type: 'ticket_created',
		data: { ticket }
	};

	// Notify all admins about new ticket
	broadcastToAdmins(event);
};

export const notifyMessageAdded = (message: TicketMessage, ticket: Ticket, updated: boolean) => {
	const event: TicketEvent = {
		type: 'message_added',
		data: { message, ticket, updated }
	};

	// Notify ticket viewers
	if (message.visibility !== MESSAGE_VISIBILITY.ADMIN_ONLY) {
		broadcastToTicket(message.ticket_uuid, event);
	}

	// For visitor messages, only notify subscribed admins
	// For admin and system messages, notify all admins
	if (message.visibility !== MESSAGE_VISIBILITY.VISITOR_ONLY) {
		broadcastToAdmins(event);
	}
};

export const notifyStatusChanged = (
	ticketUuid: string,
	oldStatus: TicketStatus,
	newStatus: TicketStatus,
	actor: string,
	isAdmin: boolean
) => {
	const event: TicketEvent = {
		type: 'status_changed',
		data: {
			ticket_uuid: ticketUuid,
			old_status: oldStatus,
			new_status: newStatus,
			actor: actor,
			admin: isAdmin
		}
	};

	// Notify ticket viewers
	broadcastToTicket(ticketUuid, event);

	// Notify admins
	broadcastToAdmins(event);
};

export const notifyAttachmentAdded = (attachment: TicketAttachment, ticket: Ticket) => {
	// Convert to client version without blob data
	const attachmentClient: TicketAttachmentClient = {
		uuid: attachment.uuid,
		ticket_uuid: attachment.ticket_uuid,
		filename: attachment.filename,
		original_filename: attachment.original_filename,
		file_size: attachment.file_size,
		mime_type: attachment.mime_type,
		uploaded_by: attachment.uploaded_by,
		uploaded_at: attachment.uploaded_at
	};

	const event: TicketEvent = {
		type: 'attachment_added',
		data: { attachment: attachmentClient, ticket }
	};

	// Notify ticket viewers
	broadcastToTicket(attachment.ticket_uuid, event);

	// Notify admins
	broadcastToAdmins(event);
};

export const notifyAdminConnectionCountUpdated = () => {
	const event: TicketEvent = {
		type: 'admin_connection_count_updated',
		data: { adminConnectionCount: new Set(Array.from(adminConnections.values())).size }
	};

	// Notify all admins about connection count update
	broadcastToAdmins(event);
};

export const notifyAdminSubscriptionChanged = (
	ticketUuid: string,
	userUuid: string,
	subscribed: boolean
) => {
	const event: TicketEvent = {
		type: 'admin_subscription_changed',
		data: {
			ticket_uuid: ticketUuid,
			user_uuid: userUuid,
			subscribed: subscribed
		}
	};

	// Notify only the specific admin user about their subscription change
	broadcastToSpecificAdmin(userUuid, event);
};

export const notifyUserBanned = (
	authorUid: string,
	bannedBy: string,
	banDurationDays: number,
	reason?: string
) => {
	const event: TicketEvent = {
		type: 'user_banned',
		data: {
			author_uid: authorUid,
			banned_by: bannedBy,
			ban_duration_days: banDurationDays,
			reason: reason
		}
	};

	// Notify all admins about the ban
	broadcastToAdmins(event);
};

export const notifyUserUnbanned = (authorUid: string, unbannedBy: string) => {
	const event: TicketEvent = {
		type: 'user_unbanned',
		data: {
			author_uid: authorUid,
			unbanned_by: unbannedBy
		}
	};

	// Notify all admins about the unban
	broadcastToAdmins(event);
};

/**
 * Forcefully disconnect all connections associated with a specific uid
 * @param uid - The user ID whose connections should be disconnected
 * @returns Number of connections that were disconnected
 */
export const disconnectConnectionsByUid = (uid: string): number => {
	const connections = uidConnectionMap.get(uid);
	if (!connections || connections.size === 0) {
		return 0;
	}

	let disconnectedCount = 0;

	// Create a copy of the connections set to avoid modification during iteration
	const connectionsToDisconnect = Array.from(connections);

	for (const emit of connectionsToDisconnect) {
		try {
			// Get visitor info for proper cleanup
			const visitorInfo = visitorConnectionMap.get(emit);
			if (visitorInfo) {
				// Use lock to forcefully close the connection if available
				if (visitorInfo.lock) {
					visitorInfo.lock.set(false);
				} else {
					// Fallback: Send a close event to trigger client-side cleanup
					emit('close', JSON.stringify({ reason: 'force_disconnect', uid }));
				}

				// Remove from ticket connections
				const ticketConnections_set = ticketConnections.get(visitorInfo.ticketUuid);
				if (ticketConnections_set) {
					ticketConnections_set.delete(emit);
					if (ticketConnections_set.size === 0) {
						ticketConnections.delete(visitorInfo.ticketUuid);
					}
				}

				// Remove from visitor connection map
				visitorConnectionMap.delete(emit);

				// Add visitor disconnected system message
				const ticket = getTicket(visitorInfo.ticketUuid);
				if (ticket) {
					addVisitorDisconnectedMessage(
						visitorInfo.ticketUuid,
						visitorInfo.visitorName || ticket.visitor_name
					);
				}
			}

			disconnectedCount++;
		} catch (error) {
			// Log error but continue with other connections
			console.error(`Error disconnecting connection for uid ${uid}:`, error);
		}
	}

	// Clean up uid connection mapping
	uidConnectionMap.delete(uid);

	return disconnectedCount;
};

/**
 * Forcefully disconnect all connections associated with a specific ticket UUID
 * @param ticketUuid - The ticket UUID whose connections should be disconnected
 * @returns Number of connections that were disconnected
 */
export const disconnectConnectionsByTicketUuid = (ticketUuid: string): number => {
	const connections = ticketConnections.get(ticketUuid);
	if (!connections || connections.size === 0) {
		return 0;
	}

	let disconnectedCount = 0;

	// Create a copy of the connections set to avoid modification during iteration
	const connectionsToDisconnect = Array.from(connections);

	for (const emit of connectionsToDisconnect) {
		try {
			// Get visitor info for proper cleanup
			const visitorInfo = visitorConnectionMap.get(emit);
			if (visitorInfo) {
				// Use lock to forcefully close the connection if available
				if (visitorInfo.lock) {
					visitorInfo.lock.set(false);
				} else {
					// Fallback: Send a close event to trigger client-side cleanup
					emit('close', JSON.stringify({ reason: 'force_disconnect', ticketUuid }));
				}

				// Remove from visitor connection map
				visitorConnectionMap.delete(emit);

				// Remove from uid connection mapping if uid exists
				if (visitorInfo.uid) {
					const uidConnections = uidConnectionMap.get(visitorInfo.uid);
					if (uidConnections) {
						uidConnections.delete(emit);
						if (uidConnections.size === 0) {
							uidConnectionMap.delete(visitorInfo.uid);
						}
					}
				}

				// Add visitor disconnected system message
				const ticket = getTicket(visitorInfo.ticketUuid);
				if (ticket) {
					addVisitorDisconnectedMessage(
						visitorInfo.ticketUuid,
						visitorInfo.visitorName || ticket.visitor_name
					);
				}
			}

			disconnectedCount++;
		} catch (error) {
			// Log error but continue with other connections
			console.error(`Error disconnecting connection for ticket ${ticketUuid}:`, error);
		}
	}

	// Clean up ticket connection mapping
	ticketConnections.delete(ticketUuid);

	return disconnectedCount;
};

/**
 * Get all active connections for a specific uid
 * @param uid - The user ID to check connections for
 * @returns Array of connection info for the uid
 */
export const getConnectionsByUid = (uid: string) => {
	const connections = uidConnectionMap.get(uid);
	if (!connections) {
		return [];
	}

	const connectionInfo = [];
	for (const emit of connections) {
		const visitorInfo = visitorConnectionMap.get(emit);
		if (visitorInfo) {
			connectionInfo.push({
				ticketUuid: visitorInfo.ticketUuid,
				visitorName: visitorInfo.visitorName,
				uid: visitorInfo.uid,
				hasLock: !!visitorInfo.lock
			});
		}
	}

	return connectionInfo;
};

/**
 * Get all active connections for a specific ticket UUID
 * @param ticketUuid - The ticket UUID to check connections for
 * @returns Array of connection info for the ticket
 */
export const getConnectionsByTicketUuid = (ticketUuid: string) => {
	const connections = ticketConnections.get(ticketUuid);
	if (!connections) {
		return [];
	}

	const connectionInfo = [];
	for (const emit of connections) {
		const visitorInfo = visitorConnectionMap.get(emit);
		if (visitorInfo) {
			connectionInfo.push({
				ticketUuid: visitorInfo.ticketUuid,
				visitorName: visitorInfo.visitorName,
				uid: visitorInfo.uid,
				hasLock: !!visitorInfo.lock
			});
		}
	}

	return connectionInfo;
};

export const getConnectionStats = () => {
	return {
		adminConnections: adminConnections.size,
		adminCount: new Set(Array.from(adminConnections.values())).size,
		ticketConnections: Array.from(ticketConnections.entries()).map(([uuid, connections]) => ({
			uuid,
			connections: connections.size
		})),
		visitorConnections: visitorConnectionMap.size,
		uidConnections: Array.from(uidConnectionMap.entries()).map(([uid, connections]) => ({
			uid,
			connections: connections.size
		}))
	};
};
