import { sqlite } from '../sqlite';
import {
	notifyTicketCreated,
	notifyMessageAdded,
	notifyStatusChanged,
	notifyAttachmentAdded,
	notifyAdminSubscriptionChanged,
	notifyUserBanned,
	notifyUserUnbanned,
	disconnectConnectionsByUid
} from '../realtime/tickets';

// Ticket expires in 3 days
export const TICKET_EXPIRE_TIME = 3 * 24 * 60 * 60 * 1000;

// Maximum number of open tickets per user
export const MAX_OPEN_TICKETS_PER_USER = 3;

// ============================================================================
// TABLE CREATION
// ============================================================================

// Create tickets table
sqlite
	.query(
		`CREATE TABLE IF NOT EXISTS tickets (
			uuid VARCHAR(36) PRIMARY KEY,
			title TEXT NOT NULL,
			status VARCHAR(20) DEFAULT 'open',
			visitor_name VARCHAR(255),
			author_uid VARCHAR(255),
			attachment_limit INTEGER DEFAULT 4,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		)`
	)
	.run();

// Create ticket subscriptions table for many-to-many relationship (no id needed)
sqlite
	.query(
		`CREATE TABLE IF NOT EXISTS ticket_subscriptions (
			ticket_uuid VARCHAR(36) NOT NULL,
			user_uuid VARCHAR(36) NOT NULL,
			subscribed_at INTEGER NOT NULL,
			FOREIGN KEY (ticket_uuid) REFERENCES tickets (uuid) ON DELETE CASCADE,
			FOREIGN KEY (user_uuid) REFERENCES user (uuid) ON DELETE CASCADE,
			PRIMARY KEY (ticket_uuid, user_uuid)
		)`
	)
	.run();

// Create ticket messages table with UUID primary key
sqlite
	.query(
		`CREATE TABLE IF NOT EXISTS ticket_messages (
			uuid VARCHAR(36) PRIMARY KEY,
			ticket_uuid VARCHAR(36) NOT NULL,
			message TEXT NOT NULL,
			author_type VARCHAR(20) NOT NULL,
			author_name VARCHAR(255) NOT NULL,
			visibility INTEGER DEFAULT 0,
			created_at INTEGER NOT NULL,
			FOREIGN KEY (ticket_uuid) REFERENCES tickets (uuid) ON DELETE CASCADE
		)`
	)
	.run();

// Add visibility column to existing table if it doesn't exist
try {
	sqlite.query(`ALTER TABLE ticket_messages ADD COLUMN visibility INTEGER DEFAULT 0`).run();
} catch (error) {
	// Column might already exist, ignore error
}

// Create ticket attachments table with UUID primary key
sqlite
	.query(
		`CREATE TABLE IF NOT EXISTS ticket_attachments (
			uuid VARCHAR(36) PRIMARY KEY,
			ticket_uuid VARCHAR(36) NOT NULL,
			filename VARCHAR(255) NOT NULL,
			original_filename VARCHAR(255) NOT NULL,
			file_size INTEGER NOT NULL,
			mime_type VARCHAR(100) NOT NULL,
			file_data BLOB NOT NULL,
			uploaded_by VARCHAR(255) NOT NULL,
			uploaded_at INTEGER NOT NULL,
			FOREIGN KEY (ticket_uuid) REFERENCES tickets (uuid) ON DELETE CASCADE
		)`
	)
	.run();

// Create ticket bans table
sqlite
	.query(
		`CREATE TABLE IF NOT EXISTS ticket_bans (
			uuid VARCHAR(36) PRIMARY KEY,
			author_uid VARCHAR(255) NOT NULL,
			banned_by VARCHAR(255) NOT NULL,
			ban_duration_days INTEGER NOT NULL,
			banned_at INTEGER NOT NULL,
			expires_at INTEGER NOT NULL,
			reason TEXT
		)`
	)
	.run();

// ============================================================================
// INDEX CREATION
// ============================================================================

// Tickets table indexes
sqlite.query('CREATE INDEX IF NOT EXISTS tickets_status ON tickets (status);').run();
sqlite.query('CREATE INDEX IF NOT EXISTS tickets_created_at ON tickets (created_at);').run();
sqlite.query('CREATE INDEX IF NOT EXISTS tickets_author_uid ON tickets (author_uid);').run();
sqlite
	.query('CREATE INDEX IF NOT EXISTS tickets_status_updated_at ON tickets (status, updated_at);')
	.run();
sqlite
	.query('CREATE INDEX IF NOT EXISTS tickets_author_uid_status ON tickets (author_uid, status);')
	.run();

// Ticket messages table indexes
sqlite
	.query('CREATE INDEX IF NOT EXISTS ticket_messages_ticket_uuid ON ticket_messages (ticket_uuid);')
	.run();
