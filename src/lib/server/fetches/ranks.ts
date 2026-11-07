import { unescapeHTML } from '$lib/helpers';
import { convert } from '$lib/server/imgproxy';
import { FetchCache } from '$lib/server/fetch-cache';

interface PointInfo {
	rank: number;
	points: number;
	region?: string;
	name: string;
}

interface FinishInfo {
	timestamp: number;
	region?: string;
	type: string;
	map: string;
	name: string;
	time: number;
}

/** 官方排位页地图卡片里的名次(团队或个人的前 10) */
export interface MapRecord {
	rank: number;
	/** 精确用时,来自行的 title,如 "02:44.90" */
	time: string;
	/** 上面的用时换算成秒 */
	seconds: number | null;
	/** 完成时间,来自行的 title,如 "2026-01-15 13:10" */
	date: string;
	region?: string;
	/** 完成者(团队就是整队) */
	names: string[];
	/** 官方页面挂了 /watch 链接时才有 */
	replay?: { uuid: string };
}

/**
 * 官方排位页下方的一张地图卡片。
 *
 * 这些数据(尤其是按地区过滤后的完成次数 / 中位时间 / 队伍数)在
 * ddnet.org/maps 的 JSON 里拿不到,只能从排位页 HTML 里解析。
 */
export interface MapCard {
	name: string;
	mapper: string;
	/** 发布日,如 "2026-01-10"(老图可能没有) */
	release: string;
	/** 难度星数 */
	difficulty: number;
	points: number;
	/** 官方截图(已换成我们自己的图片代理) */
	thumbnail: string;
	/** 图块名,对应 /ddnet/tiles/<name>.png(服务端反代 ddnet.org) */
	tiles: string[];
	/** 当前页面(地区/类型)下的完成人数 */
	finishes: number;
	/** 中位完成时间,如 "09:45.84" */
	median_time: string;
	/** 完成的队伍数 */
	teams: number;
	biggest_team: number;
	/** 官方分节:New Maps / Easy Maps / Selected Maps ... */
	section: string;
	team_records: MapRecord[];
	records: MapRecord[];
}

export interface RankInfo {
	ranks: {
		points: PointInfo[];
		team: PointInfo[];
		rank: PointInfo[];
		yearly: PointInfo[];
		monthly: PointInfo[];
		weekly: PointInfo[];
	};
	/** 该页面实际存在的排行（有些地图类型服没有团队排行等） */
	ladders: (keyof RankInfo['ranks'])[];
	/** 页面下方的地图卡片(含该地区/类型下的名次) */
	maps: MapCard[];
	/** 当前是官方排位页的第几页(地图分页,排行榜始终取第 1 页) */
	page: number;
	/** 官方排位页总页数 */
	page_count: number;
	last_finishes: FinishInfo[];
	total_points: number;
	update_time: number;
}

class LadderHandler implements HTMLRewriterTypes.HTMLRewriterElementContentHandlers {
	private data: RankInfo;
	private context: {
		type: string;
		ladder: keyof RankInfo['ranks'] | null;
		rank: PointInfo;
	} = { type: '', ladder: null, rank: { rank: 0, points: 0, region: '', name: '' } };

	constructor(data: RankInfo) {
		this.data = data;
	}

	async element(element: HTMLRewriterTypes.Element) {
		if (element.tagName === 'h3') {
			// find ladder
			this.context.type = 'ladder';
		} else if (element.tagName === 'tr') {
			// if previous rank is valid, push it (since we don't have onEndTag which leaks memory in Bun)
			if (this.context.rank.name && this.context.ladder) {
				this.data.ranks[this.context.ladder].push(this.context.rank);
			}
			this.context.rank = { rank: 0, points: 0, region: '', name: '' };
		} else if (element.tagName === 'td') {
			// extract info
			const className = element.getAttribute('class');
			if (className === 'rankglobal') {
				this.context.type = 'rank';
			} else if (className === 'points') {
				this.context.type = 'points';
			} else if (!element.hasAttribute('class')) {
				this.context.type = 'name';
			}
		} else if (element.tagName === 'img') {
			this.context.rank.region = element.getAttribute('alt') || 'UNK';
		}
	}
	async text(text: HTMLRewriterTypes.Text) {
		if (this.context.type === 'ladder') {
			if (this.context.rank.name && this.context.ladder) {
				this.data.ranks[this.context.ladder].push(this.context.rank);
			}
			this.context.rank = { rank: 0, points: 0, region: '', name: '' };

			const ladderName = text.text.trim();
			let ladder: keyof RankInfo['ranks'] | null = null;
			if (ladderName.match(/Points \([0-9]+ total\)/)) {
				ladder = 'points';
				this.data.total_points = parseInt(ladderName.slice(8, -1));
			} else if (ladderName === 'Points (past 365 days)') {
				ladder = 'yearly';
			} else if (ladderName === 'Points (past 30 days)') {
				ladder = 'monthly';
			} else if (ladderName === 'Points (past 7 days)') {
				ladder = 'weekly';
			} else if (ladderName === 'Team Rank') {
				ladder = 'team';
			} else if (ladderName === 'Rank') {
				ladder = 'rank';
			}
			this.context.ladder = ladder;
			if (ladder && !this.data.ladders.includes(ladder)) {
				this.data.ladders.push(ladder);
			}
		} else if (this.context.type === 'rank') {
			this.context.rank.rank = parseInt(text.text);
		} else if (this.context.type === 'points') {
			this.context.rank.points = parseInt(text.text);
		} else if (this.context.type === 'name') {
			this.context.rank.name = unescapeHTML(text.text);
		}
		this.context.type = '';
	}

