import { rollup } from 'rollup';
import { join, resolve } from 'path';
import { readdir, mkdir } from 'fs/promises';
import { nodeResolve } from '@rollup/plugin-node-resolve';

(async () => {
	const scriptsPath = 'scripts';
	const outputPath = resolve(import.meta.dirname, 'build/scripts');

	await mkdir(outputPath, { recursive: true });

	const scripts = await readdir(scriptsPath);

	for (const script of scripts) {
		console.log(`Bundling ${script}`);
		await Bun.build({
			entrypoints: [join(scriptsPath, script)],
			outdir: outputPath,
			format: 'esm'
		});
	}
})();
