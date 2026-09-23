import { error } from '@sveltejs/kit';
import { ZQ_TEST_BUILD } from '$lib/zhongqiu/test-build';

/**
 * 卡池一览表是**开发/查表用**的页面,上线版本不该能打开。
 * 只有开发态或测试 build(见 src/lib/zhongqiu/test-build.ts)才放行,否则 404。
 */
export const prerender = false;

export const load = () => {
	if (!import.meta.env.DEV && !ZQ_TEST_BUILD) error(404, 'Not Found');
	return {};
};
