<script lang="ts">
	import { goto } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import PlayerLink from '$lib/components/ddnet/PlayerLink.svelte';
	import FlagSpan from '$lib/components/FlagSpan.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PointCalculation from '$lib/components/PointCalculation.svelte';
	import { KNOWN_REGIONS, MAP_TYPES, MAP_TYPE_SERVERS } from '$lib/ddnet/helpers.js';
	import { loadMapList, newestMapsOfType } from '$lib/ddnet/map-list';
	import { encodeAsciiURIComponent } from '$lib/link';
	import type { MapList } from '$lib/server/fetches/maps.js';
	import type { RankInfo } from '$lib/server/fetches/ranks.js';
	import { faChevronDown, faQuestionCircle } from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';

	let { data } = $props();

	let searchName = $state('');
	let showModal = $state(false);

	// server (region / map type) dropdown
	let serverDropdown = $state<HTMLDivElement>();
	// the region whose menu is currently open, so navigating to another server closes it automatically
	let openRegion = $state<string | null>(null);
	const serverMenuOpen = $derived(openRegion == data.region);
	const closeServerMenu = () => {
		openRegion = null;
	};

	const serverName = $derived(
		KNOWN_REGIONS[data.region] ?? MAP_TYPE_SERVERS[data.region] ?? '全球'
	);
	const serverFlag = $derived(KNOWN_REGIONS[data.region] ? data.region : null);

	// 地图类型分类下的「新地图」:第一次选中类型时才懒加载全部地图数据
	// (地图页和排位页共用 lib 里的同一份缓存,一次浏览只请求一遍)
	const mapTypeSlug = $derived<string | null>(
		MAP_TYPE_SERVERS[data.region] ? data.region.toLowerCase() : null
	);
	const NEWEST_MAP_COUNT = 12;
	let mapList = $state.raw<MapList | null>(null);
	let mapListLoading = $state(false);
	let mapListFailed = $state(false);
	const newestMaps = $derived(
		mapList && mapTypeSlug ? newestMapsOfType(mapList, mapTypeSlug, NEWEST_MAP_COUNT) : []
	);

	$effect(() => {
		if (!mapTypeSlug || mapList) return;
		mapListLoading = true;
		mapListFailed = false;
		loadMapList()
			.then((list) => {
				mapList = list;
			})
			.catch(() => {
				mapListFailed = true;
			})
			.finally(() => {
				mapListLoading = false;
			});
	});

	const selectServer = (value: string) => {
		closeServerMenu();
		if (value == 'GLOBAL') goto(`/ddnet/players`);
		else goto(`/ddnet/players?server=${value.toLowerCase()}`);
	};

	// the menu shows everything it can fit below the trigger, and only scrolls when needed
	let menuMaxHeight = $state(0);
	const updateMenuMaxHeight = () => {
		if (!serverDropdown) return;
		const rect = serverDropdown.getBoundingClientRect();
		const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
		menuMaxHeight = Math.max(200, Math.round(viewportHeight - rect.bottom - 16));
	};

	// close the dropdown when clicking outside of it or pressing Escape
	$effect(() => {
		if (!serverMenuOpen) return;
		updateMenuMaxHeight();
		const onPointerDown = (ev: PointerEvent) => {
			if (serverDropdown && !serverDropdown.contains(ev.target as Node)) {
				closeServerMenu();
			}
		};
		const onKeyDown = (ev: KeyboardEvent) => {
			if (ev.key == 'Escape') closeServerMenu();
		};
		const onResize = () => updateMenuMaxHeight();
		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);
		window.addEventListener('resize', onResize);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('resize', onResize);
		};
	});

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

	const ALL_LADDERS: (keyof RankInfo['ranks'])[] = [
		'points',
		'team',
		'rank',
		'yearly',
		'monthly',
		'weekly'
	];
	// some server types don't have every ladder (e.g. no team rank on dummy/solo/race)
	const visibleLadders: (keyof RankInfo['ranks'])[] = $derived(
		data.ladders?.length ? data.ladders : ALL_LADDERS
	);

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
			queryList = (await (
				await fetch(`/api/players?query=${encodeURIComponent(queryingName)}`)
			).json()) ?? { player: null, top10: [] };
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
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ href: '/ddnet', text: 'DDNet' },
		{ text: '排名', title: 'DDNet 排名' }
	]}
/>

