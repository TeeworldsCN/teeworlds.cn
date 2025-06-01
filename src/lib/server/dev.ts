const devReloadCallbacks = new Map<string, () => void>();

export class DevReload {
	constructor(dirname: string, cb: () => void) {
		const callback = devReloadCallbacks.get(dirname);
		if (callback) {
			callback();
		}
		devReloadCallbacks.set(dirname, cb);
	}
}
