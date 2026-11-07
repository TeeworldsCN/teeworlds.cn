<script lang="ts">
	/**
	 * 实时完成记录:固定屏幕右侧的可收起侧边栏。
	 *
	 * - 默认收起,只露出竖排的「实时完成记录」小标签,点击拉出;
	 * - 拉出来才开始轮询,收起就停(不浪费请求);
	 * - /ddnet 首页不传 region 时显示「国服/全球」切换;排位页把当前筛选传进来。
	 */
	import { onMount } from 'svelte';
	import {
		faChevronLeft,
		faClock,
		faMap,
		faUser,
		faXmark
	} from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';
	import PlayerLink from '$lib/components/ddnet/PlayerLink.svelte';
	import MapLink from '$lib/components/ddnet/MapLink.svelte';
	import FlagSpan from '$lib/components/FlagSpan.svelte';
	import { secondsToDate } from '$lib/date';
	import { KNOWN_REGIONS, MAP_TYPE_SERVERS } from '$lib/ddnet/helpers';
	import { secondsToChineseTime, secondsToTime } from '$lib/helpers';
	import { tippy } from '$lib/tippy';
	import { scale } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { quartIn } from 'svelte/easing';

	interface LatestRecord {
		timestamp: number;
		map: string;
		name: string;
		time: number;
		server: string;
		key: string;
		/** 首次加载进来的这批,不播弹出动画 */
		initial?: boolean;
	}

	let {
		region = undefined,
		type = null
	}: {
		/** 国家码(如 CHN);null = 全球。不传则显示「国服/全球」切换(/ddnet 首页) */
		region?: string | null;
		/** 地图类型 slug(如 novice);null = 全部类型 */
		type?: string | null;
	} = $props();

	const hasToggle = $derived(region === undefined);
	const TOGGLE_STORAGE_KEY = 'ddnet:latest:region';
	// 竖排标签逐字排,不依赖 writing-mode(某些环境字体没有竖排度量)
	const TAB_LABEL = ['实', '时', '完', '成', '记', '录'];
	/** 只有在这段时间内完成的记录才算「实时新记录」,才播弹出动画 */
	const FRESH_WINDOW_MS = 10_000;
	let toggleRegion = $state<'CHN' | 'GLOBAL'>('CHN');

	let open = $state(false);

	let records = $state<LatestRecord[]>([]);
	let loading = $state(true);
	let timer: number | null = null;
	let generation = 0;
	let running = false;

	const sourceRegion = $derived(
		hasToggle ? (toggleRegion == 'CHN' ? 'chn' : null) : region ? region.toLowerCase() : null
	);
	const sourceType = $derived(type ? type.toLowerCase() : null);
	const mapRegion = $derived(sourceRegion ? sourceRegion.toUpperCase() : 'GLOBAL');

	const scopeName = $derived(
		hasToggle
			? toggleRegion == 'CHN'
				? '中国服'
				: '全球'
			: [
					sourceRegion ? KNOWN_REGIONS[sourceRegion.toUpperCase()] : null,
					sourceType ? MAP_TYPE_SERVERS[sourceType.toUpperCase()] : null
				]
					.filter(Boolean)
					.join(' · ') || '全球'
	);

	const apiUrl = () => {
		const params = new URLSearchParams();
		if (sourceRegion) params.set('region', sourceRegion);
		if (sourceType) params.set('type', sourceType);
		const query = params.toString();
		return `/api/latest${query ? `?${query}` : ''}`;
	};

	const stop = () => {
		running = false;
		generation++;
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	};

	async function fetchLatestRecords(gen: number) {
		if (!running || gen !== generation) return;

		// 页面在后台时不请求,过几秒再看
		if (document.hidden) {
			timer = window.setTimeout(() => fetchLatestRecords(gen), 5000);
			return;
		}

		let wait = 5000;

		try {
			const response = await fetch(apiUrl());
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const latest = (await response.json()) as LatestRecord[];
			if (gen !== generation) return;

			const fetchedAt = Date.now();
			const added: LatestRecord[] = [];
			for (const record of latest) {
				record.key = `${record.timestamp}-${record.map}-${record.name}-${record.time}`;
				if (records.some((r) => r.key === record.key)) continue;
				// 不是最近刚完成的(比如首次打开时那一批历史记录)就不播动画
				record.initial = fetchedAt - record.timestamp * 1000 > FRESH_WINDOW_MS;
				added.push(record);
			}

			if (loading) {
				added.sort((a, b) => b.timestamp - a.timestamp);
				records = added.slice(0, 50);
				loading = false;
			} else if (added.length > 0) {
				const stale = added.filter((r) => r.initial).sort((a, b) => a.timestamp - b.timestamp);
				const fresh = added.filter((r) => !r.initial).sort((a, b) => a.timestamp - b.timestamp);

				// 老记录直接安静地插进去
				for (const record of stale) records.unshift(record);
				records.splice(50);

				if (fresh.length > 0) {
					const delta = wait / fresh.length;
					for (const record of fresh) {
						if (gen !== generation) return;
						records.unshift(record);
						records.splice(50);
						await new Promise((resolve) => setTimeout(resolve, delta));
					}
					wait = 0;
				}
			}
		} catch (error) {
			console.error(error);
		} finally {
			if (gen === generation) loading = false;
		}

		if (running && gen === generation) {
			timer = window.setTimeout(() => fetchLatestRecords(gen), wait);
		}
	}

	const start = () => {
		stop();
		records = [];
		loading = true;
		running = true;
		const gen = generation;
		void fetchLatestRecords(gen);
	};

	// 拉出来才更新;收起 / 换筛选都停掉旧轮询
	$effect(() => {
		// 显式读依赖:展开状态 + 当前筛选
		open;
		sourceRegion;
		sourceType;
		if (!open) {
			stop();
			return;
		}
		start();
		return () => stop();
	});

	// Esc 收起
	$effect(() => {
		if (!open) return;
		const onKeyDown = (ev: KeyboardEvent) => {
			if (ev.key == 'Escape') open = false;
		};
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	});

	onMount(() => {
		if (!hasToggle) return;
		try {
			const stored = window.localStorage.getItem(TOGGLE_STORAGE_KEY);
			if (stored === 'CHN' || stored === 'GLOBAL') toggleRegion = stored;
		} catch {
			// 隐私模式 / 禁用存储时忽略
		}
	});

	/** 只有最近一次刷新周期里新出现的记录才播弹出动画 */
	const popIn = (node: Element, animate: boolean) =>
		animate ? scale(node, { start: 0.8, duration: 300, easing: quartIn }) : { duration: 0 };

	const switchRegion = (next: 'CHN' | 'GLOBAL') => {
		if (next == toggleRegion) return;
		toggleRegion = next;
		try {
			window.localStorage.setItem(TOGGLE_STORAGE_KEY, next);
		} catch {
			// 隐私模式 / 禁用存储时忽略
		}
	};
