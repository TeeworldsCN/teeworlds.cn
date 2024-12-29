import { persistent, volatile } from '$lib/server/keyv';
import { mapReleases } from '$lib/server/tasks/map-releases';
import { tokenToUser } from '$lib/server/users';
import { type ServerInit } from '@sveltejs/kit';
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
	try {
		event.locals.ip = event.getClientAddress();
	} catch {
		event.locals.ip = 'unknown';
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

export function handleError({ event, error }) {
	if (error instanceof Error) {
		if (error.constructor.name === 'SvelteKitError' && (error as any).status == 404) {
			return;
		}
	}

	// log other errors
	console.error(error);
}
