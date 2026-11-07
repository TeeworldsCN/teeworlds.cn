<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import Mappers from '$lib/components/ddnet/Mappers.svelte';
	import TileIcon from '$lib/components/ddnet/TileIcon.svelte';
	import PlayerLink from '$lib/components/ddnet/PlayerLink.svelte';
	import FlagSpan from '$lib/components/FlagSpan.svelte';
	import { secondsToDate, secondsToDateHM } from '$lib/date';
	import { KNOWN_REGIONS, mapType, numberToStars, watchLink } from '$lib/ddnet/helpers';
	import { secondsToChineseTime, secondsToTime } from '$lib/helpers';
	import { encodeAsciiURIComponent } from '$lib/link.js';
	import { share } from '$lib/share';
	import { tippy } from '$lib/tippy';
	import Modal from '$lib/components/Modal.svelte';
	import MapPreview from '$lib/components/mappreview/MapPreview.svelte';
	import Fa from 'svelte-fa';
	import { faChevronDown, faMapLocation, faVideo } from '@fortawesome/free-solid-svg-icons';

	const { data } = $props();

	// State for map preview modal
	let showMapPreviewModal = $state(false);

	// 地区筛选:自绘悬浮菜单(和排位页一致,移动端比原生 select 好点)
	let regionDropdown = $state<HTMLDivElement>();
	let regionMenuOpen = $state(false);
	let menuMaxHeight = $state(0);
	const regionName = $derived(KNOWN_REGIONS[data.region] ?? '全球');
	const regionFlag = $derived(KNOWN_REGIONS[data.region] ? data.region : null);

	const selectRegion = (value: string) => {
		regionMenuOpen = false;
		if (value == 'GLOBAL') goto(`/ddnet/maps/${encodeAsciiURIComponent(data.map.name)}`);
		else
			goto(`/ddnet/maps/${encodeAsciiURIComponent(data.map.name)}?server=${value.toLowerCase()}`);
	};

	const updateMenuMaxHeight = () => {
		if (!regionDropdown) return;
		const rect = regionDropdown.getBoundingClientRect();
		const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
		menuMaxHeight = Math.max(200, Math.round(viewportHeight - rect.bottom - 16));
	};

	// 点外面 / Esc 关闭;菜单放得下就全显示,放不下才滚动
	$effect(() => {
		if (!regionMenuOpen) return;
		updateMenuMaxHeight();
		const onPointerDown = (ev: PointerEvent) => {
			if (regionDropdown && !regionDropdown.contains(ev.target as Node)) regionMenuOpen = false;
		};
		const onKeyDown = (ev: KeyboardEvent) => {
			if (ev.key == 'Escape') regionMenuOpen = false;
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

	const mapperTransformed = $derived(() =>
		data.map.mapper == 'Unknown Mapper' || !data.map.mapper ? '不详' : data.map.mapper
	);

	const mapDescription = $derived(
		`${mapType(data.map.type)} ${numberToStars(data.map.difficulty)} (${data.map.points}pt) 作者：${mapperTransformed()}${data.map.median_time ? ` 均时：${secondsToTime(data.map.median_time)}` : ''}`
	);

	afterNavigate(() => {
		share({
			icon: `${window.location.origin}/shareicon.png`,
			link: `https://teeworlds.cn/goto#m${encodeAsciiURIComponent(data.map.name)}`,
			title: `${data.map.name}`,
			desc: mapDescription
		});
	});
</script>

<svelte:head>
	<meta property="og:title" content="{data.map.name} - DDNet 地图" />
	<meta property="og:type" content="website" />
	<meta
		property="og:url"
		content="https://teeworlds.cn/ddnet/maps/{encodeAsciiURIComponent(data.map.name)}"
	/>
	<meta property="og:description" content={mapDescription} />
	<meta property="og:image" content={data.map.thumbnail} />
	<meta name="title" content="{data.map.name} - DDNet 地图" />
	<meta name="description" content={mapDescription} />
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ href: '/ddnet', text: 'DDNet' },
		{ href: '/ddnet/maps', text: '地图', title: 'DDNet 地图' },
		{ text: data.map.name, title: data.map.name }
	]}
/>

