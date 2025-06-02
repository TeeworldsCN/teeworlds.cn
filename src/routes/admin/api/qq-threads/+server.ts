import { hasPermission } from '$lib/server/db/users';
import { QQBot, QQRichTextType } from '$lib/server/bots/protocol/qq';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!hasPermission(locals.user, 'POSTING')) {
		return error(404, 'Not Found');
	}

	if (!QQBot) {
		return error(404, 'QQ Bot is not activated');
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return error(400, 'Invalid JSON');
	}

	const { channelId, title, richText } = body;

	if (!channelId || !title || !richText) {
		return error(400, 'Missing required fields: channelId, title, richText');
	}

	if (typeof channelId !== 'string' || typeof title !== 'string' || typeof richText !== 'object') {
		return error(400, 'Invalid field types');
	}

	// Validate richText structure
	if (!richText.paragraphs || !Array.isArray(richText.paragraphs)) {
		return error(400, 'Invalid richText structure: missing paragraphs array');
	}

	// Validate each paragraph
	let hasContent = false;
	for (const paragraph of richText.paragraphs) {
		if (!paragraph.elems || !Array.isArray(paragraph.elems)) {
			return error(400, 'Invalid paragraph structure: missing elems array');
		}

		for (const elem of paragraph.elems) {
			if (!elem.type || !Object.values(QQRichTextType).includes(elem.type)) {
				return error(400, 'Invalid element type');
			}

			// Check if there's actual content
			if (elem.type === QQRichTextType.Text && elem.text?.text?.trim()) {
				hasContent = true;
			} else if (elem.type === QQRichTextType.Image && elem.image?.third_url?.trim()) {
				hasContent = true;
			} else if (elem.type === QQRichTextType.Video && elem.video?.third_url?.trim()) {
				hasContent = true;
			} else if (elem.type === QQRichTextType.Url && elem.url?.url?.trim()) {
				hasContent = true;
			}
		}
	}

	if (!hasContent) {
		return error(400, 'Content cannot be empty');
	}

	try {
		const result = await QQBot.publishThread(channelId, title, richText);

		if (result.error) {
			return error(result.code, result.message || 'Failed to publish thread');
		}

		return json({
			success: true,
			data: result.data,
			message: 'Thread published successfully'
		});
	} catch (err) {
		console.error('Error publishing thread:', err);
		return error(500, 'Internal server error');
	}
};
