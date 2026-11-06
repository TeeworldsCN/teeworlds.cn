import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import sqlite, { type Statement, type Database } from 'bun:sqlite';

let db: Database | null = null;

let dbGetSkinInRegion: Statement<{ current_skin: string }, [string, string]> | null = null;
let dbGetSkinInRegionPrefix: Statement<{ current_skin: string }, [string, string]> | null = null;
let dbGetSkin: Statement<{ current_skin: string }, [string]> | null = null;

if (!building) {
	const ddtrackerPath = env.DDTRACKER_PATH || './cache/ddtracker.db';
	// 这个库是部署机上同步过来的(玩家最近用的皮肤),本地开发/CI 里通常没有。
	// 打不开就当"没有数据":下面的 getter 本来就会返回 null,页面照常渲染(皮肤走默认),
	// 别让 `import` 直接抛出去把整条路由变成 500。
	try {
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
	} catch (error) {
		db = null;
		dbGetSkinInRegion = dbGetSkinInRegionPrefix = dbGetSkin = null;
		console.warn(
			`[ddtracker] 打不开 ${ddtrackerPath}(${(error as Error).message}),玩家皮肤先按"没有"处理`
		);
	}
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
