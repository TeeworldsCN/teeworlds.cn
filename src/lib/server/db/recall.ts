import { sqlite } from '../sqlite';
import { persistent } from './kv';
import { matchKeyword, normalizeForMatch } from '../bots/utils/keyword';

// ============================================================================
// TABLE CREATION
// ============================================================================

// Keywords that trigger an automatic recall of the matching group message
sqlite
	.query(
		`CREATE TABLE IF NOT EXISTS recall_keyword (
			uuid TEXT PRIMARY KEY,
			keyword TEXT NOT NULL,
			enabled INTEGER NOT NULL DEFAULT 1,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		)`
	)
	.run();

sqlite
	.query('CREATE INDEX IF NOT EXISTS recall_keyword_keyword ON recall_keyword (keyword);')
	.run();

// Recent recalls, so admins can tell a broken setup (bot is not a group admin,
// message older than 2 minutes, ...) from "nothing matched".
sqlite
	.query(
		`CREATE TABLE IF NOT EXISTS recall_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			message_id TEXT NOT NULL,
			group_openid TEXT NOT NULL,
			user_openid TEXT NOT NULL,
			user_name TEXT NOT NULL DEFAULT '',
			keyword TEXT NOT NULL,
			content TEXT NOT NULL,
			success INTEGER NOT NULL,
			error TEXT,
			created_at INTEGER NOT NULL
		)`
	)
	.run();

sqlite.query('CREATE INDEX IF NOT EXISTS recall_log_created_at ON recall_log (created_at);').run();

// ============================================================================
// PREPARED STATEMENTS
// ============================================================================

const insertRecallKeyword = sqlite.prepare(`
	INSERT INTO recall_keyword (uuid, keyword, enabled, created_at, updated_at)
	VALUES (?, ?, ?, ?, ?)
`);

const updateRecallKeyword = sqlite.prepare(`
	UPDATE recall_keyword SET keyword = ?, enabled = ?, updated_at = ? WHERE uuid = ?
`);

const deleteRecallKeyword = sqlite.prepare(`
	DELETE FROM recall_keyword WHERE uuid = ?
`);

const getRecallKeywordByUuid = sqlite.prepare(`
	SELECT * FROM recall_keyword WHERE uuid = ?
`);

const getAllRecallKeywords = sqlite.prepare(`
	SELECT * FROM recall_keyword ORDER BY created_at ASC
`);

const getEnabledRecallKeywords = sqlite.prepare(`
	SELECT * FROM recall_keyword WHERE enabled = 1 ORDER BY created_at ASC
`);

const insertRecallLog = sqlite.prepare(`
	INSERT INTO recall_log (message_id, group_openid, user_openid, user_name, keyword, content, success, error, created_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const pruneRecallLog = sqlite.prepare(`
	DELETE FROM recall_log
	WHERE id NOT IN (SELECT id FROM recall_log ORDER BY id DESC LIMIT 200)
`);

const getRecallLogs = sqlite.prepare(`
	SELECT * FROM recall_log ORDER BY id DESC LIMIT ?
`);

const deleteRecallLogs = sqlite.prepare(`
	DELETE FROM recall_log
`);

// ============================================================================
// INTERFACES
// ============================================================================

export interface RecallKeyword {
	uuid: string;
	keyword: string;
	enabled: number;
	created_at: number;
	updated_at: number;
}

export interface CreateRecallKeywordData {
	keyword: string;
	enabled?: boolean;
}

export interface UpdateRecallKeywordData {
	keyword?: string;
	enabled?: boolean;
}

export interface RecallLog {
	id: number;
	message_id: string;
	group_openid: string;
	user_openid: string;
	user_name: string;
	keyword: string;
	content: string;
	success: number;
	error: string | null;
	created_at: number;
}

export interface AddRecallLogData {
	messageId: string;
	groupOpenid: string;
	userOpenid: string;
	userName?: string;
	keyword: string;
	content: string;
	success: boolean;
	error?: string;
}

// ============================================================================
// KEYWORDS
// ============================================================================

export function createRecallKeyword(data: CreateRecallKeywordData): RecallKeyword {
	const now = Date.now();
	const uuid = crypto.randomUUID();
	const enabled = data.enabled === false ? 0 : 1;

	insertRecallKeyword.run(uuid, data.keyword, enabled, now, now);

	return { uuid, keyword: data.keyword, enabled, created_at: now, updated_at: now };
}

export function updateRecallKeywordByUuid(uuid: string, data: UpdateRecallKeywordData): boolean {
	const current = getRecallKeywordByUuid.get(uuid) as RecallKeyword | undefined;
	if (!current) return false;

	const result = updateRecallKeyword.run(
		data.keyword ?? current.keyword,
		data.enabled === undefined ? current.enabled : data.enabled ? 1 : 0,
		Date.now(),
		uuid
	);
	return result.changes > 0;
}

export function deleteRecallKeywordByUuid(uuid: string): boolean {
	const result = deleteRecallKeyword.run(uuid);
	return result.changes > 0;
}

export function getRecallKeyword(uuid: string): RecallKeyword | null {
	return (getRecallKeywordByUuid.get(uuid) as RecallKeyword | undefined) ?? null;
}

export function listRecallKeywords(): RecallKeyword[] {
	return getAllRecallKeywords.all() as RecallKeyword[];
}

/** Whether the same keyword (after normalization) is already configured */
export function hasRecallKeyword(keyword: string, excludeUuid?: string): boolean {
	const needle = normalizeForMatch(keyword);
	if (!needle) return false;

	return listRecallKeywords().some(
		(item) => item.uuid !== excludeUuid && normalizeForMatch(item.keyword) === needle
	);
}

/** Find the enabled keyword contained in a message, if any */
export function findRecallKeyword(message: string): RecallKeyword | null {
	const keywords = getEnabledRecallKeywords.all() as RecallKeyword[];
	return matchKeyword(keywords, message);
}

// ============================================================================
// GLOBAL SWITCH
// ============================================================================

export const AUTO_RECALL_ENABLED_KEY = 'qq:auto-recall-enabled';

/** The feature is on by default; the switch only exists to pause it quickly */
export function isAutoRecallEnabled(): boolean {
	return persistent.get<boolean>(AUTO_RECALL_ENABLED_KEY) !== false;
}

export function setAutoRecallEnabled(enabled: boolean): void {
	persistent.set(AUTO_RECALL_ENABLED_KEY, enabled);
}

// ============================================================================
// LOGS
// ============================================================================

export function addRecallLog(data: AddRecallLogData): void {
	insertRecallLog.run(
		data.messageId,
		data.groupOpenid,
		data.userOpenid,
		data.userName ?? '',
		data.keyword,
		data.content,
		data.success ? 1 : 0,
		data.error ?? null,
		Date.now()
	);
	pruneRecallLog.run();
}

export function listRecallLogs(limit = 50): RecallLog[] {
	return getRecallLogs.all(limit) as RecallLog[];
}

export function clearRecallLogs(): void {
	deleteRecallLogs.run();
}
