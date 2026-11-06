import { FetchCache } from '../fetch-cache';

/**
 * ddnet.org/watch/watchable.jsonl 里的一条记录。
 *
 * 字段和上游保持一致(`time` 是字符串、时间戳叫 `ts`),因为这份数据同时被
 * `/ddnet/watch` 播放器接口直接返回给前端,少一层改名就少一处不一致。
 */
export type WatchableEntry = {
	uuid: string;
	map: string;
	/** 完赛时间,秒。上游是字符串,比如 "280.78" */
	time: string;
	/** 完赛时间戳,秒 */
	ts: number;
	/** 'solo' | 'team'。同一次完赛会同时出现 solo 和 team 两种视角的记录 */
	kind: string;
	/** 名次 */
	rank: number;
	/** 这次回放里应该跟随机位的客户端 id(转出来的 demo 没有"本机玩家") */
	cid: number;
	names: string[];
	finishers: number[];
	/** 预生成好的 demo 文件名 */
	demo: string;
	/** demo 对应的客户端版本号,用来给 URL 打版本、做缓存失效 */
	rev: string;
};

/** 地图名(小写)→ 这张图的回放,按上游顺序 */
export type WatchableIndex = Record<string, WatchableEntry[]>;

const createWatchable = () =>
	new FetchCache<WatchableIndex>(
		'https://ddnet.org/watch/watchable.jsonl',
		async (response) => {
			const text = await response.text();
			const index: WatchableIndex = {};

			for (const line of text.split('\n')) {
				// 上游这个是 JSONL:一行一条,末尾可能有空行
				if (!line) continue;
				let raw: Record<string, unknown>;
				try {
					raw = JSON.parse(line);
				} catch {
					// 坏行/半行跳过,不要因为一行挂掉整份索引
					continue;
				}
				// status != ok 的是转换失败的历史记录,没有 demo 可用
				if (raw.status !== 'ok' || typeof raw.demo !== 'string' || !raw.demo) continue;
				if (typeof raw.map !== 'string' || typeof raw.uuid !== 'string') continue;

				const entry: WatchableEntry = {
					uuid: raw.uuid,
					map: raw.map,
					time: String(raw.time ?? ''),
					ts: Number(raw.ts ?? 0),
					kind: String(raw.kind ?? 'solo'),
					rank: Number(raw.rank ?? 0),
					cid: Number(raw.cid ?? 0),
					names: Array.isArray(raw.names) ? raw.names.map(String) : [],
					finishers: Array.isArray(raw.finishers) ? raw.finishers.map(Number) : [],
					demo: raw.demo,
					rev: String(raw.rev ?? '')
				};

				// 地图名按小写归档,查询时不用关心大小写
				const key = entry.map.toLowerCase();
				(index[key] ??= []).push(entry);
			}

			return index;
		},
		{
			// JSONL 全量 3.2 MB,每张图都要看,不缓存到磁盘就等于每次冷启动再拉一遍。
			// 上游每分钟级更新,HEAD 的请求频率控制在这里。
			minQueryInterval: 300,
			version: 1
		}
	);

export const watchable = createWatchable();

type Memo = {
	timestamp: number;
	index: WatchableIndex;
	byUuid: Map<string, WatchableEntry[]>;
};

/**
 * 解析后的索引,换缓存时重建一次。
 *
 * `fetchCache()` 每次都会把 2.4 MB 的 JSON 重新 parse 一遍,而这个查询在地图详情页
 * 每次 SSR 都要走一次。所以留着上一次的结果,只有上游真的更新(timestamp 变了)
 * 才重建 —— parse 只发生在上游变更时。
 *
 * `MEMO_TTL` 是另一层:光看 timestamp 的话,每次请求还是要把 2.4 MB 从 sqlite 读出来
 * 才能知道有没有变。留个短 TTL,等于把"读缓存 + 比对"也省掉。上限比上游检查间隔
 * (`minQueryInterval` 300 秒)短得多,所以不会因此变旧。
 */
