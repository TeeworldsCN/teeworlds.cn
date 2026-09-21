<script lang="ts">
	import TeeRender from '$lib/components/TeeRender.svelte';
	import { RARITY_INFO, cardBorderColor, type TeeCard } from './teecards';

	/**
	 * 图鉴专用 Tee 卡(不再复用游戏里的 TeeCard)。
	 *
	 * 和游戏内卡片的区别,都是为「看」而不是为「玩」服务的:
	 *   · **尺寸统一**:头像 + 名字 + 描述区,高度写死 —— 一屏几十张卡,大小参差会很乱;
	 *   · **描述直接印在卡上**,不用 hover 浮层:图鉴就是拿来读效果的,点开即见更直观;
	 *   · 字号按「能滚动」放宽(名字 12~14px、描述 11~12px),读起来不费劲;
	 *   · 窄屏描述区矮一档并 `line-clamp` 收尾(手机上要一屏多看几张,长描述放不下);
	 *   · 未解锁:皮肤名传空(TeeRender 自带兜底图,不走网络)、名字留空、整张压暗。
	 */
	type Props = {
		card: TeeCard;
		unlocked: boolean;
	};

	let { card, unlocked }: Props = $props();

	const color = $derived(RARITY_INFO[card.rarity].color);
</script>

<div
	class="codex-tee flex h-full flex-col items-center rounded-xl border bg-slate-800/60 px-2 py-2 text-center sm:px-3 sm:py-2.5 {unlocked
		? ''
		: 'opacity-35'}"
	style="border-color: {cardBorderColor(color)}"
>
	<div class="h-9 w-9 shrink-0 sm:h-12 sm:w-12">
		<TeeRender name={unlocked ? card.skin : ''} className="h-full w-full" lazy />
	</div>
	<div
		class="codex-name mt-1.5 w-full truncate text-xs leading-tight font-semibold text-slate-100 sm:mt-2 sm:text-sm"
	>
		{#if unlocked}{card.name}{:else}&nbsp;{/if}
	</div>
	<div
		class="codex-desc mt-1 line-clamp-4 h-[60px] w-full overflow-hidden text-[11px] leading-[1.36] sm:mt-1.5 sm:line-clamp-4 sm:h-[72px] sm:text-xs sm:leading-[1.5] {unlocked
			? 'text-left text-slate-300'
			: 'flex items-center justify-center text-slate-500'}"
	>
		{unlocked ? card.desc : '尚未发现'}
	</div>
</div>