</script>

{#if !open}
	<!-- 用 100svh 的固定容器居中:手机地址栏/键盘变化时不会跟着跳 -->
	<div class="pointer-events-none fixed top-0 right-0 z-40 flex h-[100svh] items-center">
		<button
			type="button"
			class="pointer-events-auto flex cursor-pointer flex-col items-center gap-2 rounded-l-lg border border-r-0 border-slate-600 bg-slate-700/90 py-2 pr-0.5 pl-1 text-slate-300 shadow-lg backdrop-blur transition-colors hover:bg-slate-600 active:bg-slate-700"
			onclick={() => (open = true)}
			title="实时完成记录"
			aria-label="打开实时完成记录"
			aria-expanded="false"
			aria-controls="latest-records-drawer"
		>
			<Fa icon={faChevronLeft} class="text-[10px]" />
			<span class="flex flex-col items-center gap-0.5 text-xs leading-none font-semibold">
				{#each TAB_LABEL as char}
					<span>{char}</span>
				{/each}
			</span>
		</button>
	</div>
{/if}

<div
	id="latest-records-drawer"
	class="fixed inset-y-0 right-0 z-40 flex w-[min(92vw,20rem)] flex-col border-l border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur transition-transform duration-300 ease-out {open
		? 'translate-x-0'
		: 'pointer-events-none translate-x-full'}"
	aria-hidden={!open}
	inert={!open}
>
	<div class="border-b border-slate-700 px-3 py-2">
		<div class="flex items-center gap-2">
			<h2 class="flex items-center gap-2 text-sm font-bold text-white">
				<Fa icon={faClock} />
				实时完成记录
			</h2>
			<button
				type="button"
				class="ml-auto flex h-6 w-6 cursor-pointer items-center justify-center rounded bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 hover:text-white"
				onclick={() => (open = false)}
				aria-label="收起实时完成记录"
				title="收起"
			>
				<Fa icon={faXmark} />
			</button>
		</div>
		<div class="mt-1 flex items-center gap-2">
			{#if hasToggle}
				<div class="flex rounded-md bg-slate-800 p-0.5 text-xs font-semibold">
					<button
						class="cursor-pointer rounded px-2 py-1 transition-colors {toggleRegion == 'CHN'
							? 'bg-slate-600 text-white'
							: 'text-slate-400 hover:text-slate-200'}"
						aria-pressed={toggleRegion == 'CHN'}
						title="只看国服完成的记录"
						onclick={() => switchRegion('CHN')}
					>
						国服
					</button>
					<button
						class="cursor-pointer rounded px-2 py-1 transition-colors {toggleRegion == 'GLOBAL'
							? 'bg-slate-600 text-white'
							: 'text-slate-400 hover:text-slate-200'}"
						aria-pressed={toggleRegion == 'GLOBAL'}
						title="看全世界所有服完成的记录"
						onclick={() => switchRegion('GLOBAL')}
					>
						全球
					</button>
				</div>
			{:else}
				<span class="truncate text-xs text-slate-400">{scopeName}</span>
			{/if}
		</div>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto p-2">
		{#if loading}
			<div class="py-8 text-center text-slate-400">
				<div
					class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-current border-t-transparent"
				></div>
				<p class="mt-2">加载中...</p>
			</div>
		{:else if records.length == 0}
			<div class="py-8 text-center text-slate-400">暂无记录</div>
		{:else}
			<div class="space-y-1 text-sm">
				{#each records as record (record.key)}
					<div
						in:popIn={!record.initial}
						animate:flip={{ duration: 300 }}
						class="w-full rounded-lg border border-slate-600 bg-slate-800 px-2 py-1"
					>
						<div>
							<Fa icon={faUser} class="inline-block w-7" />
							<PlayerLink player={record.name} className="text-nowrap">{record.name}</PlayerLink>
						</div>
						<div>
							<Fa icon={faMap} class="inline-block w-7" />
							<MapLink map={record.map} region={mapRegion} className="text-nowrap font-semibold"
								>{record.map}</MapLink
							>
						</div>
						<div>
							<FlagSpan flag={record.server} class="inline-block w-7" />
							<span
								use:tippy={{
									content: `于 ${secondsToDate(record.timestamp)} 用时 ${secondsToChineseTime(
										record.time
									)} 完成`,
									maxWidth: '100svw'
								}}
								class="inline-block text-left text-nowrap">{secondsToTime(record.time)}</span
							>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