	finialize() {
		if (this.context.rank.name && this.context.ladder) {
			this.data.ranks[this.context.ladder].push(this.context.rank);
		}
		this.context.rank = { rank: 0, points: 0, region: '', name: '' };
	}
}

class UpdateTimeHandler implements HTMLRewriterTypes.HTMLRewriterElementContentHandlers {
	private data: RankInfo;

	constructor(data: RankInfo) {
		this.data = data;
	}

	async element(element: HTMLRewriterTypes.Element) {
		if (element.tagName === 'span') {
			let timeDate = element.getAttribute('data-date');
			if (timeDate) {
				timeDate = timeDate.replace(' ', 'T') + '+01:00';
			}

			this.data.update_time = new Date(timeDate || 0).getTime() / 1000;
		}
	}
}

/** "02:44.90" / "1:05:22.10" → 秒 */
const timeToSeconds = (value: string) => {
	const parts = value.split(':').map((part) => parseFloat(part));
	if (!parts.length || parts.some((part) => !Number.isFinite(part))) return null;
	return parts.reduce((total, part) => total * 60 + part, 0);
};

const parseRecords = (tableHtml: string): MapRecord[] => {
	const records: MapRecord[] = [];
	for (const row of tableHtml.matchAll(/<tr(?: title="([^"]*)")?>([\s\S]*?)<\/tr>/g)) {
		const [time, date] = (row[1] ?? '').split(',').map((part) => part.trim());
		const rowHtml = row[2];
		const names = [...rowHtml.matchAll(/<a href="\/players\/[^"]*">([\s\S]*?)<\/a>/g)].map(
			(match) => unescapeHTML(match[1]).trim()
		);
		if (!names.length) continue;

		// 官方只有部分记录挂了 /watch 链接(有的带 time,有的不带)
		const replay = rowHtml.match(/\/watch\/\?uuid=([^"&]+)/);
		records.push({
			rank: parseInt(rowHtml.match(/<td class="rank">(\d+)\./)?.[1] ?? '0'),
			time: time || '',
			seconds: time ? timeToSeconds(time) : null,
			date: date || '',
			region: rowHtml.match(/<td class="flag"><img[^>]*alt="([A-Z]+)"/)?.[1],
			names,
			replay: replay ? { uuid: replay[1] } : undefined
		});
	}
	return records;
};

/**
 * 从排位页 HTML 下半部分解析地图卡片。
 *
 * 这些卡片是和排行榜同一份 HTML,所以不需要额外请求/缓存 —— 跟着排行页的
 * FetchCache 一起更新。卡片里的完成次数、中位时间、队伍数、名次都是按当前
 * 地区/类型过滤过的,ddnet.org/maps 的 JSON 里没有这些。
 */
const parseMapCards = (html: string): MapCard[] => {
	// 按顺序扫「分节标题」和「地图卡片起点」,把它们之间的 HTML 切出来
	const tokens =
		/<div class="longblock div-ranks"><h2[^>]*>([^<]*)<\/h2>|<div class="block2 info" id="map-([^"]+)">/g;
	const blocks: { section: string; html: string }[] = [];
	let section = '';
	let current: { section: string; start: number } | null = null;
	for (const match of html.matchAll(tokens)) {
		if (current) {
			blocks.push({ section: current.section, html: html.slice(current.start, match.index) });
			current = null;
		}
		if (match[1] !== undefined) {
			section = unescapeHTML(match[1]).trim();
		} else {
			current = { section, start: match.index };
		}
	}
	if (current) {
		blocks.push({ section: current.section, html: html.slice(current.start) });
	}

	const cards: MapCard[] = [];
	for (const block of blocks) {
		const name = block.html.match(/<h3 class="inline"><a [^>]*><span[^>]*>([\s\S]*?)<\/span>/)?.[1];
		if (!name) continue;

		const mapperHtml =
			block.html.match(/<p class="inline"><strong>([\s\S]*?)<\/strong><\/p>/)?.[1] ?? '';
		const mapper = [...mapperHtml.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)]
			.map((match) => unescapeHTML(match[1]).trim())
			.join(' & ');

		const infoHtml = block.html.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? '';
		const difficulty = infoHtml.match(/Difficulty:\s*([★✰]+),\s*Points:\s*(\d+)/);
		const finishes = infoHtml.match(/([\d,]+)\s+tees finished(?:\s*\(median time:\s*([\d:.]+)\))?/);
		const teams = infoHtml.match(/([\d,]+)\s+teams finished(?:\s*\(biggest team:\s*(\d+)\))?/);
		const teamHtml =
			block.html.match(/<div class="block2 teamrecords">([\s\S]*?)<\/table>\s*<\/div>/)?.[1] ?? '';
		const recordsHtml =
			block.html.match(/<div class="block2 records">([\s\S]*?)<\/table>\s*<\/div>/)?.[1] ?? '';

		cards.push({
			name: unescapeHTML(name).trim(),
			mapper,
			release: infoHtml.match(/Released:\s*([^<]+)/)?.[1]?.trim() ?? '',
			difficulty: (difficulty?.[1].match(/★/g) ?? []).length,
			points: parseInt(difficulty?.[2] ?? '0'),
			thumbnail: infoHtml.match(/<img class="screenshot"[^>]*src="([^"]+)"/)?.[1] ?? '',
			tiles: [...infoHtml.matchAll(/<img[^>]*src="\/tiles\/([^"]+)\.png"/g)].map(
				(match) => match[1]
			),
			finishes: parseInt((finishes?.[1] ?? '0').replace(/,/g, '')),
			median_time: finishes?.[2] ?? '',
			teams: parseInt((teams?.[1] ?? '0').replace(/,/g, '')),
			biggest_team: parseInt(teams?.[2] ?? '0'),
			section: block.section,
			team_records: parseRecords(teamHtml),
			records: parseRecords(recordsHtml)
		});
	}
	return cards;
};

