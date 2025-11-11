import {
	createBotReply,
	updateBotReplyByUuid,
	deleteBotReplyByUuid,
	listBotReplies,
	getBotReply,
	type CreateBotReplyData,
	type UpdateBotReplyData
} from '$lib/server/db/botreply';
import { hasPermission } from '$lib/server/db/users';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	const replies = listBotReplies();

	return new Response(JSON.stringify(replies), {
		headers: { 'content-type': 'application/json' }
	});
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	const body = (await request.json()) as
		| {
				op: 'create';
				data: CreateBotReplyData;
		  }
		| {
				op: 'update';
				uuid: string;
				data: UpdateBotReplyData;
		  }
		| {
				op: 'delete';
				uuid: string;
		  };

	if (!body || !body.op) {
		return new Response('Bad Request', { status: 400 });
	}

	try {
		switch (body.op) {
			case 'create': {
				if (!body.data || !body.data.keyword || !body.data.response) {
					return new Response('Missing required fields', { status: 400 });
				}

				// Validate keyword and response
				if (body.data.keyword.trim().length === 0) {
					return new Response('Keyword cannot be empty', { status: 400 });
				}

				if (body.data.response.trim().length === 0) {
					return new Response('Response cannot be empty', { status: 400 });
				}

				const reply = createBotReply({
					keyword: body.data.keyword.trim(),
					response: body.data.response.trim()
				});

				return new Response(JSON.stringify(reply), {
					headers: { 'content-type': 'application/json' }
				});
			}

			case 'update': {
				if (!body.uuid || !body.data || !body.data.keyword || !body.data.response) {
					return new Response('Missing required fields', { status: 400 });
				}

				// Validate keyword and response
				if (body.data.keyword.trim().length === 0) {
					return new Response('Keyword cannot be empty', { status: 400 });
				}

				if (body.data.response.trim().length === 0) {
					return new Response('Response cannot be empty', { status: 400 });
				}

				const success = updateBotReplyByUuid(body.uuid, {
					keyword: body.data.keyword.trim(),
					response: body.data.response.trim()
				});

				if (!success) {
					return new Response('Bot reply not found', { status: 404 });
				}

				const updatedReply = getBotReply(body.uuid);
				return new Response(JSON.stringify(updatedReply), {
					headers: { 'content-type': 'application/json' }
				});
			}

			case 'delete': {
				if (!body.uuid) {
					return new Response('Missing UUID', { status: 400 });
				}

				const success = deleteBotReplyByUuid(body.uuid);

				if (!success) {
					return new Response('Bot reply not found', { status: 404 });
				}

				return new Response(JSON.stringify({ success: true }), {
					headers: { 'content-type': 'application/json' }
				});
			}

			default:
				return new Response('Invalid operation', { status: 400 });
		}
	} catch (err) {
		console.error('Error in bot replies API:', err);
		return new Response('Internal Server Error', { status: 500 });
	}
};
