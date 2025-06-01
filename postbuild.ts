#!/usr/bin/env bun

import fs from 'fs';
import path from 'path';

/**
 * Script to generate a production package.json in the build directory
 * This runs after SvelteKit build to ensure the build directory exists
 */

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
		type: sourcePackageJson.type,
		private: sourcePackageJson.private,
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
} catch (error) {
	console.error('❌ Failed to generate package.json:', error);
	process.exit(1);
}
