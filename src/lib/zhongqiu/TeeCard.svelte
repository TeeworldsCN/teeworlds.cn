<script lang="ts">
	import type { Snippet } from 'svelte';
	import { RARITY_INFO, type TeeCard } from './teecards';
	import TeeRender, { type TeePose } from '$lib/components/TeeRender.svelte';
	import CardTip from './CardTip.svelte';
	import { fade } from 'svelte/transition';

	/**
	 * 统一 Tee 小卡。三处复用(队伍 / 3 选 1 / 中秋集市):
	 * - 卡本体:固定尺寸,稀有度边框 + 头像 + 名字,样式统一
	 * - 说明(desc):hover 淡入淡出弹出,可带附加信息(tipExtra)
	 * - 操作区(actions):渲染在卡牌下方(队伍:掷骰结果;3 选 1:选择;中秋集市:购买)
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
		tipList?: { text: string; cls?: string; name?: string; nameColor?: string }[];
		/** 卡面角标(队伍:身上加成数量;开局选卡:出战顺序) */
		badge?: string;
		/** 角标配色(默认琥珀;开局选卡用翠绿,与「已选」同色系) */
		badgeClass?: string;
		/** 技能角标(主动技剩余冷却 / 可发动),固定卡片左下角、紫红色 —— 和加成卡角标分开 */
		skillBadge?: string;
		/** 卡牌下方的操作/结果区(队伍:结果;3 选 1:选择按钮;中秋集市:购买按钮) */
		actions?: Snippet;
		/** 卡牌右上角角标(队伍:卖出 ×) */
		sellBtn?: Snippet;
		/** 选中高亮(3 选 1 已选) */
		selected?: boolean;
		/** 掷骰中高亮(队伍) */
		active?: boolean;
		/** 动画 class(队伍:tee-throw / tee-celebrate 等) */
		animate?: string;
		/** 投掷等级标签 */
		level?: string;
		/** 投掷等级颜色(Tailwind 文字色类):和结算动画等级行同一套 —— 金色高档/绿色正分/灰色 0 分 */
		levelColor?: string;
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
		skillBadge,
		actions,
		sellBtn,
		selected = false,
		active = false,
		animate = '',
		level = '',
		levelColor = ''
	}: Props = $props();

	const rarity = $derived(card?.rarity);
	const rinfo = $derived(rarity ? RARITY_INFO[rarity] : null);
	/** 头像:卡牌用卡上的皮肤;没有卡(「我」)用传进来的 skin */
	const teeSkin = $derived(card?.skin ?? skin);
	const teeName = $derived(card?.name ?? name);

	let wrapEl: HTMLElement | undefined = $state();
	/** 鼠标 hover / 键盘聚焦 */
	let hover = $state(false);
	/** 触屏:点一下固定显示(触摸抬指后立刻 pointerleave,只靠 hover 收不住) */
	let hold = $state(false);
	const showTip = $derived(hover || hold);
	// 点卡片外面收掉;点卡片本身不算(点一下固定、再点还是固定 —— 和以前 CardTip 里的行为一致)。
	// 用**捕获**阶段:加成卡芯片会在自己那按里 stopPropagation()(免得窗口那条 dismissTip
	// 把刚点开的说明又收掉),冒泡阶段的监听根本收不到那一按 —— 捕获先于它执行。
	$effect(() => {
		if (!hold) return;
		const onDocDown = (e: PointerEvent) => {
			if (e.target instanceof Node && wrapEl?.contains(e.target)) return;
			hold = false;
		};
		document.addEventListener('pointerdown', onDocDown, true);
		return () => document.removeEventListener('pointerdown', onDocDown, true);
	});
</script>

<div
	class="group relative w-[76px] shrink-0 text-xs max-[365px]:w-[74px]"
	role="group"
	bind:this={wrapEl}
	onpointerenter={() => (hover = true)}
	onpointerleave={() => (hover = false)}
	onpointerdown={(e) => {
		if (e.pointerType === 'touch') hold = true;
	}}
	onfocusin={() => (hover = true)}
	onfocusout={() => (hover = false)}
>
	<div
		class="tee-card transition-colors {selected ? 'ring-2 ring-emerald-400' : ''} {active
			? '-translate-y-1 border-amber-300/90 bg-[#2c2c2c] shadow-[0_0_16px_rgba(251,191,36,0.55),0_4px_12px_rgba(0,0,0,0.35)]'
			: 'bg-[#1d2639]'} {animate}"
		style={`--rarity: ${rinfo?.color ?? '#94a3b8'}`}
	>
		{#if sellBtn}
			{@render sellBtn()}
		{/if}
		{#if badge}
			<div
				class="absolute -right-1.5 -bottom-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-bold shadow {badgeClass}"
			>
				{badge}
			</div>
		{/if}
		{#if skillBadge}
			<div
				class="absolute -bottom-1.5 -left-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-fuchsia-500/90 px-1 font-bold text-fuchsia-950 shadow"
			>
				{skillBadge}
			</div>
		{/if}
		<div class="mx-auto h-12 w-12 max-[365px]:h-10 max-[365px]:w-10">
			<TeeRender name={teeSkin} {emote} {pose} className="h-full w-full" />
		</div>
		{#if level}
			<div
				transition:fade
				class="absolute -top-1 -left-1.5 rounded-full px-1.5 text-center font-semibold {levelColor} -rotate-6 text-[0.9em]"
				style="background: color-mix(in srgb, currentColor 22%, #1d2639); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.45)"
			>
				{level}
			</div>
		{/if}
		<div class="mt-1 h-2 w-full text-center font-semibold text-nowrap text-slate-200">
			<div class="-mt-1">{teeName}</div>
		</div>
	</div>

	{#if (desc || tipExtra || tipList?.length) && showTip}
		<CardTip anchor={wrapEl} color={rinfo?.color}>
			{desc}
			{#if tipExtra}
				<div class="mt-1 font-semibold text-amber-300">{tipExtra}</div>
			{/if}
			{#if tipList?.length}
				<div class="mt-1.5 space-y-0.5 border-t border-slate-600/50 pt-1 text-left">
					{#each tipList as line}
						<div class={line.cls ?? 'text-slate-400'}>
							<!-- 名字单独上色(加成卡按稀有度:普通灰 / 稀有蓝 / 传说金) -->
							{#if line.name}<b style="color: {line.nameColor}">{line.name}</b>{/if}{line.text}
						</div>
					{/each}
				</div>
			{/if}
		</CardTip>
	{/if}

	{#if actions}
		<div class="mt-2 mb-1 flex flex-col items-center">
			{@render actions()}
		</div>
	{/if}
</div>

<style>
	.tee-card {
		/* 角标(⚡/✨)和卖出 ✕ 都 absolute 在卡内,锚点必须是卡片本体,
		 * 否则会锚到外层容器(卡 + 分数行),左下角标会掉到分数行下面 */
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 8px;
		border-radius: 12px;
		border: 1px solid color-mix(in srgb, var(--rarity, #94a3b8) 45%, transparent);
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
