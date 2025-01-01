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
		const bundle = await rollup({
			input: join('scripts', script),
			external: ['bun:sqlite'],
			plugins: [nodeResolve()],
			output: { file: resolve(outputPath, script.replace(/\.ts$/, '.js')), format: 'esm' }
		});

		await bundle.write({
			format: 'esm',
			dir: outputPath
		});
	}
})();
