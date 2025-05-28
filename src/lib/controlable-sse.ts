import { source, type SourceConfiguration } from 'sveltekit-sse';

const calculateBackoffRetries = (attempt: number, baseDelay = 500, maxDelay = 10000) => {
	const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
	const jitter = delay * Math.random();
	return Math.round((delay + jitter) / 1000);
};

export const customSource = (
	url: string,
	config: Omit<SourceConfiguration, 'options' | 'error'> & {
		options?: Omit<SourceConfiguration['options'], 'fetch'>;
		lost?: () => void | Promise<void>;
		restore?: () => void | Promise<void>;
		attempts?: (attempts: number) => void | Promise<void>;
	}
) => {
	let attempts = 0;
	let remainingTryCount = 0;
	let errorTriggered = false;

	const customFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		if (remainingTryCount > 0) {
			remainingTryCount--;
			return;
		}

		try {
			const result = await fetch(input, init);
			if (result.ok) {
				if (errorTriggered) {
					config.restore?.();
					attempts = 0;
					errorTriggered = false;
				}
			} else {
				throw new Error('Not OK');
			}
			return result;
		} catch {
			attempts++;
			config.attempts?.(attempts);
			remainingTryCount = calculateBackoffRetries(attempts);
		}
	}) as any; // we don't need to implement preconnect

	return source(url, {
		cache: config.cache,
		open: config.open,
		close: config.close,
		error: () => {
			if (!errorTriggered) {
				config.lost?.();
				errorTriggered = true;
				remainingTryCount = 0;
			}
		},
		options: {
			fetch: customFetch,
			...(config.options ?? {})
		}
	});
};
