import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const allowedHosts = (process.env.VITE_ALLOWED_HOSTS ?? '')
	.split(',')
	.map((h) => h.trim())
	.filter(Boolean);

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		allowedHosts
	},
	build: {
		rollupOptions: {
			external: ['sharp']
		}
	}
});
