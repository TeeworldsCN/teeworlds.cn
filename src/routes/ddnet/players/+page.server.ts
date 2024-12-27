import { unescapeHTML } from '$lib/ddnet/helpers';
import { keyv } from '$lib/server/keyv';
import type { PageServerLoad } from './$types';

interface PointInfo {
	rank: number;
	points: number;
	region?: string;
	name: string;
}

interface FinishInfo {
	timestamp: number;
	region: string;
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

class LastFinishesHandler implements HTMLRewriterTypes.HTMLRewriterElementContentHandlers {
	private data: RankInfo;
	private context: {
		type: string;
		isLink: boolean;
		finish: FinishInfo;
	} = {
		type: '',
		isLink: false,
		finish: { timestamp: 0, region: '', type: '', map: '', name: '', time: 0 }
	};

	constructor(data: RankInfo) {
		this.data = data;
	}

	async element(element: HTMLRewriterTypes.Element) {
		if (element.tagName === 'span') {
			this.context.finish.timestamp =
				new Date(element.getAttribute('data-date') || 0).getTime() / 1000;
		} else if (element.tagName === 'tr') {
			// reset finish
			this.context.finish = { timestamp: 0, region: '', type: '', map: '', name: '', time: 0 };
			this.context.type = '';
			element.onEndTag(() => {
				if (this.context.finish.name) this.data.last_finishes.push(this.context.finish);
			});
		} else if (element.tagName === 'img') {
			this.context.finish.region = element.getAttribute('alt') || 'UNK';
		} else if (element.tagName === 'a') {
			if (this.context.type === '') {
				this.context.type = 'type';
				this.context.isLink = true;
			} else if (this.context.type === 'type') {
				this.context.type = 'map';
				this.context.isLink = true;
			} else if (this.context.type === 'map') {
				this.context.type = 'name';
				this.context.isLink = true;
			} else {
				this.context.type = 'unknown';
			}
			element.onEndTag(() => {
				this.context.isLink = false;
				if (this.context.type == 'name') {
					this.context.type = 'time';
				}
			});
		}
	}

	async text(text: HTMLRewriterTypes.Text) {
		const trimmed = text.text.trim();
		if (!trimmed) return;

		if (this.context.isLink) {
			if (this.context.type === 'type') {
				this.context.finish.type = trimmed;
			} else if (this.context.type === 'map') {
				this.context.finish.map = trimmed;
			} else if (this.context.type === 'name') {
				this.context.finish.name = trimmed;
			}
		} else if (
			this.context.type === 'time' &&
			trimmed.match(/\((?:[0-9]{2}:)?[0-9]{2}:[0-9]{2}\)/)
		) {
			const time = trimmed.slice(1, -1).split(':');
			if (time.length == 3) {
				this.context.finish.time =
					parseInt(time[0]) * 3600 + parseInt(time[1]) * 60 + parseInt(time[2]);
			} else if (time.length == 2) {
				this.context.finish.time = parseInt(time[0]) * 60 + parseInt(time[1]);
			} else {
				this.context.finish.time = 0;
			}
		}
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

let nextQueryTime = 0;
let minQueryInterval = 60;

export const load = (async ({ parent }) => {
	const now = Date.now();

	// check if the file is updated
	let outdated = false;

	// if somehow not ok or there is no etag, just pretend it's not updated
	let tag: string | null = null;

	if (nextQueryTime < now) {
		const head = await fetch('https://ddnet.org/ranks/', { method: 'HEAD' });

		if (head.ok) {
			tag = head.headers.get('etag') || head.headers.get('last-modified');
			if (tag) {
				const cachedTag = await keyv.get('ddnet:ranks:tag');
				outdated = cachedTag != tag;
			}
		}

		nextQueryTime = now + minQueryInterval * 1000;
	}

	let result: RankInfo | {} = {};

	if (outdated) {
		const res = await fetch(`https://ddnet.org/ranks/`);
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

		const ladderHandler = new LadderHandler(ranks);
		const lastFinishesHandler = new LastFinishesHandler(ranks);
		new HTMLRewriter()
			.on(
				[
					'div[class="block2 ladder"] > h3',
					'div[class="block2 ladder"] > table > tr',
					'div[class="block2 ladder"] > table > tr > td',
					'div[class="block2 ladder"] > table > tr > td > img'
				].join(','),
				ladderHandler
			)
			.on(
				[
					'div[class="block4"] > table > tr',
					'div[class="block4"] > table > tr > td',
					'div[class="block4"] > table > tr > td > span[data-type="date"]',
					'div[class="block4"] > table > tr > td > img',
					'div[class="block4"] > table > tr > td > a'
				].join(','),
				lastFinishesHandler
			)
			.on('p[class="toggle"] > span[data-type="date"]', new UpdateTimeHandler(ranks))
			.transform(await res.text());

		result = ranks;

		if (tag) {
			// only cache if the tag is valid
			await keyv.set('ddnet:ranks', ranks);
			await keyv.set('ddnet:ranks:tag', tag);
		}
	} else {
		// not outdated, just fetch the cache
		result = (await keyv.get('ddnet:ranks')) as RankInfo;
	}

	return { ...result, ...(await parent()) };
}) satisfies PageServerLoad;
