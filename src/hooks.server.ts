import { tokenToUser } from '$lib/server/db/users';
import { volatile } from '$lib/server/keyv';
import { mapTracker } from '$lib/server/tasks/map-tracker';
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

	initTasks(
		// initialize scheduled tasks
		mapTracker
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

export function handleError({ error }) {
	if (error instanceof Error) {
		if (error.constructor.name === 'SvelteKitError' && (error as any).status == 404) {
			return;
		}
	}

	// log other errors
	console.error(error);
}
