<script lang="ts">
	import { page } from '$app/state';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import PlayerLink from '$lib/components/ddnet/PlayerLink.svelte';
	import FlagSpan from '$lib/components/FlagSpan.svelte';
	import type { RankInfo } from './+page.server';

	const sliceRanks = () => {
		const result = { total: [], team: [], rank: [], yearly: [], monthly: [], weekly: [] };
		for (const ladder of Object.keys(page.data.ranks) as (keyof RankInfo['ranks'])[]) {
			result[ladder] = page.data.ranks[ladder].slice(0, top500 ? 500 : 20);
		}
		return result;
	};

	let top500 = $state(false);
	let ranks: RankInfo['ranks'] = $state(sliceRanks());

	$effect(() => {
		ranks = sliceRanks();
	});

	const LADDER_NAMES = {
		total: '🌎 总通过分',
		yearly: '📅 获得通过分 (近365天)',
		monthly: '📅 获得通过分 (近30天)',
		weekly: '📅 获得通过分 (近7天)',
		team: '👥 团队排位分',
		rank: '👤 个人排位分'
	};
</script>

<Breadcrumbs
	breadcrumbs={[{ href: '/', text: '首页' }, { href: '/ddnet', text: 'DDNet' }, { text: '排名' }]}
/>

<button
	class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:bg-blue-500 disabled:opacity-50"
	onclick={() => (top500 = !top500)}
>
	{top500 ? '显示 20 名' : '显示 500 名'}
</button>

<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
	{#each Object.keys(ranks) as ladder}
		<div class="mt-4 rounded-lg bg-slate-700 p-4 shadow-md">
			{#if ladder == 'total'}
				<h2 class="text-xl font-bold">{LADDER_NAMES[ladder]}（共 {page.data.total_points}pts）</h2>
			{:else}
				<h2 class="text-xl font-bold">{LADDER_NAMES[ladder as any as keyof RankInfo['ranks']]}</h2>
			{/if}
			<ul class="mt-2">
				{#each ranks[ladder as any as keyof RankInfo['ranks']] as rank}
					<li>
						<span class="inline-block w-8 text-right">{rank.rank}.</span>
						<span class="inline-block w-20 text-right">{rank.points}pts</span>
						<FlagSpan flag={rank.region} />
						<PlayerLink player={rank.name} className="font-semibold">{rank.name}</PlayerLink>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</div>
