<script lang="ts">
	import { onMount } from 'svelte';
	import { faClock, faMap, faUser } from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';
	import PlayerLink from '$lib/components/ddnet/PlayerLink.svelte';
	import { secondsToDate } from '$lib/date';
	import { secondsToChineseTime, secondsToTime } from '$lib/helpers';
	import { tippy } from '$lib/tippy';
	import MapLink from './ddnet/MapLink.svelte';
	import FlagSpan from './FlagSpan.svelte';
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
	}

	type Region = 'CHN' | 'GLOBAL';

	const REGION_STORAGE_KEY = 'ddnet:latest:region';

	const REGION_OPTIONS: { key: Region; text: string; title: string }[] = [
		{ key: 'CHN', text: '国服', title: '只看国服完成的记录' },
		{ key: 'GLOBAL', text: '全球', title: '看全世界所有服完成的记录' }
	];

	const latestUrl = (region: Region) =>
		region === 'GLOBAL' ? '/api/latest' : `/api/latest?region=${region.toLowerCase()}`;

	// 默认只看国服，和 ddnet.org/ranks/chn/ 的 Latest Finishes 一致
	let region = $state<Region>('CHN');
	let latestRecords: LatestRecord[] = $state([]);
	let isLoading = $state(true);
	let isRunning = true;
	let fetchTimeout: number | null = null;
	// 每次切换区域加一，用来丢弃切换前发出去的请求（否则全球的记录会混进国服的列表）
	let generation = 0;

	async function fetchLatestRecords(gen = generation) {
		if (!isRunning || gen !== generation) return;

		// Skip fetching if the window is not visible
		if (document.hidden) {
			// Schedule next fetch attempt after checking visibility
			fetchTimeout = window.setTimeout(() => fetchLatestRecords(gen), 5000);
			return;
		}

		let timeout = 5000;

		try {
			const response = await fetch(latestUrl(region));
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const latest = (await response.json()) as LatestRecord[];
			if (gen !== generation) return;

			const newRecords = [];

			for (const record of latest) {
				record.key = `${record.timestamp}-${record.map}-${record.name}-${record.time}`;
				if (latestRecords.some((r) => r.key === record.key)) continue;
				newRecords.push(record);
			}

			newRecords.sort((a, b) => a.timestamp - b.timestamp);

			if (isLoading) {
				latestRecords.push(...newRecords.splice(0, Math.max(0, newRecords.length - 3)));
				isLoading = false;
			}

			if (newRecords.length > 0) {
				const delta = timeout / newRecords.length;
				for (const record of newRecords) {
					if (gen !== generation) return;
					latestRecords.unshift(record);
					latestRecords.splice(50);
					await new Promise((resolve) => setTimeout(resolve, delta));
				}
				timeout = 0;
			}
		} catch (err) {
			console.error(err);
		} finally {
			if (gen === generation) isLoading = false;
		}

		// Schedule next fetch after current one completes
		if (isRunning && gen === generation) {
			fetchTimeout = window.setTimeout(() => fetchLatestRecords(gen), timeout);
		}
	}

	function switchRegion(next: Region) {
		if (next === region) return;

		region = next;
		generation++;

		try {
			window.localStorage.setItem(REGION_STORAGE_KEY, next);
		} catch {
			// 隐私模式 / 禁用存储时忽略
		}

		if (fetchTimeout !== null) {
			clearTimeout(fetchTimeout);
			fetchTimeout = null;
		}

		// 清空旧列表，重新从「加载中」开始，避免两个区域的记录拼在一起
		latestRecords = [];
		isLoading = true;

		fetchLatestRecords();
	}

	onMount(() => {
		try {
			const stored = window.localStorage.getItem(REGION_STORAGE_KEY);
			if (stored === 'CHN' || stored === 'GLOBAL') region = stored;
		} catch {
			// 隐私模式 / 禁用存储时忽略
		}

		fetchLatestRecords();

		return () => {
			isRunning = false;
			if (fetchTimeout !== null) {
				clearTimeout(fetchTimeout);
			}
		};
	});
</script>

<div class="w-full overflow-hidden rounded-lg bg-slate-700 shadow-lg">
	<div class="flex items-center justify-between gap-2 bg-slate-900 bg-linear-to-r px-4 py-3">
		<h2 class="flex items-center gap-2 text-lg font-bold text-white">
			<Fa icon={faClock} />
			最近完成
		</h2>
		<div class="flex shrink-0 rounded-md bg-slate-800 p-0.5 text-xs font-semibold">
			{#each REGION_OPTIONS as option (option.key)}
				<button
					class="cursor-pointer rounded px-2 py-1 transition-colors {region === option.key
						? 'bg-slate-600 text-white'
						: 'text-slate-400 hover:text-slate-200'}"
					aria-pressed={region === option.key}
					title={option.title}
					onclick={() => switchRegion(option.key)}
				>
					{option.text}
				</button>
			{/each}
		</div>
	</div>

	<div class="overflow-y-auto p-2 sm:max-h-[calc(100svh-9rem)]">
		{#if isLoading}
			<div class="py-8 text-center text-slate-400">
				<div
					class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-current border-t-transparent"
				></div>
				<p class="mt-2">加载中...</p>
			</div>
		{:else if latestRecords.length == 0}
			<div class="py-8 text-center text-slate-400">暂无记录</div>
		{:else}
			<div class="space-y-1 text-sm">
				{#each latestRecords as record, index (record.key)}
					<div
						in:scale={{ start: 0.8, duration: 300, easing: quartIn }}
						animate:flip={{ duration: 300 }}
						class="w-full rounded-lg border border-slate-600 bg-slate-800 px-2"
					>
						<div>
							<Fa icon={faUser} class="inline-block w-7" />
							<PlayerLink player={record.name} className="text-nowrap">{record.name}</PlayerLink>
						</div>
						<div>
							<Fa icon={faMap} class="inline-block w-7" />
							<MapLink map={record.map} {region} className="text-nowrap font-semibold"
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
