import { sqlite } from '../sqlite';

// ============================================================================
// TABLE CREATION
// ============================================================================

// Create botreply table
sqlite
	.query(
		`CREATE TABLE IF NOT EXISTS botreply (
			uuid TEXT PRIMARY KEY,
			keyword TEXT NOT NULL,
			response TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		)`
	)
	.run();

// Create indexes for better performance
sqlite.query('CREATE INDEX IF NOT EXISTS botreply_keyword ON botreply (keyword);').run();

// ============================================================================
// PREPARED STATEMENTS
// ============================================================================

const insertBotReply = sqlite.prepare(`
	INSERT INTO botreply (uuid, keyword, response, created_at, updated_at)
	VALUES (?, ?, ?, ?, ?)
`);

const updateBotReply = sqlite.prepare(`
	UPDATE botreply 
	SET keyword = ?, response = ?, updated_at = ?
	WHERE uuid = ?
`);

const deleteBotReply = sqlite.prepare(`
	DELETE FROM botreply WHERE uuid = ?
`);

const getBotReplyByUuid = sqlite.prepare(`
	SELECT * FROM botreply WHERE uuid = ?
`);

const getAllBotReplies = sqlite.prepare(`
	SELECT * FROM botreply ORDER BY keyword ASC
`);

// ============================================================================
// INTERFACES
// ============================================================================

export interface BotReply {
	uuid: string;
	keyword: string;
	response: string;
	created_at: number;
	updated_at: number;
}

export interface CreateBotReplyData {
	keyword: string;
	response: string;
}

export interface UpdateBotReplyData {
	keyword: string;
	response: string;
}

// ============================================================================
// FUNCTIONS
// ============================================================================

/**
 * Create a new bot reply
 */
export function createBotReply(data: CreateBotReplyData): BotReply {
	const now = Date.now();
	const replyUuid = crypto.randomUUID();

	insertBotReply.run(replyUuid, data.keyword, data.response, now, now);

	return {
		uuid: replyUuid,
		keyword: data.keyword,
		response: data.response,
		created_at: now,
		updated_at: now
	};
}

/**
 * Update an existing bot reply
 */
export function updateBotReplyByUuid(uuid: string, data: UpdateBotReplyData): boolean {
	const now = Date.now();
	const result = updateBotReply.run(data.keyword, data.response, now, uuid);
	return result.changes > 0;
}

/**
 * Delete a bot reply
 */
export function deleteBotReplyByUuid(uuid: string): boolean {
	const result = deleteBotReply.run(uuid);
	return result.changes > 0;
}

/**
 * Get a bot reply by UUID
 */
export function getBotReply(uuid: string): BotReply | null {
	const result = getBotReplyByUuid.get(uuid) as BotReply | undefined;
	return result || null;
}

/**
 * Get all bot replies
 */
export function listBotReplies(): BotReply[] {
	return getAllBotReplies.all() as BotReply[];
}

/**
 * Search for a bot reply by keyword (case-insensitive partial match)
 * This function is used by the bot to find matching responses
 */
export function findBotReplyByMessage(message: string): BotReply | null {
	const allReplies = listBotReplies();

	// Convert message to lowercase for case-insensitive matching
	const lowerMessage = message.toLowerCase();

	// Find the first keyword that matches (contains the keyword)
	for (const reply of allReplies) {
		const lowerKeyword = reply.keyword.toLowerCase();
		if (lowerMessage.includes(lowerKeyword)) {
			return reply;
		}
	}

	return null;
}
