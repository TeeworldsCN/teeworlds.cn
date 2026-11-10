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
	/**
	 * 上游标记的「名次已经不存在」的 demo(成绩被删/玩家改名后旧名字不再持有名次)。
	 * 这些记录不进 `watchables.runs`,而是单独放在 `watchables.invalid` 里。
	 */
	kept: boolean;
};

/** 地图名(小写)→ 这张图的回放,按上游顺序 */
export type WatchableIndex = Record<string, WatchableEntry[]>;

/**
 * 清单的两个分区:
 * - `runs`    正常的、官方名次里还能查到的回放(地图页 / 玩家页 / bot 用的)
 * - `invalid` `kept: true` 的历史回放(名次已经不在,但 demo 文件还在)
 *
 * 两个分区来自同一个 watchable.jsonl,但分别落在两个缓存 key 上,
 * 平时只读 runs,只有 DDNet TV 的 `?invalid=1` 才会去碰 invalid。
 */
export type WatchablePartition = 'runs' | 'invalid';

export const WATCHABLE_PARTITIONS: WatchablePartition[] = ['runs', 'invalid'];

const SOURCE = 'https://ddnet.org/watch/watchable.jsonl';

const createWatchable = (partition: WatchablePartition) =>
	new FetchCache<WatchableIndex>(
		SOURCE,
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

				// `kept` 是上游保留下来的「名次已经不存在」的 demo:成绩因作弊等被删,
				// 或者玩家改名后旧名字不再持有这条名次,本地 demo 文件还会留着,清单里就标
				// `kept: true`。例子:Kobra 的两条 176.96 团队第一名([D] 秋落 / [D] пендос)
				// 在 watchable.jsonl 里是 kept,但地图详情页的官方名次里根本没有它们。
				// 这些记录如果混在普通清单里,地图页 / bot 会给出指向「已删除记录」的链接。
				// 所以分成 runs / invalid 两份:普通查询只看 runs,DDNet TV 的隐藏模式看 invalid。
				const kept = raw.kept === true;
				if (kept !== (partition === 'invalid')) continue;

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
					rev: String(raw.rev ?? ''),
					kept
				};

				// 地图名按小写归档,查询时不用关心大小写
				const key = entry.map.toLowerCase();
				(index[key] ??= []).push(entry);
			}

			return index;
		},
		{
			// 两个分区共用一个上游 url,但各自写一个 key,普通查询不用把 invalid 也读出来。
			key: `watchables.${partition}`,
			// JSONL 全量 3.2 MB,每张图都要看,不缓存到磁盘就等于每次冷启动再拉一遍。
			// 上游每分钟级更新,HEAD 的请求频率控制在这里。
			minQueryInterval: 300,
			// 分区缓存的第一版(旧的未分区缓存留在 sqlite 里,不再使用)
			version: 1
		}
	);

/** 两个分区各一个缓存;invalid 只有在真的查它时才会发请求/写磁盘 */
const watchableCaches: Record<WatchablePartition, FetchCache<WatchableIndex>> = {
	runs: createWatchable('runs'),
	invalid: createWatchable('invalid')
};

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
 *
 * 两个分区各自 memo,互不影响:普通地图页永远不用等 invalid 的解析。
 */
const MEMO_TTL = 60_000;
const memos: Record<WatchablePartition, Memo | null> = { runs: null, invalid: null };
const memoAts: Record<WatchablePartition, number> = { runs: 0, invalid: 0 };