sqlite
	.query('CREATE INDEX IF NOT EXISTS ticket_messages_created_at ON ticket_messages (created_at);')
	.run();
sqlite
	.query(
		'CREATE INDEX IF NOT EXISTS ticket_messages_ticket_uuid_visibility ON ticket_messages (ticket_uuid, visibility);'
	)
	.run();

// Ticket attachments table indexes
sqlite
	.query(
		'CREATE INDEX IF NOT EXISTS ticket_attachments_ticket_uuid ON ticket_attachments (ticket_uuid);'
	)
	.run();

// Ticket subscriptions table indexes
sqlite
	.query(
		'CREATE INDEX IF NOT EXISTS ticket_subscriptions_ticket_uuid ON ticket_subscriptions (ticket_uuid);'
	)
	.run();
sqlite
	.query(
		'CREATE INDEX IF NOT EXISTS ticket_subscriptions_user_uuid ON ticket_subscriptions (user_uuid);'
	)
	.run();
sqlite
	.query(
		'CREATE INDEX IF NOT EXISTS ticket_subscriptions_ticket_uuid_user_uuid ON ticket_subscriptions (ticket_uuid, user_uuid);'
	)
	.run();

// Ticket bans table indexes
sqlite
	.query('CREATE INDEX IF NOT EXISTS ticket_bans_author_uid ON ticket_bans (author_uid);')
	.run();
sqlite
	.query('CREATE INDEX IF NOT EXISTS ticket_bans_expires_at ON ticket_bans (expires_at);')
	.run();

// ============================================================================
// INTERFACES
// ============================================================================

export type TicketStatus = 'open' | 'closed' | 'in_progress';

export interface Ticket {
	uuid: string;
	title: string;
	status: TicketStatus;
	visitor_name: string;
	author_uid: string;
	attachment_limit: number;
	created_at: number;
	updated_at: number;
	author_banned?: boolean; // Optional field for admin views
}

export interface TicketSubscription {
	ticket_uuid: string;
	user_uuid: string;
	subscribed_at: number;
}

export interface TicketMessage {
	uuid: string;
	ticket_uuid: string;
	message: string; // For system messages, this can be JSON string
	author_type: 'visitor' | 'admin' | 'system' | 'bot' | 'sys';
	author_name: string;
	visibility: number; // 0 = all, 1 = admin only, 2 = visitor only
	created_at: number;
}

// System message types for JSON parsing
export type SystemMessageData =
	| SystemMessageStatusChange
	| SystemMessageAdminSubscribed
	| SystemMessageAdminUnsubscribed
	| SystemMessageAttachmentLimitIncreased
	| SystemMessageNavigationWarning
	| SystemMessageVisitorConnected
	| SystemMessageVisitorDisconnected
	| SystemMessageUploadError
	| SystemMessageSendError
	| SystemMessageButtonGroup;

export interface SystemMessageStatusChange {
	type: 'status_change';
	data: {
		actor: string;
		old_status: string;
		new_status: string;
		admin: boolean;
	};
}

export interface SystemMessageAdminSubscribed {
	type: 'admin_subscribed';
	data: {
		admin_name: string;
	};
}

export interface SystemMessageAdminUnsubscribed {
	type: 'admin_unsubscribed';
	data: {
		admin_name: string;
	};
}

export interface SystemMessageAttachmentLimitIncreased {
	type: 'attachment_limit_increased';
	data: {
		admin_name: string;
		old_limit: number;
		new_limit: number;
	};
}

export interface SystemMessageNavigationWarning {
	type: 'navigation_warning';
	data: {
		message: string;
	};
}

export interface SystemMessageVisitorConnected {
	type: 'visitor_connected';
	data: {
		visitor_name: string;
	};
}

export interface SystemMessageVisitorDisconnected {
	type: 'visitor_disconnected';
	data: {
		visitor_name: string;
	};
}

export interface SystemMessageUploadError {
	type: 'upload_error';
	data: {
		error_message: string;
		error_type: string;
		filename: string;
	};
}

export interface SystemMessageSendError {
	type: 'message_send_error';
	data: {
		error_message: string;
		original_message?: string;
	};
}

export interface SystemMessageButtonGroup {
	type: 'button_group';
	data: {
		message: string;
		buttons: ButtonData[];
	};
}

// Button data interface for system messages
export interface ButtonData {
	id: string;
	text: string;
	description?: string; // Optional description for row layout
	variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'success';
}

export interface TicketAttachment {
	uuid: string;
	ticket_uuid: string;
	filename: string;
	original_filename: string;
	file_size: number;
	mime_type: string;
	file_data: Buffer;
	uploaded_by: string;
	uploaded_at: number;
}

export interface TicketBan {
	uuid: string;
	author_uid: string;
	banned_by: string;
	ban_duration_days: number;
	banned_at: number;
	expires_at: number;
	reason?: string;
}

