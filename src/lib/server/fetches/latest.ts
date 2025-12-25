import { FetchCache } from '../fetch-cache';

export const latest = new FetchCache<
	{
		timestamp: number;
		map: string;
		name: string;
		time: string;
		server: string;
		hash: string;
	}[]
>(
	'https://ddnet.org/maps/?latest=1',
	async (response) => {
		const result = await response.json();
		return result.slice(0, 50);
	},
	{ version: 1, minQueryInterval: 3, skipHead: true, memory: true }
);
