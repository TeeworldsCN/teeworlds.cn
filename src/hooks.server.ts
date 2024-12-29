import { persistent, volatile } from '$lib/server/keyv';
import { mapReleases } from '$lib/server/tasks/map-releases';
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
	let ip = 'unknown';
	const headers = event.request.headers;
	const hostname = headers.get('x-forwarded-host') || headers.get('host') || '';

	let isLocalhost = !hostname;
	if (hostname) {
		const host = new URL(`http://${hostname}`);
		isLocalhost =
			host.hostname == 'localhost' || host.hostname == '127.0.0.1' || host.hostname == '[::1]';
	}

	if (isLocalhost) {
		ip = event.getClientAddress();
	}
	const forwarded =
		headers.get('x-forwarded-for') || headers.get('x-real-ip') || headers.get('cf-connecting-ip');
	if (forwarded) {
		ip = forwarded;
	}
	event.locals.ip = ip;
	return resolve(event);
};

export default handle;
