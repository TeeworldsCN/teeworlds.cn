<script lang="ts">
	import { page } from '$app/state';
	import { onDestroy, onMount } from 'svelte';
	import { goto, preloadData } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import Mappers from '$lib/components/ddnet/Mappers.svelte';
	import { encodeAsciiURIComponent } from '$lib/link';
	import type { MapList } from '$lib/server/fetches/maps';
	import { ddnetDate, mapType, numberToStars } from '$lib/ddnet/helpers';
	import { browser } from '$app/environment';

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
		if (!Array.isArray(maps)) return;

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
		error = void 0;
		processHashQuery(page.url.hash);
		const response = await fetch('/ddnet/maps');
		if (response.ok) {
			maps = await response.json();
		} else {
			error = response.statusText;
		}
	};

	onMount(loadMaps);

	let slider: HTMLDivElement | null = null;
	let startX = 0;
	let scrollLeft = 0;
	const startDragging = (ev: MouseEvent) => {
		ev.preventDefault();
		slider = ev.currentTarget as HTMLDivElement;
		startX = ev.pageX;
		scrollLeft = slider.scrollLeft;
		console.log(`${startX}, ${scrollLeft}`);
		slider.addEventListener('mousemove', moveDragging);
	};
	const moveDragging = (ev: MouseEvent) => {
		if (slider == null) return;
		ev.preventDefault();
		const x = ev.pageX - startX;
		slider.scrollLeft = scrollLeft - x;
	};
	const stopDragging = (ev: MouseEvent) => {
		if (slider) {
			slider.removeEventListener('mousemove', moveDragging);
			slider = null;
		}
	};

	onMount(() => {
		if (browser) {
			document.addEventListener('mouseup', stopDragging);
		}
	});

	onDestroy(() => {
		if (browser) {
			document.removeEventListener('mouseup', stopDragging);
		}
	});
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
		class="rounded bg-red-800 px-4 py-2 text-white hover:bg-red-700 disabled:bg-red-800 disabled:opacity-50"
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
					style="background-image: url({map.thumbnail}); background-size: cover; background-repeat: no-repeat; background-position: center;"
					onmousedown={() => {
						preloadData(`/ddnet/m?n=${encodeAsciiURIComponent(map.name)}`);
					}}
					onclick={() => {
						goto(`/ddnet/m?n=${encodeAsciiURIComponent(map.name)}`);
					}}
					aria-label={map.name}
				>
					<p
						class="absolute bottom-0 right-0 rounded-tl-lg bg-slate-800 bg-opacity-70 px-3 py-1 text-sm backdrop-blur"
					>
						{mapType(map.type)}
						{numberToStars(map.difficulty)} ({map.points} pts)
					</p>
				</button>
				<div
					class="scrollbar-hide mt-1 h-8 cursor-grab overflow-x-auto whitespace-nowrap"
					onmousedown={startDragging}
					onmouseup={stopDragging}
					role="button"
					tabindex="0"
				>
					{#each map.tiles as tile}
						<img
							class="m-0 mr-1 inline-block h-8 w-8 rounded bg-gray-600 p-0"
							title={tile}
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
			class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
			onclick={() => loadPage(currentPage - 1)}
			disabled={currentPage <= 1}>上一页</button
		>

		<p class="inline-block w-48 text-center text-slate-400">第 {currentPage} / {totalPages} 页</p>

		<button
			class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
			onclick={() => loadPage(currentPage + 1)}
			disabled={currentPage >= totalPages}>下一页</button
		>
	</div>
{/if}
