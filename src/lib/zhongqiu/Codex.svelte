<script lang="ts">
	import CodexTeeCard from './CodexTeeCard.svelte';
	import CodexBuffCard from './CodexBuffCard.svelte';
	import { CARDS, RARITY_INFO, type Rarity } from './teecards';
	import { BUFF_CARDS } from './items';
	import {
		isTeeUnlocked,
		isBuffUnlocked,
		teeUnlockedCount,
		buffUnlockedCount
	} from './codex.svelte';

	/**
	 * 队友图鉴:两页 —— Tee 卡 / 加成卡,都按稀有度排(普通 → 稀有 → 传说)。
	 *
	 * 卡片是**图鉴专用**的(不再复用游戏里的 TeeCard):描述直接印在卡上,没有浮层。
	 * 两类卡故意做成不同尺寸 —— Tee 卡是等高的方块(头像 + 名字 + 三行描述),
	 * 加成卡是矮一半的横条 —— 一眼就能分出这是两个池子。
	 * 未解锁:名字留空、皮肤名也传空(TeeRender 自带兜底图,不走网络)、整张压暗。
	 */
	type Props = {
		show?: boolean;
	};

	let { show = $bindable() }: Props = $props();

	let tab = $state<'tee' | 'buff'>('tee');

	/** 普通 → 稀有 → 传说;同级保持卡表原顺序(Array.sort 是稳定的) */
	const RANK: Record<Rarity, number> = { common: 0, rare: 1, legendary: 2 };

	const teeList = $derived(
		[...CARDS]
			.sort((a, b) => RANK[a.rarity] - RANK[b.rarity])
			.map((card) => ({ card, unlocked: isTeeUnlocked(card.id) }))
	);

	const buffList = $derived(
		[...BUFF_CARDS]
			.sort((a, b) => RANK[a.rarity] - RANK[b.rarity])
			.map((card) => ({ card, unlocked: isBuffUnlocked(card.id) }))
	);

	const tabCls = (on: boolean) =>
		`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition sm:text-sm ${
			on
				? 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-400'
				: 'bg-slate-800/70 text-slate-400 hover:text-slate-200'
		}`;
</script>

{#if show}
	<div
		class="fixed inset-0 z-50 flex cursor-default items-center justify-center bg-black/60 p-2 backdrop-blur-sm sm:p-4"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) show = false;
		}}
	>
		<!-- select-text:活动页整体是 select-none,图鉴这里放开 —— 卡面描述就是拿来复制的 -->
		<div
			class="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-slate-900 select-text"
			role="dialog"
			aria-modal="true"
			aria-label="队友图鉴"
		>
			<!-- 标题 -->
			<div
				class="flex items-center justify-between gap-2 border-b border-slate-700/60 px-3 py-2.5 sm:px-4"
			>
				<div class="text-base font-bold text-amber-200 sm:text-xl">📖 队友图鉴</div>
				<button
					class="rounded-lg bg-slate-700/60 px-2.5 py-1 text-sm font-bold text-slate-300 transition hover:bg-slate-600"
					onclick={() => (show = false)}
					aria-label="关闭"
				>
					✕
				</button>
			</div>

			<!-- 两个 tab -->
			<div class="flex flex-wrap gap-1.5 px-3 pt-2.5 sm:px-4">
				<button class={tabCls(tab === 'tee')} onclick={() => (tab = 'tee')}>
					Tee 卡
					<span class="font-normal text-slate-400">{teeUnlockedCount()}/{CARDS.length}</span>
				</button>
				<button class={tabCls(tab === 'buff')} onclick={() => (tab = 'buff')}>
					加成卡
					<span class="font-normal text-slate-400">{buffUnlockedCount()}/{BUFF_CARDS.length}</span>
				</button>
			</div>

			<!-- 卡片列表(只有这里滚动)。auto-rows-fr:每行等高 → 每张卡一样大。
			     皮肤是懒加载的(滚到哪加载哪),所以一屏几十张卡也不会一起发请求。 -->
			<div class="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-3 sm:px-4">
				{#if tab === 'tee'}
					<div class="grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5">
						{#each teeList as { card, unlocked } (card.id)}
							<CodexTeeCard {card} {unlocked} />
						{/each}
					</div>
				{:else}
					<div class="grid auto-rows-fr grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5">
						{#each buffList as { card, unlocked } (card.id)}
							<CodexBuffCard {card} {unlocked} />
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
