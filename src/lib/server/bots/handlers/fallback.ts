import type { Handler } from '../protocol/types';
import { handleHelp } from './help';
import { findBotReplyByMessage } from '$lib/server/db/botreply';

export const handleFallback: Handler = async (args) => {
	// First, check if there's a keyword match for the message
	const originalMessage = `${args.command} ${args.args}`.trim();
	const botReply = findBotReplyByMessage(originalMessage);

	if (botReply) {
		args.reply.text(botReply.response);
		return {
			type: 'keyword',
			message: botReply.response
		};
	}

	if (args.mode === 'DIRECT') {
		// fallback to help message in direct message
		return handleHelp(args);
	}
};
