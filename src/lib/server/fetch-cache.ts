import { volatile } from './keyv';

interface FetchCacheOptions {
	/** how often can the cache be checked for updates. default to 60 seconds */
	minQueryInterval?: number;
	/** always fetch without making a HEAD request first. default to false */
	skipHead?: boolean;
	/** useful for debugging. always fetch the data from the upstream regardless of the cache */
	alwaysFetch?: boolean;
}

type CachedData = {
	tag: string;
	data: string;
};

export class FetchCache<T> {
	private url: string;
	private nextQueryTime = 0;
	private minQueryInterval = 60;
	private skipHead = false;
	private alwaysFetch = false;
	private transformer: (response: Response) => Promise<T> | T;
	private callbacks:
		| (
				| {
						cb: (result: { result: string; hit: boolean }) => void;
						keepObject: false;
						error: (error: any) => void;
				  }
				| {
						cb: (result: { result: string; hit: boolean } | { data: T; hit: boolean }) => void;
						keepObject: true;
						error: (error: any) => void;
				  }
		  )[]
		| null = null;

	/**
	 * Cache a GET request, and automatically update if etag or last-modified is outdated.
	 * The transformer should only return a plain object. Can not be a string.
	 *
	 * @param url the url to fetch
	 * @param transformer post process the response, can be a function or one of 'json', 'text', 'arrayBuffer'
	 * @param options see {@link FetchCacheOptions}
	 */
	constructor(
		url: string,
		transformer: (response: Response) => Promise<T> | T,
		options?: FetchCacheOptions
	) {
		if (options) {
			this.minQueryInterval = options.minQueryInterval ?? this.minQueryInterval;
			this.skipHead = options.skipHead ?? this.skipHead;
			this.alwaysFetch = options.alwaysFetch ?? this.alwaysFetch;
			if (this.alwaysFetch) {
				this.skipHead = true;
				this.minQueryInterval = -1;
			}
			this.minQueryInterval = Math.max(this.minQueryInterval, 1);
		}

		this.url = url;
		this.transformer = transformer;
	}

	/**
	 * This might be useful for directly sending the response to the client without parsing the cached data
	 * @param cached true - use cache whenever possible, false - automatically determine whether to use cache or not, defaults to false
	 */
	async fetchAsString(cached?: boolean): Promise<{ result: string; hit: boolean; string: true }>;
	async fetchAsString(
		cached: boolean,
		keepObject: true
	): Promise<
		{ result: string; hit: boolean; string: true } | { data: T; hit: boolean; string: false }
	>;
	async fetchAsString(
		cached?: boolean,
		keepObject: boolean = false
	): Promise<
		{ result: string; hit: boolean; string: true } | { data: T; hit: boolean; string: false }
	> {
		if (this.callbacks) {
			const lcbs = this.callbacks;
			return new Promise<{ result: string; hit: boolean; string: true }>((resolve, reject) =>
				lcbs.push({
					cb: (result: any) => resolve(result),
					error: (error: any) => reject(error),
					keepObject
				})
			);
		}

		this.callbacks = [];
		try {
			const result:
				| { result: string; hit: boolean; string: true }
				| { data: T; hit: boolean; string: false } = await (async () => {
				const now = Date.now() / (this.minQueryInterval * 1000);
				const key = `dd:cache:${this.url}`;
				const cache = await volatile.get<CachedData>(key);

				if (cached && cache) {
					return {
						result: cache.data,
						hit: true,
						string: true
					};
				}

				// if the cache is not found, it is always outdated
				let outdated = !cache;

				// if somehow not ok or there is no etag, just pretend it's not updated
				let tag: string | null = null;

				let response: Response | null = null;

				if (cache && this.minQueryInterval >= 1 && this.nextQueryTime && this.nextQueryTime > now) {
					// if the cache is still fresh, don't do anything
					return {
						result: cache.data,
						hit: true,
						string: true as const
					};
				}

				this.nextQueryTime = Math.floor(now) + 1;

				if (!this.skipHead) {
					if (cache) {
						try {
							// check against the cache tag if a cache is available
							response = await fetch(this.url, { method: 'HEAD' });
							if (response.ok) {
								tag = response.headers.get('etag') || response.headers.get('last-modified');
								if (tag) {
									outdated = cache.tag != tag;
								}
							} else {
								// if the upstream errored. just pretend it is up to date
								outdated = false;
							}
						} catch {
							// if the upstream errored. just pretend it is up to date
							outdated = false;
						}
					}
				} else {
					// if head is skipped, always do GET fetch
					outdated = true;
				}

				let data: any = null;

				// if the cache is outdated, fetch the file again
				if (outdated) {
					const abort = new AbortController();
					try {
						const result = await fetch(this.url, { signal: abort.signal });

						if (result.ok) {
							tag = result.headers.get('etag') || result.headers.get('last-modified');
							if (!this.alwaysFetch && cache && tag == cache.tag) {
								// tag is the same, drop the connection immediately and just use the cache
								abort.abort();
								return {
									result: cache.data,
									hit: true,
									string: true as const
								};
							}
							data = await this.transformer(result);
							let stringData;
							if (tag) {
								// only cache if the tag is valid
								stringData = JSON.stringify(data);
								await volatile.set<CachedData>(key, { tag, data: stringData });
							}
							return {
								data,
								hit: false,
								string: false as const
							};
						}
					} catch {}
				}

				// not outdated, use the cache directly if it exists
				if (cache) {
					return {
						result: cache.data,
						hit: true,
						string: true as const
					};
				}

				// next query should try to fetch again since we don't have a cache and upstream errored
				this.nextQueryTime = 0;

				// not outdated but no cache, means the head response is possibly not ok or errored
				if (response) {
					throw new Error(
						`Failed to fetch data: ${this.url} ${response.status} ${response.statusText}`
					);
				} else {
					throw new Error(`Failed to fetch data: ${this.url} Unknown error`);
				}
			})();

			let stringData: { result: string; hit: boolean; string: true } | null = null;
			const getStringData = () => {
				if (!stringData) {
					stringData = {
						result: result.string ? result.result : JSON.stringify(result.data),
						hit: result.hit,
						string: true
					};
				}
				return stringData;
			};

			for (const callback of this.callbacks) {
				if (callback.keepObject) {
					callback.cb(result);
					continue;
				}
				callback.cb(getStringData());
			}

			this.callbacks = null;
			if (keepObject) {
				return result;
			}
			return getStringData();
		} catch (e) {
			console.error(e);
			for (const callback of this.callbacks!) {
				callback.error(e);
			}
			this.callbacks = null;
			throw e;
		}
	}

	/**
	 * Fetch the data
	 * @param cached true - use cache whenever possible, false - automatically determine whether to use cache or not, defaults to false.
	 */
	async fetch(cached: boolean = false): Promise<{ result: T; hit: boolean; string: false }> {
		const result = await this.fetchAsString(cached, true);
		if (result.string) {
			return { result: JSON.parse(result.result), hit: result.hit, string: false };
		}
		return { result: result.data, hit: result.hit, string: false };
	}
}
