<script lang="ts">
	import { page } from '$app/state';
	import { onDestroy, onMount } from 'svelte';
	import { goto, preloadData } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import Mappers from '$lib/components/ddnet/Mappers.svelte';
	import { encodeAsciiURIComponent } from '$lib/link';
	import type { MapList } from '$lib/server/fetches/maps';
	import { ddnetDate, mapType, numberToStars, TILES } from '$lib/ddnet/helpers';
	import { browser } from '$app/environment';
	import { tippy } from '$lib/tippy';
	import { checkMapName, checkMapper } from '$lib/ddnet/searches';
	import RangeSlider from '$lib/components/RangeSlider.svelte';
	import { SvelteSet } from 'svelte/reactivity';

	let maps: MapList = $state([]);
	let error = $state();

	const pageSize = 12;

	let searchName = $state('');
	let searchMapper = $state('');
	let currentPage = $state(1);
	let difficulty = $state([0, 5]) as [number, number];
	let type = $state('all');
	let filterTiles = $state(false);
	let allTiles = $state(TILES) as string[];
	let hasTiles = $state(new SvelteSet<string>());

	const needReset = $derived(
		!!searchName ||
			!!searchMapper ||
			difficulty[0] != 0 ||
			difficulty[1] != 5 ||
			type != 'all' ||
			(filterTiles && hasTiles.size > 0)
	);

	function resetFilters() {
		searchName = '';
		searchMapper = '';
		type = 'all';
		difficulty[0] = 0;
		difficulty[1] = 5;
		hasTiles.clear();
	}

	const createHashQuery = () => {
		const params = new URLSearchParams();
		if (searchName) params.set('name', searchName);
		if (searchMapper) params.set('mapper', searchMapper);
		if (type != 'all') params.set('type', type);
		if (difficulty[0] != 0 || difficulty[1] != 5) {
			if (difficulty[0] == difficulty[1]) params.set('diff', difficulty[0].toString());
			else params.set('diff', `${difficulty[0]}-${difficulty[1]}`);
		}
		if (currentPage > 1) params.set('page', currentPage.toString());
		if (filterTiles && hasTiles.size > 0) {
			params.set('tile', Array.from(hasTiles).join('!'));
		}
		const result = `#${params.toString()}`;
		if (result.length == 1) return '';
		return result;
	};

	const processHashQuery = (hash: string) => {
		if (hash.startsWith('#')) {
			hash = `${hash.slice(1)}`;
		}
		const params = new URLSearchParams(hash);
		searchName = params.get('name') || '';
		searchMapper = params.get('mapper') || '';
		currentPage = parseInt(params.get('page') || '1');
		const diff = params.get('diff');
		if (diff) {
			const parts = diff.split('-');
			if (parts.length == 2) {
				difficulty[0] = parseInt(parts[0]);
				difficulty[1] = parseInt(parts[1]);
			} else {
				difficulty[0] = parseInt(diff);
				difficulty[1] = parseInt(diff);
			}
		}
		type = params.get('type') || 'all';
		filterTiles = params.has('tile');
		if (filterTiles) {
			const tiles = params.get('tile')?.split('!');
			if (tiles) {
				for (const tile of tiles) {
					hasTiles.add(tile);
				}
			}
		}
	};

	processHashQuery(page.url.hash);

	let paginatedMaps = $state<MapList>([]);
	let totalPages = $state(1);

	const checkTiles = (map: (typeof maps)[0], tiles: string[] | null) => {
		if (!filterTiles) return true;
		if (!tiles) return true;
		if (tiles.length == 0) return true;
		return tiles.every((t) => map.tiles.includes(t));
	};

	$effect(() => {
		if (!Array.isArray(maps)) return;

		const allType = type == 'all';
		const tiles = hasTiles.size > 0 ? Array.from(hasTiles) : null;
		const filteredMaps = maps.filter((map: (typeof maps)[0]) => {
			return (
				(allType || map.type.toLowerCase().startsWith(type)) &&
				map.difficulty >= difficulty[0] &&
				map.difficulty <= difficulty[1] &&
				checkTiles(map, tiles) &&
				checkMapName(map.name, searchName) &&
				checkMapper(map.mapper, searchMapper)
			);
		});

		totalPages = Math.max(Math.ceil(filteredMaps.length / pageSize), 1);

		if (maps.length > 0) {
			// only clamp page if the list is already loaded
			if (currentPage > totalPages) {
				currentPage = 1;
			}
			if (currentPage < 1) {
				currentPage = 1;
			}
		}

		paginatedMaps = filteredMaps.slice((currentPage - 1) * pageSize, currentPage * pageSize);

		const hashQuery = createHashQuery();
		goto(hashQuery, { keepFocus: true, noScroll: true, replaceState: true });
	});

	const loadPage = (page: number) => {
		currentPage = page;
		goto(createHashQuery());
	};

	const loadMaps = async () => {
		error = void 0;
		processHashQuery(page.url.hash);
		const response = await fetch('/ddnet/maps');
		if (response.ok) {
			maps = await response.json();
		} else {
			error = response.statusText;
		}

		allTiles = Array.from(new Set(maps.flatMap((map) => map.tiles))).sort();
	};

	onMount(loadMaps);

	let sliderMap = new Map<number, HTMLDivElement>();
	let startX = 0;
	let scrollLeft = 0;

	const startDragging = (ev: PointerEvent) => {
		if (ev.pointerType == 'mouse' && ev.button != 0) return;
		ev.preventDefault();
		const slider = ev.currentTarget as HTMLDivElement;
		sliderMap.set(ev.pointerId, slider);
		startX = ev.pageX;
		scrollLeft = slider.scrollLeft;
	};

	const moveDragging = (ev: PointerEvent) => {
		ev.preventDefault();
		const slider = sliderMap.get(ev.pointerId);
		if (!slider) return;

		const x = ev.pageX - startX;
		slider.scrollLeft = scrollLeft - x;
	};

	const stopDragging = (ev: PointerEvent) => {
		const slider = sliderMap.get(ev.pointerId);
		if (slider) {
			sliderMap.delete(ev.pointerId);
		}
	};

	onMount(() => {
		if (browser) {
			document.addEventListener('pointerup', stopDragging);
			document.addEventListener('pointercancel', stopDragging);
			document.addEventListener('pointermove', moveDragging);
		}
	});

	onDestroy(() => {
		if (browser) {
			document.addEventListener('pointerup', stopDragging);
			document.addEventListener('pointercancel', stopDragging);
			document.removeEventListener('pointermove', moveDragging);
		}
	});

	const abortOnDestroy = (element: HTMLImageElement) => {
		return {
			destroy() {
				// abort the image loading
				element.src = '';
			}
		};
	};
