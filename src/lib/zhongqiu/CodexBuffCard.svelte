<script lang="ts">
	import TeeRender from '$lib/components/TeeRender.svelte';
	import CardTip from './CardTip.svelte';
	import BuffTip from './BuffTip.svelte';
	import { RARITY_INFO, cardBorderColor } from './teecards';
	import type { BuffCard } from './items';

	/**
	 * 图鉴里的加成卡格子:样式取自中秋集市货架(头像 + 名字 + 价格),
	 * 去掉集市特有的那几态(上锁 / 已买 / 选中 / 买不起)。
	 *
	 * 集市那个格子身上挂着买卖、锁定、双击购买一整套交互,直接复用会把那些行为
	 * 一起带进图鉴,所以这里是精简副本 —— 改样式时两边要一起改。
	 */
	type Props = {
		card: BuffCard;
		unlocked: boolean;
	};

	let { card, unlocked }: Props = $props();

	let wrapEl: HTMLElement | undefined = $state();
	/** 鼠标 hover(触屏那套「点一下固定显示」在 CardTip 里) */
	let hover = $state(false);

	const color = $derived(RARITY_INFO[card.rarity].color);
</script>

<div
	class="relative"
	role="group"
	bind:this={wrapEl}
	onpointerenter={() => (hover = true)}
	onpointerleave={() => (hover = false)}
	onfocusin={() => (hover = true)}
	onfocusout={() => (hover = false)}
>
	<div
		class="flex h-8 w-full items-center gap-1 rounded-lg border bg-slate-800/70 px-1.5 text-left transition"
		style="border-color: {cardBorderColor(color)}"
	>
		<span class="h-5 w-5 shrink-0">
			<!-- 未解锁也照旧显示本人皮肤(不再换 x_spec 占位图),藏名字就够了 -->
			<TeeRender name={card.skin} className="h-full w-full" lazy />
		</span>
		<span class="min-w-0 flex-1 truncate text-xs leading-tight font-semibold text-slate-200">
			{#if unlocked}{card.name}{:else}&nbsp;{/if}
		</span>
		<span class="shrink-0 text-[11px] font-bold text-amber-300">🥮 {card.price}</span>
	</div>
	<!-- 加成卡说明比 Tee 卡长,用宽一档的浮层(和货架上那个 buffPop 同一个宽度) -->
	<CardTip anchor={wrapEl} {hover} {color} wide>
		<BuffTip {card} locked={!unlocked} />
	</CardTip>
</div>
