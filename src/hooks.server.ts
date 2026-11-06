import { tokenToUser } from '$lib/server/db/users';
import { DevReload } from '$lib/server/dev';
import { volatile } from '$lib/server/keyv';
import { mapTracker } from '$lib/server/tasks/map-tracker';
import { toolClear } from '$lib/server/tasks/tool-clear';
import { ranks } from '$lib/server/fetches/ranks';
import { maps } from '$lib/server/fetches/maps';
import { warmWatchable } from '$lib/server/fetches/watchable';
import { type ServerInit } from '@sveltejs/kit';
import type { Cron } from 'croner';

const initTasks = (...tasks: Cron[]) => {
	new DevReload(import.meta.file, () => {
		console.log('Cleaning up tasks...');
		for (const task of tasks || []) {
			task.stop();
		}
	});

	process.on('sveltekit:shutdown', async (reason) => {
		console.log('Shutting down tasks...');
		for (const task of tasks || []) {
			task.stop();
		}
	});
};

export const init: ServerInit = async () => {
	// initialize the key-value store on launch
	volatile;

	initTasks(
		// initialize scheduled tasks
		mapTracker,
		toolClear
	);

	// Pre-warm maps, ranks and watchable cache so the first API call doesn't hit cold start
	setTimeout(() => {
		console.log('[warmup] Pre-fetching maps, ranks and watchable cache...');
		Promise.allSettled([
			maps.fetchCache().then(() => console.log('[warmup] Maps cache ready')),
			ranks.fetchCache().then(() => console.log('[warmup] Ranks cache ready')),
			// watchable.jsonl 是 3 MB 的 JSONL,冷启动解析要一两秒。
			// 地图详情页每次 SSR 都要查它,别让第一个访客替我等着。
			warmWatchable().then(() => console.log('[warmup] Watchable cache ready'))
		]).catch(() => {});
	}, 2000);
};

export const handle = async ({ event, resolve }) => {
	// check login
	{
		const token = event.cookies.get('token');
		if (token) {
			const userToken = await tokenToUser(token);
			if (userToken) {
				event.locals.user = userToken.user;

				if (userToken.token != token) {
					// refresh token
					event.cookies.set('token', userToken.token, { path: '/', maxAge: 30 * 24 * 60 * 60 });
				}
			}
		}
	}
	return resolve(event);
};

export function handleError({ error }) {
	if (error instanceof Error) {
		if (error.constructor.name === 'SvelteKitError' && (error as any).status == 404) {
			return;
		}
	}

	// log other errors
	console.error(error);
}
