import adapter from 'svelte-adapter-bun-next';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const forceRunesMode = (filename) => {
	if (filename.match(/[\/\\]node_modules[\/\\]/)) {
		return false;
	}
	return true;
};

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),
	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter()
	},
	vitePlugin: {
		dynamicCompileOptions({ filename, compileOptions }) {
			// Dynamically set runes mode per Svelte file
			if (forceRunesMode(filename) && !compileOptions.runes) {
				return { runes: true };
			}
		}
	}
};

export default config;