</script>

<svelte:head>
	<meta property="og:title" content="DDNet 地图列表 - TeeworldsCN" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://teeworlds.cn/ddnet/maps" />
	<meta property="og:description" content="查询和浏览 DDraceNetwork 官方地图，按类型、难度和作者过滤" />
	<meta property="og:image" content="https://teeworlds.cn/shareicon.png" />
	<meta name="title" content="DDNet 地图列表 - TeeworldsCN" />
	<meta name="description" content="查询和浏览 DDraceNetwork 官方地图，按类型、难度和作者过滤" />
</svelte:head>

<svelte:window
	on:hashchange={() => {
		processHashQuery(page.url.hash);
	}}
/>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ href: '/ddnet', text: 'DDNet' },
		{ text: '地图', title: 'DDNet 地图' }
	]}
/>

<div class="mb-4 flex flex-col space-y-2 xl:flex-row xl:space-x-5 xl:space-y-0">
	<div
		class="flex flex-col items-center space-y-2 sm:flex-grow sm:flex-row sm:space-x-2 sm:space-y-0"
	>
		<input
			type="text"
			placeholder="按地图名搜索"
			class="w-full rounded border border-slate-600 bg-slate-700 p-2 text-slate-300"
			bind:value={searchName}
		/>
		<input
			type="text"
			placeholder="按作者名搜索"
			class="w-full rounded border border-slate-600 bg-slate-700 p-2 text-slate-300"
			bind:value={searchMapper}
		/>
	</div>
	<div class="flex flex-row flex-wrap items-center justify-center gap-2">
		<div class="flex flex-row items-center space-x-2">
			<span class="hidden sm:inline-block">类型</span>
			<select class="rounded bg-slate-700 px-4 py-2 text-slate-300" bind:value={type}>
				<option value="all">全部</option>
				<option value="novice">新手</option>
				<option value="moderate">中阶</option>
				<option value="brutal">高阶</option>
				<option value="insane">疯狂</option>
				<option value="ddmax">古典</option>
				<option value="oldschool">传统</option>
				<option value="dummy">分身</option>
				<option value="solo">单人</option>
				<option value="race">竞速</option>
				<option value="fun">娱乐</option>
			</select>
		</div>
		<div class="flex flex-row items-center space-x-2">
			<span class="hidden sm:inline-block">★难度</span>
			<RangeSlider
				class="w-32"
				text={['0', '1', '2', '3', '4', '5']}
				step={1}
				min={0}
				max={5}
				bind:value={difficulty}
			></RangeSlider>
		</div>
		<button
			class="hidden rounded bg-red-800 px-4 py-2 text-white hover:bg-red-700 disabled:bg-red-800 disabled:opacity-50 md:block"
			onclick={resetFilters}
			disabled={!needReset}
		>
			重置搜索
		</button>
		<button
			class="block rounded bg-red-800 px-4 py-2 text-white hover:bg-red-700 disabled:bg-red-800 disabled:opacity-50 md:hidden"
			onclick={resetFilters}
			disabled={!needReset}
		>
			重置
		</button>
	</div>
