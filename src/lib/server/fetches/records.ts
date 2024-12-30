import { FetchCache } from '../fetch-cache';
import Parser from 'rss-parser';

const parser = new Parser();

export const records = new FetchCache(
	'https://ddnet.org/status/records/feed/',
	async (response) => {
		const text = await response.text();
		const data = await parser.parseString(text);
		const records = data.items
			.map((item) => {
				const title = item.title?.trim() || '';
				const date = new Date(item.pubDate || 0).getTime();
				return { title, date };
			})
			.filter((item) => item.title && item.date)
			.sort((a, b) => b.date - a.date);
		return records;
	}
);
