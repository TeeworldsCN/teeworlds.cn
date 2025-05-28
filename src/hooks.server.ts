import { env } from '$env/dynamic/private';
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

const address_header = env.ADDRESS_HEADER?.toLowerCase();
const xff_depth = Number(env.XFF_DEPTH) || 1;

export const handle = async ({ event, resolve }) => {
	try {
		const req = event.request;
		if (address_header) {
			const value = req.headers.get(address_header);
			if (!value) {
				throw new Error(
					`Address header was specified with ${'ADDRESS_HEADER'}=${address_header} but is absent from request`
				);
			}

			if (address_header === 'x-forwarded-for') {
				const addresses = value.split(',');

				if (xff_depth < 1) {
					throw new Error(`XFF_DEPTH must be a positive integer`);
				}

				if (xff_depth > addresses.length) {
					throw new Error(
						`XFF_DEPTH is ${xff_depth}, but only found ${addresses.length} addresses`
					);
				}
				event.locals.ip = addresses[addresses.length - xff_depth].trim();
			} else {
				event.locals.ip = value;
			}
		} else {
			event.locals.ip = event.getClientAddress();
		}
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
