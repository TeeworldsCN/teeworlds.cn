<script lang="ts">
	/**
	 * DDNet TV:ddnet.org/watch 预生成好的 demo 一览。
	 *
	 * 服务端已经把「一场完赛 = 一张卡」整理好了(团队记录优先、被团队包含的个人记录剔掉),
	 * 这里只负责每页 6 张卡片和翻页。隐藏参数 `?invalid=1` 看的是 kept 的历史回放,
	 * 由 +page.server.ts 切到 watchables.invalid 分区。
	 */
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { secondsToDateHM } from '$lib/date';
	import { watchLink } from '$lib/ddnet/helpers';
	import Fa from 'svelte-fa';
	import {
		faChevronLeft,
		faChevronRight,
		faPlay,
		faTv,
		faTriangleExclamation
	} from '@fortawesome/free-solid-svg-icons';

	let { data } = $props();

	/** mm:ss.cc,和 /ddnet/watch 标题里的成绩格式一致 */
	const formatTime = (value: number) => {
		const minutes = Math.floor(value / 60);
		return `${String(minutes).padStart(2, '0')}:${(value - minutes * 60).toFixed(2).padStart(5, '0')}`;
	};

	const namesOf = (names: string[]) =>
		names.length > 2 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names.join(' & ');

	/** 用地图名算一个稳定的色相,让每张卡片有点区分度(同图永远同色) */
	const hueOf = (name: string) => {
		let hash = 0;
		for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) | 0;
		return Math.abs(hash) % 360;
	};

	const cardStyle = (map: string) => {
		const hue = hueOf(map);
		return (
			`background-image:` +
			`radial-gradient(130% 130% at 0% 0%, hsl(${hue} 52% 30% / 0.9), transparent 62%),` +
			`linear-gradient(135deg, hsl(${(hue + 42) % 360} 45% 17%), #0b1220 86%)`
		);
	};

	/** 缩略图 404 / 被墙时别留一个破图标,直接让下面的渐变背景露出来 */
	const hideBrokenImage = (event: Event) => {
		if (event.currentTarget instanceof HTMLImageElement) event.currentTarget.style.display = 'none';
	};

	/** 翻页链接:保留 invalid 隐藏参数 */
	const pageUrl = (page: number) => {
		const params = new URLSearchParams();
		if (page > 1) params.set('page', String(page));
		if (data.invalid) params.set('invalid', '1');
		const query = params.toString();
		return `/ddnet/tv${query ? `?${query}` : ''}`;
	};

	const hrefOf = (item: (typeof data.items)[number]) =>
		watchLink({
			uuid: item.uuid,
			time: item.time,
			kind: item.kind,
			names: item.names,
			invalid: data.invalid
		});

	/** 页码窗口:首页、末页、当前页附近;中间用省略号 */
	const pageLinks = $derived.by(() => {
		const wanted = new Set([1, data.pageCount, data.page - 1, data.page, data.page + 1]);
		const pages = [...wanted]
			.filter((page) => page >= 1 && page <= data.pageCount)
			.sort((a, b) => a - b);
		const result: (number | null)[] = [];
		for (let i = 0; i < pages.length; i++) {
			if (i > 0 && pages[i] - pages[i - 1] > 1) result.push(null);
			result.push(pages[i]);
		}
		return result;
	});
</script>

<svelte:head>
	<title>DDNet TV - demo 回放 - TeeworldsCN</title>
	<meta name="description" content="DDNet 最新公布回放,按过图时间从新到旧看。" />
</svelte:head>