// Client-side attachment interface (without file_data)
export interface TicketAttachmentClient {
	uuid: string;
	ticket_uuid: string;
	filename: string;
	original_filename: string;
	file_size: number;
	mime_type: string;
	uploaded_by: string;
	uploaded_at: number;
}

export interface CreateTicketData {
	title: string;
	visitor_name?: string;
	author_uid: string;
	first_message?: string;
}

export interface CreateTicketResult {
	success: boolean;
	ticket?: Ticket;
	error?: string;
}

export interface AddMessageData {
	ticket_uuid: string;
	message: string;
	author_type: 'visitor' | 'admin' | 'system' | 'bot' | 'sys';
	author_name: string;
	visibility?: number; // 0 = all, 1 = admin only, 2 = visitor only (defaults to 0)
}

export interface AddMessageResult {
	success: boolean;
	message?: TicketMessage;
	error?: string;
}

// ============================================================================
// PREPARED STATEMENTS
// ============================================================================

const getOpenTicketCountQuery = sqlite.prepare<{ count: number }, string>(
	`SELECT COUNT(*) as count FROM tickets WHERE author_uid = ? AND status != 'closed'`
);

const getOpenTicketsQuery = sqlite.prepare<Ticket, string>(
	`SELECT uuid, title, status, visitor_name, author_uid, attachment_limit, created_at, updated_at
	 FROM tickets WHERE author_uid = ? AND status != 'closed' ORDER BY created_at DESC`
);

const insertTicketQuery = sqlite.prepare<
	unknown,
	[string, string, string, string | null, string | null, number, number, number]
>(
	`INSERT INTO tickets (uuid, title, status, visitor_name, author_uid, attachment_limit, created_at, updated_at)
	 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

const getTicketQuery = sqlite.prepare<Ticket, string>(
	`SELECT uuid, title, status, visitor_name, author_uid, attachment_limit, created_at, updated_at
	 FROM tickets WHERE uuid = ?`
);

const getTicketMessagesQuery = sqlite.prepare<TicketMessage, string>(
	`SELECT uuid, ticket_uuid, message, author_type, author_name, visibility, created_at
	 FROM ticket_messages WHERE ticket_uuid = ? ORDER BY created_at ASC`
);

const getTicketMessagesForAdminQuery = sqlite.prepare<TicketMessage, string>(
	`SELECT uuid, ticket_uuid, message, author_type, author_name, visibility, created_at
	 FROM ticket_messages WHERE ticket_uuid = ? AND visibility != 2 ORDER BY created_at ASC`
);

const getTicketMessagesForVisitorQuery = sqlite.prepare<TicketMessage, string>(
	`SELECT uuid, ticket_uuid, message, author_type, author_name, visibility, created_at
	 FROM ticket_messages WHERE ticket_uuid = ? AND visibility != 1 ORDER BY created_at ASC`
);

const insertTicketMessageQuery = sqlite.prepare<
	unknown,
	[string, string, string, string, string, number, number]
>(
	`INSERT INTO ticket_messages (uuid, ticket_uuid, message, author_type, author_name, visibility, created_at)
	 VALUES (?, ?, ?, ?, ?, ?, ?)`
);

const updateTicketTimestampQuery = sqlite.prepare<unknown, [number, string]>(
	`UPDATE tickets SET updated_at = ? WHERE uuid = ?`
);

const updateTicketStatusQuery = sqlite.prepare<unknown, [string, number, string]>(
	`UPDATE tickets SET status = ?, updated_at = ? WHERE uuid = ?`
);

const getAvailableTicketsQuery = sqlite.prepare<Ticket, [number, number, number]>(
	`SELECT uuid, title, status, visitor_name, author_uid, attachment_limit, created_at, updated_at
	 FROM tickets WHERE status != 'closed' OR updated_at > ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
);

const getAvailableTicketCountQuery = sqlite.prepare<{ count: number }, [number]>(
	`SELECT COUNT(*) as count FROM tickets WHERE status != 'closed' OR updated_at > ?`
);

const insertTicketAttachmentQuery = sqlite.prepare<
	unknown,
	[string, string, string, string, number, string, Uint8Array, string, number]
