<script lang="ts">
	import TeeRender from '$lib/components/TeeRender.svelte';
	import { RARITY_INFO, cardBorderColor } from './teecards';
	import type { BuffCard } from './items';

	/**
	 * 图鉴里的加成卡格子。
	 *
	 * 和 Tee 卡**故意长得不一样**(一眼分出两个池子):横条 —— 左边 24px 头像 + 名字
	 * (价格靠右),下面两行描述;比 Tee 卡矮一大截、宽一倍。
	 * 描述同样直接印在卡上,不用浮层;未解锁时皮肤名传空(自带兜底图,不走网络)+ 压暗。
	 */
	type Props = {
		card: BuffCard;
		unlocked: boolean;
	};

	let { card, unlocked }: Props = $props();

	const color = $derived(RARITY_INFO[card.rarity].color);
</script>

<div
	class="codex-buff flex flex-col rounded-xl border bg-slate-800/70 px-3 py-2 {unlocked
		? ''
		: 'opacity-35'}"
	style="border-color: {cardBorderColor(color)}"
>
	<div class="flex items-center gap-2">
		<span class="h-6 w-6 shrink-0">
			<TeeRender name={unlocked ? card.skin : ''} className="h-full w-full" lazy />
		</span>
		<span
			class="codex-name min-w-0 flex-1 truncate text-sm leading-tight font-semibold text-slate-200"
		>
			{#if unlocked}{card.name}{:else}&nbsp;{/if}
		</span>
		<span class="shrink-0 text-xs font-bold text-amber-300">🥮 {card.price}</span>
		<!-- 持续关数以前只在 tooltip 里,图鉴改成「说明印在卡上」后必须补回来 -->
		<span class="shrink-0 text-[11px] text-slate-500">持续 {card.turns} 关</span>
	</div>
	<div
		class="codex-desc mt-1 flex h-[36px] overflow-hidden text-xs leading-[1.5] {unlocked
			? 'text-slate-300'
			: 'items-center text-slate-500'}"
	>
		{unlocked ? card.desc : '尚未发现'}
	</div>
</div>
