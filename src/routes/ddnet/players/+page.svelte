<script lang="ts">
	import { goto } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import LatestRecordsDrawer from '$lib/components/ddnet/LatestRecordsDrawer.svelte';
	import MapTiles from '$lib/components/ddnet/MapTiles.svelte';
	import PlayerLink from '$lib/components/ddnet/PlayerLink.svelte';
	import FlagSpan from '$lib/components/FlagSpan.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PointCalculation from '$lib/components/PointCalculation.svelte';
	import {
		KNOWN_REGIONS,
		MAP_TYPES,
		MAP_TYPE_SERVERS,
		numberToStars,
		watchLink
	} from '$lib/ddnet/helpers.js';
	import { secondsToChineseTime, secondsToTime } from '$lib/helpers';
	import { encodeAsciiURIComponent } from '$lib/link';
	import type { MapRecord, RankInfo } from '$lib/server/fetches/ranks.js';
	import { tippy } from '$lib/tippy';
	import {
		faChevronDown,
		faChevronLeft,
		faChevronRight,
		faHome,
		faQuestionCircle,
		faVideo
	} from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';

	let { data } = $props();

	let searchName = $state('');
	let showModal = $state(false);

	// 地区 / 地图类型 双选下拉
	let serverDropdown = $state<HTMLDivElement>();
	let serverMenuOpen = $state(false);
	const closeServerMenu = () => {
		serverMenuOpen = false;
	};

	const regionSlug = $derived(data.region === 'GLOBAL' ? null : data.region.toLowerCase());
	const typeSlug = $derived(data.type ? data.type.toLowerCase() : null);
	const regionLabel = $derived(KNOWN_REGIONS[data.region] ?? '全球');
	const typeLabel = $derived(data.type ? (MAP_TYPE_SERVERS[data.type] ?? data.type) : '全部类型');
	// 触发按钮上显示当前组合:全球 / 中国服 / 新手图 / 中国服 · 新手图
	const serverName = $derived(
		typeSlug ? (regionSlug ? `${regionLabel} · ${typeLabel}` : typeLabel) : regionLabel
	);
	const serverFlag = $derived(KNOWN_REGIONS[data.region] ? data.region : null);
	const mapPage = $derived(data.map_page ?? 1);
	const mapPageCount = $derived(data.page_count ?? 1);

	const serverUrl = (region: string | null, type: string | null, page?: number) => {
		const params = new URLSearchParams();
		if (region && region != 'GLOBAL') params.set('server', region.toLowerCase());
		if (type) params.set('type', type.toLowerCase());
		if (page && page > 1) params.set('page', String(page));
		const query = params.toString();
		return `/ddnet/players${query ? `?${query}` : ''}`;
	};

	// 两边都能选:选中一边时保留另一边
	const selectRegion = (region: string) => {
		goto(serverUrl(region, data.type ? data.type.toLowerCase() : null));
	};
	const selectType = (type: string | null) => {
		goto(serverUrl(regionSlug, type));
	};

	// 过图时间和地图详情页一样:mm:ss 显示,悬停看完整用时和日期
	const recordTooltip = (record: MapRecord) => {
		if (record.seconds == null) return '';
		const when = record.date ? `于 ${record.date} ` : '';
		return `${when}用时 ${secondsToChineseTime(record.seconds)} 完成`;
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
		if (data.region == 'GLOBAL' && !data.type && queryListName) {
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

{#snippet serverOption(selected: boolean, label: string, flag: string | null, onclick: () => void)}
	<button
		type="button"
		class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-left text-sm text-nowrap {selected
			? 'bg-blue-500/20 font-semibold text-blue-300'
			: 'text-slate-300 hover:bg-white/10'}"
		{onclick}
	>
		{#if flag}<FlagSpan {flag} tooltip={null} />{/if}
		<span>{label}</span>
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
				if (serverMenuOpen) closeServerMenu();
				else {
					updateMenuMaxHeight();
					serverMenuOpen = true;
				}
			}}
			aria-haspopup="true"
			aria-expanded={serverMenuOpen}
			aria-controls="server-menu"
		>
			{#if serverFlag}<FlagSpan flag={serverFlag} tooltip={null} />{/if}
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
						<li>
							{@render serverOption(data.region == 'GLOBAL', '🌎 全球', null, () =>
								selectRegion('GLOBAL')
							)}
						</li>
						{#each Object.keys(KNOWN_REGIONS) as key}
							<li>
								{@render serverOption(data.region == key, KNOWN_REGIONS[key], key, () =>
									selectRegion(key)
								)}
							</li>
						{/each}
					</ul>
				</div>
				<div class="flex min-h-0 min-w-0 flex-1 flex-col border-l border-white/10 pl-3">
					<div class="px-2 py-1 text-sm font-semibold text-slate-400">地图</div>
					<ul class="min-h-0 flex-1 overflow-y-auto">
						<li>
							{@render serverOption(!data.type, '全部类型', null, () => selectType(null))}
						</li>
						{#each Object.keys(MAP_TYPE_SERVERS) as key}
							<li>
								{@render serverOption(data.type == key, MAP_TYPE_SERVERS[key], null, () =>
									selectType(key.toLowerCase())
								)}
							</li>
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

<!-- 地图翻页后上半部分的排行榜都一样,只留地图排位 -->
{#if mapPage <= 1}
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
							{#if data.region != 'GLOBAL' && !data.type && !searchName && serverFlag}
								<span class="text-center">无记录，可能已停服</span>
							{:else if (data.region != 'GLOBAL' || data.type) && searchName}
								<span class="text-center">未进前 500 名</span>
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
{/if}

<div class="mt-2">
	{#if data.update_time}
		上次数据更新于 {new Date(data.update_time * 1000).toLocaleString('zh-CN', {
			dateStyle: 'short',
			timeStyle: 'short'
		})}
	{/if}
</div>

{#if typeSlug && data.maps.length}
	<div class="mt-6">
		<div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
			<h2 class="text-xl font-bold">🗺️ 地图排位</h2>
			<a
				href={`/ddnet/maps#type=${typeSlug}`}
				class="text-sm text-blue-300 hover:text-blue-200"
				onclick={(ev) => {
					if (ev.button != 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
					ev.preventDefault();
					// goto 默认 noScroll: false，从排位页底部跳过去时自动滚回顶部
					goto(`/ddnet/maps#type=${typeSlug}`);
				}}>查看全部{MAP_TYPES[typeSlug]}地图 →</a
			>
		</div>
		<div class="flex flex-col gap-3">
			{#each data.maps as map (map.name)}
				<div class="rounded-lg bg-slate-700 p-3 shadow-md">
					<div class="flex flex-col gap-3 sm:flex-row">
						<a
							href={`/ddnet/maps/${encodeAsciiURIComponent(map.name)}`}
							class="aspect-map block w-full shrink-0 overflow-hidden rounded bg-slate-800 sm:w-48 lg:w-64"
						>
							{#if map.thumbnail}
								<img
									src={map.thumbnail}
									alt={map.name}
									loading="lazy"
									class="h-full w-full object-cover"
								/>
							{/if}
						</a>
						<div class="min-w-0 flex-1">
							<h3 class="text-lg font-bold">
								<a
									href={`/ddnet/maps/${encodeAsciiURIComponent(map.name)}`}
									class="hover:text-blue-300">{map.name}</a
								>
							</h3>
							{#if map.mapper}
								<p class="text-sm text-slate-400">by {map.mapper}</p>
							{/if}
							<p class="text-sm">
								{#if map.release}发布于 {map.release} ·
								{/if}
								{numberToStars(map.difficulty)} ({map.points} pts)
							</p>
							{#if map.finishes || map.teams}
								<p class="text-sm text-slate-300">
									{#if map.finishes}
										完成 {map.finishes} 次{map.median_time ? `（中位 ${map.median_time}）` : ''}
									{/if}
									{#if map.finishes && map.teams}
										·
									{/if}
									{#if map.teams}
										{map.teams} 队{map.biggest_team ? `（最大 ${map.biggest_team} 人）` : ''}
									{/if}
								</p>
							{/if}
							{#if map.tiles?.length}
								<MapTiles tiles={map.tiles ?? []} class="mt-1" />
							{/if}
						</div>
					</div>

					<div class="mt-2 grid grid-cols-1 gap-3 border-t border-slate-600 pt-2 md:grid-cols-2">
						<div>
							<h4 class="mb-1 text-sm font-semibold text-slate-400">团队排行</h4>
							<ul>
								{#each map.team_records as record}
									<li class="flex items-center gap-1 text-sm">
										<span class="inline-block w-6 shrink-0 text-right">{record.rank}.</span>
										<span
											class="inline-block w-16 shrink-0 text-right tabular-nums"
											use:tippy={{ content: recordTooltip(record) }}
										>
											{record.seconds != null ? secondsToTime(record.seconds) : record.time}
										</span>
										{#if record.region}<FlagSpan flag={record.region} />{/if}
										<span class="min-w-0 truncate">
											{#each record.names as name, i}
												<PlayerLink player={name} className="font-semibold">{name}</PlayerLink
												>{#if i < record.names.length - 2}{', '}{:else if i == record.names.length - 2}{' & '}{/if}
											{/each}
										</span>
										{#if record.replay}
											<a
												href={watchLink({
													uuid: record.replay.uuid,
													time: record.seconds,
													kind: 'team'
												})}
												class="ml-auto shrink-0 text-slate-400 transition-colors hover:text-orange-400"
												aria-label="观看回放"
											>
												<Fa icon={faVideo} size="xs" />
											</a>
										{/if}
									</li>
								{/each}
							</ul>
						</div>
						<div>
							<h4 class="mb-1 text-sm font-semibold text-slate-400">个人排行</h4>
							<ul>
								{#each map.records as record}
									<li class="flex items-center gap-1 text-sm">
										<span class="inline-block w-6 shrink-0 text-right">{record.rank}.</span>
										<span
											class="inline-block w-16 shrink-0 text-right tabular-nums"
											use:tippy={{ content: recordTooltip(record) }}
										>
											{record.seconds != null ? secondsToTime(record.seconds) : record.time}
										</span>
										{#if record.region}<FlagSpan flag={record.region} />{/if}
										<PlayerLink player={record.names[0]} className="min-w-0 truncate font-semibold">
											{record.names[0]}
										</PlayerLink>
										{#if record.replay}
											<a
												href={watchLink({
													uuid: record.replay.uuid,
													time: record.seconds,
													kind: 'solo',
													names: [record.names[0]]
												})}
												class="ml-auto shrink-0 text-slate-400 transition-colors hover:text-orange-400"
												aria-label="观看回放"
											>
												<Fa icon={faVideo} size="xs" />
											</a>
										{/if}
									</li>
								{/each}
							</ul>
						</div>
					</div>
				</div>
			{/each}
		</div>

		{#if mapPageCount > 1}
			<div class="mt-3 flex items-center justify-center gap-3">
				{#if mapPage > 1}
					<a
						href={serverUrl(regionSlug, typeSlug)}
						class="inline-flex h-8 w-8 items-center justify-center rounded bg-slate-700 text-slate-300 hover:bg-slate-600 active:bg-slate-700"
						title="返回第一页（排行榜）"
						aria-label="返回第一页（排行榜）"
					>
						<Fa icon={faHome} />
					</a>
				{/if}
				<button
					class="inline-flex h-8 w-8 items-center justify-center rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
					disabled={mapPage <= 1}
					onclick={() => goto(serverUrl(regionSlug, typeSlug, mapPage - 1))}
					title="上一页"
					aria-label="上一页"
				>
					<Fa icon={faChevronLeft} />
				</button>
				<span class="text-sm text-slate-400">地图 {mapPage} / {mapPageCount}</span>
				<button
					class="inline-flex h-8 w-8 items-center justify-center rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
					disabled={mapPage >= mapPageCount}
					onclick={() => goto(serverUrl(regionSlug, typeSlug, mapPage + 1))}
					title="下一页"
					aria-label="下一页"
				>
					<Fa icon={faChevronRight} />
				</button>
			</div>
		{/if}
	</div>
{/if}

<Modal bind:show={showModal}>
	<PointCalculation></PointCalculation>
</Modal>

<LatestRecordsDrawer
	region={data.region === 'GLOBAL' ? null : data.region}
	type={data.type ? data.type.toLowerCase() : null}
/>
