<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { goto, preloadData } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import MapTiles from '$lib/components/ddnet/MapTiles.svelte';
	import TileIcon from '$lib/components/ddnet/TileIcon.svelte';
	import Mappers from '$lib/components/ddnet/Mappers.svelte';
	import { encodeAsciiURIComponent } from '$lib/link';
	import type { MapList } from '$lib/server/fetches/maps';
	import { ddnetDate, MAP_TYPES, mapType, numberToStars, TILES } from '$lib/ddnet/helpers';
	import { checkMapName, checkMapper } from '$lib/ddnet/searches';
	import { loadMapList } from '$lib/ddnet/map-list';
	import RangeSlider from '$lib/components/RangeSlider.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { secondsToDateHM } from '$lib/date';
	import Modal from '$lib/components/Modal.svelte';
	import MapPreview from '$lib/components/mappreview/MapPreview.svelte';
	import Fa from 'svelte-fa';
	import {
		faChevronDown,
		faChevronLeft,
		faChevronRight,
		faMapLocation
	} from '@fortawesome/free-solid-svg-icons';

	let maps: MapList = $state([]);
	let error = $state();
	let previewMapName = $state<string | null>(null);
	let showMapPreviewModal = $state(false);

	const pageSize = 12;

	let searchName = $state('');
	let searchMapper = $state('');
	let currentPage = $state(1);
	let difficulty = $state([0, 5]) as [number, number];
	let type = $state('all');
	let filterTiles = $state(false);
	let allTiles = $state(TILES) as string[];
	let hasTiles = $state(new SvelteSet<string>());

	// 类型筛选:自绘悬浮菜单(和排位页/地图页一致,移动端比原生 select 好点)
	let typeDropdown = $state<HTMLDivElement>();
	let typeMenuOpen = $state(false);
	let typeMenuMaxHeight = $state(0);
	const typeName = $derived(type == 'all' ? '全部' : (MAP_TYPES[type] ?? type));

	const updateTypeMenuMaxHeight = () => {
		if (!typeDropdown) return;
		const rect = typeDropdown.getBoundingClientRect();
		const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
		typeMenuMaxHeight = Math.max(200, Math.round(viewportHeight - rect.bottom - 16));
	};

	// 点外面 / Esc 关闭;放得下就全显示,放不下才滚动
	$effect(() => {
		if (!typeMenuOpen) return;
		updateTypeMenuMaxHeight();
		const onPointerDown = (ev: PointerEvent) => {
			if (typeDropdown && !typeDropdown.contains(ev.target as Node)) typeMenuOpen = false;
		};
		const onKeyDown = (ev: KeyboardEvent) => {
			if (ev.key == 'Escape') typeMenuOpen = false;
		};
		const onResize = () => updateTypeMenuMaxHeight();
		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);
		window.addEventListener('resize', onResize);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('resize', onResize);
		};
	});

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
		filterTiles = false;
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
		// 菜单打开本身也写进 hash(空值 tile=):不然点开菜单后 effect 把 hash 刷成
		// 不带 tile 的,hashchange 又会把 filterTiles 置回 false,菜单根本打不开。
		if (filterTiles) {
			params.set('tile', hasTiles.size > 0 ? Array.from(hasTiles).join('!') : '');
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
			// tile= 空值表示「菜单开着,但还没选图块」
			const wanted = new Set((params.get('tile') ?? '').split('!').filter(Boolean));
			for (const tile of hasTiles) {
				if (!wanted.has(tile)) hasTiles.delete(tile);
			}
			for (const tile of wanted) {
				if (!hasTiles.has(tile)) hasTiles.add(tile);
			}
		} else if (hasTiles.size > 0) {
			hasTiles.clear();
		}
	};

	processHashQuery(page.url.hash);

	// 从别的页面带 ?type= 进来(比如排位页的「查看全部地图」):套用一次这个类型筛选。
	// #hash 里已有 type 时以 #hash 为准(那是页面自己的筛选状态)。
	const initialHash = new URLSearchParams(page.url.hash.replace(/^#/, ''));
	const typeParam = page.url.searchParams.get('type');
	if (!initialHash.get('type') && typeParam && MAP_TYPES[typeParam]) type = typeParam;

	let paginatedMaps = $state<MapList>([]);
	let totalPages = $state(1);

	const checkTiles = (map: (typeof maps)[0], tiles: string[] | null) => {
		if (!filterTiles) return true;
		if (!tiles) return true;
		if (tiles.length == 0) return true;
		return tiles.every((t) => (map.tiles ?? []).includes(t));
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
		// 用固定路径而不是只给 hash:把进来时的 ?type= 参数一并去掉,后续只认 #hash。
		// 注意别在这里读 page.url —— goto 会更新它,effect 会把自己再触发一遍(死循环)。
		// 不加 noScroll:进来 / 筛选 / 翻页都回到页面顶部(和 /goto 跳地图类型的行为一致)。
		goto(`/ddnet/maps${hashQuery}`, { keepFocus: true, replaceState: true });
	});

	const loadPage = (page: number) => {
		currentPage = page;
		goto(createHashQuery());
	};

	const loadMaps = async () => {
		error = void 0;
		try {
			maps = await loadMapList();
		} catch (e) {
			error = (e as Error).message;
		}

		allTiles = Array.from(new Set(maps.flatMap((map) => map.tiles ?? []))).sort();
	};

	onMount(loadMaps);

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
	<meta
		property="og:description"
		content="查询和浏览 DDraceNetwork 官方地图，按类型、难度和作者过滤"
	/>
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
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ href: '/ddnet', text: 'DDNet' },
		{ text: '地图', title: 'DDNet 地图' }
	]}
