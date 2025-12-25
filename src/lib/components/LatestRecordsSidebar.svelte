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

	let latestRecords: LatestRecord[] = $state([]);
	let isLoading = $state(true);
	let error: string | null = $state(null);
	let fetchTimeout: number | null = $state(null);
	let isRunning = true;

	async function fetchLatestRecords() {
		// Skip fetching if the window is not visible
		if (document.hidden) {
			// Schedule next fetch attempt after checking visibility
			if (isRunning) {
				fetchTimeout = window.setTimeout(fetchLatestRecords, 5000);
			}
			return;
		}

		let timeout = 5000;

		try {
			const response = await fetch('/api/latest');
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const latest = (await response.json()) as LatestRecord[];
			const newRecords = [];

			for (const record of latest) {
				record.key = `${record.timestamp}-${record.map}-${record.name}-${record.time}`;
				if (latestRecords.some((r) => r.key === record.key)) continue;
				newRecords.push(record);
			}

			newRecords.sort((a, b) => a.timestamp - b.timestamp);

			if (newRecords.length > 0) {
				const delta = timeout / newRecords.length;
				for (const record of newRecords) {
					latestRecords.unshift(record);
					latestRecords.splice(50);
					await new Promise((resolve) => setTimeout(resolve, delta));
				}
				timeout = 0;
			}
			error = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to fetch latest records';
		} finally {
			isLoading = false;
		}

		// Schedule next fetch after current one completes
		if (isRunning) {
			fetchTimeout = window.setTimeout(fetchLatestRecords, timeout);
		}
	}

	onMount(() => {
		fetchLatestRecords();

		return () => {
			if (fetchTimeout !== null) {
				console.log('Clearing timeout');
				clearTimeout(fetchTimeout);
			}
			isRunning = false;
		};
	});
</script>

<div class="w-full overflow-hidden rounded-lg bg-slate-700 shadow-lg">
	<div class="bg-slate-900 bg-linear-to-r px-4 py-3">
		<h2 class="flex items-center gap-2 text-lg font-bold text-white">
			<Fa icon={faClock} />
			最近完成
		</h2>
	</div>

	<div class="overflow-y-auto p-2 sm:max-h-[calc(100svh-9rem)]">
		{#if isLoading}
			<div class="py-8 text-center text-slate-400">
				<div
					class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-current border-t-transparent"
				></div>
				<p class="mt-2">加载中...</p>
			</div>
		{:else if error}
			<div class="py-8 text-center text-red-400">
				<p>加载失败: {error}</p>
			</div>
		{:else if latestRecords.length === 0}
			<div class="py-8 text-center text-slate-400">
				<p>暂无纪录</p>
			</div>
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
							<MapLink map={record.map} className="text-nowrap font-semibold">{record.map}</MapLink>
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
