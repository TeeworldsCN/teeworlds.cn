<script lang="ts">
	import type { Snippet } from 'svelte';
	import { RARITY_INFO, type TeeCard } from '$lib/teecards';
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
		/** 卡面角标(队伍:身上加成数量) */
		badge?: string;
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

	// ---- tooltip 防溢出屏幕两侧:默认居中,靠边时自动钳制 ----
	let wrapEl: HTMLElement | undefined = $state();
	let tipEl: HTMLElement | undefined = $state();
	/** null = 居中模式(left 50% + translateX);否则为相对卡容器的 left px */
	let tipLeft = $state<number | null>(null);

	const positionTip = () => {
		if (!tipEl || !wrapEl) return;
		const tipW = tipEl.offsetWidth;
		const wrapRect = wrapEl.getBoundingClientRect();
		const center = wrapRect.left + wrapRect.width / 2;
		const target = Math.max(8 + tipW / 2, Math.min(center, window.innerWidth - 8 - tipW / 2));
		tipLeft = Math.round(target - tipW / 2 - wrapRect.left);
	};

	$effect(() => {
		if (!tipEl || !wrapEl) return;
		positionTip();
		const ro = new ResizeObserver(positionTip);
		ro.observe(tipEl);
		window.addEventListener('resize', positionTip);
		return () => {
			ro.disconnect();
			window.removeEventListener('resize', positionTip);
		};
	});
</script>

<div class="group relative w-[86px] shrink-0" bind:this={wrapEl}>
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
				class="absolute -top-1.5 -left-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/90 px-1 text-[10px] font-bold text-amber-950 shadow"
			>
				{badge}
			</div>
		{/if}
		<div class="mx-auto h-12 w-12">
			<TeeRender name={teeSkin} {emote} {pose} className="h-full w-full" />
		</div>
		<div class="mt-1 w-full truncate text-center text-xs font-semibold text-slate-200">
			{teeName}
		</div>
	</div>

	{#if desc || tipExtra || tipList?.length}
		<div
			bind:this={tipEl}
			class="tip pointer-events-none absolute bottom-full z-50 mb-2 w-max max-w-52 rounded-lg border px-2.5 py-1.5 text-center text-xs leading-snug text-slate-200 shadow-xl {tipLeft ===
			null
				? 'centered'
				: ''}"
			style={`border-color: color-mix(in srgb, var(--rarity, #94a3b8) 50%, transparent); background: rgba(2, 6, 23, 0.95);${tipLeft !== null ? `left: ${tipLeft}px;` : ''}`}
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
	/* hover 说明淡入淡出。手写 .group:hover 而非 Tailwind group-hover:
	 * 当前 Chromium 样式引擎不应用 Tailwind v4 的 :is(:where(.group):hover *) 写法 */
	.tip {
		opacity: 0;
		transition: opacity 0.15s ease;
		left: 50%;
		transform: translateX(-50%);
	}

	/* JS 钳制定位时取消居中 translate */
	.tip:not(.centered) {
		transform: none;
	}

	.group:hover .tip {
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
