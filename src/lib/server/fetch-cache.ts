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
	data: any;
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
				| { cb: (result: string) => void; keepObject: false; error: (error: any) => void }
				| {
						cb: (result: string | { data: T }) => void;
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
		}

		this.url = url;
		this.transformer = transformer;
	}

	/** This might be useful for directly sending the response to the client without parsing the cached data */
	async fetchAsString(): Promise<string>;
	async fetchAsString(
		thisFetch: typeof global.fetch,
		keepObject: true
	): Promise<string | { data: T }>;
	async fetchAsString(thisFetch: typeof global.fetch): Promise<string>;
	async fetchAsString(
		thisFetch: typeof global.fetch = fetch,
		keepObject: boolean = false
	): Promise<string | { data: T }> {
		if (this.callbacks) {
			const lcbs = this.callbacks;
			return new Promise<string>((resolve, reject) =>
				lcbs.push({
					cb: (result: any) => resolve(result),
					error: (error: any) => reject(error),
					keepObject
				})
			);
		}

		this.callbacks = [];
		try {
			const result: string | { data: T } = await (async () => {
				const now = Date.now();
				const key = `dd:cache:${this.url}`;
				const cache = await volatile.get<CachedData>(key);

				// if the cache is not found, it is always outdated
				let outdated = !cache;

				// if somehow not ok or there is no etag, just pretend it's not updated
				let tag: string | null = null;

				let response: Response | null = null;

				if (cache && this.nextQueryTime >= now) {
					// if the cache is still fresh, don't do anything
					return cache.data;
				}

				if (!this.skipHead) {
					if (cache) {
						// check against the cache tag if a cache is available
						response = await thisFetch(this.url, { method: 'HEAD' });
						if (response.ok) {
							tag = response.headers.get('etag') || response.headers.get('last-modified');
							if (tag) {
								outdated = cache.tag != tag;
							}
						} else {
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
					const result = await thisFetch(this.url, { signal: abort.signal });

					if (result.ok) {
						tag = result.headers.get('etag') || result.headers.get('last-modified');
						if (!this.alwaysFetch && cache && tag == cache.tag) {
							// tag is the same, drop the connection immediately and just use the cache
							abort.abort();
							return cache.data;
						}
						data = await this.transformer(result);
						let stringData;
						if (tag) {
							// only cache if the tag is valid
							stringData = JSON.stringify(data);
							await volatile.set<CachedData>(key, { tag, data: stringData });
							this.nextQueryTime = now + this.minQueryInterval * 1000;
						}
						return { data };
					}
				}

				// not outdated, use the cache directly if it exists
				if (cache) {
					return cache.data;
				}

				// not outdated but no cache, means the head response is possibly not ok
				if (response) {
					throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
				} else {
					throw new Error('Failed to fetch data: Unknown error');
				}
			})();

			let stringData = null;
			for (const callback of this.callbacks) {
				if (callback.keepObject) {
					callback.cb(result);
					continue;
				}
				if (stringData) {
					callback.cb(stringData);
					continue;
				}
				stringData = typeof result === 'string' ? result : JSON.stringify(result.data);
				callback.cb(stringData);
			}

			this.callbacks = null;
			if (keepObject) {
				return result;
			}
			stringData ??= typeof result === 'string' ? result : JSON.stringify(result.data);
			return stringData;
		} catch (e) {
			console.error(e);
			for (const callback of this.callbacks!) {
				callback.error(e);
			}
			this.callbacks = null;
			throw e;
		}
	}

	async fetch(thisFetch: typeof global.fetch = fetch): Promise<T> {
		const result = await this.fetchAsString(thisFetch, true);
		if (typeof result === 'string') {
			return JSON.parse(result);
		}
		const { data } = result;
		return data;
	}
}
