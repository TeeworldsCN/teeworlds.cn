<script lang="ts">
	import { RARITY_INFO } from './teecards';
	import type { BuffCard } from './items';

	/**
	 * 加成卡说明的内容部分(不含外框定位)—— 三处共用:
	 * 队伍货架、中秋集市货架、图鉴。外框由各自的容器/浮层提供。
	 */
	type Props = {
		card: BuffCard;
		/** 未解锁(图鉴):名字藏起来,效果也不露 */
		locked?: boolean;
		/** 底部那行小字;传 null 去掉(图鉴里没有「点 Tee 挂上」这回事) */
		foot?: string | null;
	};

	let { card, locked = false, foot = '点队伍里的 Tee 挂上' }: Props = $props();

	/** 未解锁也要给稀有度色 —— 图鉴的描边不该剧透名字,但稀有度本来就露着 */
	const color = $derived(RARITY_INFO[card.rarity].color);
</script>

<div class="font-semibold" style="color: {color}">
	{locked ? '？？？' : card.name}
	{#if !locked}
		<span class="ml-1 font-normal text-sky-300">持续 {card.turns} 关</span>
	{/if}
</div>
<div class="mt-0.5 text-slate-300">{locked ? '尚未解锁' : card.desc}</div>
{#if foot}
	<div class="mt-1 text-[10px] text-slate-400">{foot}</div>
{/if}
