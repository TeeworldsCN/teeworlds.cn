<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	// 说明框 portal 到 body 下,继承不到页面根节点的字体栈 —— 自己带上自带的 emoji 字体
	import '$lib/zhongqiu/emoji-font.css';

	/**
	 * 卡片悬浮说明:portal 到 body + `position: fixed` 定位到锚点旁边
	 * (默认优先上方;`below` 在 lg 起优先下方)。
	 *
	 * 为什么要 portal:说明框挂在卡片内部时,任何 overflow 祖先都会把它裁掉 ——
	 * 横滑芯片行、modal 的滚动区、页面根节点的 overflow-hidden……
	 * **DOM 里有、屏幕上看不见**。挂到 body 下就只剩视口这一个约束。
	 *
	 * 挂载/卸载由父组件决定(`{#if}`),淡入淡出交给根元素的 `transition:fade` ——
	 * Svelte 会等淡出播完再删节点,父组件不用自己留「最后一张」占位;
	 * 触屏「点一下固定显示」的状态也归父组件(TeeCard 里),这里只管定位和淡出。
	 */
	type Props = {
		/** 锚点:说明框定位在它旁边(默认优先上方,放不下翻到下方;`below` 反之) */
		anchor: HTMLElement | undefined;
		/** 描边色(一般给稀有度色) */
		color?: string;
		/** 层级:modal 里的卡片要压过 z-50 的遮罩 */
		z?: string;
		/** 宽一档(17rem):加成卡说明比 Tee 卡说明长 */
		wide?: boolean;
		/**
		 * lg(≥1024px)起优先放到锚点**下方** —— 加成卡货架在队伍下方,
		 * 说明往上弹会盖住正要点选的 Tee。窄屏 / 下方放不下时仍按空间检测翻回上方。
		 */
		below?: boolean;
		children: Snippet;
	};

	let { anchor, color, z = 'z-[60]', wide = false, below = false, children }: Props = $props();

	let el: HTMLElement | undefined = $state();
	/** 视口坐标(position: fixed)。null = 还没量过,先挪到屏幕外 */
	let pos = $state<{ left: number; top: number } | null>(null);

	/**
	 * 提示框已经是 body 的直接子节点,所以这里算的全是**视口坐标** ——
	 * 既不用折算祖先的 transform: scale,也不会被 overflow: hidden 切掉。
	 */
	const position = () => {
		if (!el || !anchor) return;
		// visualViewport 才是「真正看得见」的区域:桌面版网站 / 双指缩放时它会窄于 innerWidth,
		// 只钳 innerWidth 的话提示框会跑到屏幕外看不到
		const vv = window.visualViewport;
		const vLeft = vv ? vv.offsetLeft : 0;
		const vTop = vv ? vv.offsetTop : 0;
		const vRight = vLeft + (vv ? vv.width : window.innerWidth);
		const vBottom = vTop + (vv ? vv.height : window.innerHeight);
		const ar = anchor.getBoundingClientRect();
		const tw = el.offsetWidth;
		const th = el.offsetHeight;
		const pad = 8;
		// 水平:先当居中,贴边就钳进来
		const left = Math.max(
			vLeft + pad,
			Math.min(ar.left + ar.width / 2 - tw / 2, vRight - pad - tw)
		);
		// 垂直:默认优先放卡片上方;below 的站在 lg 起优先下方(加成卡货架在队伍下面,
		// 往上弹会盖住要点选的 Tee)。首选方向不够翻到另一侧,两边都不够就贴住可视区。
		const preferBelow = below && window.innerWidth >= 1024;
		let top = preferBelow ? ar.bottom + pad : ar.top - pad - th;
		const overflows = preferBelow ? top + th > vBottom - pad : top < vTop + pad;
		if (overflows) {
			const alt = preferBelow ? ar.top - pad - th : ar.bottom + pad;
			const altOverflows = preferBelow ? alt < vTop + pad : alt + th > vBottom - pad;
			top = altOverflows ? (preferBelow ? vBottom - pad - th : vTop + pad) : alt;
		}
		// 最后再夹一次:锚点在视口下方(比如芯片被滚到滚动区外面)时,上面那套
		// 只会让它留在屏幕外 —— 兜底夹进可视区,至少看得见。
		top = Math.min(Math.max(top, vTop + pad), Math.max(vTop + pad, vBottom - pad - th));
		pos = { left: Math.round(left), top: Math.round(top) };
	};

	/** 把提示框节点搬到 body 下:不受任何祖先的 overflow / transform 影响 */
	const portal = (node: HTMLElement) => {
		document.body.appendChild(node);
		schedule();
		return {
			destroy: () => node.remove()
		};
	};

	/**
	 * 重算入口:resize / 缩放 / 滚动 / 布局变化都走这里。
	 * 下一帧再算 —— resize 事件里读到的 rect 还是旧布局,直接算会取到过时的位置;
	 * 同一帧内多次触发只算一次。
	 */
	let raf = 0;
	const schedule = () => {
		if (raf) return;
		raf = requestAnimationFrame(() => {
			raf = 0;
			position();
		});
	};

	$effect(() => {
		if (!el || !anchor) return;
		position();
		const ro = new ResizeObserver(schedule);
		ro.observe(el);
		// 卡片本身/祖先的布局变化也会让提示框错位(队伍满员换卡、结算行增高……)
		const roAnchor = new ResizeObserver(schedule);
		roAnchor.observe(anchor);
		window.addEventListener('resize', schedule);
		// 说明框挂在卡片外面,容器滚动它不会跟着走 —— 滚动事件不冒泡但能被 capture 抓到,
		// 这样 modal 里的滚动区、横向芯片行都能顺带覆盖
		window.addEventListener('scroll', schedule, { capture: true, passive: true });
		// 手机「桌面版网站」+ 双指缩放:变的是 visualViewport,window 的 resize 不一定触发
		window.visualViewport?.addEventListener('resize', schedule);
		window.visualViewport?.addEventListener('scroll', schedule);
		return () => {
			ro.disconnect();
			roAnchor.disconnect();
			window.removeEventListener('resize', schedule);
			window.removeEventListener('scroll', schedule, { capture: true });
			window.visualViewport?.removeEventListener('resize', schedule);
			window.visualViewport?.removeEventListener('scroll', schedule);
			if (raf) cancelAnimationFrame(raf);
		};
	});
</script>

<!-- 淡入淡出走 Svelte 过渡:节点卸载会等淡出播完再删(常数 150ms,和以前的 .tip 一致)。
     节点挂在 body 下,祖先选择器(.group:hover)够不着,所以开合与否由父组件的 {#if} 决定 -->
<div
	bind:this={el}
	use:portal
	transition:fade={{ duration: 150, easing: cubicOut }}
	class="zq-emoji tip pointer-events-none fixed w-max {wide
		? 'max-w-[min(17rem,calc(100vw-2.5rem))]'
		: 'max-w-[min(13rem,calc(100vw-2.5rem))]'} rounded-lg border bg-slate-950/95 px-2.5 py-1.5 text-center text-xs leading-snug text-slate-200 shadow-xl lg:text-sm {z}"
	style="--rarity: {color ??
		'#94a3b8'}; border-color: color-mix(in srgb, var(--rarity, #94a3b8) 50%, transparent); {pos
		? `left: ${pos.left}px; top: ${pos.top}px;`
		: 'left: -9999px; top: -9999px;'}"
>
	{@render children()}
</div>
