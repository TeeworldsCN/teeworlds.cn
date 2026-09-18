<script lang="ts">
	import type { Snippet } from 'svelte';
	import { RARITY_INFO, type TeeCard } from './teecards';
	import TeeRender, { type TeePose } from '$lib/components/TeeRender.svelte';

	/**
	 * 统一 Tee 小卡。三处复用(队伍 / 3 选 1 / 商店):
	 * - 卡本体:固定尺寸,稀有度边框 + 头像 + 名字,样式统一
	 * - 说明(desc):hover 淡入淡出弹出,可带附加信息(tipExtra)
	 * - 操作区(actions):渲染在卡牌下方(队伍:掷骰结果;3 选 1:选择;商店:购买)
	 */
	type Props = {
		/** 卡牌数据;null 时表示玩家自己(用 skin/name) */
		card?: TeeCard | null;
		/** 无卡时(玩家自己)的皮肤 */
		skin?: string;
		/** 无卡时(玩家自己)的名字 */
		name?: string;
		/** 头像表情(队伍动画) */
		emote?: number;
		/** 头像姿势(队伍动画) */
		pose?: TeePose | null;
		/** 卡牌说明,hover 淡入淡出弹出 */
		desc?: string;
		/** tooltip 底部附加信息(队伍:卖出价值) */
		tipExtra?: string;
		/** tooltip 附加明细行(队伍:身上加成项目+剩余回合、成长卡当前数值) */
		tipList?: { text: string; cls?: string }[];
		/** 卡面角标(队伍:身上加成数量;开局选卡:出战顺序) */
		badge?: string;
		/** 角标配色(默认琥珀;开局选卡用翠绿,与「已选」同色系) */
		badgeClass?: string;
		/** 卡牌下方的操作/结果区(队伍:结果;3 选 1:选择按钮;商店:购买按钮) */
		actions?: Snippet;
		/** 卡牌右上角角标(队伍:卖出 ×) */
		sellBtn?: Snippet;
		/** 选中高亮(3 选 1 已选) */
		selected?: boolean;
		/** 掷骰中高亮(队伍) */
		active?: boolean;
		/** 动画 class(队伍:tee-throw / tee-celebrate 等) */
		animate?: string;
	};

	let {
		card = null,
		skin = '',
		name = '',
		emote,
		pose,
		desc,
		tipExtra,
		tipList,
		badge,
		badgeClass = 'bg-amber-500/90 text-amber-950',
		actions,
		sellBtn,
		selected = false,
		active = false,
		animate = ''
	}: Props = $props();

	const rarity = $derived(card?.rarity);
	const rinfo = $derived(rarity ? RARITY_INFO[rarity] : null);
	const teeSkin = $derived(card?.skin ?? (skin || 'x_spec'));
	const teeName = $derived(card?.name ?? name);

	// ---- tooltip 挂到 body 下:脱离所有 overflow:hidden / transform 的祖先 ----
	let wrapEl: HTMLElement | undefined = $state();
	let tipEl: HTMLElement | undefined = $state();
	/** 视口坐标(position: fixed)。null = 还没量过,先挪到屏幕外 */
	let tipPos = $state<{ left: number; top: number } | null>(null);
	/** 挂到 body 后 CSS 的 .group:hover 够不着了,用 JS 开关 */
	let tipOpen = $state(false);
	/** 触屏上的固定显示:点别处才收(触摸指针抬指后立刻 pointerleave) */
	let touchHold = false;

	/**
	 * 提示框已经是 body 的直接子节点,所以这里算的全是**视口坐标** ——
	 * 既不用折算祖先的 transform: scale,也不会被 overflow: hidden 切掉。
	 */
	const positionTip = () => {
		if (!tipEl || !wrapEl) return;
		// visualViewport 才是「真正看得见」的区域:桌面版网站 / 双指缩放时它会窄于 innerWidth,
		// 只钳 innerWidth 的话提示框会跑到屏幕外看不到
		const vv = window.visualViewport;
		const vLeft = vv ? vv.offsetLeft : 0;
		const vTop = vv ? vv.offsetTop : 0;
		const vRight = vLeft + (vv ? vv.width : window.innerWidth);
		const vBottom = vTop + (vv ? vv.height : window.innerHeight);
		const wr = wrapEl.getBoundingClientRect();
		const tw = tipEl.offsetWidth;
		const th = tipEl.offsetHeight;
		const pad = 8;
		// 水平:先当居中,贴边就钳进来
		const left = Math.max(
			vLeft + pad,
			Math.min(wr.left + wr.width / 2 - tw / 2, vRight - pad - tw)
		);
		// 垂直:优先放卡片上方;上方不够翻到下方;下方也放不下就贴住可视区顶部
		let top = wr.top - pad - th;
		if (top < vTop + pad) {
			const below = wr.bottom + pad;
			top = below + th > vBottom - pad ? vTop + pad : below;
		}
		tipPos = { left: Math.round(left), top: Math.round(top) };
	};

	/** 把提示框节点搬到 body 下:不受任何祖先的 overflow / transform 影响 */
	const portal = (node: HTMLElement) => {
		document.body.appendChild(node);
		scheduleTip();
		return {
			destroy: () => node.remove()
		};
	};

	/**
	 * 重算入口:resize / 缩放 / 祖先布局变化都走这里。
	 * 下一帧再算 —— resize 事件里读到的 rect 还是旧布局,直接算会取到过时的位置;
	 * 同一帧内多次触发只算一次。
	 */
	let tipRaf = 0;
	const scheduleTip = () => {
		if (tipRaf) return;
		tipRaf = requestAnimationFrame(() => {
			tipRaf = 0;
			positionTip();
		});
	};

	$effect(() => {
		if (!tipEl || !wrapEl) return;
		positionTip();
		const ro = new ResizeObserver(scheduleTip);
		ro.observe(tipEl);
		// 卡片本身/祖先的布局变化也会让提示框错位(队伍满员换卡、结算行增高……)
		const roWrap = new ResizeObserver(scheduleTip);
		roWrap.observe(wrapEl);
		window.addEventListener('resize', scheduleTip);
		// 手机「桌面版网站」+ 双指缩放:变的是 visualViewport,window 的 resize 不一定触发
		window.visualViewport?.addEventListener('resize', scheduleTip);
		window.visualViewport?.addEventListener('scroll', scheduleTip);
		// 触屏:点卡片以外的地方收掉固定显示的提示框
		const onDocDown = (e: PointerEvent) => {
			if (!touchHold) return;
			if (e.target instanceof Node && wrapEl?.contains(e.target)) return;
			touchHold = false;
			tipOpen = false;
		};
		document.addEventListener('pointerdown', onDocDown);
		return () => {
			ro.disconnect();
			roWrap.disconnect();
			document.removeEventListener('pointerdown', onDocDown);
			window.removeEventListener('resize', scheduleTip);
			window.visualViewport?.removeEventListener('resize', scheduleTip);
			window.visualViewport?.removeEventListener('scroll', scheduleTip);
			if (tipRaf) cancelAnimationFrame(tipRaf);
		};
	});
