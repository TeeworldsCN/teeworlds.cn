#!/usr/bin/env bun

import fs from 'fs';
import path from 'path';

/**
 * Script to generate a production package.json in the build directory
 * This runs after SvelteKit build to ensure the build directory exists
 */

const srcDir = 'src';
const buildDir = 'build';

try {
	// Check if build directory exists
	if (!fs.existsSync(buildDir)) {
		console.error(`❌ Build directory '${buildDir}' does not exist. Run 'bun run build' first.`);
		process.exit(1);
	}

	// Read the source package.json
	const sourcePackageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

	// Create a production package.json with only necessary fields
	const productionPackageJson = {
		name: sourcePackageJson.name,
		version: sourcePackageJson.version,
		type: 'module',
		private: sourcePackageJson.private,
		main: 'index.js',
		dependencies: sourcePackageJson.dependencies || {},
		scripts: {
			start: 'bun index.js'
		}
	};

	// Write package.json to build directory
	const packageJsonPath = path.join(buildDir, 'package.json');
	fs.writeFileSync(packageJsonPath, JSON.stringify(productionPackageJson, null, 2));

	console.log(`✅ Generated package.json in ${buildDir}/`);
	console.log(
		`📦 Dependencies: ${Object.keys(productionPackageJson.dependencies).join(', ') || 'none'}`
	);

	// Build custom server into build directory
	const customServerPath = path.join(srcDir, 'server', 'index.ts');
	const transpiler = new Bun.Transpiler({ loader: 'ts' });
	const customServerCode = transpiler.transformSync(fs.readFileSync(customServerPath, 'utf-8'));
	fs.writeFileSync(path.join(buildDir, 'index.js'), customServerCode);
	console.log(`✅ Generated custom server in ${buildDir}/`);
	console.log(`🚀 To start the server, run 'bun ./${buildDir}/index.js'`);
} catch (error) {
	console.error('❌ Failed to generate package.json:', error);
	process.exit(1);
}