/>

<div class="mb-4 flex flex-col space-y-2 xl:flex-row xl:space-y-0 xl:space-x-5">
	<div
		class="flex flex-col items-center space-y-2 sm:flex-grow sm:flex-row sm:space-y-0 sm:space-x-2"
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
			<div class="relative" bind:this={typeDropdown}>
				<button
					type="button"
					class="flex w-32 cursor-pointer items-center justify-between gap-2 rounded bg-slate-700 px-4 py-2 font-semibold text-nowrap text-slate-300 hover:bg-slate-600 active:bg-slate-700"
					onclick={() => {
						if (typeMenuOpen) typeMenuOpen = false;
						else {
							updateTypeMenuMaxHeight();
							typeMenuOpen = true;
						}
					}}
					aria-haspopup="true"
					aria-expanded={typeMenuOpen}
					aria-controls="type-menu"
				>
					<span class="truncate">{typeName}</span>
					<Fa
						icon={faChevronDown}
						class="shrink-0 text-xs transition-transform {typeMenuOpen ? 'rotate-180' : ''}"
					/>
				</button>
				{#if typeMenuOpen}
					<div
						id="type-menu"
						class="absolute left-0 z-30 mt-2 flex w-[min(90vw,14rem)] flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-950/80 p-2 shadow-2xl ring-1 shadow-black/60 ring-white/5 backdrop-blur-xl"
						style:max-height={typeMenuMaxHeight ? `${typeMenuMaxHeight}px` : null}
					>
						<ul class="min-h-0 flex-1 overflow-y-auto">
							<li>
								<button
									type="button"
									class="flex w-full cursor-pointer items-center rounded px-2 py-1 text-left text-sm text-nowrap {type ==
									'all'
										? 'bg-blue-500/20 font-semibold text-blue-300'
										: 'text-slate-300 hover:bg-white/10'}"
									onclick={() => {
										type = 'all';
										typeMenuOpen = false;
									}}
								>
									全部
								</button>
							</li>
							{#each Object.entries(MAP_TYPES) as [k, v]}
								<li>
									<button
										type="button"
										class="flex w-full cursor-pointer items-center rounded px-2 py-1 text-left text-sm text-nowrap {type ==
										k
											? 'bg-blue-500/20 font-semibold text-blue-300'
											: 'text-slate-300 hover:bg-white/10'}"
										onclick={() => {
											type = k;
											typeMenuOpen = false;
										}}
									>
										{v}
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
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
			class="h-8 w-8 overflow-hidden rounded bg-gray-600 bg-cover bg-center"
			class:pointer-events-none={!filterTiles}
			class:opacity-0={!filterTiles}
			class:opacity-30={filterTiles && !hasTiles.has(tile)}
			class:bg-gray-700={filterTiles && !hasTiles.has(tile)}
			aria-label={tile}
			onclick={() => (hasTiles.has(tile) ? hasTiles.delete(tile) : hasTiles.add(tile))}
		>
			<TileIcon {tile} class="h-full w-full object-cover" />
		</button>
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
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
		{#each paginatedMaps as map, index (map.name + index)}
			<div class="rounded border border-slate-700 bg-slate-700 p-4 pt-3 shadow">
				<h3 class="scrollbar-hide h-8 overflow-x-auto text-lg font-bold text-nowrap">
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
						发布于：{secondsToDateHM(map.release)}
					{:else}
						发布于：远古
					{/if}
				</span>
				<div
					class="aspect-map relative mt-2 h-auto w-full overflow-hidden rounded-md border border-slate-600 hover:border-blue-500 active:border-blue-300"
				>
					<button
						class="h-full w-full"
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
							class="absolute top-0 left-0 h-full w-full object-cover"
						/>
					</button>
					<p
						class="bg-opacity-70 absolute right-0 bottom-0 rounded-tl-lg bg-slate-800 py-1 pr-9 pl-3 text-sm backdrop-blur"
					>
						{mapType(map.type)}
						{numberToStars(map.difficulty)} ({map.points} pts)
						<button
							class="absolute right-0 bottom-0 h-full bg-slate-800 px-2 hover:bg-slate-900 active:bg-slate-700"
							onclick={(e) => {
								previewMapName = map.name;
								showMapPreviewModal = true;
							}}
							aria-label="预览地图"
						>
							<Fa icon={faMapLocation} />
						</button>
					</p>
				</div>
				<MapTiles tiles={map.tiles ?? []} class="mt-1" />
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
				<div class="aspect-map mt-2 h-auto w-full rounded-md border border-slate-600"></div>
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
			class="inline-flex h-8 w-8 items-center justify-center rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
			onclick={() => loadPage(currentPage - 1)}
			disabled={currentPage <= 1}
			title="上一页"
			aria-label="上一页"
		>
			<Fa icon={faChevronLeft} />
		</button>

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
			class="inline-flex h-8 w-8 items-center justify-center rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
			onclick={() => loadPage(currentPage + 1)}
			disabled={currentPage >= totalPages}
			title="下一页"
			aria-label="下一页"
		>
			<Fa icon={faChevronRight} />
		</button>
	</div>
{/if}

<Modal bind:show={showMapPreviewModal}>
	<div
		class="h-[calc(100svh-4rem)] max-h-[calc(100svh-4rem)] w-[calc(100vw-2rem)] overflow-hidden rounded-l-lg rounded-br-lg bg-slate-700 p-1 shadow-md sm:w-[calc(100vw-5rem)]"
	>
		<MapPreview map={showMapPreviewModal ? previewMapName : null} />
	</div>
</Modal>
