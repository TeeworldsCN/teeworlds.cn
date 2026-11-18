import {
	clearRecallLogs,
	createRecallKeyword,
	deleteRecallKeywordByUuid,
	hasRecallKeyword,
	isAutoRecallEnabled,
	listRecallKeywords,
	listRecallLogs,
	setAutoRecallEnabled,
	updateRecallKeywordByUuid
} from '$lib/server/db/recall';
import { hasPermission } from '$lib/server/db/users';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const MAX_KEYWORD_LENGTH = 64;

const json = (data: unknown, status = 200) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json' }
	});

const validateKeyword = (keyword: string): string | null => {
	if (keyword.length === 0) return '关键词不能为空';
	if (keyword.length > MAX_KEYWORD_LENGTH) return `关键词不能超过 ${MAX_KEYWORD_LENGTH} 个字符`;
	return null;
};

export const GET: RequestHandler = async ({ locals }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	return json({
		keywords: listRecallKeywords(),
		logs: listRecallLogs(),
		enabled: isAutoRecallEnabled()
	});
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!hasPermission(locals.user, 'SUPER')) {
		return error(404, 'Not Found');
	}

	const body = (await request.json()) as
		| { op: 'create'; keyword: string }
		| { op: 'update'; uuid: string; keyword?: string; enabled?: boolean }
		| { op: 'delete'; uuid: string }
		| { op: 'toggle'; enabled: boolean }
		| { op: 'clear-logs' }
		| null;

	if (!body || !body.op) {
		return new Response('Bad Request', { status: 400 });
	}

	try {
		switch (body.op) {
			case 'create': {
				const keyword = (body.keyword ?? '').trim();
				const invalid = validateKeyword(keyword);
				if (invalid) return new Response(invalid, { status: 400 });
				if (hasRecallKeyword(keyword)) {
					return new Response('该关键词已存在', { status: 409 });
				}

				return json(createRecallKeyword({ keyword }));
			}

			case 'update': {
				if (!body.uuid) return new Response('Missing UUID', { status: 400 });

				const data: { keyword?: string; enabled?: boolean } = {};
				if (body.keyword !== undefined) {
					const keyword = body.keyword.trim();
					const invalid = validateKeyword(keyword);
					if (invalid) return new Response(invalid, { status: 400 });
					if (hasRecallKeyword(keyword, body.uuid)) {
						return new Response('该关键词已存在', { status: 409 });
					}
					data.keyword = keyword;
				}
				if (body.enabled !== undefined) data.enabled = body.enabled;

				if (!updateRecallKeywordByUuid(body.uuid, data)) {
					return new Response('关键词不存在', { status: 404 });
				}

				return json({ success: true });
			}

			case 'delete': {
				if (!body.uuid) return new Response('Missing UUID', { status: 400 });
				if (!deleteRecallKeywordByUuid(body.uuid)) {
					return new Response('关键词不存在', { status: 404 });
				}

				return json({ success: true });
			}

			case 'toggle': {
				if (typeof body.enabled !== 'boolean') {
					return new Response('Missing enabled', { status: 400 });
				}
				setAutoRecallEnabled(body.enabled);
				return json({ success: true, enabled: body.enabled });
			}

			case 'clear-logs': {
				clearRecallLogs();
				return json({ success: true });
			}

			default:
				return new Response('Invalid operation', { status: 400 });
		}
	} catch (err) {
		console.error('Error in bot auto-recall API:', err);
		return new Response('Internal Server Error', { status: 500 });
	}
};