<div class="mx-auto w-full max-w-6xl px-3 pb-10">
	<Breadcrumbs
		breadcrumbs={[
			{ href: '/', text: '首页', title: 'TeeworldsCN' },
			{ href: '/ddnet', text: 'DDNet 工具箱', title: 'DDNet 工具箱' },
			{ text: 'DDNet TV', title: 'DDNet TV' }
		]}
	/>

	<div
		class="relative mt-4 overflow-hidden rounded-2xl p-5 ring-1 ring-white/10 sm:p-6"
		style="background: radial-gradient(120% 160% at 0% 0%, rgb(249 115 22 / 0.16), transparent 55%), linear-gradient(120deg, #111827, #0b1220 70%)"
	>
		<!-- 一点电视扫描线的味道,很淡,不影响读字 -->
		<div
			class="pointer-events-none absolute inset-0 opacity-[0.05]"
			style="background-image: repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 4px)"
			aria-hidden="true"
		></div>

		<div class="relative flex flex-wrap items-end justify-between gap-4">
			<div class="min-w-0">
				<p class="text-[10px] font-semibold tracking-[0.35em] text-orange-300/80 uppercase">
					Demo channel
				</p>
				<h1 class="mt-1 flex items-center gap-2.5 text-2xl font-black text-white sm:text-3xl">
					<span
						class="grid h-10 w-10 place-items-center rounded-xl bg-orange-500/15 text-orange-300 ring-1 ring-orange-300/30"
					>
						<Fa icon={faTv} />
					</span>
					DDNet TV
				</h1>
				<p class="mt-2 max-w-2xl text-sm text-slate-300">最新公布回放</p>
			</div>

			<div class="flex flex-wrap items-center gap-2 text-xs text-slate-300">
				{#if data.invalid}
					<span
						class="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1.5 font-semibold text-red-300 ring-1 ring-red-400/30 backdrop-blur"
						title="这些回放的官方名次已经被删除(成绩作废/改名),demo 文件仍被上游保留"
					>
						<Fa icon={faTriangleExclamation} />
						已删除记录
					</span>
				{/if}
				<span class="rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-white/10 backdrop-blur">
					共 <strong class="font-semibold text-white">{data.total}</strong> 场
				</span>
				<span class="rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-white/10 backdrop-blur">
					第 <strong class="font-semibold text-white">{data.page}</strong> / {data.pageCount} 页
				</span>
			</div>
		</div>
	</div>

	<div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.items as item (item.uuid + item.kind + item.ts + item.time)}
			<a
				href={hrefOf(item)}
				class="group relative flex min-h-48 flex-col justify-end overflow-hidden rounded-2xl text-white shadow-lg ring-1 ring-white/10 transition duration-200 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-orange-950/40 hover:ring-orange-300/60 focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:outline-none"
				style={cardStyle(item.map)}
				title="播放 {item.map}"
			>
				{#if item.thumbnail}
					<!-- 官方地图缩略图(360x225)铺满卡片;加载失败就退回下面那层渐变 -->
					<img
						src={item.thumbnail}
						alt=""
						loading="lazy"
						decoding="async"
						class="absolute inset-0 h-full w-full object-cover brightness-90 transition duration-500 group-hover:scale-[1.03] group-hover:brightness-100"
						onerror={hideBrokenImage}
					/>
					<span
						class="absolute inset-0 bg-linear-to-b from-slate-950/45 via-slate-950/10 to-slate-950/60"
						aria-hidden="true"
					></span>
				{/if}

				<!-- 顶部:类型 / 名次 / 人数 + 播放圆钮。都放在毛玻璃胶囊里,压在任何缩略图上都读得清 -->
				<div class="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
					<div class="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] font-semibold">
						<span
							class="rounded-full bg-slate-950/55 px-2.5 py-1 text-slate-100 ring-1 ring-white/15 backdrop-blur-md"
						>
							{item.kind === 'team' ? '团队' : '个人'}
						</span>
						{#if item.rank > 0}
							<span
								class="rounded-full bg-orange-500/25 px-2.5 py-1 text-orange-100 ring-1 ring-orange-300/30 backdrop-blur-md"
							>
								#{item.rank}
							</span>
						{/if}
						{#if item.finishers?.length > 1}
							<span
								class="rounded-full bg-slate-950/45 px-2.5 py-1 text-slate-200 ring-1 ring-white/10 backdrop-blur-md"
							>
								{item.finishers.length} 人
							</span>
						{/if}
					</div>
					<span
						class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950/45 text-white ring-1 ring-white/25 backdrop-blur-md transition duration-200 group-hover:scale-105 group-hover:bg-orange-500 group-hover:ring-orange-300"
						aria-hidden="true"
					>
						<Fa icon={faPlay} class="ml-0.5" />
					</span>
				</div>

				<!-- 底部信息:毛玻璃面板,地图缩略图再花也不会压住文字 -->
				<div
					class="relative m-2.5 rounded-xl bg-slate-950/55 p-3 ring-1 ring-white/15 backdrop-blur-md"
				>
					<div class="flex items-baseline justify-between gap-3">
						<h2 class="min-w-0 truncate text-lg font-bold tracking-tight" title={item.map}>
							{item.map}
						</h2>
						<span class="shrink-0 font-mono text-lg font-semibold text-orange-200 tabular-nums">
							{formatTime(item.time)}
						</span>
					</div>
					<div class="mt-1.5 flex items-center justify-between gap-3 text-xs">
						<p class="min-w-0 truncate text-slate-200" title={item.names.join(', ')}>
							{namesOf(item.names)}
						</p>
						<time class="shrink-0 text-slate-400" datetime={new Date(item.ts * 1000).toISOString()}>
							{secondsToDateHM(item.ts)}
						</time>
					</div>
				</div>
			</a>
		{/each}
	</div>

	{#if data.pageCount > 1}
		<nav
			class="mx-auto mt-8 flex w-fit max-w-full flex-wrap items-center justify-center gap-1 rounded-full bg-slate-900/70 p-1.5 shadow-lg ring-1 ring-white/10 backdrop-blur"
			aria-label="翻页"
		>
			{#if data.page > 1}
				<a
					href={pageUrl(data.page - 1)}
					class="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
					title="上一页"
					aria-label="上一页"
				>
					<Fa icon={faChevronLeft} />
				</a>
			{:else}
				<span
					class="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-600"
					aria-hidden="true"
				>
					<Fa icon={faChevronLeft} />
				</span>
			{/if}

			{#each pageLinks as page, index (index)}
				{#if page === null}
					<span class="px-1 text-slate-500">…</span>
				{:else if page === data.page}
					<span
						class="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-orange-500 px-2 text-sm font-semibold text-white shadow-md shadow-orange-950/40"
						aria-current="page">{page}</span
					>
				{:else}
					<a
						href={pageUrl(page)}
						class="inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
						>{page}</a
					>
				{/if}
			{/each}

			{#if data.page < data.pageCount}
				<a
					href={pageUrl(data.page + 1)}
					class="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
					title="下一页"
					aria-label="下一页"
				>
					<Fa icon={faChevronRight} />
				</a>
			{:else}
				<span
					class="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-600"
					aria-hidden="true"
				>
					<Fa icon={faChevronRight} />
				</span>
			{/if}
		</nav>
	{/if}

	{#if !data.items.length}
		<p class="mt-10 text-center text-slate-400">这个分区暂时没有可播放的 demo。</p>
	{/if}
</div>