const load = async (partition: WatchablePartition = 'runs'): Promise<Memo> => {
	const now = Date.now();
	const memo = memos[partition];
	if (memo && now - memoAts[partition] < MEMO_TTL) return memo;

	const { result, timestamp } = await watchableCaches[partition].fetchAsString();
	if (memo && memo.timestamp === timestamp) {
		memoAts[partition] = now;
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

	const next: Memo = { timestamp, index, byUuid };
	memos[partition] = next;
	memoAts[partition] = now;
	return next;
};

/**
 * 某个 uuid 的所有记录(默认只看 runs 分区)。
 *
 * 同一次完赛在 watchable.jsonl 里会出现多条:team 视角一条 + 每个完成者各一条 solo
 * 视角(时间和 uuid 都一样,只有 `cid`/`names` 不同)。播放器需要按 `time` 再挑一次。
 */
export const getWatchableEntriesByUuid = async (
	uuid: string,
	partition: WatchablePartition = 'runs'
): Promise<WatchableEntry[]> => {
	const { byUuid } = await load(partition);
	return byUuid.get(uuid) ?? [];
};

/** 预热:把清单拉下来、索引建好,别让第一个访客替我们等。默认只预热 runs */
export const warmWatchable = async (partition: WatchablePartition = 'runs'): Promise<void> => {
	await load(partition);
};

/** 某张地图的所有回放;地图名大小写不敏感,查不到就是查不到 */
export const getWatchableEntriesByMap = async (
	mapName: string,
	partition: WatchablePartition = 'runs'
): Promise<WatchableEntry[]> => {
	const { index } = await load(partition);
	return index[mapName.toLowerCase()] ?? [];
};

/** 同一档成绩的浮点比较精度(上游时间是两位小数的字符串) */
const runSecond = (time: string) => Math.round(parseFloat(time) * 100) / 100;

/**
 * 给 DDNet TV 用的「一场回放一行」列表。
 *
 * 上游对同一次完赛会写 team 一条 + 每个完成者各一条 solo,这些行的 demo 文件
 * 往往是同一个;另外还有个别人自己单独转了一份 demo 的 solo 记录。
 * 规则:
 * 1. 只要个人记录被同一张图、同一完赛时间的团队记录包含(玩家名在团队名单里),
 *    就直接剔掉 —— 团队记录已经能看到全队,单独再列一次只是重复。
 * 2. 剩下的按 demo 文件去重(同一个 demo 只上一张卡),团队视角优先。
 * 3. 按完赛时间戳倒序(最新在前),方便当「电视」列表翻。
 */
const dedupeWatchable = (entries: WatchableEntry[]): WatchableEntry[] => {
	/** (地图, 完赛时间) → 这一档团队记录的完成者 */
	const teamPlayers = new Map<string, Set<string>>();
	const runKey = (entry: WatchableEntry) => `${entry.map.toLowerCase()}|${runSecond(entry.time)}`;
	for (const entry of entries) {
		if (entry.kind !== 'team') continue;
		const key = runKey(entry);
		let names = teamPlayers.get(key);
		if (!names) teamPlayers.set(key, (names = new Set()));
		for (const name of entry.names) names.add(name.toLowerCase());
	}

	const contained = (entry: WatchableEntry) =>
		entry.kind !== 'team' &&
		entry.names.length > 0 &&
		entry.names.every((name) => teamPlayers.get(runKey(entry))?.has(name.toLowerCase()));

	const byDemo = new Map<string, WatchableEntry>();
	for (const entry of entries) {
		if (contained(entry)) continue;
		const existing = byDemo.get(entry.demo);
		if (!existing || (existing.kind !== 'team' && entry.kind === 'team')) {
			byDemo.set(entry.demo, entry);
		}
	}

	return [...byDemo.values()].sort(
		(a, b) =>
			b.ts - a.ts ||
			a.map.localeCompare(b.map) ||
			parseFloat(a.time) - parseFloat(b.time) ||
			a.uuid.localeCompare(b.uuid)
	);
};

/** 每个分区的一份去重排序缓存,跟索引一起按上游 timestamp 失效 */
const tvMemos: Record<WatchablePartition, { timestamp: number; items: WatchableEntry[] } | null> = {
	runs: null,
	invalid: null
};

/**
 * DDNet TV 的完整列表(已去重、已排序)。
 *
 * 上游一份清单几十分钟才动一次,这里和索引 memo 一样按 timestamp 复用;
 * 三千多场回放的过滤 + 排序只有在上游真的更新后才做一次。
 */
export const getWatchableTvDemos = async (
	partition: WatchablePartition = 'runs'
): Promise<WatchableEntry[]> => {
	const { timestamp, index } = await load(partition);
	const memo = tvMemos[partition];
	if (memo && memo.timestamp === timestamp) return memo.items;

	const items = dedupeWatchable(Object.values(index).flat());
	tvMemos[partition] = { timestamp, items };
	return items;
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

		// 优先和名次同视角(个人榜给 solo,团队榜给 team);team 视角带着完整的
		// 完成者列表,播放器靠它把队友也画出来,同视角找不到时优先它
		const entry =
			sameRun.find((item) => item.kind === candidate.kind) ??
			sameRun.find((item) => item.kind === 'team') ??
			sameRun[0];
		return { entry, candidate };
	}
	return null;
};

/** 页面上要用的一条可播录像 */
export type PlayerDemo = {
	uuid: string;
	/** 完赛时间,秒 */
	time: number;
	/** 'team' | 'solo' */
	kind: string;
	/** 过图的人(团队就是整队) */
	names: string[];
};

