import { env } from '$env/dynamic/private';
import sqlite from 'bun:sqlite';

const ddtrackerPath = env.DDTRACKER_PATH || './cache/ddtracker.db';
const db = sqlite.open(ddtrackerPath, { readonly: true });

export type DDNetSkin = { n: string; b?: number; f?: number };

export const getCurrentSkinInRegion = (name: string, region: string) => {
	const location = region.split(':');
	if (location.length >= 2) {
		const result = db
			.prepare<
				{ current_skin: string },
				[string, string]
			>('SELECT current_skin FROM clients WHERE name = ? AND region = ?')
			.get(name, region);
		if (!result) {
			return null;
		}
		return JSON.parse(result.current_skin) as DDNetSkin;
	} else {
		const result = db
			.prepare<
				{ skin_history: string },
				[string, string]
			>('SELECT skin_history FROM clients WHERE name = ? AND region LIKE ?')
			.all(name, `${region}%`);

		const skin = result
			.flatMap(({ skin_history }) => JSON.parse(skin_history) as { t: number; s: string }[])
			.sort((a, b) => b.t - a.t)[0];
		if (!skin) {
			return null;
		}
		return JSON.parse(skin.s) as DDNetSkin;
	}
};

export const getFrequentSkinInRegion = (name: string, region: string) => {
	const updateTime = db
		.prepare<{ value: string }, string>('SELECT value FROM info where key = ?')
		.get('last_update');
	const lastUpdate = parseInt(updateTime?.value || Math.round(Date.now() / 60000).toString());

	const location = region.split(':');

	const result =
		location.length >= 2
			? db
					.prepare<
						{ skin_history: string },
						[string, string]
					>('SELECT skin_history FROM clients WHERE name = ? AND region = ?')
					.all(name, region)
			: db
					.prepare<
						{ skin_history: string },
						[string, string]
					>('SELECT skin_history FROM clients WHERE name = ? AND region LIKE ?')
					.all(name, `${region}%`);

	const skins = result
		.flatMap(({ skin_history }) => JSON.parse(skin_history) as { t: number; s: string }[])
		.sort((a, b) => a.t - b.t);

	if (skins.length < 1) {
		return null;
	}

	if (skins.length == 1) {
		return JSON.parse(skins[0].s) as DDNetSkin;
	}

	skins.push({ t: lastUpdate, s: skins[skins.length - 1].s });

	const skinDurations = new Map<string, number>();
	for (let i = 1; i < skins.length; i++) {
		const duration = skins[i].t - skins[i - 1].t;
		skinDurations.set(skins[i - 1].s, skinDurations.get(skins[i - 1].s) || 0 + duration);
	}
	let longestDurationSkin = { t: 0, s: '' };
	for (const [skin, duration] of skinDurations) {
		if (duration > longestDurationSkin.t) {
			longestDurationSkin = { t: duration, s: skin };
		}
	}
	if (longestDurationSkin.t == 0) {
		return null;
	}
	return JSON.parse(longestDurationSkin.s) as DDNetSkin;
};

export const getFrequentSkin = (name: string) => {
	const updateTime = db
		.prepare<{ value: string }, string>('SELECT value FROM info where key = ?')
		.get('last_update');
	const lastUpdate = parseInt(updateTime?.value || Math.round(Date.now() / 60000).toString());

	const result = db
		.prepare<{ skin_history: string }, [string]>('SELECT skin_history FROM clients WHERE name = ?')
		.all(name);

	const skins = result
		.flatMap(({ skin_history }) => JSON.parse(skin_history) as { t: number; s: string }[])
		.sort((a, b) => a.t - b.t);

	if (skins.length < 1) {
		return null;
	}

	if (skins.length == 1) {
		return JSON.parse(skins[0].s) as DDNetSkin;
	}

	skins.push({ t: lastUpdate, s: skins[skins.length - 1].s });

	const skinDurations = new Map<string, number>();
	for (let i = 1; i < skins.length; i++) {
		const duration = skins[i].t - skins[i - 1].t;
		skinDurations.set(skins[i - 1].s, skinDurations.get(skins[i - 1].s) || 0 + duration);
	}
	let longestDurationSkin = { t: 0, s: '' };
	for (const [skin, duration] of skinDurations) {
		if (duration > longestDurationSkin.t) {
			longestDurationSkin = { t: duration, s: skin };
		}
	}
	if (longestDurationSkin.t == 0) {
		return null;
	}
	return JSON.parse(longestDurationSkin.s) as DDNetSkin;
};

export const getCurrentSkin = (name: string) => {
	const result = db
		.prepare<{ skin_history: string }, [string]>('SELECT skin_history FROM clients WHERE name = ?')
		.all(name);

	const skin = result
		.flatMap(({ skin_history }) => JSON.parse(skin_history) as { t: number; s: string }[])
		.sort((a, b) => b.t - a.t)[0];

	if (!skin) {
		return null;
	}

	return JSON.parse(skin.s) as DDNetSkin;
};
