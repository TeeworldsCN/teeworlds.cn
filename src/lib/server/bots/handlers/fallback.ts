import type { Handler } from '../protocol/types';
import { handleHelp } from './help';

export const handleFallback: Handler = async (args) => {
	if (args.mode === 'DIRECT') {
		// fallback to help message in direct message
		return handleHelp(args);
	}
};
