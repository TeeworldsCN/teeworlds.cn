import { addSubscription, removeSubscription, type SubscriptionKey } from '$lib/server/db/subs';
import { hasPermission } from '$lib/server/db/users';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { triggerMapRelease } from '$lib/server/tasks/map-tracker';
import { QQBot } from '$lib/server/bots/protocol/qq';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	const body = (await request.json()) as
		| {
				op: 'add' | 'rm';
				key?: SubscriptionKey;
				value?: string;
		  }
		| { op: 'trigger-map' }
		| { op: 'download-thread'; channel: string; title: string };

	if (!body) {
		return new Response('Bad Request', { status: 400 });
	}

	if (body.op == 'trigger-map') {
		// force trigger a map release for testing
		await triggerMapRelease();
		return new Response(JSON.stringify({ success: true }), {
			headers: { 'content-type': 'application/json' }
		});
	}

	if (body.op == 'download-thread') {
		// download thread
		console.log('Downloading');
		if (!QQBot) return error(500, 'QQBot is not initialized');
		const threads = await QQBot.listThreads(body.channel);
		console.log(threads);
		if (threads.error) {
			return error(500, threads.body || threads.message);
		}
		const thread = threads.data.threads.find((thread) => thread.thread_info.title == body.title);
		if (!thread) {
			return error(404, 'Thread not found');
		}

		const threadDetail = await QQBot.getThread(body.channel, thread.thread_info.thread_id);
		return new Response(JSON.stringify(threadDetail), {
			headers: {
				'content-type': 'text/plain'
			}
		});
	}

	if (!body.key || !body.value) {
		return new Response('Bad Request', { status: 400 });
	}

	if (body.op == 'add') {
		addSubscription(body.key, body.value);
	} else if (body.op == 'rm') {
		removeSubscription(body.key, body.value);
	}
	return new Response(JSON.stringify({ success: true }), {
		headers: { 'content-type': 'application/json' }
	});
};
