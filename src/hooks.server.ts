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
