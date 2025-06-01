import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import sqlite, { type Statement, type Database } from 'bun:sqlite';

let db: Database | null = null;

let dbGetSkinInRegion: Statement<{ current_skin: string }, [string, string]> | null = null;
let dbGetSkinInRegionPrefix: Statement<{ current_skin: string }, [string, string]> | null = null;
let dbGetSkin: Statement<{ current_skin: string }, [string]> | null = null;

if (!building) {
	const ddtrackerPath = env.DDTRACKER_PATH || './cache/ddtracker.db';
	db = sqlite.open(ddtrackerPath, { readonly: true });
	dbGetSkinInRegion = db.prepare<{ current_skin: string }, [string, string]>(
		'SELECT current_skin FROM clients WHERE name = ? AND region = ?'
	);
	dbGetSkinInRegionPrefix = db.prepare<{ current_skin: string }, [string, string]>(
		'SELECT current_skin FROM clients WHERE name LIKE ? AND region LIKE ? ORDER BY current_skin_time DESC LIMIT 1'
	);
	dbGetSkin = db.prepare<{ current_skin: string }, [string]>(
		'SELECT current_skin FROM clients WHERE name = ? ORDER BY current_skin_time DESC LIMIT 1'
	);

	process.on('sveltekit:shutdown', async (reason) => {
		console.log('Shutting down ddtracker...');
		db?.close();
	});
}

export type DDNetSkin = { n: string; b?: number; f?: number };

export const getSkin = (name: string, region: string | null = null) => {
	if (!db || !dbGetSkinInRegion || !dbGetSkinInRegionPrefix || !dbGetSkin) return null;

	if (!region) {
		const result = dbGetSkin.get(name);
		if (!result) {
			return null;
		}
		return JSON.parse(result.current_skin) as DDNetSkin;
	}

	const location = region.split(':');
	if (location.length >= 2) {
		const result = dbGetSkinInRegion.get(name, region);
		if (!result) {
			return null;
		}
		return JSON.parse(result.current_skin) as DDNetSkin;
	} else {
		const result = dbGetSkinInRegionPrefix.get(name, `${region}%`);
		if (!result) {
			return null;
		}
		return JSON.parse(result.current_skin) as DDNetSkin;
	}
};
