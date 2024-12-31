import { volatile } from '../../keyv';

type RateLimitInfo = {
	/** Cooldown time in milliseconds */
	cd?: number;
	/** Timestamps in milliseconds */
	ts?: number[];
};

export class RateLimiter {
	private static RATE_LIMITER_PREFIX = 'rl';
	private prefix: string;
	private threshold: number;
	private interval: number;
	private cooldown: number;

	/**
	 * A simple rate limiter implementation.
	 *
	 * @param prefix the prefix to use for the key
	 * @param threshold how many requests are allowed in a given time period
	 * @param interval the time period in seconds
	 * @param cooldown if the rate limiter is triggered, how long to wait before allowing another request (in seconds)
	 */
	constructor(prefix: string, options: { threshold: number; interval: number; cooldown: number }) {
		this.prefix = prefix;
		this.threshold = options.threshold;
		this.interval = options.interval;
		this.cooldown = options.cooldown;
	}

	isLimited = async (user: string, group: string = '') => {
		const now = Date.now();
		const key = `${RateLimiter.RATE_LIMITER_PREFIX}:${this.prefix}:${group}:${user}`;
		const rateLimiter = await volatile.get<RateLimitInfo>(key);

		if (rateLimiter && rateLimiter.cd && now - rateLimiter.cd < this.cooldown * 1000) {
			// cooldown is still active
			return { triggered: false, limited: true };
		}

		if (!rateLimiter) {
			await volatile.set<RateLimitInfo>(key, { ts: [now] }, this.interval * 1000);
			return { triggered: false, limited: false };
		}

		const ts = rateLimiter.ts || [];

		const withInInterval = ts.filter((ts) => now - ts < this.interval * 1000);
		if (withInInterval.length >= this.threshold) {
			await volatile.set<RateLimitInfo>(
				key,
				{ cd: now + this.cooldown * 1000 },
				this.cooldown * 1000
			);
			return { triggered: true, limited: true };
		}

		// add current timestamp to the list
		withInInterval.push(now);
		await volatile.set<RateLimitInfo>(key, { ts: withInInterval }, this.interval * 1000);
		return { triggered: false, limited: false };
	};
}
