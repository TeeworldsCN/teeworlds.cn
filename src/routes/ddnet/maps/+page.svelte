<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { goto, preloadData } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import Mappers from '$lib/components/ddnet/Mappers.svelte';
	import { encodeAsciiURIComponent } from '$lib/link';
	import type { MapList } from '$lib/server/fetches/maps';
	import { mapType, numberToStars } from '$lib/ddnet/helpers'

	let maps: MapList = $state([]);
	let error = $state();

	const pageSize = 12;

	let searchName = $state('');
	let searchMapper = $state('');
	let currentPage = $state(1);

	function resetFilters() {
		searchName = '';
		searchMapper = '';
	}

	const createHashQuery = () => {
		const params = new URLSearchParams();
		if (searchName) params.set('name', searchName);
		if (searchMapper) params.set('mapper', searchMapper);
		if (currentPage > 1) params.set('page', currentPage.toString());
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
	};

	processHashQuery(page.url.hash);

	let paginatedMaps = $state<typeof maps>([]);
	let totalPages = $state(1);

	const checkMapName = (map: any, search: string) => {
		if (!search) {
			return true;
		}

		let mapInitial = '';
		let mapNameNoSeparator = '';
		let prevIsUpper = false;
		let prevIsSeparator = true;
		for (let i = 0; i < map.name.length; i++) {
			const char = map.name[i];
			const isUpper = char.match(/[A-Z]/);
			const isLetter = isUpper || char.match(/[a-z]/);
			const isSeparator = char == '-' || char == '_' || char == ' ';
			const isNumber = char.match(/[0-9]/);
			if (isUpper) {
				if (!prevIsUpper || prevIsSeparator) {
					mapInitial += char;
				}
			} else if (isLetter) {
				if (prevIsSeparator) {
					mapInitial += char;
				}
			} else if (isNumber) {
				mapInitial += char;
			}
			prevIsUpper = isUpper;
			prevIsSeparator = isSeparator;
			if (!isSeparator) {
				mapNameNoSeparator += char;
			}
		}

		const mapName = map.name.toLowerCase();
		const searchTextLower = search.toLowerCase();
		return (
			mapInitial.toLowerCase() == searchTextLower ||
			mapNameNoSeparator.toLowerCase().includes(searchTextLower) ||
			mapName.includes(searchTextLower)
		);
	};

	const checkMapper = (map: any, search: string) => {
		if (!search) {
			return true;
		}

		const mapperString = map.mapper || '不详';

		if (search.startsWith('"') && search.endsWith('"')) {
			// exact match
			const mappers = (mapperString as string)
				.split(',')
				.flatMap((mapper) => mapper.split('&'))
				.map((mapper) => mapper.trim());

			search = search.slice(1, -1).toLowerCase();
			return mappers.some((mapper) => mapper.toLowerCase() == search);
		}

		return mapperString.toLowerCase().includes(search.toLowerCase());
	};

	$effect(() => {
		if (!Array.isArray(maps)) return

		const filteredMaps = maps.filter((map: any) => {
			return checkMapName(map, searchName) && checkMapper(map, searchMapper);
		});

		totalPages = Math.ceil(filteredMaps.length / pageSize);

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
		error = void 0
		processHashQuery(page.url.hash);
		const response = await fetch('/ddnet/maps');
		if (response.ok) {
			maps = await response.json();
		} else {
			error = response.statusText;
		}
	}

	onMount(loadMaps);
</script>

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

<div class="mb-4 md:flex md:space-x-5">
	<input
		type="text"
		placeholder="按地图名搜索"
		class="w-full rounded border border-slate-600 bg-slate-700 p-2 text-slate-300 md:mb-0 md:flex-1"
		bind:value={searchName}
	/>
	<input
		type="text"
		placeholder="按作者名搜索"
		class="w-full rounded border border-slate-600 bg-slate-700 p-2 text-slate-300 md:mb-0 md:flex-1"
		bind:value={searchMapper}
	/>
	<button
		class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-red-800 disabled:bg-blue-500 disabled:opacity-50"
		onclick={resetFilters}
		disabled={!searchName && !searchMapper}
	>
		重置搜索
	</button>
</div>
{#if error}
	<div class="text-center text-slate-300">
		<h2 class="text-xl font-bold">数据加载失败</h2>
		<p>{error}</p>
		<button onclick={loadMaps} class="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">重新加载</button>
	</div>
{:else if maps.length}
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
		{#each paginatedMaps as map (map.name)}
			<div class="rounded border border-slate-700 bg-slate-700 pt-3 p-4 shadow">
				<h3 class="text-lg font-bold text-nowrap overflow-x-auto scrollbar-hide">{map.name}</h3>
				<!-- 发布日期 -->
				<span class="font-semibold">{map.release}</span>
				<button
					class="mt-2 aspect-map h-auto w-full rounded-md border border-slate-600 hover:border-blue-500 active:border-blue-300"
					style="background-image: url({map.thumbnail}); background-size: cover; background-repeat: no-repeat; background-position: center;"
					onmousedown={() => {
						preloadData(`/ddnet/m?n=${encodeAsciiURIComponent(map.name)}`);
					}}
					onclick={() => {
						goto(`/ddnet/m?n=${encodeAsciiURIComponent(map.name)}`);
					}}
					aria-label={map.name}
				>
				</button>
				<p class="scrollbar-hide mt-2 overflow-x-auto whitespace-nowrap">
					<span class="font-semibold">作者：</span><Mappers
						authors={map.mapper || '不详'}
						click={(author) => {
							resetFilters();
							searchMapper = `"${author}"`;
						}}
				/>
				</p>
				<p class="mt-1"><span class="font-semibold">类型：{mapType(map.type)} {numberToStars(map.difficulty)} ({map.points} pts)</span></p>
				<div class="mt-1 scrollbar-hide overflow-x-auto whitespace-nowrap">
					{#each map.tiles as tile}
						<img
							class="inline-block w-8 h-8 mr-1"
							src={`/assets/tiles/${tile}.png`}
							alt={tile}
						/>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	<div class="mt-6 flex items-center justify-center space-x-4">
		{#if currentPage > 1}
			<button
				class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
				onclick={() => loadPage(currentPage - 1)}>上一页</button
			>
		{/if}
		<p class="text-gray-700">第 {currentPage} / {totalPages} 页</p>
		{#if currentPage < totalPages}
			<button
				class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
				onclick={() => loadPage(currentPage + 1)}>下一页</button
			>
		{/if}
	</div>
{:else}
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
		{#each Array(8) as _}
			<div class="rounded border border-slate-700 bg-slate-700 pt-3 p-4 pb-3.5 shadow animate-pulse">
				<div class="h-6 w-28 bg-gray-400 rounded mb-2"></div>
				<div class="h-5 w-40 bg-gray-400 rounded mb-2"></div>
				<div class="mt-2 aspect-map h-auto w-full bg-gray-400 rounded mb-2"></div>
				<div class="rounded w-28 h-5 mt-1 bg-gray-400"></div>
				<div class="rounded h-5 w-2/3 mt-2 bg-gray-400"></div>
				<div class="mt-1 scrollbar-hide overflow-x-auto whitespace-nowrap">
					{#each Array(10) as _}
						<div class="rounded inline-block w-8 h-8 mr-1 bg-gray-400"></div>
					{/each}
				</div>
			</div>
		{/each}
	</div>
{/if}
