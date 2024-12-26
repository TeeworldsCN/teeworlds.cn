<script lang="ts">
	import { goto } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import PlayerLink from '$lib/components/ddnet/PlayerLink.svelte';
	import FlagSpan from '$lib/components/FlagSpan.svelte';
	import type { RankInfo } from './+page.server';

	let { data } = $props();

	const sliceRanks = () => {
		const result: RankInfo['ranks'] = {
			total: [],
			team: [],
			rank: [],
			yearly: [],
			monthly: [],
			weekly: []
		};
		for (const ladder of Object.keys(data.ranks) as (keyof RankInfo['ranks'])[]) {
			result[ladder] = data.ranks[ladder].slice(0, top500 ? 500 : 20);
		}
		return result;
	};

	const filterRanks = () => {
		const result: RankInfo['ranks'] = {
			total: [],
			team: [],
			rank: [],
			yearly: [],
			monthly: [],
			weekly: []
		};
		for (const ladder of Object.keys(data.ranks) as (keyof RankInfo['ranks'])[]) {
			result[ladder] = data.ranks[ladder].filter((rank) => rank.name == searchName);
		}
		return result;
	};

	let top500 = $state(false);
	let ranks: RankInfo['ranks'] = $state(sliceRanks());

	let searchName = $state('');

	const MIN_QUERY_INTERVAL = 200;
	let queryListName: string | null = null;
	let queryList = $state<{ name: string; points: number }[]>([]);
	let querying = false;
	let lastQueryTime = 0;

	function gotoName(name: string) {
		goto(`/ddnet/players/${encodeURIComponent(name)}`);
	}

	async function query() {
		if (querying) return;

		querying = true;
		const remaining = MIN_QUERY_INTERVAL - (Date.now() - lastQueryTime);
		lastQueryTime = Date.now();
		if (remaining > 0) {
			await new Promise((resolve) => setTimeout(resolve, remaining));
		}
		queryListName = searchName;
		if (!searchName) {
			queryList = [];
		} else {
			queryList = await (
				await fetch(`?query=${encodeURIComponent(queryListName)}`)
			).json();
		}
		querying = false;
		if (searchName != queryListName) {
			query();
		}
	}

	$effect(() => {
		if (searchName) {
			ranks = filterRanks();
		} else {
			ranks = sliceRanks();
		}
	});

	$effect(() => {
		searchName;
		query();
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
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ href: '/ddnet', text: 'DDNet' },
		{ text: '排名', title: 'DDNet 排名' }
	]}
/>

<div class="mb-4 md:flex md:space-x-5">
	<input
		type="text"
		placeholder="查找玩家名"
		class="w-full rounded border border-slate-600 bg-slate-700 p-2 text-slate-300 md:mb-0 md:flex-1"
		bind:value={searchName}
		onkeydown={(ev) => {
			if (ev.key == 'Enter') {
				gotoName(searchName);
			}
		}}
	/>
	<button
		class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:bg-blue-500 disabled:opacity-50"
		onclick={() => gotoName(searchName)}
		disabled={!searchName}
	>
		查询玩家
	</button>
</div>

<!-- horizontally scrollable list of cards -->
<div class="scrollbar-hide overflow-x-auto text-nowrap">
	{#each queryList as player}
		<button
			class="mx-2 inline-block rounded border {player.name == searchName
				? 'border-slate-300'
				: 'border-slate-600'} bg-slate-700 px-2 py-0 hover:border-blue-500 active:border-blue-300"
			onclick={() => {
				gotoName(player.name);
			}}
		>
			<span class="text-base font-bold">{player.name}</span>
			<span class="text-sm">
				{player.points}pts
			</span>
		</button>
	{/each}
</div>

<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
	{#each Object.keys(ranks) as ladder}
		<div
			class="mt-4 rounded-lg bg-slate-700 p-4 shadow-md {ranks[
				ladder as any as keyof RankInfo['ranks']
			].length == 0
				? 'opacity-50'
				: ''}"
		>
			{#if ladder == 'total'}
				<h2 class="text-xl font-bold">{LADDER_NAMES[ladder]}（共 {data.total_points}pts）</h2>
			{:else}
				<h2 class="text-xl font-bold">{LADDER_NAMES[ladder as any as keyof RankInfo['ranks']]}</h2>
			{/if}
			<ul class="mt-2">
				{#if ranks[ladder as any as keyof RankInfo['ranks']].length == 0}
					<li>
						<span class="text-center">该名字未进入前 500 名</span>
					</li>
				{:else}
					{#each ranks[ladder as any as keyof RankInfo['ranks']] as rank}
						<li>
							<span class="inline-block w-8 text-right">{rank.rank}.</span>
							<span class="inline-block w-20 text-right">{rank.points}pts</span>
							<FlagSpan flag={rank.region} />
							<PlayerLink player={rank.name} className="font-semibold">{rank.name}</PlayerLink>
						</li>
					{/each}
				{/if}
			</ul>
		</div>
	{/each}
</div>
