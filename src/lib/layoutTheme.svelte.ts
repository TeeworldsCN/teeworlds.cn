/**
 * 页面自定义 layout 主题(背景 / 内边距)。
 *
 * 页面在 onMount 时调用 setLayoutTheme 声明自定义背景,
 * 离开时返回 setLayoutTheme({}) 恢复默认。
 * 仅客户端生效(背景类页面通常 ssr = false)。
 */

export type LayoutTheme = {
	/** 自定义背景 CSS background 值,如 linear-gradient(...);为空则用默认 bg-slate-800 */
	bg?: string;
	/** false 时去掉 main 的默认 p-2 内边距,让页面内容贴边 */
	pad?: boolean;
	/** true 时隐藏 layout 底部的备案 footer(全屏游戏页省 32px 纵向空间,下部布局随之撑满) */
	footer?: boolean;
};

/** 导出单一 proxy,属性级更新,保证响应式传播 */
export const layoutTheme = $state<LayoutTheme>({});

export function setLayoutTheme(t: LayoutTheme): void {
	layoutTheme.bg = t.bg;
	layoutTheme.pad = t.pad;
	layoutTheme.footer = t.footer;
}