</div>

<div class="mb-4 flex flex-wrap items-center justify-center gap-1" class:h-8={!filterTiles}>
	<button
		class="relative h-8 w-[4.25rem] rounded bg-slate-700 text-sm text-white hover:bg-slate-600 disabled:bg-slate-700 disabled:opacity-50"
		onclick={() => (filterTiles = !filterTiles)}
	>
		{#if !filterTiles}
			<div class="pointer-events-none absolute left-[5.41rem] w-[100svw] text-left text-slate-500">
				点击展开图块筛选菜单
			</div>
		{/if}
		图块特性
	</button>
	{#each allTiles as tile}
		<button
			use:tippy={{ content: tile }}
			class="h-8 w-8 overflow-hidden rounded bg-gray-600 bg-cover bg-center"
			class:pointer-events-none={!filterTiles}
			class:opacity-0={!filterTiles}
			class:opacity-30={filterTiles && !hasTiles.has(tile)}
			class:bg-gray-700={filterTiles && !hasTiles.has(tile)}
			style="background-image: url(/assets/tiles/{tile}.png)"
			aria-label={tile}
			onclick={() => (hasTiles.has(tile) ? hasTiles.delete(tile) : hasTiles.add(tile))}
		></button>
	{/each}
</div>

{#if error}
	<div class="text-center text-slate-300">
		<h2 class="text-xl font-bold">数据加载失败</h2>
		<p>{error}</p>
		<button
			onclick={loadMaps}
			class="mt-4 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600">重新加载</button
		>
	</div>
{:else}
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
		{#each paginatedMaps as map (map.name)}
			<div class="rounded border border-slate-700 bg-slate-700 p-4 pt-3 shadow">
				<h3 class="scrollbar-hide h-8 overflow-x-auto text-nowrap text-lg font-bold">
					{map.name}
				</h3>
				<p class="scrollbar-hide h-6 overflow-x-auto whitespace-nowrap">
					<span class="font-semibold">作者：</span><Mappers
						authors={map.mapper || '不详'}
						click={(author) => {
							resetFilters();
							searchMapper = `"${author}"`;
						}}
					/>
				</p>
				<span class="h-6 text-sm">
					{#if map.release}
						发布于：{ddnetDate(map.release).toLocaleString('zh-CN', {
							dateStyle: 'short',
							timeStyle: 'short'
						})}
					{:else}
						发布于：远古
					{/if}
				</span>
				<button
					class="relative mt-2 aspect-map h-auto w-full overflow-hidden rounded-md border border-slate-600 hover:border-blue-500 active:border-blue-300"
					onmousedown={() => {
						preloadData(`/ddnet/maps/${encodeAsciiURIComponent(map.name)}`);
					}}
					onclick={() => {
						goto(`/ddnet/maps/${encodeAsciiURIComponent(map.name)}`);
					}}
					aria-label={map.name}
				>
					<img
						src={map.thumbnail}
						alt={map.name}
						use:abortOnDestroy
						class="absolute left-0 top-0 h-full w-full object-cover"
					/>
					<p
						class="absolute bottom-0 right-0 rounded-tl-lg bg-slate-800 bg-opacity-70 px-3 py-1 text-sm backdrop-blur"
					>
						{mapType(map.type)}
						{numberToStars(map.difficulty)} ({map.points} pts)
					</p>
				</button>
				<div
					class="scrollbar-hide mt-1 h-8 cursor-grab overflow-x-auto whitespace-nowrap"
					onpointerdown={startDragging}
					role="button"
					tabindex="0"
				>
					{#each map.tiles as tile}
						<img
							class="m-0 mr-1 inline-block h-8 w-8 rounded bg-gray-600 p-0"
							use:tippy={{ content: tile }}
							src={`/assets/tiles/${tile}.png`}
							alt={tile}
						/>
					{/each}
				</div>
			</div>
		{/each}
		{#each Array(Math.max(12 - paginatedMaps.length, 0)) as _}
			<div
				class="rounded border border-slate-700 bg-slate-700 p-4 pt-3 shadow"
				class:animate-pulse={!maps.length}
				class:opacity-20={maps.length}
			>
				<div class="h-8 w-28 text-lg">
					<span
						class="fake-content inline-block w-full rounded bg-slate-600 align-middle leading-tight"
					></span>
				</div>
				<div class="h-6 w-32 text-base">
					<span
						class="fake-content inline-block w-full rounded bg-slate-600 align-middle leading-tight"
					></span>
				</div>
				<div class="h-6 w-48 text-sm">
					<span
						class="fake-content inline-block w-full rounded bg-slate-600 align-middle leading-tight"
					></span>
				</div>
				<div class="mt-2 aspect-map h-auto w-full rounded-md border border-slate-600"></div>
				<div class="scrollbar-hide mt-1 h-8 overflow-x-auto overflow-y-hidden whitespace-nowrap">
					{#each Array(10) as _}
						<div class="mr-1 inline-block h-8 w-8 rounded bg-slate-600"></div>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	<div class="mt-6 flex items-center justify-center space-x-4">
		<button
			class="text-nowrap rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
			onclick={() => loadPage(currentPage - 1)}
			disabled={currentPage <= 1}>上一页</button
		>

		<div class="flex flex-col items-center justify-center">
			<p class="inline-block text-center text-slate-400">共 {totalPages} 页</p>
			<div>
				<span>当前页：</span>
				<select class="rounded bg-slate-700 px-2 py-1 text-slate-300" bind:value={currentPage}>
					{#each Array(totalPages) as _, i}
						<option value={i + 1}>{i + 1}</option>
					{/each}
				</select>
			</div>
		</div>

		<button
			class="text-nowrap rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
			onclick={() => loadPage(currentPage + 1)}
			disabled={currentPage >= totalPages}>下一页</button
		>
	</div>
{/if}