{#snippet serverOption(value: string, label: string, flag?: string)}
	<button
		type="button"
		class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-left text-sm text-nowrap {data.region ==
		value
			? 'bg-blue-500/20 font-semibold text-blue-300'
			: 'text-slate-300 hover:bg-white/10'}"
		onclick={() => selectServer(value)}
	>
		{#if flag}<FlagSpan {flag} tooltip={null} />{/if}
		{label}
	</button>
{/snippet}

<div class="mb-4 flex-col space-y-2 md:flex md:flex-row md:space-y-0 md:space-x-2">
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
		class="cursor-pointer rounded bg-slate-700 px-4 py-2 font-semibold text-nowrap hover:bg-slate-600 active:bg-slate-700"
		onclick={() => {
			showModal = !showModal;
		}}><Fa class="inline" icon={faQuestionCircle}></Fa> 积分说明</button
	>
	<div class="relative" bind:this={serverDropdown}>
		<button
			type="button"
			class="flex w-full cursor-pointer items-center justify-between gap-2 rounded bg-slate-700 px-4 py-2 font-semibold text-nowrap text-slate-300 hover:bg-slate-600 active:bg-slate-700 md:w-auto"
			onclick={() => {
				if (serverMenuOpen) {
					closeServerMenu();
				} else {
					updateMenuMaxHeight();
					openRegion = data.region;
				}
			}}
			aria-haspopup="true"
			aria-expanded={serverMenuOpen}
			aria-controls="server-menu"
		>
			{serverName}
			<Fa
				icon={faChevronDown}
				class="text-xs transition-transform {serverMenuOpen ? 'rotate-180' : ''}"
			/>
		</button>
		{#if serverMenuOpen}
			<div
				id="server-menu"
				class="absolute right-0 z-30 mt-2 flex w-[min(90vw,26rem)] gap-x-3 overflow-hidden rounded-xl border border-white/10 bg-slate-950/80 p-2 shadow-2xl ring-1 shadow-black/60 ring-white/5 backdrop-blur-xl"
				style:max-height={menuMaxHeight ? `${menuMaxHeight}px` : null}
			>
				<div class="flex min-h-0 min-w-0 flex-1 flex-col">
					<div class="px-2 py-1 text-sm font-semibold text-slate-400">地区</div>
					<ul class="min-h-0 flex-1 overflow-y-auto">
						<li>{@render serverOption('GLOBAL', '🌎 全球')}</li>
						{#each Object.keys(KNOWN_REGIONS) as key}
							<li>{@render serverOption(key, KNOWN_REGIONS[key], key)}</li>
						{/each}
					</ul>
				</div>
				<div class="flex min-h-0 min-w-0 flex-1 flex-col border-l border-white/10 pl-3">
					<div class="px-2 py-1 text-sm font-semibold text-slate-400">地图</div>
					<ul class="min-h-0 flex-1 overflow-y-auto">
						{#each Object.keys(MAP_TYPE_SERVERS) as key}
							<li>{@render serverOption(key, MAP_TYPE_SERVERS[key])}</li>
						{/each}
					</ul>
				</div>
			</div>
		{/if}
	</div>
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
	{#each visibleLadders as ladder}
		{@const ladderName = LADDER_NAMES[ladder]}
		<div
			class="mt-4 rounded-lg bg-slate-700 p-4 shadow-md {ranks[ladder].length == 0
				? 'opacity-50'
				: ''}"
		>
			{#if ladder == 'points'}
				{#if data.region == 'GLOBAL'}
					<h2 class="text-xl font-bold">
						{ladderName[1]}{serverName}{ladderName[0]}（共 {data.total_points}pts）
					</h2>
				{:else}
					<h2 class="text-xl font-bold">
						{#if serverFlag}<FlagSpan flag={serverFlag} />{/if}{serverName}{ladderName[0]}（共 {data.total_points}pts）
					</h2>
				{/if}
			{:else}
				<h2 class="text-xl font-bold">
					{ladderName[1]}{serverName}{ladderName[0]}
				</h2>
			{/if}
			<ul class="mt-2">
				{#if ranks[ladder].length == 0}
					<li>
						{#if data.region != 'GLOBAL' && !searchName && serverFlag}
							<span class="text-center">无记录，可能已停服</span>
						{:else if data.region != 'GLOBAL' && searchName}
							<span class="text-center">未进区服前 500 名</span>
						{:else}
							<span class="text-center">未获得记录</span>
						{/if}
					</li>
				{:else}
					{#each ranks[ladder] as rank}
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

{#if mapTypeSlug}
	<div class="mt-4">
		<div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
			<h2 class="text-xl font-bold">🆕 新地图</h2>
			<a
				href={`/ddnet/maps#type=${mapTypeSlug}`}
				class="text-sm text-blue-300 hover:text-blue-200"
				onclick={(ev) => {
					if (ev.button != 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
					ev.preventDefault();
					// goto 默认 noScroll: false,从排位页底部跳过去时会自动滚回顶部
					goto(`/ddnet/maps#type=${mapTypeSlug}`);
				}}>查看全部{MAP_TYPES[mapTypeSlug]}地图 →</a
			>
		</div>
		{#if mapListFailed}
			<p class="text-slate-400">地图列表加载失败</p>
		{:else if !mapList || mapListLoading}
			<p class="text-slate-400">加载地图列表中…</p>
		{:else}
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
				{#each newestMaps as map}
					<a
						href={`/ddnet/maps/${encodeAsciiURIComponent(map.name)}`}
						class="rounded-lg bg-slate-700 p-1.5 shadow-md hover:bg-slate-600"
						title={map.name}
					>
						<img
							src={map.thumbnail}
							alt={map.name}
							loading="lazy"
							class="aspect-map w-full rounded object-cover"
						/>
						<p class="mt-1 truncate text-sm font-semibold">{map.name}</p>
					</a>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<Modal bind:show={showModal}>
	<PointCalculation></PointCalculation>
</Modal>
