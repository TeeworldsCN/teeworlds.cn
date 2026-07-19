<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import Fa from 'svelte-fa';
	import { faSearch, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
	import SkinCard from '$lib/components/SkinCard.svelte';
	import VirtualScroll from 'svelte-virtual-scroll-list';

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

		// 解析搜索语法：
		//   author:X       → 匹配作者 (X 大小写不敏感)
		//   pack:X         → 匹配系列/skinpack
		//   X              → 匹配皮肤名
		// 多个 token 用空格分隔，AND 关系。
		// 带空格的 pack/作者可用双引号包裹：pack:"The Rotting Halls"
		// 用 shlex 风格 tokenizer 拆分（支持引号），避免 "The Rotting Halls" 被切碎。
		function tokenize(query: string): string[] {
			const tokens: string[] = [];
			let buf = '';
			let inQuote: '"' | "'" | null = null;
			for (const ch of query) {
				if (inQuote) {
					if (ch === inQuote) {
						inQuote = null;
					} else {
						buf += ch;
					}
				} else if (ch === '"' || ch === "'") {
					inQuote = ch;
				} else if (ch === ' ' || ch === '\t') {
					if (buf) {
						tokens.push(buf);
						buf = '';
					}
				} else {
					buf += ch;
				}
			}
			if (buf) tokens.push(buf);
			return tokens;
		}

		function buildMatcher(query: string) {
			const tokens = tokenize(query);
			if (tokens.length === 0) return () => true;

			return (skin: typeof data.skins[number]) => {
				return tokens.every((tok) => {
					const lower = tok.toLowerCase();
					if (lower.startsWith('author:')) {
						const needle = lower.slice('author:'.length);
						return needle !== '' && skin.creator.toLowerCase().includes(needle);
					}
					if (lower.startsWith('pack:')) {
						const needle = lower.slice('pack:'.length);
						return (
							needle !== '' &&
							!!skin.skinpack &&
							skin.skinpack.toLowerCase().includes(needle)
						);
					}
					return skin.name.toLowerCase().includes(lower);
				});
			};
		}

		const matcher = buildMatcher(searchQuery);

		// Filter skins based on search query and community toggle
		const filtered = data.skins
			.filter((skin) => {
				// Filter by community toggle
				if (!showCommunity && skin.type !== 'normal') {
					return false;
				}

				return matcher(skin);
			})
			.sort((a, b) => -a.date.localeCompare(b.date));

		// Group skins into rows of 3 for the desktop 3-column layout.
		// The wrapper uses `block w-full sm:inline-block sm:w-1/3`, so on mobile
		// each card stacks to its own line (single column) while on desktop
		// three cards sit side-by-side per row.
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

	// 皮肤卡片点击作者/系列时调用：直接替换搜索框内容为对应的过滤 token。
	// 替换而不是累加：用户点击即"我想按这个字段筛"，避免堆出无意义的 AND。
	// 含空格的 pack/作者自动用双引号包裹，避免被 tokenizer 切碎。
	function quoteIfNeeded(value: string): string {
		return /\s/.test(value) ? `"${value}"` : value;
	}
	function searchByAuthor(name: string) {
		searchField = `author:${quoteIfNeeded(name)}`;
	}
	function searchByPack(name: string) {
		searchField = `pack:${quoteIfNeeded(name)}`;
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
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ href: '/ddnet', text: 'DDNet' },
		{ text: '皮肤', title: 'DDNet 皮肤' }
	]}
/>

<div
	class="mb-3 flex items-start gap-3 rounded-md border border-blue-700/60 bg-blue-900/30 p-3 text-sm text-blue-100"
	role="note"
>
	<Fa icon={faCircleInfo} class="mt-0.5 shrink-0 text-blue-300" />
	<p>
		通常情况下，<strong class="font-semibold">复制皮肤名</strong>粘贴到 DDNet 客户端即可自动下载，无需手动下载源文件。
	</p>
</div>

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
				placeholder="搜索皮肤…"
				class="w-full rounded-md bg-slate-700 py-2 pr-9 pl-10 text-slate-300 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
			/>
			{#if searchField}
				<button
					type="button"
					onclick={() => (searchField = '')}
					aria-label="清空搜索"
					title="清空搜索"
					class="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-200"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						class="h-4 w-4"
					>
						<path
							d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
						/>
					</svg>
				</button>
			{/if}
		</div>

		<!-- Community skins toggle -->
		<div class="flex items-center">
			<label class="inline-flex cursor-pointer items-center">
				<input type="checkbox" bind:checked={showCommunity} class="peer sr-only" />
				<div
					class="peer relative h-6 w-11 rounded-full bg-slate-700 peer-checked:bg-blue-600 peer-focus:ring-2 peer-focus:ring-blue-500 peer-focus:outline-none after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white rtl:peer-checked:after:-translate-x-full"
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
	<div class="scrollbar-subtle h-[calc(100svh-16rem)] w-full sm:h-[calc(100svh-14rem)]">
		<VirtualScroll keeps={20} data={filteredSkins} key="row" let:data>
			<div class="w-full sm:h-20 sm:overflow-hidden">
				{#each data.skins as skin}
					<div class="block w-full p-1 sm:inline-block sm:w-1/3">
						<SkinCard
							{skin}
							{copiedSkin}
							{copySkinName}
							{getTooltipContent}
							{searchByAuthor}
							{searchByPack}
						/>
					</div>
				{/each}
			</div>
		</VirtualScroll>
	</div>
</div>