const MEMO_TTL = 60_000;
let memo: Memo | null = null;
let memoAt = 0;

const load = async (): Promise<Memo> => {
	const now = Date.now();
	if (memo && now - memoAt < MEMO_TTL) return memo;

	const { result, timestamp } = await watchable.fetchAsString();
	if (memo && memo.timestamp === timestamp) {
		memoAt = now;
		return memo;
	}

	const index = JSON.parse(result) as WatchableIndex;
	// 按 uuid 的索引只放在内存里(不写进缓存,省 1/3 的体积):它只服务单条查询。
	const byUuid = new Map<string, WatchableEntry[]>();
	for (const entries of Object.values(index)) {
		for (const entry of entries) {
			const list = byUuid.get(entry.uuid);
			if (list) list.push(entry);
			else byUuid.set(entry.uuid, [entry]);
		}
	}

	memo = { timestamp, index, byUuid };
	memoAt = now;
	return memo;
};

/**
 * 某个 uuid 的所有记录。
 *
 * 同一次完赛在 watchable.jsonl 里会出现多条:team 视角一条 + 每个完成者各一条 solo
 * 视角(时间和 uuid 都一样,只有 `cid`/`names` 不同)。播放器需要按 `time` 再挑一次。
 */
export const getWatchableEntriesByUuid = async (uuid: string): Promise<WatchableEntry[]> => {
	const { byUuid } = await load();
	return byUuid.get(uuid) ?? [];
};

/** 预热:把清单拉下来、索引建好,别让第一个访客替我们等 */
export const warmWatchable = async (): Promise<void> => {
	await load();
};

/** 某张地图的所有回放;地图名大小写不敏感,查不到就是查不到 */
export const getWatchableEntriesByMap = async (mapName: string): Promise<WatchableEntry[]> => {
	const { index } = await load();
	return index[mapName.toLowerCase()] ?? [];
};

/** 官方名次里的一档,按优先级排好(第一名先) */
export type RankCandidate = {
	time: number;
	players: string[];
	/** 'solo' | 'team' */
	kind: string;
	rank: number;
};

/**
 * 把官方名次和 watchable.jsonl 里的回放对上。
 *
 * 不能简单取时间最短的:`watchable.jsonl` 里混着旧版本地图、非官方服务器的记录,
 * 比如 AiP-Gores 里最快的是一条 58.38 秒的 `rank 32`,而官方团队第一是 97.34 秒。
 * 按最短时间选会给出一个不对劲的"世界纪录"。
 *
 * 所以拿地图页正在展示的官方名次去对:时间对得上(0.02 秒容差)、玩家名对得上。
 * 名次数据出于同一套数据库,名字和成绩应该完全一致,只有时间戳带时区偏移,
 * 所以只比 `time` 和 `players`,不比 `timestamp`。
 *
 * @param entries 这张图的所有回放
 * @param candidates 按优先级排好的官方名次(第一名的团队、个人各一条,然后第二名…)
 */
export const matchRankedRecord = (
	entries: WatchableEntry[],
	candidates: RankCandidate[]
): { entry: WatchableEntry; candidate: RankCandidate } | null => {
	for (const candidate of candidates) {
		if (!candidate.players.length || !Number.isFinite(candidate.time)) continue;
		// 这次完赛在清单里有多条视角:team 一条 + 每个完成者各一条 solo
		const sameRun = entries.filter(
			(entry) =>
				Math.abs(parseFloat(entry.time) - candidate.time) < 0.02 &&
				candidate.players.every((player) =>
					entry.names.some((name) => name.toLowerCase() === player.toLowerCase())
				)
		);
		if (!sameRun.length) continue;

		// team 视角带着完整的完成者列表,播放器靠它把队友也画出来,优先用
		const entry = sameRun.find((item) => item.kind === 'team') ?? sameRun[0];
		return { entry, candidate };
	}
	return null;
};
