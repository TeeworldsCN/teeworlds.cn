import { env } from '$env/dynamic/private';
import { ipToNumber } from '$lib/helpers';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const parseBanDateTime = (month: string, day: string, hour: string, minute: string) => {
	let date = new Date();
	date.setUTCMonth(MONTHS.indexOf(month));
	date.setUTCDate(parseInt(day));
	date.setUTCHours(parseInt(hour));
	date.setUTCMinutes(parseInt(minute));
	date.setUTCSeconds(0);
	date.setUTCMilliseconds(0);

	if (date < new Date()) {
		date.setUTCFullYear(date.getUTCFullYear() + 1);
	}
	return date;
};

export const getDDNetBanList = async () => {
	const url = env.DDNET_BANS;
	const auth = env.DDNET_AUTH;
	if (!url) {
		return null;
	}

	const response = await fetch(url, {
		headers: {
			authorization: `Basic ${auth}`
		}
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
	}

	let text = await response.text();

	const banRegex =
		/ban ([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}) -1 "([^"]*)\. Until ([A-Z][a-z]*) ([0-9]{2}) ([0-9]{2}):([0-9]{2}) UTC" # ([^:]*): (.*)/gm;
	const banRangeRegex =
		/ban_range ([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}) ([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}) -1 "([^"]*)\. Until ([A-Z][a-z]*) ([0-9]{2}) ([0-9]{2}):([0-9]{2}) UTC" # ([^:]*): (.*)/gm;
	const banRegionRegex =
		/ban_region ([a-z]{3}) ([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}) -1 "([^"]*)\. Until ([A-Z][a-z]*) ([0-9]{2}) ([0-9]{2}):([0-9]{2}) UTC" # ([^:]*): (.*)/gm;
	const banRegionRangeRegex =
		/ban_region_range ([a-z]{3}) ([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}) ([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}) -1 "([^"]*)\. Until ([A-Z][a-z]*) ([0-9]{2}) ([0-9]{2}):([0-9]{2}) UTC" # ([^:]*): (.*)/gm;

	const result: (
		| {
				type: 'ban';
				region: string;
				ip: number;
				name: string;
				reason: string;
				by: string;
				expires: number;
		  }
		| {
				type: 'ban_range';
				region: string;
				start: number;
				end: number;
				name: string;
				reason: string;
				by: string;
				expires: number;
		  }
	)[] = [];

	for (const match of text.matchAll(banRegex)) {
		result.push({
			type: 'ban',
			region: 'global',
			ip: ipToNumber(match[1]),
			reason: match[2],
			by: match[7],
			name: match[8],
			expires: Math.round(parseBanDateTime(match[3], match[4], match[5], match[6]).getTime() / 1000)
		});
	}

	for (const match of text.matchAll(banRangeRegex)) {
		result.push({
			type: 'ban_range',
			region: 'global',
			start: ipToNumber(match[1]),
			end: ipToNumber(match[2]),
			name: match[9],
			reason: match[3],
			by: match[8],
			expires: Math.round(parseBanDateTime(match[4], match[5], match[6], match[7]).getTime() / 1000)
		});
	}

	for (const match of text.matchAll(banRegionRegex)) {
		result.push({
			type: 'ban',
			region: match[1],
			ip: ipToNumber(match[2]),
			reason: match[3],
			by: match[8],
			name: match[9],
			expires: Math.round(parseBanDateTime(match[4], match[5], match[6], match[7]).getTime() / 1000)
		});
	}

	for (const match of text.matchAll(banRegionRangeRegex)) {
		result.push({
			type: 'ban_range',
			region: match[1],
			start: ipToNumber(match[2]),
			end: ipToNumber(match[3]),
			name: match[10],
			reason: match[4],
			by: match[9],
			expires: Math.round(parseBanDateTime(match[5], match[6], match[7], match[8]).getTime() / 1000)
		});
	}

	return result;
};