const createRankInfo = (): RankInfo => ({
	ranks: {
		points: [],
		team: [],
		rank: [],
		yearly: [],
		monthly: [],
		weekly: []
	},
	ladders: [],
	maps: [],
	page: 1,
	page_count: 1,
	last_finishes: [],
	total_points: 0,
	update_time: 0
});

/**
 * 解析一个排位页面。
 *
 * @param allRows true 时把隐藏的 Top 500 行也收进来(地区/类型页),方便搜玩家是否进前 500;
 *                false 只留每榜前 10(全球总榜,数据量太大)。
 */
const parseRankPage = async (response: Response, allRows: boolean): Promise<RankInfo> => {
	const ranks = createRankInfo();
	const html = await response.text();

	const handler = new LadderHandler(ranks);
	new HTMLRewriter()
		.on(
			[
				'div[class="block2 ladder"] > h3',
				allRows
					? 'div[class="block2 ladder"] > table > tr'
					: 'div[class="block2 ladder"] > table > tr:not([class="allPoints"])',
				allRows
					? 'div[class="block2 ladder"] > table > tr > td'
					: 'div[class="block2 ladder"] > table > tr:not([class="allPoints"]) > td',
				allRows
					? 'div[class="block2 ladder"] > table > tr > td > img'
					: 'div[class="block2 ladder"] > table > tr:not([class="allPoints"]) > td > img'
			].join(','),
			handler
		)
		.on('p[class="toggle"] > span[data-type="date"]', new UpdateTimeHandler(ranks))
		.transform(html);

	handler.finialize();

	// 标题里的 (1/7) 是官方地图分页;没有的话就只有 1 页
	const pager = html.match(/<h2[^>]*>[^<]*\((\d+)\/(\d+)\)<\/h2>/);
	if (pager) {
		ranks.page = parseInt(pager[1]);
		ranks.page_count = parseInt(pager[2]);
	}

	ranks.maps = parseMapCards(html);
	// 截图走我们自己的图片代理(和地图列表同一套),顺手签好 URL
	ranks.maps = await Promise.all(
		ranks.maps.map(async (card) => ({
			...card,
			thumbnail: card.thumbnail ? await convert('https://ddnet.org' + card.thumbnail) : ''
		}))
	);

	return ranks;
};

export const ranks = new FetchCache<RankInfo>(
	'https://ddnet.org/ranks/',
	(response) => parseRankPage(response, false),
	{
		version: 8,
		minQueryInterval: 1800
	}
);

// 地区 / 类型(可以组合)排位页的缓存
const pageCache = new Map<string, Promise<FetchCache<RankInfo> | null>>();
export const rankPage = async (options: {
	region?: string | null;
	type?: string | null;
	page?: number;
}) => {
	const region = options.region?.toLowerCase() || null;
	const type = options.type?.toLowerCase() || null;
	const page = Math.max(1, Math.floor(options.page ?? 1));
	const path = [region, type].filter(Boolean).join('/');
	if (!path) return null;
	const key = page > 1 ? `${path}/${page}` : path;

	let cache = pageCache.get(key);
	if (!cache) {
		cache = (async () => {
			const url = `https://ddnet.org/ranks/${path}/${page > 1 ? `${page}/` : ''}`;
			// 先确认这个地区/类型组合存在(不存在的组合直接 404,别让它进缓存)
			const response = await fetch(url, { method: 'HEAD' });
			if (!response.ok) return null;

			return new FetchCache<RankInfo>(url, (response) => parseRankPage(response, true), {
				version: 8,
				minQueryInterval: 1800
			});
		})();
		pageCache.set(key, cache);
	}
	return cache;
};

// 老接口:只要地区(/ranks/<region>/)
export const regionalRanks = async (region: string) => {
	if (!region) return null;
	return rankPage({ region });
};