<div class="mb-4 flex justify-between selection:flex-row">
	<div>
		<div class="text-2xl font-bold">{data.map.name}</div>
		<div class="text-md font-bold">
			<span>作者：</span><Mappers authors={mapperTransformed()} />
		</div>
	</div>
	<div class="flex items-center justify-center">
		<div class="relative" bind:this={regionDropdown}>
			<button
				type="button"
				class="flex w-full cursor-pointer items-center justify-between gap-2 rounded bg-slate-700 px-4 py-2 font-semibold text-nowrap text-slate-300 hover:bg-slate-600 active:bg-slate-700 md:w-auto"
				onclick={() => {
					if (regionMenuOpen) regionMenuOpen = false;
					else {
						updateMenuMaxHeight();
						regionMenuOpen = true;
					}
				}}
				aria-haspopup="true"
				aria-expanded={regionMenuOpen}
				aria-controls="region-menu"
			>
				{#if regionFlag}<FlagSpan flag={regionFlag} tooltip={null} />{/if}
				{regionName}
				<Fa
					icon={faChevronDown}
					class="text-xs transition-transform {regionMenuOpen ? 'rotate-180' : ''}"
				/>
			</button>
			{#if regionMenuOpen}
				<div
					id="region-menu"
					class="absolute right-0 z-30 mt-2 flex w-[min(90vw,16rem)] flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-950/80 p-2 shadow-2xl ring-1 shadow-black/60 ring-white/5 backdrop-blur-xl"
					style:max-height={menuMaxHeight ? `${menuMaxHeight}px` : null}
				>
					<ul class="min-h-0 flex-1 overflow-y-auto">
						<li>
							<button
								type="button"
								class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-left text-sm text-nowrap {data.region ==
								'GLOBAL'
									? 'bg-blue-500/20 font-semibold text-blue-300'
									: 'text-slate-300 hover:bg-white/10'}"
								onclick={() => selectRegion('GLOBAL')}
							>
								<span>🌎 全球</span>
							</button>
						</li>
						{#each Object.keys(KNOWN_REGIONS) as key}
							<li>
								<button
									type="button"
									class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-left text-sm text-nowrap {data.region ==
									key
										? 'bg-blue-500/20 font-semibold text-blue-300'
										: 'text-slate-300 hover:bg-white/10'}"
									onclick={() => selectRegion(key)}
								>
									<FlagSpan flag={key} tooltip={null} />
									<span>{KNOWN_REGIONS[key]}</span>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	</div>
</div>
<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
	<div class="relative rounded-lg bg-slate-700 p-4 shadow-md">
		<div class="flex flex-col flex-wrap md:flex-row">
			<img
				width="360"
				height="225"
				class="mr-4 mb-4 rounded"
				src={data.map.thumbnail}
				alt="{data.map.name} thumbnail"
			/>
			<div>
				<h2 class="mb-3 text-xl font-bold">地图信息</h2>
				<p use:tippy={{ content: data.map.type }}>类型：{mapType(data.map.type)}</p>
				<p>里程：{data.map.points}</p>
				<p>难度：{numberToStars(data.map.difficulty)}</p>
			</div>
		</div>
		<button
			class="absolute right-4 bottom-4 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
			onclick={() => (showMapPreviewModal = true)}
		>
			<Fa class="inline" icon={faMapLocation}></Fa> 查看地图
		</button>
	</div>
	<div class="rounded-lg bg-slate-700 p-4 shadow-md">
		<h2 class="mb-3 text-xl font-bold">
			{#if data.region != 'GLOBAL'}
				<FlagSpan flag={data.region} />
			{/if}地图数据
		</h2>
		<p>
			发布日期：{data.map.release > 0 ? secondsToDateHM(data.map.release) : '远古'}
		</p>
		{#if data.map.median_time}
			<p>
				平均时间：<span use:tippy={{ content: `${data.map.median_time.toFixed(2.0)}秒` }}
					>{secondsToTime(data.map.median_time)}</span
				>
			</p>
		{/if}
		{#if data.map.median_time}
			<p>完成总次数：{data.map.finishes}</p>
		{/if}
		{#if data.map.median_time}
			<p>完成玩家数：{data.map.finishers}</p>
		{/if}
		{#if data.map.biggest_team}
			<p>最大团队：{data.map.biggest_team} 人</p>
		{/if}
		{#if data.map.tiles && data.map.tiles.length}
			<p class="mb-1">图块特性：</p>
			<div class="justify-left flex flex-row flex-wrap items-center gap-1">
				{#each data.map.tiles as tile}
					<TileIcon {tile} class="m-0 mr-1 inline-block h-8 w-8 rounded bg-gray-600 p-0" />
				{/each}
			</div>
		{/if}
	</div>
</div>

<div
	class="grid grid-cols-1 gap-4 md:grid-cols-2 {data.map.team_ranks.length ? 'xl:grid-cols-3' : ''}"
>
	{#if data.map.team_ranks.length}
		<div class="mt-4 rounded-lg bg-slate-700 p-4 shadow-md">
			<h2 class="text-xl font-bold">
				{#if data.region != 'GLOBAL'}
					<FlagSpan flag={data.region} />
				{/if}
				团队排名
			</h2>
			<ul class="mt-2">
				{#each data.map.team_ranks as rank}
					<li>
						<span class="inline-block w-8 text-right">{rank.rank}.</span>
						<span
							use:tippy={{
								content: `于 ${secondsToDate(rank.timestamp)} 用时 ${secondsToChineseTime(rank.time)} 完成`
							}}
							class="inline-block w-20 text-right align-middle">{secondsToTime(rank.time)}</span
						>
						<span class="ml-1 inline-block w-5 text-center align-middle">
							{#if rank.demo}
								<a
									href={watchLink(rank.demo)}
									class="inline-flex h-5 w-5 items-center justify-center rounded bg-slate-600/60 text-slate-400 transition-colors hover:bg-orange-500 hover:text-white"
									use:tippy={{ content: `观看过图回放（${secondsToTime(rank.time)}）` }}
									aria-label={`观看 ${rank.players.join(' & ')} 用时 ${secondsToTime(rank.time)} 的回放`}
								>
									<Fa icon={faVideo} size="xs" />
								</a>
							{/if}
						</span>
						{#if data.region == 'GLOBAL'}
							<FlagSpan flag={rank.country} />
						{/if}
						<span>
							{#each rank.players as player, i}
								<PlayerLink {player} className="font-semibold">{player}</PlayerLink
								>{#if i === rank.players.length - 2}{' & '}{:else if i < rank.players.length - 2}{', '}{/if}
							{/each}
						</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="mt-4 rounded-lg bg-slate-700 p-4 shadow-md">
		<h2 class="text-xl font-bold">
			{#if data.region != 'GLOBAL'}
				<FlagSpan flag={data.region} />
			{/if}
			个人排名
		</h2>
		<ul class="mt-2">
			{#each data.map.ranks as rank}
				<li>
					<span class="inline-block w-8 text-right">{rank.rank}.</span>
					<span
						use:tippy={{
							content: `于 ${secondsToDate(rank.timestamp)} 用时 ${secondsToChineseTime(rank.time)} 完成`
						}}
						class="inline-block w-20 text-right align-middle">{secondsToTime(rank.time)}</span
					>
					<span class="ml-1 inline-block w-5 text-center align-middle">
						{#if rank.demo}
							<a
								href={watchLink({ ...rank.demo, names: [rank.player] })}
								class="inline-flex h-5 w-5 items-center justify-center rounded bg-slate-600/60 text-slate-400 transition-colors hover:bg-orange-500 hover:text-white"
								use:tippy={{ content: `观看过图回放（${secondsToTime(rank.time)}）` }}
								aria-label={`观看 ${rank.player} 用时 ${secondsToTime(rank.time)} 的回放`}
							>
								<Fa icon={faVideo} size="xs" />
							</a>
						{/if}
					</span>
					{#if data.region == 'GLOBAL'}
						<FlagSpan flag={rank.country} />
					{/if}
					<span
						><PlayerLink player={rank.player} className="font-semibold">{rank.player}</PlayerLink
						></span
					>
				</li>
			{/each}
		</ul>
	</div>

	<div class="mt-4 rounded-lg bg-slate-700 p-4 shadow-md">
		<h2 class="text-xl font-bold">
			{#if data.region != 'GLOBAL'}
				<FlagSpan flag={data.region} />
			{/if}
			完成次数
		</h2>
		<ul class="mt-2">
			{#each data.map.max_finishes as finishes}
				<li>
					<span class="inline-block w-8 text-right">{finishes.rank}.</span>
					<span
						use:tippy={{
							content: `首次完成：${secondsToDate(finishes.min_timestamp)}，最后完成：${secondsToDate(
								finishes.max_timestamp
							)}，最快用时：${secondsToChineseTime(finishes.time)}`
						}}
						class="inline-block w-20 text-right">{finishes.num} 次</span
					>
					<span class="ml-3"
						><PlayerLink player={finishes.player} className="font-semibold"
							>{finishes.player}</PlayerLink
						></span
					>
				</li>
			{/each}
		</ul>
	</div>
</div>

<Modal bind:show={showMapPreviewModal}>
	<div
		class="h-[calc(100svh-4rem)] max-h-[calc(100svh-4rem)] w-[calc(100vw-2rem)] overflow-hidden rounded-l-lg rounded-br-lg bg-slate-700 p-1 shadow-md sm:w-[calc(100vw-5rem)]"
	>
		<MapPreview map={showMapPreviewModal ? data.map.name : null} />
	</div>
</Modal>
