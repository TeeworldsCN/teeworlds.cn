import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import anymatch from 'anymatch';

const matcher = anymatch([
	`${__dirname}/**`,
	`${__dirname}/.*/**`,
	`!${__dirname}`,
	`!${__dirname}/*`,
	`!${__dirname}/src`,
	`!${__dirname}/src/**`,
	`!${__dirname}/static`,
	`!${__dirname}/static/**`,
	`!${__dirname}/.svelte-kit`,
	`!${__dirname}/.svelte-kit/**`
]);

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		watch: {
			// vite has problem dealing with watched files, so we manually select files to watch
			ignored: matcher
		}
	}
});
