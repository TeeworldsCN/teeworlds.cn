import { persistent, volatile } from '$lib/server/keyv';
import { mapReleases } from '$lib/server/tasks/map-releases';
import { tokenToUser } from '$lib/server/users';
import type { ServerInit } from '@sveltejs/kit';
import type { Cron } from 'croner';

const initTasks = (...tasks: Cron[]) => {
	const { __croner_tasks }: { __croner_tasks: Cron[] } = globalThis as any;
	for (const task of __croner_tasks || []) {
		task.stop();
	}
	(globalThis as any).__croner_tasks = tasks;
};

export const init: ServerInit = async () => {
	// initialize the key-value store on launch
	volatile;
	persistent;

	initTasks(
		// initialize scheduled tasks
		mapReleases
	);
};

export const handle = async ({ event, resolve }) => {
	// check ip
	{
		let ip = 'unknown';
		try {
			ip = event.getClientAddress();
		} catch {
			ip = 'unknown';
		}
		event.locals.ip = ip;
	}

	// check login
	{
		const token = event.cookies.get('token');
		if (token) {
			const userToken = await tokenToUser(token);
			if (userToken) {
				event.locals.user = userToken.user;

				if (userToken.token != token) {
					// refresh token
					event.cookies.set('token', userToken.token, { path: '/' });
				}
			}
		}
	}

	return resolve(event);
};

export default handle;
