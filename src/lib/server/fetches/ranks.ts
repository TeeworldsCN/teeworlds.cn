import { unescapeHTML } from '$lib/helpers';
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

export interface RankInfo {
	ranks: {
		points: PointInfo[];
		team: PointInfo[];
		rank: PointInfo[];
		yearly: PointInfo[];
		monthly: PointInfo[];
		weekly: PointInfo[];
	};
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
			// reset rank
			this.context.rank = { rank: 0, points: 0, region: '', name: '' };
			element.onEndTag(() => {
				if (this.context.rank.name && this.context.ladder)
					this.data.ranks[this.context.ladder].push(this.context.rank);
			});
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
			const ladderName = text.text.trim();
			if (ladderName.match(/Points \([0-9]+ total\)/)) {
				this.context.ladder = 'points';
				this.data.total_points = parseInt(ladderName.slice(8, -1));
			} else if (ladderName === 'Points (past 365 days)') {
				this.context.ladder = 'yearly';
			} else if (ladderName === 'Points (past 30 days)') {
				this.context.ladder = 'monthly';
			} else if (ladderName === 'Points (past 7 days)') {
				this.context.ladder = 'weekly';
			} else if (ladderName === 'Team Rank') {
				this.context.ladder = 'team';
			} else if (ladderName === 'Rank') {
				this.context.ladder = 'rank';
			} else {
				this.context.ladder = null;
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

export const ranks = new FetchCache<RankInfo>('https://ddnet.org/ranks/', async (response) => {
	const ranks = {
		ranks: {
			points: [],
			team: [],
			rank: [],
			yearly: [],
			monthly: [],
			weekly: []
		},
		last_finishes: [],
		total_points: 0,
		update_time: 0
	} satisfies RankInfo;

	const html = await response.text();

	new HTMLRewriter()
		.on(
			[
				'div[class="block2 ladder"] > h3',
				'div[class="block2 ladder"] > table > tr:not([class="allPoints"])',
				'div[class="block2 ladder"] > table > tr:not([class="allPoints"]) > td',
				'div[class="block2 ladder"] > table > tr:not([class="allPoints"]) > td > img'
			].join(','),
			new LadderHandler(ranks)
		)
		.on('p[class="toggle"] > span[data-type="date"]', new UpdateTimeHandler(ranks))
		.transform(html);

	return ranks;
});

// fetch caches for regional ranks
const regionCache = new Map<string, FetchCache<RankInfo>>();
export const regionalRanks = async (region: string) => {
	if (!region) return null;
	const existing = regionCache.get(region);
	if (existing) return existing;

	// create a new fetch cache for the region
	// check whether the region exists first
	const response = await fetch(`https://ddnet.org/ranks/${region}/`, { method: 'HEAD' });
	if (!response.ok) {
		return null;
	}

	const fetchCache = new FetchCache<RankInfo>(
		`https://ddnet.org/ranks/${region}/`,
		async (response) => {
			const ranks = {
				ranks: {
					points: [],
					team: [],
					rank: [],
					yearly: [],
					monthly: [],
					weekly: []
				},
				last_finishes: [],
				total_points: 0,
				update_time: 0
			} satisfies RankInfo;

			const html = await response.text();

			// we actually want all 500 ranks, so people can check whether they hit the top 500
			// there is no other way to check this
			new HTMLRewriter()
				.on(
					[
						'div[class="block2 ladder"] > h3',
						'div[class="block2 ladder"] > table > tr',
						'div[class="block2 ladder"] > table > tr > td',
						'div[class="block2 ladder"] > table > tr > td > img'
					].join(','),
					new LadderHandler(ranks)
				)
				.on('p[class="toggle"] > span[data-type="date"]', new UpdateTimeHandler(ranks))
				.transform(html);

			return ranks;
		}
	);
	regionCache.set(region, fetchCache);
	return fetchCache;
};
