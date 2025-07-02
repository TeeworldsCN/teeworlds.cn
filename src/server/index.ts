// @ts-expect-error this will be copied into build
import { env } from './env';
// @ts-expect-error this will be copied into build
import { handler } from './handler';
import EventEmitter from 'node:events';

const host = env('HOST', '0.0.0.0');
const port = env('PORT', '3000');

const textEncoder = new TextEncoder();

export class ServerResponse extends EventEmitter<{ ready: [Response]; close: []; error: [] }> {
	private _headers: Headers = new Headers();
	private _readableStream?: ReadableStream<Uint8Array>;
	private _controller?: ReadableStreamDefaultController<Uint8Array>;

	private _sent: boolean = false;
	private _closed: boolean = false;
	private _destroyed: boolean = false;

	public statusCode: number = 200;

	constructor() {
		super();
	}

	public createStream() {
		return new Promise<void>((resolve) => {
			this._readableStream = new ReadableStream<Uint8Array>({
				start: (controller) => {
					this._controller = controller;
					resolve();
				},
				cancel: () => {
					this._closed = true;
					this.emit('close');
				}
			});
		});
	}

	// @ts-ignore
	end(chunk?: string) {
		if (this._destroyed) {
			throw new Error('Cannot call end() on destroyed response');
		}

		if (this._closed) {
			throw new Error('Cannot call end() on already closed response');
		}

		if (chunk !== undefined) {
			this.write(textEncoder.encode(chunk));
		}

		if (!this._sent) {
			this._sent = true;
			this.emit(
				'ready',
				new Response(this._readableStream, {
					status: this.statusCode,
					headers: this._headers
				})
			);
		}

		if (!this._closed) {
			this._controller!.close();
			this._closed = true;
		}
		this.emit('close');
		return this;
	}

	getHeader(name: string) {
		return this._headers.get(name);
	}

	setHeader(name: string, value: string | number | string[]) {
		if (this._sent) {
			throw new Error('Cannot set headers after response has been sent');
		}

		if (this._destroyed) {
			throw new Error('Cannot set headers on destroyed response');
		}

		if (typeof value === 'string') {
			this._headers.set(name, value);
		} else if (typeof value === 'number') {
			this._headers.set(name, value.toString());
		} else {
			for (const v of value) {
				this._headers.append(name, v);
			}
		}
		return this;
	}

	removeHeader(name: string) {
		if (this._sent) {
			throw new Error('Cannot remove headers after response has been sent');
			return this;
		}

		if (this._destroyed) {
			throw new Error('Cannot remove headers on destroyed response');
			return this;
		}

		try {
			this._headers.delete(name);
		} catch (error) {
			throw error;
		}
		return this;
	}

	// Write chunk to the stream
	write(chunk: Uint8Array<ArrayBufferLike>) {
		if (this._destroyed) {
			throw new Error('Cannot write to destroyed response');
		}

		if (this._closed) {
			throw new Error('Cannot write to closed response');
		}

		this._controller!.enqueue(chunk);
		return true;
	}

	status() {
		return this.statusCode;
	}

	writeHead(code: number, headers?: { [name: string]: string | string[] }) {
		if (this._sent) {
			throw new Error('Cannot write head after response has been sent');
		}

		if (this._destroyed) {
			throw new Error('Cannot write head on destroyed response');
		}

		if (headers) {
			for (const name in headers) {
				this.setHeader(name, headers[name]);
			}
		}

		this.statusCode = code;
		this.emit(
			'ready',
			new Response(this._readableStream, { status: code, headers: this._headers })
		);
		this._sent = true;
		return this;
	}

	destroy(error?: Error) {
		if (!this._sent) {
			this.emit('ready', new Response(null, { status: 500, headers: this._headers }));
			this._sent = true;
		}

		if (this._destroyed) {
			return this;
		}

		this._destroyed = true;
		if (!this._closed) {
			this._controller!.close();
			this._closed = true;
		}
		this.emit('close');
		return this;
	}
}

export class ServerRequest extends EventEmitter<{
	error: [Error];
	data: [any];
	end: [];
}> {
	private _request: Request;
	private _destroyed: boolean = false;
	private _paused: boolean = false;
	private _resumeCallbacks: (() => void)[] = [];
	public headers: {};

	constructor(request: Request) {
		super();
		this._request = request;
		this.headers = new Proxy({} as Record<string, string>, {
			get: (_target, prop: string) => {
				return this._request.headers.get(prop);
			},
			has: (_target, prop: string) => {
				return this._request.headers.has(prop);
			},
			ownKeys: (_target) => {
				return Array.from(this._request.headers.keys());
			},
			getOwnPropertyDescriptor: (_target, prop: string) => {
				if (this._request.headers.has(prop)) {
					return {
						enumerable: true,
						configurable: true,
						value: this._request.headers.get(prop)
					};
				}
				return undefined;
			}
		});
		this._processBody();
	}

	private async _processBody() {
		try {
			if (!this._request.body) {
				this.emit('end');
				return;
			}

			const reader = this._request.body.getReader();

			while (true) {
				if (this._destroyed) {
					break;
				}

				if (this._paused) {
					// Wait for resume
					await new Promise<void>((resolve) => {
						if (!this._paused || this._destroyed) {
							resolve();
						} else {
							this._resumeCallbacks.push(resolve);
						}
					});
				}

				if (this._destroyed) {
					break;
				}

				try {
					const { done, value } = await reader.read();
					if (done) {
						this.emit('end');
						break;
					}

					if (value) {
						this.emit('data', value);
					}
				} catch (error) {
					throw error;
				}
			}
		} catch (error) {
			if (!this._destroyed) {
				this.destroy();
			}
		}
	}

	get url() {
		const url = new URL(this._request.url);
		return url.pathname + url.search;
	}

	get method() {
		return this._request.method;
	}

	get body() {
		return this._request.body;
	}

	// IncomingMessage compatibility properties
	get httpVersionMajor() {
		return 1; // Default to HTTP/1.1
	}

	get destroyed() {
		return this._destroyed;
	}

	// IncomingMessage compatibility methods
	pause() {
		this._paused = true;
		return this;
	}

	resume() {
		this._paused = false;
		// Call all pending resume callbacks
		const callbacks = this._resumeCallbacks.splice(0);
		callbacks.forEach((callback) => callback());
		return this;
	}

	destroy() {
		this._destroyed = true;
		return this;
	}
}

const server = Bun.serve({
	hostname: host,
	port: parseInt(port),
	async fetch(request) {
		return new Promise<Response>(async (resolve) => {
			const req = new ServerRequest(request);
			const res = new ServerResponse();
			await res.createStream();
			res.once('ready', resolve);
			handler(req, res, () => {});
		});
	},
	idleTimeout: 60,
	error(error) {
		console.error('Bun.serve error:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
});

function shutdown() {
	server.stop(false);

	// @ts-expect-error custom events cannot be typed
	process.emit('sveltekit:shutdown', 'shutdown');
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
