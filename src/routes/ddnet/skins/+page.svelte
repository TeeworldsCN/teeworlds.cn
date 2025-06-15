<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { tippy } from '$lib/tippy';
	import Fa from 'svelte-fa';
	import { faSearch } from '@fortawesome/free-solid-svg-icons';
	import TeeRender from '$lib/components/TeeRender.svelte';
	import VirtualScroll from 'svelte-virtual-scroll-list';
	import { EMOTE } from '$lib/stores/skins.js';

	const { data } = $props();

	// State variables
	let searchQuery = $state('');
	let searchField = $state('');
	let showCommunity = $state(false);
	let filteredSkins = $state<{ row: number; skins: typeof data.skins }[]>([]);
	let copiedSkin = $state<string | null>(null);

	// Process skins data
	$effect(() => {
		if (!data.skins) return;

		// Filter skins based on search query and community toggle
		const filtered = data.skins
			.filter((skin) => {
				// Filter by community toggle
				if (!showCommunity && skin.type !== 'normal') {
					return false;
				}

				// Filter by search query
				const matchesSearch =
					searchQuery === '' || skin.name.toLowerCase().includes(searchQuery.toLowerCase());

				// For now, we don't have actual type information, so the toggle doesn't do anything
				// In a real implementation, we would filter by skin.type here
				return matchesSearch;
			})
			.sort((a, b) => -a.date.localeCompare(b.date));

		// Split skins into three columns
		const result = [];
		for (let i = 0; i < filtered.length; i += 3) {
			result.push({
				row: i,
				skins: filtered.slice(i, i + 3)
			});
		}

		filteredSkins = result;
	});

	let updateTimer: NodeJS.Timeout;

	$effect(() => {
		searchField;

		if (updateTimer) clearTimeout(updateTimer);

		// Delay updating search query to avoid unnecessary re-renders
		updateTimer = setTimeout(() => {
			searchQuery = searchField;
		}, 350);
	});

	// Copy skin name to clipboard
	async function copySkinName(skinName: string) {
		try {
			await navigator.clipboard.writeText(skinName);
			copiedSkin = skinName;

			// Reset copied state after 2 seconds
			setTimeout(() => {
				if (copiedSkin === skinName) copiedSkin = null;
			}, 2000);

			return true;
		} catch (err) {
			console.error('Failed to copy skin name:', err);
			return false;
		}
	}

	// Get tooltip content based on copy state
	function getTooltipContent(skinName: string) {
		return copiedSkin === skinName ? `${skinName} 已复制！` : `${skinName} 点击复制`;
	}
</script>

<svelte:head>
	<meta property="og:title" content="DDNet 皮肤列表 - TeeworldsCN" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://teeworlds.cn/ddnet/skins" />
	<meta property="og:description" content="浏览和复制 DDraceNetwork 皮肤，包括官方皮肤和社区皮肤" />
	<meta property="og:image" content="https://teeworlds.cn/shareicon.png" />
	<meta name="title" content="DDNet 皮肤列表 - TeeworldsCN" />
	<meta name="description" content="浏览和复制 DDraceNetwork 皮肤，包括官方皮肤和社区皮肤" />
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ href: '/ddnet', text: 'DDNet' },
		{ text: '皮肤', title: 'DDNet 皮肤' }
	]}
/>

<div class="mt-2">
	<div class="mb-2 flex flex-col gap-4 sm:flex-row">
		<!-- Search input -->
		<div class="relative flex-grow">
			<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
				<Fa icon={faSearch} class="text-slate-400" />
			</div>
			<input
				type="text"
				bind:value={searchField}
				placeholder="搜索皮肤..."
				class="w-full rounded-md bg-slate-700 py-2 pl-10 pr-4 text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
			/>
		</div>

		<!-- Community skins toggle -->
		<div class="flex items-center">
			<label class="inline-flex cursor-pointer items-center">
				<input type="checkbox" bind:checked={showCommunity} class="peer sr-only" />
				<div
					class="peer relative h-6 w-11 rounded-full bg-slate-700 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rtl:peer-checked:after:-translate-x-full"
				></div>
				<span class="ms-3 text-sm font-medium text-slate-300">显示社区皮肤</span>
			</label>
		</div>
	</div>

	<!-- Skins count -->
	<p class="mb-2 text-slate-400">
		共 {filteredSkins.reduce((sum, row) => sum + row.skins.length, 0)} 个皮肤
	</p>

	<!-- Skins grid with virtual scrolling -->
	<div class="scrollbar-subtle grid h-[calc(100svh-16rem)] w-full sm:h-[calc(100svh-14rem)]">
		<VirtualScroll keeps={20} data={filteredSkins} key="row" let:data>
			<div class="h-20 w-full overflow-hidden">
				{#each data.skins as skin}
					<div class="inline-block w-1/3 p-1">
						<div class="flex rounded-lg bg-slate-700 p-1">
							<button
								type="button"
								class="h-full cursor-pointer flex-col items-center rounded-lg bg-slate-600 transition-colors hover:bg-slate-500"
								data-skin-name={skin.name}
								use:tippy={{
									content: getTooltipContent(skin.name),
									placement: 'top',
									hideOnClick: false,
									sticky: true
								}}
								onclick={() => copySkinName(skin.name)}
								aria-label={`复制皮肤名称: ${skin.name}`}
							>
								<div class="relative h-16 w-16">
									<TeeRender
										name={skin.name}
										className="w-full h-full"
										emote={copiedSkin === skin.name ? EMOTE.hurt : EMOTE.normal}
									/>
								</div>
							</button>
							<div
								class="ml-3 hidden h-full w-full flex-col justify-center self-center overflow-hidden sm:flex"
							>
								<div class="text-center text-sm">{skin.name}</div>
								<div class="text-center text-sm">作者：{skin.creator}</div>
								{#if skin.skinpack}
									<div class="text-center text-sm">{skin.skinpack} 系列</div>
								{/if}
							</div>
							<div
								class="ml-3 hidden h-full w-full flex-col justify-center self-center overflow-hidden xl:flex"
							>
								<div class="text-center text-sm">
									{skin.type == 'normal' ? '官方皮肤' : '社区皮肤'}
								</div>
								<div class="text-center text-sm">发布于：{skin.date}</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</VirtualScroll>
	</div>
</div>
