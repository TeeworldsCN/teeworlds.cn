/**
 * Skin name blocklist loaded from file
 * Skins matching these names will not be served
 */

import { readFileSync, existsSync, statSync, watch } from 'fs';
import { join } from 'path';

let BLOCKED_SKINS: readonly string[] = [];
let lastModified = 0;

const BLOCKLIST_PATH = join(process.cwd(), 'skin_blocklist.txt');

function loadBlocklist() {
	try {
		if (!existsSync(BLOCKLIST_PATH)) {
			BLOCKED_SKINS = [];
			return;
		}

		const stat = statSync(BLOCKLIST_PATH);
		if (stat.mtimeMs === lastModified) {
			return;
		}
		lastModified = stat.mtimeMs;

		const content = readFileSync(BLOCKLIST_PATH, 'utf-8');
		const skins = content
			.split('\n')
			.map((line) => line.trim().toLowerCase())
			.filter((line) => line.length > 0 && !line.startsWith('#'));

		BLOCKED_SKINS = skins;
		console.log(
			`[blocklist] Loaded ${BLOCKED_SKINS.length} blocked skins: ${BLOCKED_SKINS.join(', ')}`
		);
	} catch (e) {
		console.error('[blocklist] Failed to load blocklist:', e);
		BLOCKED_SKINS = [];
	}
}

// Load initial blocklist
loadBlocklist();

// Watch for file changes (only in non-test environments)
if (process.env.NODE_ENV !== 'test') {
	try {
		watch(BLOCKLIST_PATH, (eventType) => {
			if (eventType === 'change') {
				console.log('[blocklist] File changed, reloading...');
				loadBlocklist();
			}
		});
	} catch (e) {
		console.warn('[blocklist] Could not watch file for changes:', e);
	}
}

export type BlockedSkin = string;

/**
 * DDNet 的内置功能皮肤(`x_ninja`、`x_spec` …)。
 *
 * 它们在皮肤库里是合法条目(客户端资源),但**玩家不能拿它们当自己的皮肤**:
 * 谁都可以把名字改成 `x_ninja`,那样就能伪装成忍者/旁观皮肤,或者把内部资源
 * 当普通皮肤展示。所以只拦"玩家皮肤"这条路径,皮肤库本身照旧提供。
 */
export function isInternalSkin(name: string): boolean {
	return name.toLowerCase().startsWith('x_');
}

/**
 * Check if a skin name is blocked
 */
export function isSkinBlocked(name: string): boolean {
	return BLOCKED_SKINS.includes(name.toLowerCase());
}

/**
 * Get current blocklist
 */
export function getBlockedSkins(): readonly string[] {
	return BLOCKED_SKINS;
}