/**
 * 某个玩家在某张图上的可播录像。
 *
 * 先按成绩时间对(0.02 秒容差,和地图详情页那套一致),对不上就退一步取他在这张图上
 * 最快的一条 —— 页面上写的是"这个玩家的回放",不承诺正好是那一档。
 */
export const findPlayerDemo = async (
	mapName: string,
	player: string,
	times: (number | null | undefined)[],
	/** 优先取这一种视角('team' | 'solo'):个人记录用 solo,团队记录用 team */
	kind?: string
): Promise<PlayerDemo | null> => {
	const entries = await getWatchableEntriesByMap(mapName);
	if (!entries.length) return null;

	const lower = player.toLowerCase();
	const mine = entries.filter((entry) => entry.names.some((name) => name.toLowerCase() === lower));
	if (!mine.length) return null;

	// 和这条记录同视角的优先;没有(比如 solo 视角还没生成)再退回该玩家的任意记录
	const preferred = kind ? mine.filter((entry) => entry.kind === kind) : [];
	const seconds = (entry: WatchableEntry) => parseFloat(entry.time);
	const byTime = (list: WatchableEntry[], time: number) =>
		list.find((entry) => Math.abs(seconds(entry) - time) < 0.02);

	for (const time of times) {
		if (typeof time !== 'number' || !Number.isFinite(time)) continue;
		const hit = byTime(preferred, time) ?? byTime(mine, time);
		if (hit) return { uuid: hit.uuid, time: seconds(hit), kind: hit.kind, names: hit.names };
	}

	const fastestOf = (list: WatchableEntry[]) =>
		list.reduce<WatchableEntry | null>(
			(best, entry) => (!best || seconds(entry) < seconds(best) ? entry : best),
			null
		);
	const fastest = fastestOf(preferred) ?? fastestOf(mine);
	if (!fastest) return null;
	return { uuid: fastest.uuid, time: seconds(fastest), kind: fastest.kind, names: fastest.names };
};

/**
 * 一张图「最值得看」的那条录像,**团队优先**:有团队纪录就取最快的团队,
 * 没有团队才有个人。团队图本来就该给人看团队的那一档。
 */
export const findMapDemo = async (mapName: string): Promise<PlayerDemo | null> => {
	const entries = await getWatchableEntriesByMap(mapName);
	if (!entries.length) return null;

	const fastest = (kind: string) =>
		entries
			.filter((entry) => entry.kind === kind)
			.reduce<WatchableEntry | null>(
				(best, entry) => (!best || parseFloat(entry.time) < parseFloat(best.time) ? entry : best),
				null
			);

	const pick = fastest('team') ?? fastest('solo');
	if (!pick) return null;
	return { uuid: pick.uuid, time: parseFloat(pick.time), kind: pick.kind, names: pick.names };
};

/** 玩家最新的一条回放(带地图名,给豆豆的「最新回放」链接用) */
export type LatestPlayerDemo = PlayerDemo & {
	/** 地图名 */
	map: string;
};

/**
 * 某个玩家在 watchable 清单里最新的一条回放(按完赛时间戳)。
 *
 * 同一场完赛会有 team 一条 + 每个完成者各一条 solo,时间戳完全一样;
 * 这里优先取本人那条 solo(镜头跟着自己,默认也不开团队视角),
 * 没有 solo 视角(比如只转了团队)才用 team。
 */
export const findPlayerLatestDemo = async (player: string): Promise<LatestPlayerDemo | null> => {
	const lower = player.toLowerCase();
	const { index } = await load();

	const ownSolo = (entry: WatchableEntry) =>
		entry.kind === 'solo' && entry.names.length === 1 && entry.names[0].toLowerCase() === lower;

	let latest: WatchableEntry | null = null;
	for (const entries of Object.values(index)) {
		for (const entry of entries) {
			if (!entry.names.some((name) => name.toLowerCase() === lower)) continue;
			if (
				!latest ||
				entry.ts > latest.ts ||
				// 同一场完赛的多条记录:本人 solo 优先,其余保持先到的那条
				(entry.ts === latest.ts && ownSolo(entry) && !ownSolo(latest))
			) {
				latest = entry;
			}
		}
	}

	if (!latest) return null;
	return {
		map: latest.map,
		uuid: latest.uuid,
		time: parseFloat(latest.time),
		kind: latest.kind,
		names: latest.names
	};
};
