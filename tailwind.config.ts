import typography from '@tailwindcss/typography';
import type { Config } from 'tailwindcss';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],

	theme: {
		extend: {
			aspectRatio: {
				'map': '360 / 225',
			  },
		}
	},

	plugins: [typography]
} satisfies Config;
