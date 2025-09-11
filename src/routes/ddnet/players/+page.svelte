<script lang="ts">
	import { goto } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import PlayerLink from '$lib/components/ddnet/PlayerLink.svelte';
	import FlagSpan from '$lib/components/FlagSpan.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PointCalculation from '$lib/components/PointCalculation.svelte';
	import { KNOWN_REGIONS } from '$lib/ddnet/helpers.js';
	import { encodeAsciiURIComponent } from '$lib/link';
	import type { RankInfo } from '$lib/server/fetches/ranks.js';
	import { faQuestionCircle } from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';

	let { data } = $props();

	let searchName = $state('');
	let showModal = $state(false);

	// slicing top 20 ranks for each ladder
	const sliceRanks = () => {
		const result: RankInfo['ranks'] = {
			points: [],
			team: [],
			rank: [],
			yearly: [],
			monthly: [],
			weekly: []
		};
		for (const ladder of Object.keys(data.ranks) as (keyof RankInfo['ranks'])[]) {
			result[ladder] = data.ranks[ladder].slice(0, 20);
		}
		return result;
	};

	let ranks: RankInfo['ranks'] = $state(sliceRanks());

	// queried global ranks
	const queryRanks = () => {
		const result: RankInfo['ranks'] = {
			points: [],
			team: [],
			rank: [],
			yearly: [],
			monthly: [],
			weekly: []
		};
		const player = queryList.player;
		if (player) {
			const name = player.name;
			if (player.points.rank) result.points.push({ name, ...player.points });
			if (player.team.rank) result.team.push({ name, ...player.team });
			if (player.rank.rank) result.rank.push({ name, ...player.rank });
			if (player.yearly.rank) result.yearly.push({ name, ...player.yearly });
			if (player.monthly.rank) result.monthly.push({ name, ...player.monthly });
			if (player.weekly.rank) result.weekly.push({ name, ...player.weekly });
		}
		return result;
	};

	// find top 500 ranks with search name
	const searchRanksTop500 = () => {
		const result: RankInfo['ranks'] = {
			points: [],
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

	const MIN_QUERY_INTERVAL = 200;
	let queryingName: string | null = null;
	let queryListName: string | null = $state(null);
	let queryList = $state<{ player: any; top10: { name: string; points: number }[] }>({
		player: null,
		top10: []
	});

	let querying = false;
	let lastQueryTime = 0;

	function gotoName(name: string) {
		goto(`/ddnet/players/${encodeAsciiURIComponent(name)}`);
	}

	async function query() {
		if (querying) return;

		querying = true;
		const remaining = MIN_QUERY_INTERVAL - (Date.now() - lastQueryTime);
		lastQueryTime = Date.now();
		if (remaining > 0) {
			await new Promise((resolve) => setTimeout(resolve, remaining));
		}
		queryingName = searchName;
		if (!searchName) {
			queryList = { player: null, top10: [] };
			queryListName = null;
		} else {
			queryList = await (
				await fetch(`/api/players?query=${encodeURIComponent(queryingName)}`)
			).json();
			queryListName = queryingName;
		}
		querying = false;
		if (searchName != queryingName) {
			query();
		}
	}

	$effect(() => {
		if (data.region == 'GLOBAL' && queryListName) {
			ranks = queryRanks();
		} else if (searchName) {
			ranks = searchRanksTop500();
		} else {
			ranks = sliceRanks();
		}
	});

	$effect(() => {
		searchName;
		query();
	});

	const LADDER_NAMES: Record<string, [string, string]> = {
		points: ['里程', '🌎'],
		yearly: ['近期里程 (近365天)', '📅'],
		monthly: ['近期里程 (近30天)', '📅'],
		weekly: ['近期里程 (近7天)', '📅'],
		team: ['团队排位分', '👥'],
		rank: ['个人排位分', '👤']
	};
</script>

<svelte:head>
	<meta property="og:title" content="DDNet 玩家排名 - TeeworldsCN" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://teeworlds.cn/ddnet/players" />
	<meta
		property="og:description"
		content="查询 DDraceNetwork 玩家排名和分数，包括里程、团队分、个人分和时间段分数"
	/>
	<meta property="og:image" content="https://teeworlds.cn/shareicon.png" />
	<meta name="title" content="DDNet 玩家排名 - TeeworldsCN" />
	<meta
		name="description"
		content="查询 DDraceNetwork 玩家排名和分数，包括里程、团队分、个人分和时间段分数"
	/>
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ href: '/ddnet', text: 'DDNet' },
		{ text: '排名', title: 'DDNet 排名' }
	]}
