import { keyv } from './keyv';

const defaultJSONTransformer = (response: Response) => response.json();
const defaultTextTransformer = (response: Response) => response.text();

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

export class FetchCache {
	private url: string;
	private nextQueryTime = 0;
	private minQueryInterval = 60;
	private skipHead = false;
	private alwaysFetch = false;
	private transformer: (response: Response) => Promise<any> | any;

	/**
	 * Cache a GET request, and automatically update if etag or last-modified is outdated.
	 *
	 * @param url the url to fetch
	 * @param transformer post process the response, can be a function or one of 'json', 'text', 'arrayBuffer'
	 * @param options see {@link FetchCacheOptions}
	 */
	constructor(
		url: string,
		transformer: ((response: Response) => Promise<any> | any) | 'json' | 'text',
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

		if (typeof transformer === 'function') {
			this.transformer = transformer;
		} else {
			switch (transformer) {
				case 'json':
					this.transformer = defaultJSONTransformer;
					break;
				case 'text':
					this.transformer = defaultTextTransformer;
					break;
				default:
					throw new Error('Invalid transformer');
			}
		}
	}

	async fetch(thisFetch: typeof global.fetch = fetch) {
		const now = Date.now();
		const key = `ddnet:cache:${this.url}`;
		const cache = await keyv.get<CachedData>(key);

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

				if (tag) {
					// only cache if the tag is valid
					await keyv.set<CachedData>(key, { tag, data });
					this.nextQueryTime = now + this.minQueryInterval * 1000;
				}
				return data;
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
	}
}
