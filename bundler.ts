import { join, resolve } from 'path';
import { readdir, mkdir } from 'fs/promises';

(async () => {
	const scriptsPath = 'scripts';
	const outputPath = resolve(import.meta.dirname, 'build/scripts');

	await mkdir(outputPath, { recursive: true });

	// 只打包真正要跑的 TypeScript 入口。
	// `scripts/` 下还放着构建用的辅助文件(`twgpu-patch-prepare.py`、`twgpu-templates/`),
	// 把它们当 entrypoint 会让 Bun.build 直接报错,整个部署失败。
	const scripts = (await readdir(scriptsPath, { withFileTypes: true }))
		.filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
		.map((entry) => entry.name);

	if (scripts.length === 0) {
		throw new Error(`${scriptsPath}/ 下没有可打包的 .ts 脚本`);
	}

	for (const script of scripts) {
		console.log(`Bundling ${script}`);
		await Bun.build({
			entrypoints: [join(scriptsPath, script)],
			outdir: outputPath,
			format: 'esm'
		});
	}
})();