>(
	`INSERT INTO ticket_attachments (uuid, ticket_uuid, filename, original_filename, file_size, mime_type, file_data, uploaded_by, uploaded_at)
	 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const getTicketAttachmentsQuery = sqlite.prepare<TicketAttachmentClient, string>(
	`SELECT uuid, ticket_uuid, filename, original_filename, file_size, mime_type, uploaded_by, uploaded_at
	 FROM ticket_attachments WHERE ticket_uuid = ? ORDER BY uploaded_at ASC`
);

const deleteTicketAttachmentQuery = sqlite.prepare<unknown, string>(
	`DELETE FROM ticket_attachments WHERE uuid = ?`
);

const insertTicketSubscriptionQuery = sqlite.prepare<unknown, [string, string, number]>(
	`INSERT INTO ticket_subscriptions (ticket_uuid, user_uuid, subscribed_at)
	 VALUES (?, ?, ?)`
);

const deleteTicketSubscriptionQuery = sqlite.prepare<unknown, [string, string]>(
	`DELETE FROM ticket_subscriptions WHERE ticket_uuid = ? AND user_uuid = ?`
);

const isUserSubscribedQuery = sqlite.prepare<{ count: number }, [string, string]>(
	`SELECT COUNT(*) as count FROM ticket_subscriptions WHERE ticket_uuid = ? AND user_uuid = ?`
);

const getUserSubscribedTicketsQuery = sqlite.prepare<Pick<Ticket, 'uuid'>, string>(
	`SELECT t.uuid
	 FROM tickets t
	 INNER JOIN ticket_subscriptions ts ON t.uuid = ts.ticket_uuid
	 WHERE ts.user_uuid = ?
	 ORDER BY t.created_at DESC`
);

const getTicketSubscriptionsQuery = sqlite.prepare<Pick<TicketSubscription, 'user_uuid'>, string>(
	`SELECT user_uuid FROM ticket_subscriptions WHERE ticket_uuid = ?`
);

const deleteAllTicketSubscriptionsQuery = sqlite.prepare<unknown, string>(
	`DELETE FROM ticket_subscriptions WHERE ticket_uuid = ?`
);

const getUserLatestTicketQuery = sqlite.prepare<Ticket, [string, number]>(
	`SELECT uuid, title, status, visitor_name, author_uid, attachment_limit, created_at, updated_at
	 FROM tickets WHERE author_uid = ? ORDER BY created_at DESC LIMIT ?`
);

const getTicketAttachmentCountQuery = sqlite.prepare<{ count: number }, string>(
	`SELECT COUNT(*) as count FROM ticket_attachments WHERE ticket_uuid = ?`
);

const updateAttachmentLimitQuery = sqlite.prepare<unknown, [number, string]>(
	`UPDATE tickets SET attachment_limit = ? WHERE uuid = ?`
);

// Ban-related queries
const insertTicketBanQuery = sqlite.prepare<
	unknown,
	[string, string, string, number, number, number, string | null]
>(
	`INSERT INTO ticket_bans (uuid, author_uid, banned_by, ban_duration_days, banned_at, expires_at, reason)
	 VALUES (?, ?, ?, ?, ?, ?, ?)`
);

const getActiveBanQuery = sqlite.prepare<TicketBan, [string, number]>(
	`SELECT uuid, author_uid, banned_by, ban_duration_days, banned_at, expires_at, reason
	 FROM ticket_bans WHERE author_uid = ? AND expires_at > ? ORDER BY banned_at DESC LIMIT 1`
);

const getBanByUuidQuery = sqlite.prepare<TicketBan, string>(
	`SELECT uuid, author_uid, banned_by, ban_duration_days, banned_at, expires_at, reason
	 FROM ticket_bans WHERE uuid = ?`
);

const deleteBanQuery = sqlite.prepare<unknown, string>(`DELETE FROM ticket_bans WHERE uuid = ?`);

// Query to get all open tickets for a user
const getUserOpenTicketsQuery = sqlite.prepare<Pick<Ticket, 'uuid'>, string>(
	`SELECT uuid FROM tickets WHERE author_uid = ? AND status != 'closed'`
);

// ============================================================================
// CONSTANTS
// ============================================================================

// Message visibility constants
export const MESSAGE_VISIBILITY = {
	ALL: 0, // Visible to all (admins and visitors)
	ADMIN_ONLY: 1, // Visible only to admins
	VISITOR_ONLY: 2 // Visible only to visitors
} as const;

// ============================================================================
// FUNCTIONS
// ============================================================================

// Get count of open tickets for a user
export const getOpenTicketCount = (author_uid: string): number => {
	try {
		const result = getOpenTicketCountQuery.get(author_uid);
		return result?.count || 0;
	} catch (error) {
		console.error('Error getting open ticket count:', error);
		return 0;
	}
};

export const getOpenTickets = (author_uid: string): Ticket[] => {
	try {
		const tickets = getOpenTicketsQuery.all(author_uid);
		return tickets;
	} catch (error) {
		console.error('Error getting open tickets:', error);
		return [];
	}
};

// Check if user has any open tickets (kept for backward compatibility)
export const hasOpenTickets = (author_uid: string): boolean => {
	return getOpenTicketCount(author_uid) > 0;
};

export const createTicket = (data: CreateTicketData): CreateTicketResult => {
	try {
		// Check if user is banned from creating tickets
		if (data.author_uid && isUserBanned(data.author_uid)) {
			return {
				success: false,
				error: 'You are currently restricted from creating tickets. Please try again later.'
			};
		}

		// Check if user already has maximum number of open tickets
		if (data.author_uid) {
			const openTicketCount = getOpenTicketCount(data.author_uid);
			if (openTicketCount >= MAX_OPEN_TICKETS_PER_USER) {
				return {
					success: false,
					error: `You already have ${openTicketCount} open tickets. Please close some of your existing tickets before creating a new one. (Maximum: ${MAX_OPEN_TICKETS_PER_USER} open tickets)`
				};
			}
		}

		const uuid = crypto.randomUUID();
		const now = Date.now();

		const ticket: Ticket = {
			uuid,
			title: data.title,
			status: 'open',
			visitor_name: data.visitor_name || '访客',
			author_uid: data.author_uid,
			attachment_limit: 4,
			created_at: now,
			updated_at: now
		};

		insertTicketQuery.run(
			ticket.uuid,
			ticket.title,
			ticket.status,
			ticket.visitor_name || null,
			ticket.author_uid || null,
			ticket.attachment_limit,
			ticket.created_at,
			ticket.updated_at
		);

		// Notify admins about new ticket
		notifyTicketCreated(ticket);

		return { success: true, ticket };
	} catch (error) {
		console.error('Error creating ticket:', error);
		return { success: false, error: 'Failed to create ticket' };
	}
};

export const getTicket = (uuid: string): Ticket | null => {
	try {
		const ticket = getTicketQuery.get(uuid);
		return ticket || null;
	} catch (error) {
		console.error('Error getting ticket:', error);
		return null;
	}
};

export const getTicketMessages = (ticket_uuid: string, isAdmin?: boolean): TicketMessage[] => {
	try {
		let messages: TicketMessage[];

		if (isAdmin === true) {
			// Admin can see all messages except visitor-only (visibility = 2)
			messages = getTicketMessagesForAdminQuery.all(ticket_uuid);
		} else if (isAdmin === false) {
			// Visitor can see all messages except admin-only (visibility = 1)
			messages = getTicketMessagesForVisitorQuery.all(ticket_uuid);
		} else {
			// If role is not specified, return all messages (for backward compatibility)
			messages = getTicketMessagesQuery.all(ticket_uuid);
		}

		return messages;
	} catch (error) {
		console.error('Error getting ticket messages:', error);
		return [];
	}
};

const insertTicketMessage = (data: AddMessageData, isUpdate: boolean): AddMessageResult => {
	try {
		const now = Date.now();
		const messageUuid = crypto.randomUUID();
		const visibility = data.visibility ?? 0; // Default to 0 (visible to all)

		insertTicketMessageQuery.run(
			messageUuid,
			data.ticket_uuid,
			data.message,
			data.author_type,
			data.author_name,
			visibility,
			now
		);

		// Update ticket's updated_at timestamp
		if (isUpdate) {
			updateTicketTimestampQuery.run(now, data.ticket_uuid);
		}

		const message: TicketMessage = {
			uuid: messageUuid,
			ticket_uuid: data.ticket_uuid,
			message: data.message,
			author_type: data.author_type,
			author_name: data.author_name,
			visibility: visibility,
			created_at: now
		};

		// Get ticket for notification
		const ticket = getTicket(data.ticket_uuid);
		if (ticket) {
			// Notify about new message
			notifyMessageAdded(message, ticket, isUpdate);
		}

		return { success: true, message };
	} catch (error) {
		console.error('Error adding ticket message:', error);
		return { success: false, error: 'Failed to add message' };
	}
};

export const updateTicketStatus = (
	uuid: string,
	status: Ticket['status'],
	actor: string,
	isAdmin: boolean
): boolean => {
	try {
		const now = Date.now();

		// Get current status for system message and notifications
		const currentTicket = getTicket(uuid);

		if (!currentTicket) {
			return false;
		}

		const oldStatus = currentTicket.status;

		const result = updateTicketStatusQuery.run(status, now, uuid);

		// Add system message for status change and send notifications
		if (result.changes > 0 && actor && oldStatus !== status) {
			// If ticket is being closed, remove all subscriptions
			if (status === 'closed') {
				removeAllTicketSubscriptions(uuid);
			}

			const systemMessage: SystemMessageData = {
				type: 'status_change',
				data: {
					actor: actor,
					old_status: oldStatus,
					new_status: status,
					admin: isAdmin
				}
			};

			// Add system message (this will trigger message notification via addTicketMessage)
			insertTicketMessage(
				{
					ticket_uuid: uuid,
					message: JSON.stringify(systemMessage),
					author_type: 'system',
					author_name: actor
				},
				false
			);

			// Get updated ticket and notify about status change
			const updatedTicket = getTicket(uuid);
			if (updatedTicket && oldStatus) {
				notifyStatusChanged(uuid, oldStatus, status, actor, isAdmin);
			}
		}

		return result.changes > 0;
	} catch (error) {
		console.error('Error updating ticket status:', error);
		return false;
	}
};

export const getAvailableTickets = (
	cutoffTime: number,
	limit: number,
	offset: number
): Ticket[] => {
	try {
		const tickets = getAvailableTicketsQuery.all(cutoffTime, limit, offset);
		return tickets;
	} catch (error) {
		console.error('Error getting all tickets:', error);
		return [];
	}
};

export const getAvailableTicketCount = (cutoffTime: number): number => {
	try {
		const result = getAvailableTicketCountQuery.get(cutoffTime);
		return result?.count || 0;
	} catch (error) {
		console.error('Error getting ticket count:', error);
		return 0;
	}
};

export const addTicketAttachment = (
	attachment: Omit<TicketAttachment, 'uuid'>
): TicketAttachment | null => {
	try {
		const attachmentUuid = crypto.randomUUID();

		insertTicketAttachmentQuery.run(
			attachmentUuid,
			attachment.ticket_uuid,
			attachment.filename,
			attachment.original_filename,
			attachment.file_size,
			attachment.mime_type,
			new Uint8Array(attachment.file_data),
			attachment.uploaded_by,
			attachment.uploaded_at
		);

		const fullAttachment: TicketAttachment = {
			uuid: attachmentUuid,
			...attachment
		};

		updateTicketTimestampQuery.run(attachment.uploaded_at, attachment.ticket_uuid);

		// Get ticket for notification
		const ticket = getTicket(attachment.ticket_uuid);
		if (ticket) {
			// Notify about new attachment
			notifyAttachmentAdded(fullAttachment, ticket);
		}

		return fullAttachment;
	} catch (error) {
		console.error('Error adding ticket attachment:', error);
		return null;
	}
};

export const getTicketAttachments = (ticket_uuid: string): TicketAttachmentClient[] => {
	try {
		const attachments = getTicketAttachmentsQuery.all(ticket_uuid);
		return attachments;
	} catch (error) {
		console.error('Error getting ticket attachments:', error);
		return [];
	}
};

export const deleteTicketAttachment = (uuid: string): boolean => {
	try {
		const result = deleteTicketAttachmentQuery.run(uuid);
		return result.changes > 0;
	} catch (error) {
		console.error('Error deleting ticket attachment:', error);
		return false;
	}
};

// Subscription functions
export const subscribeToTicket = (
	ticket_uuid: string,
	user_uuid: string,
	admin_name: string
): boolean => {
	try {
		const now = Date.now();

		// Get current ticket for status change notification
		const ticket = getTicket(ticket_uuid);
		if (!ticket) {
			return false;
		}

		// Insert subscription (will fail if already exists due to UNIQUE constraint)
		const result = insertTicketSubscriptionQuery.run(ticket_uuid, user_uuid, now);

		if (result.changes > 0) {
			// Update ticket status to in_progress if it's currently open
			if (ticket.status === 'open') {
				updateTicketStatus(ticket_uuid, 'in_progress', admin_name, true);
			}

			// Add system message (this will trigger message notification via addTicketMessage)
			const systemMessage: SystemMessageData = {
				type: 'admin_subscribed',
				data: { admin_name }
			};

			insertTicketMessage(
				{
					ticket_uuid,
					message: JSON.stringify(systemMessage),
					author_type: 'system',
					author_name: 'System'
				},
				false
			);

			// Notify the admin about their subscription change
			notifyAdminSubscriptionChanged(ticket_uuid, user_uuid, true);

			return true;
		}
		return false;
	} catch (error) {
		console.error('Error subscribing to ticket:', error);
		return false;
	}
};

export const unsubscribeFromTicket = (
	ticket_uuid: string,
	user_uuid: string,
	admin_name: string
): boolean => {
	try {
		const result = deleteTicketSubscriptionQuery.run(ticket_uuid, user_uuid);

		if (result.changes > 0) {
			// Add system message (this will trigger message notification via addTicketMessage)
			const systemMessage: SystemMessageData = {
				type: 'admin_unsubscribed',
				data: { admin_name }
			};

			insertTicketMessage(
				{
					ticket_uuid,
					message: JSON.stringify(systemMessage),
					author_type: 'system',
					author_name: 'System'
				},
				false
			);

			// Notify the admin about their subscription change
			notifyAdminSubscriptionChanged(ticket_uuid, user_uuid, false);

			return true;
		}
		return false;
	} catch (error) {
		console.error('Error unsubscribing from ticket:', error);
		return false;
	}
};

export const isUserSubscribed = (ticket_uuid: string, user_uuid: string): boolean => {
	try {
		const subscription = isUserSubscribedQuery.get(ticket_uuid, user_uuid);
		return (subscription?.count || 0) > 0;
	} catch (error) {
		console.error('Error checking user subscription:', error);
		return false;
	}
};

export const getUserSubscribedTickets = (user_uuid: string): string[] => {
	try {
		const tickets = getUserSubscribedTicketsQuery.all(user_uuid);
		return tickets.map((t) => t.uuid);
	} catch (error) {
		console.error('Error getting user subscribed tickets:', error);
		return [];
	}
};

export const getTicketSubscriptions = (ticket_uuid: string): string[] => {
	try {
		const subscriptions = getTicketSubscriptionsQuery.all(ticket_uuid);
		return subscriptions.map((s) => s.user_uuid);
	} catch (error) {
		console.error('Error getting ticket subscriptions:', error);
		return [];
	}
};

export const removeAllTicketSubscriptions = (ticket_uuid: string): boolean => {
	try {
		const result = deleteAllTicketSubscriptionsQuery.run(ticket_uuid);
		return result.changes > 0;
	} catch (error) {
		console.error('Error removing all ticket subscriptions:', error);
		return false;
	}
};

// Get user's last created ticket by author_uid
export const getUserLatestTicket = (author_uid: string, limit: number): Ticket[] => {
	try {
		const ticket = getUserLatestTicketQuery.all(author_uid, limit);
		return ticket;
	} catch (error) {
		console.error('Error getting user last ticket:', error);
		return [];
	}
};

// Attachment limit management functions
export const getTicketAttachmentCount = (ticket_uuid: string): number => {
	try {
		const result = getTicketAttachmentCountQuery.get(ticket_uuid);
		return result?.count || 0;
	} catch (error) {
		console.error('Error getting ticket attachment count:', error);
		return 0;
	}
};

export const canUploadAttachment = (
	ticket_uuid: string,
	isAdmin: boolean
): { canUpload: boolean; currentCount: number; limit: number } => {
	try {
		const ticket = getTicket(ticket_uuid);
		if (!ticket) {
			return { canUpload: false, currentCount: 0, limit: 0 };
		}

		const currentCount = getTicketAttachmentCount(ticket_uuid);

		// Admins can always upload
		if (isAdmin) {
			return { canUpload: true, currentCount, limit: ticket.attachment_limit };
		}

		// Visitors are limited by the attachment_limit
		const canUpload = currentCount < ticket.attachment_limit;
		return { canUpload, currentCount, limit: ticket.attachment_limit };
	} catch (error) {
		console.error('Error checking attachment upload permission:', error);
		return { canUpload: false, currentCount: 0, limit: 0 };
	}
};

export const increaseAttachmentLimit = (ticket_uuid: string, admin_name: string): boolean => {
	try {
		const ticket = getTicket(ticket_uuid);
		if (!ticket) {
			return false;
		}

		const oldLimit = ticket.attachment_limit;
		const newLimit = oldLimit + 2;

		const result = updateAttachmentLimitQuery.run(newLimit, ticket_uuid);

		if (result.changes > 0) {
			// Add system message for limit increase
			const systemMessage: SystemMessageData = {
				type: 'attachment_limit_increased',
				data: {
					admin_name,
					old_limit: oldLimit,
					new_limit: newLimit
				}
			};

			insertTicketMessage(
				{
					ticket_uuid,
					message: JSON.stringify(systemMessage),
					author_type: 'system',
					author_name: 'System'
				},
				false
			);

			return true;
		}
		return false;
	} catch (error) {
		console.error('Error increasing attachment limit:', error);
		return false;
	}
};

// Visitor connection tracking functions
export const addVisitorConnectedMessage = (
	ticket_uuid: string,
	visitor_name?: string
): TicketMessage | null => {
	try {
		const systemMessage: SystemMessageData = {
			type: 'visitor_connected',
			data: { visitor_name: visitor_name || '访客' }
		};

		const result = addAdminOnlyMessage({
			ticket_uuid,
			message: JSON.stringify(systemMessage),
			author_type: 'sys',
			author_name: 'System'
		});

		return result.success ? result.message || null : null;
	} catch (error) {
		console.error('Error adding visitor connected message:', error);
		return null;
	}
};

export const addVisitorDisconnectedMessage = (
	ticket_uuid: string,
	visitor_name?: string
): TicketMessage | null => {
	try {
		const systemMessage: SystemMessageData = {
			type: 'visitor_disconnected',
			data: { visitor_name: visitor_name || '访客' }
		};

		const result = addAdminOnlyMessage({
			ticket_uuid,
			message: JSON.stringify(systemMessage),
			author_type: 'sys',
			author_name: 'System'
		});

		return result.success ? result.message || null : null;
	} catch (error) {
		console.error('Error adding visitor disconnected message:', error);
		return null;
	}
};

// Helper functions for creating messages with specific visibility
export const addAdminOnlyMessage = (data: {
	ticket_uuid: string;
	message: string;
	author_name: string;
	author_type: 'bot' | 'system' | 'sys';
}): AddMessageResult => {
	return insertTicketMessage(
		{
			...data,
			visibility: MESSAGE_VISIBILITY.ADMIN_ONLY
		},
		false
	);
};

export const addVisitorOnlyMessage = (data: {
	ticket_uuid: string;
	message: string;
	author_name: string;
	author_type: 'bot' | 'system' | 'sys';
}): AddMessageResult => {
	return insertTicketMessage(
		{
			...data,
			visibility: MESSAGE_VISIBILITY.VISITOR_ONLY
		},
		false
	);
};

export const addTicketMessage = (data: {
	ticket_uuid: string;
	message: string;
	author_name: string;
	author_type: 'admin' | 'visitor' | 'bot' | 'system' | 'sys';
}): AddMessageResult => {
	return insertTicketMessage(
		{
			...data,
			visibility: MESSAGE_VISIBILITY.ALL
		},
		true
	);
};

// ============================================================================
// BAN MANAGEMENT FUNCTIONS
// ============================================================================

export interface BanUserData {
	author_uid: string;
	banned_by: string;
	ban_duration_days: number;
	reason?: string;
}

export type BanUserResult =
	| { success: true; ban: TicketBan; closedTicketCount: number; disconnectedCount: number }
	| { success: false; error: string };

export const banUserFromTickets = (data: BanUserData): BanUserResult => {
	try {
		// Validate duration (1-30 days)
		if (data.ban_duration_days < 1 || data.ban_duration_days > 30) {
			return {
				success: false,
				error: 'Ban duration must be between 1 and 30 days'
			};
		}

		// Check if user is already banned
		const existingBan = getUserActiveBan(data.author_uid);
		if (existingBan) {
			return {
				success: false,
				error: 'User is already banned'
			};
		}

		const uuid = crypto.randomUUID();
		const now = Date.now();
		const expiresAt = now + data.ban_duration_days * 24 * 60 * 60 * 1000;

		const ban: TicketBan = {
			uuid,
			author_uid: data.author_uid,
			banned_by: data.banned_by,
			ban_duration_days: data.ban_duration_days,
			banned_at: now,
			expires_at: expiresAt,
			reason: data.reason
		};

		insertTicketBanQuery.run(
			ban.uuid,
			ban.author_uid,
			ban.banned_by,
			ban.ban_duration_days,
			ban.banned_at,
			ban.expires_at,
			ban.reason || null
		);

		// Close all open tickets for the banned user
		const closedTicketCount = closeAllUserTickets(data.author_uid, data.banned_by);

		// Forcefully disconnect all connections for the banned user
		const disconnectedCount = disconnectConnectionsByUid(data.author_uid);

		// Notify admins about the ban
		notifyUserBanned(data.author_uid, data.banned_by, data.ban_duration_days, data.reason);

		return { success: true, ban, closedTicketCount, disconnectedCount };
	} catch (error) {
		console.error('Error banning user from tickets:', error);
		return { success: false, error: 'Failed to ban user' };
	}
};

export const getUserActiveBan = (author_uid: string): TicketBan | null => {
	try {
		const now = Date.now();
		const ban = getActiveBanQuery.get(author_uid, now);
		return ban || null;
	} catch (error) {
		console.error('Error getting user ban:', error);
		return null;
	}
};

export const isUserBanned = (author_uid: string): boolean => {
	return getUserActiveBan(author_uid) !== null;
};

export const removeBan = (ban_uuid: string, unbanned_by: string): boolean => {
	try {
		// Get the ban info before deleting it for notification
		const ban = getBanByUuidQuery.get(ban_uuid);

		const result = deleteBanQuery.run(ban_uuid);

		if (result.changes > 0 && ban) {
			// Notify admins about the unban
			notifyUserUnbanned(ban.author_uid, unbanned_by);
		}

		return result.changes > 0;
	} catch (error) {
		console.error('Error removing ban:', error);
		return false;
	}
};

export const closeAllUserTickets = (author_uid: string, admin_name: string): number => {
	try {
		// Get all open tickets for the user
		const openTickets = getUserOpenTicketsQuery.all(author_uid);
		let closedCount = 0;

		// Close each open ticket
		for (const ticket of openTickets) {
			const success = updateTicketStatus(ticket.uuid, 'closed', admin_name, true);
			if (success) {
				closedCount++;
			}
		}

		return closedCount;
	} catch (error) {
		console.error('Error closing user tickets:', error);
		return 0;
	}
};
