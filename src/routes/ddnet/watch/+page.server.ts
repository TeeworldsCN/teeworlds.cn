import type { PageServerLoad } from './$types';

/**
 * 引擎产物在**构建时**就生成了(`bun run engine` 先跑,vite build 后跑),
 * 所以版本号可以直接塞进 SSR 的数据里 —— 页面渲染出来的 import URL 就是
 * `demo.js?v=<这次的版本>`,不用客户端再单独 fetch 一次 `version.json`。
 *
 * `import.meta.glob` 而不是静态 import:这个 JSON 是构建产物、不在版本库里,
 * 没跑过 `bun run engine` 的仓库(比如刚 clone 下来)静态 import 会直接报错,
 * glob 在没匹配到时只是空对象。
 */
const stamps = import.meta.glob('../../../../static/ddnet/engine/version.json', {
	eager: true,
	import: 'default'
}) as Record<string, { version?: string } | undefined>;

const engineVersion = Object.values(stamps)[0]?.version ?? '';

export const load: PageServerLoad = () => ({ engineVersion });
