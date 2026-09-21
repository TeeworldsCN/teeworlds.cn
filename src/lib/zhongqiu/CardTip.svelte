<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * 卡片悬浮说明:portal 到 body + `position: fixed` 定位到锚点上方。
	 *
	 * 为什么要 portal:说明框挂在卡片内部时,任何 overflow 祖先都会把它裁掉 ——
	 * 横滑芯片行、modal 的滚动区、页面根节点的 overflow-hidden……
	 * **DOM 里有、屏幕上看不见**。挂到 body 下就只剩视口这一个约束。
	 *
	 * 触屏没有 hover:点一下卡片固定显示,点别处再收掉(和 CSS :hover 的直觉一致)。
	 */
	type Props = {
		/** 锚点:说明框定位在它上方(上面放不下就翻到下方) */
		anchor: HTMLElement | undefined;
		/** 鼠标 hover / 键盘聚焦 —— 由父组件维护 */
		hover?: boolean;
		/** 描边色(一般给稀有度色) */
		color?: string;
		/** 层级:modal 里的卡片要压过 z-50 的遮罩 */
		z?: string;
		/** 宽一档(17rem):加成卡说明比 Tee 卡说明长 */
		wide?: boolean;
		children: Snippet;
	};

	let { anchor, hover = false, color, z = 'z-[60]', wide = false, children }: Props = $props();

	/** 触屏上的固定显示:点别处才收(触摸指针抬指后立刻 pointerleave) */
	let hold = $state(false);
	const open = $derived(hover || hold);

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
		// 垂直:优先放卡片上方;上方不够翻到下方;下方也放不下就贴住可视区顶部
		let top = ar.top - pad - th;
		if (top < vTop + pad) {
			const below = ar.bottom + pad;
			top = below + th > vBottom - pad ? vTop + pad : below;
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
		// 触屏:点卡片固定显示,点别处收掉
		const onAnchorDown = (e: PointerEvent) => {
			if (e.pointerType !== 'touch') return;
			hold = true;
			schedule();
		};
		const onDocDown = (e: PointerEvent) => {
			if (!hold) return;
			if (e.target instanceof Node && anchor.contains(e.target)) return;
			hold = false;
		};
		anchor.addEventListener('pointerdown', onAnchorDown);
		document.addEventListener('pointerdown', onDocDown);
		return () => {
			ro.disconnect();
			roAnchor.disconnect();
			anchor.removeEventListener('pointerdown', onAnchorDown);
			document.removeEventListener('pointerdown', onDocDown);
			window.removeEventListener('resize', schedule);
			window.removeEventListener('scroll', schedule, { capture: true });
			window.visualViewport?.removeEventListener('resize', schedule);
			window.visualViewport?.removeEventListener('scroll', schedule);
			if (raf) cancelAnimationFrame(raf);
		};
	});
</script>

<!-- hover 说明淡入淡出。节点挂在 body 下,祖先选择器(.group:hover)够不着,所以开关由 JS 控制 -->
<div
	bind:this={el}
	use:portal
	class="tip pointer-events-none fixed w-max {wide
		? 'max-w-[min(17rem,calc(100vw-2.5rem))]'
		: 'max-w-[min(13rem,calc(100vw-2.5rem))]'} rounded-lg border bg-slate-950/95 px-2.5 py-1.5 text-center text-[11px] leading-snug text-slate-200 shadow-xl {z} {open
		? 'tip-open'
		: ''}"
	style="--rarity: {color ??
		'#94a3b8'}; border-color: color-mix(in srgb, var(--rarity, #94a3b8) 50%, transparent); {pos
		? `left: ${pos.left}px; top: ${pos.top}px;`
		: 'left: -9999px; top: -9999px;'}"
>
	{@render children()}
</div>

<style>
	.tip {
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.tip.tip-open {
		opacity: 1;
	}
</style>
