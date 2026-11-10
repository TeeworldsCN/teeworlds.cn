import { error, json } from '@sveltejs/kit';
import { getWatchableEntriesByUuid, type WatchablePartition } from '$lib/server/fetches/watchable';
import type { RequestHandler } from './$types';

/**
 * 按 uuid 查一场回放的记录(可选 `time` 用来在同一次完赛的多条记录里选一档)。
 *
 * 服务端已经缓存并索引了 watchable.jsonl(3.2 MB),所以播放器不用再把这个整文件
 * 拉进浏览器 —— 那正是这里要避免的流量。
 *
 * `invalid=1` 时查 `watchables.invalid`(kept 的历史回放),给 DDNet TV 的隐藏模式用。
 */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const uuid = url.searchParams.get('uuid');
	if (!uuid) return error(400, 'Missing uuid');

	const invalid = url.searchParams.get('invalid') === '1';
	const partition: WatchablePartition = invalid ? 'invalid' : 'runs';

	let entries;
	try {
		entries = await getWatchableEntriesByUuid(uuid, partition);
	} catch {
		return error(502, 'Upstream watchable list unavailable');
	}

	const wanted = url.searchParams.get('time');
	if (wanted !== null) {
		// 和上游播放器一致:0.005 秒容差,避免浮点/格式化差异把记录漏掉
		const target = parseFloat(wanted);
		entries = entries.filter((entry) => Math.abs(parseFloat(entry.time) - target) < 0.005);
	}

	// 上游清单只在索引重建时变,短时间内可以放心缓存
	setHeaders({ 'cache-control': 'public, max-age=60' });
	return json({ entries, invalid });
};