</script>

<div
	class="group relative w-[86px] shrink-0 max-[365px]:w-[74px]"
	role="group"
	bind:this={wrapEl}
	onpointerenter={() => {
		tipOpen = true;
		scheduleTip();
	}}
	onpointerleave={() => {
		if (!touchHold) tipOpen = false;
	}}
	onpointerdown={(e) => {
		// 触屏没有 hover:点一下固定显示,点别处再收 —— 和接管前的 CSS :hover 行为一致
		if (e.pointerType !== 'touch') return;
		touchHold = true;
		tipOpen = true;
		scheduleTip();
	}}
	onfocusin={() => {
		tipOpen = true;
		scheduleTip();
	}}
	onfocusout={() => (tipOpen = false)}
>
	<div
		class="tee-card {selected ? 'ring-2 ring-emerald-400' : ''} {active
			? '-translate-y-1 border-amber-400/70 bg-amber-400/10 shadow-lg shadow-amber-900/30'
			: ''} {animate}"
		style={`--rarity: ${rinfo?.color ?? '#94a3b8'}`}
	>
		{#if sellBtn}
			{@render sellBtn()}
		{/if}
		{#if badge}
			<div
				class="absolute -top-1.5 -left-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold shadow {badgeClass}"
			>
				{badge}
			</div>
		{/if}
		<div class="mx-auto h-12 w-12 max-[365px]:h-10 max-[365px]:w-10">
			<TeeRender name={teeSkin} {emote} {pose} className="h-full w-full" />
		</div>
		<div
			class="mt-1 w-full truncate text-center text-xs font-semibold text-slate-200 max-[365px]:text-[11px]"
		>
			{teeName}
		</div>
	</div>

	{#if desc || tipExtra || tipList?.length}
		<div
			bind:this={tipEl}
			use:portal
			class="tip pointer-events-none fixed z-40 w-max max-w-[min(13rem,calc(100vw-2.5rem))] rounded-lg border px-2.5 py-1.5 text-center text-xs leading-snug text-slate-200 shadow-xl {tipOpen
				? 'tip-open'
				: ''}"
			style={`border-color: color-mix(in srgb, var(--rarity, #94a3b8) 50%, transparent); background: rgba(2, 6, 23, 0.95);${
				tipPos ? `left: ${tipPos.left}px; top: ${tipPos.top}px;` : 'left: -9999px; top: -9999px;'
			}`}
		>
			{desc}
			{#if tipExtra}
				<div class="mt-1 text-[10px] font-semibold text-amber-300">{tipExtra}</div>
			{/if}
			{#if tipList?.length}
				<div class="mt-1.5 space-y-0.5 border-t border-slate-600/50 pt-1 text-left text-[10px]">
					{#each tipList as line}
						<div class={line.cls ?? 'text-slate-400'}>{line.text}</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if actions}
		<div class="mt-1.5 flex flex-col items-center">
			{@render actions()}
		</div>
	{/if}
</div>

<style>
	/* hover 说明淡入淡出。节点挂在 body 下,祖先选择器(.group:hover)够不着,
	 * 所以开关由 JS 的 onpointerenter / onfocusin 控制 */
	.tip {
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.tip.tip-open {
		opacity: 1;
	}

	.tee-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 86px;
		padding: 8px;
		border-radius: 12px;
		border: 1px solid color-mix(in srgb, var(--rarity, #94a3b8) 45%, transparent);
		background: rgba(30, 41, 59, 0.6);
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease;
	}

	/* 320px(初代 SE):卡片整体缩一档,否则 Boss 关 + 6 人满队会溢出约 15px */
	@media (max-width: 365px) {
		.tee-card {
			width: 74px;
			padding: 6px;
			border-radius: 10px;
		}
	}

	.tee-card:hover {
		/* 只加阴影,不用 transform:避免与投掷动画(transform keyframes)冲突 */
		box-shadow: 0 6px 14px color-mix(in srgb, var(--rarity, #94a3b8) 22%, transparent);
	}

	.tee-throw {
		animation: tee-throw 0.75s ease-in-out both;
	}

	@keyframes tee-throw {
		0%,
		100% {
			transform: translateY(0) rotate(0deg);
		}
		30% {
			transform: translateY(-6px) rotate(-6deg);
		}
		60% {
			transform: translateY(-2px) rotate(4deg);
		}
	}

	.tee-celebrate {
		animation: tee-celebrate 0.9s ease-in-out 2;
	}

	@keyframes tee-celebrate {
		0%,
		100% {
			transform: translateY(0) rotate(0deg);
		}
		30% {
			transform: translateY(-18px) rotate(-8deg) scale(1.05);
		}
		55% {
			transform: translateY(-14px) rotate(6deg);
		}
		75% {
			transform: translateY(-4px) rotate(-3deg);
		}
	}

	.tee-happy {
		animation: tee-happy 0.8s ease-in-out 2;
	}

	@keyframes tee-happy {
		0%,
		100% {
			transform: rotate(0deg);
		}
		25% {
			transform: rotate(-7deg) translateY(-4px);
		}
		50% {
			transform: rotate(5deg);
		}
		75% {
			transform: rotate(-3deg) translateY(-2px);
		}
	}

	.tee-sad {
		animation: tee-sad 0.8s ease-in-out 1;
	}

	@keyframes tee-sad {
		0%,
		100% {
			transform: translateY(0) rotate(0deg);
		}
		40% {
			transform: translateY(6px) rotate(3deg);
		}
	}
</style>
