export class AsyncQueue {
	private isRunning = false;
	private queue: (() => Promise<any>)[] = [];

	public size() {
		return this.queue.length;
	}

	public push<T>(task: () => Promise<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			this.queue.push(async () => {
				try {
					const result = await task();
					resolve(result);
				} catch (e) {
					reject(e);
				}
			});

			if (!this.isRunning) {
				this.run();
			}
		});
	}

	async run() {
		if (this.isRunning) return;

		this.isRunning = true;
		while (this.queue.length > 0) {
			const task = this.queue.shift();
			if (task) {
				await task();
			}
		}
		this.isRunning = false;
	}
}

export class MultiAsyncQueue {
	private queues: AsyncQueue[];

	constructor(count: number) {
		this.queues = Array.from({ length: count }, () => new AsyncQueue());
	}

	public size() {
		return this.queues.reduce((sum, queue) => sum + queue.size(), 0);
	}

	public push<T>(task: () => Promise<T>): Promise<T> {
		const queue = this.queues.reduce(
			(smallest, current) => (current.size() < smallest.size() ? current : smallest),
			this.queues[0]
		);
		return queue.push(task);
	}
}
