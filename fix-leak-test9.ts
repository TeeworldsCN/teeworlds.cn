const devReloadCallbacks = new Map<string, () => void>();

class DevReload {
	constructor(dirname: string, cb: () => void) {
		const callback = devReloadCallbacks.get(dirname);
		if (callback) {
			callback();
		}
		devReloadCallbacks.set(dirname, cb);
	}
}

// simulate what happens on reload
let memory = [];
function reload(file) {
    new DevReload(file, () => {
        // memory leak because we reference something that is not collected
        memory.push(new Array(1000).fill(1));
    });
}

for(let i=0; i<1000; i++) {
    reload("file.ts");
}
console.log(process.memoryUsage().rss / 1024 / 1024);
