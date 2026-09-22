import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

const allowedHosts = [
	'kit.tsfreddie.com',
	...(process.env.VITE_ALLOWED_HOSTS ?? '')
		.split(',')
		.map((h) => h.trim())
		.filter(Boolean)
];

export default defineConfig(({ mode }) => {
	/**
	 * 测试 build 开关:`.env.test` 里写 `PUBLIC_ZQ_TEST=1`,构建时带 `--mode test`。
	 * 定义成 `__ZQ_TEST_BUILD__` 这个**编译期常量**,生产构建里它直接是 `false` ——
	 * `import.meta.env.DEV || __ZQ_TEST_BUILD__` 会被常量折叠,__cheat / 卡池一览
	 * 那些分支连代码一起被 DCE 掉(不只是运行时藏起来)。
	 * 不走 `$env/static/public`:变量缺失时那个导入会直接报错,而「没配 = 关」才对。
	 */
	const zqTest = loadEnv(mode, process.cwd(), '').PUBLIC_ZQ_TEST === '1';

	return {
		define: { __ZQ_TEST_BUILD__: JSON.stringify(zqTest) },
		plugins: [tailwindcss(), sveltekit()],
		server: {
			allowedHosts,
			watch: {
				// `svelte-kit sync`(npm run check / run build 都会跑)会重写 .svelte-kit/** ——
				// dev server 一看文件变了就**整页 reload**,正在玩的页面直接被顶掉(实测一局被打断,
				// 一次 check/build 就是十几条 reload)。把生成目录/无关目录摘出监听:
				// 源码(src/**)的改动照常 HMR,只是「重新生成的脚手架」不再触发刷新。
				// 注意:自定义 ignored 不与默认列表合并,node_modules/.git 要自己写上。
				ignored: ['**/.svelte-kit/**', '**/node_modules/**', '**/.git/**', '**/.pi-web/**']
			}
		},
		build: {
			rollupOptions: {
				external: ['sharp']
			}
		}
	};
});
