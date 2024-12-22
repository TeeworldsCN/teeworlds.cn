<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { goto, preloadData } from '$app/navigation';

	const maps = page.data.maps;

	const pageSize = 12;
	let currentPage = $state(parseInt(page.url.hash.slice(1) || '1'));
	let paginatedMaps = $state<typeof maps>([]);

	const totalPages = Math.ceil(maps.length / pageSize);

	$effect(() => {
		paginatedMaps = maps.slice((currentPage - 1) * pageSize, currentPage * pageSize);
	});

	function loadPage(page: number) {
		currentPage = page;
		goto(`#${page}`);
	}

	onMount(() => {
		currentPage = +(page.url.hash.slice(1) || 1);
	});
</script>

<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
	{#each paginatedMaps as map (map.name)}
		<button
			class="rounded border border-slate-700 bg-slate-700 p-4 shadow hover:border-blue-500 active:border-blue-300"
			onmousedown={() => {
				preloadData(`/ddnet/maps/${encodeURIComponent(map.name)}`);
			}}
			onclick={() => {
				goto(`/ddnet/maps/${encodeURIComponent(map.name)}`);
			}}
		>
			<h3 class="text-lg font-bold">{map.name}</h3>
			<img class="mt-2 aspect-map h-auto w-full" src={map.thumbnail} alt={map.name} />
			<p class="mt-2"><span class="font-semibold">作者：</span> {map.mapper}</p>
			<p class="mt-1"><span class="font-semibold">类型：</span> {map.type}</p>
		</button>
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
