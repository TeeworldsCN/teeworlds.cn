import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** 旧地址永久迁往 /minigames/zhongqiu/data —— 308 保住已分享出去的链接 */
export const load: PageLoad = ({ url }) => redirect(308, `/minigames/zhongqiu/data${url.search}`);
