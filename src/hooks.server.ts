import { tokenToUser } from '$lib/server/db/users';
import { DevReload } from '$lib/server/dev';
import { volatile } from '$lib/server/keyv';
import { mapTracker } from '$lib/server/tasks/map-tracker';
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
		mapTracker
	);
};

export const handle = async ({ event, resolve }) => {
	try {
		event.locals.ip = event.getClientAddress();
	} catch (e) {
		console.log(e);
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
