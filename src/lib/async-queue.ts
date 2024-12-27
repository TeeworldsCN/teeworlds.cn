export class AsyncQueue {
	private isRunning = false;
	private queue: (() => Promise<any>)[] = [];

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