/>

<div class="mb-4 flex-col space-y-2 md:flex md:flex-row md:space-x-2 md:space-y-0">
	<input
		type="text"
		placeholder="查找玩家名"
		class="w-full rounded border border-slate-600 bg-slate-700 px-4 py-2 text-slate-300 md:mb-0 md:flex-1"
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
	<button
		class="cursor-pointer text-nowrap rounded bg-slate-700 px-4 py-2 font-semibold hover:bg-slate-600 active:bg-slate-700"
		onclick={() => {
			showModal = !showModal;
		}}><Fa class="inline" icon={faQuestionCircle}></Fa> 积分说明</button
	>
	<select
		class="rounded bg-slate-700 px-4 py-2 text-slate-300"
		value={data.region}
		onchange={(ev: Event) => {
			const value = (ev.currentTarget as HTMLSelectElement).value;
			if (value == 'GLOBAL') goto(`/ddnet/players`);
			else goto(`/ddnet/players?server=${value.toLowerCase()}`);
		}}
	>
		<option value="GLOBAL">全球</option>
		{#each Object.keys(KNOWN_REGIONS) as key}
			<option value={key}>{KNOWN_REGIONS[key]}</option>
		{/each}
	</select>
</div>

<!-- horizontally scrollable list of cards -->
<div class="scrollbar-hide overflow-x-auto text-nowrap">
	{#each queryList.top10 as player}
		<button
			class="mx-2 inline-block rounded border {player.name == searchName
				? 'border-slate-300'
				: 'border-slate-600'} bg-slate-700 px-2 py-0 hover:border-blue-500 active:border-blue-300"
			onclick={() => {
				searchName = player.name;
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
		{@const ladderName = LADDER_NAMES[ladder]}
		{@const regionName = KNOWN_REGIONS[data.region] ?? '全球'}
		<div
			class="mt-4 rounded-lg bg-slate-700 p-4 shadow-md {ranks[
				ladder as any as keyof RankInfo['ranks']
			].length == 0
				? 'opacity-50'
				: ''}"
		>
			{#if ladder == 'points'}
				{#if data.region == 'GLOBAL'}
					<h2 class="text-xl font-bold">
						{ladderName[1]}{regionName}{ladderName[0]}（共 {data.total_points}pts）
					</h2>
				{:else}
					<h2 class="text-xl font-bold">
						<FlagSpan flag={data.region} />{regionName}{ladderName[0]}（共 {data.total_points}pts）
					</h2>
				{/if}
			{:else}
				<h2 class="text-xl font-bold">
					{ladderName[1]}{regionName}{ladderName[0]}
				</h2>
			{/if}
			<ul class="mt-2">
				{#if ranks[ladder as any as keyof RankInfo['ranks']].length == 0}
					<li>
						{#if data.region != 'GLOBAL' && !searchName}
							<span class="text-center">无记录，可能已停服</span>
						{:else if data.region != 'GLOBAL' && searchName}
							<span class="text-center">未进区服前 500 名</span>
						{:else}
							<span class="text-center">未获得记录</span>
						{/if}
					</li>
				{:else}
					{#each ranks[ladder as any as keyof RankInfo['ranks']] as rank}
						<li>
							<span class="inline-block w-8 text-right">{rank.rank}.</span>
							<span class="inline-block w-20 text-right">{rank.points}pts</span>
							{#if rank.region}<FlagSpan flag={rank.region} />{/if}
							<PlayerLink player={rank.name} className="font-semibold">{rank.name}</PlayerLink>
						</li>
					{/each}
				{/if}
			</ul>
		</div>
	{/each}
</div>

<div class="mt-2">
	{#if data.update_time}
		上次数据更新于 {new Date(data.update_time * 1000).toLocaleString('zh-CN', {
			dateStyle: 'short',
			timeStyle: 'short'
		})}
	{/if}
</div>

<Modal bind:show={showModal}>
	<PointCalculation></PointCalculation>
</Modal>
