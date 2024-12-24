<script lang="ts">
	import { page } from '$app/state';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import MapLink from '$lib/components/ddnet/MapLink.svelte';
	import FlagSpan from '$lib/components/FlagSpan.svelte';
	import { secondsToDate } from '$lib/date';
	import { mapType, secondsToTime } from '$lib/ddnet/helpers';
	import type { PageData } from './$types';

	const player = (page.data as PageData).player;
	const last_finish = player.last_finishes[0] || {
		timestamp: 0,
		map: '',
		time: 0,
		country: '',
		type: ''
	};

	const types = Object.keys(player.types);
	types.unshift('total');

	const total = {
		type: 'total',
		rank: player.points.rank,
		points: 0,
		total_points: 0,
		finishes: 0,
		total_map: 0
	};

	const stats = types.map((type) => {
		if (type == 'total') return total;
		const data = player.types[type];
		const result = {
			type,
			rank: data.points.rank,
			points: data.points.points || 0,
			total_points: data.points.total,
			finishes: Object.entries(data.maps).filter(([_, map]) => map.finishes).length,
			total_map: Object.keys(data.maps).length
		};

		total.points += result.points;
		total.total_points += result.total_points;
		total.finishes += result.finishes;
		total.total_map += result.total_map;
		return result;
	});

	const statsCols = [
		stats.slice(0, Math.ceil(stats.length / 2)),
		stats.slice(Math.ceil(stats.length / 2))
	];

	const ranks = [
		{ name: '🌎 总通过分', rank: player.points },
		{ name: '👥 团队排位分', rank: player.team_rank },
		{ name: '👤 个人排位分', rank: player.rank },
		{ name: '📅 获得通过分 (近365天)', rank: player.points_last_year },
		{ name: '📅 获得通过分 (近30天)', rank: player.points_last_month },
		{ name: '📅 获得通过分 (近7天)', rank: player.points_last_week }
	];
</script>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页' },
		{ href: '/ddnet', text: 'DDNet' },
		{ href: '/ddnet/players', text: '排名' },
		{ text: player.player }
	]}
/>

<div class="mb-4">
	<div class="text-2xl font-bold">{player.player}</div>
	<div class="text-md font-bold">
		<span>最近活跃：{secondsToDate(last_finish.timestamp)}</span>
	</div>
</div>
<div class="grid grid-cols-1 gap-4 md:grid-cols-1">
	<div class="rounded-lg bg-slate-700 p-4 shadow-md">
		<h2 class="mb-3 text-xl font-bold">
			玩家信息 <FlagSpan
				flag={player.favorite_server.server}
				title="常玩地区：{player.favorite_server.server}"
			/>
		</h2>

		<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
			{#each ranks as rank}
				<div
					class="rounded-lg bg-slate-600 px-3 py-1 shadow-md sm:py-3 {rank.rank.rank
						? ''
						: 'opacity-50'}"
				>
					<h3 class="mb-1 text-base font-bold">{rank.name}</h3>
					{#if rank.rank.rank}
						<p class="text-md">
							<span class="text-sm">No.</span>{rank.rank.rank} - {rank.rank.points}pts
						</p>
					{:else}
						<p class="text-md">未获得</p>
					{/if}
				</div>
			{/each}
		</div>

		<div class="mt-2 rounded-lg bg-slate-600 px-3 py-1 shadow-md sm:py-3">
			<h3 class="mb-1 text-base font-bold">最近记录</h3>
			{#each player.last_finishes as finish}
				<p class="text-md">
					<span class="text-sm">{secondsToDate(finish.timestamp)}</span>
					<MapLink map={finish.map} className="font-bold"
						>[{mapType(finish.type)}] {finish.map}</MapLink
					> - {secondsToTime(finish.time)}
				</p>
			{/each}
		</div>
	</div>
	<div class="rounded-lg bg-slate-700 p-4 shadow-md">
		<h2 class="mb-3 text-xl font-bold">玩家数据</h2>
		<div class="grid grid-cols-1 md:grid-cols-2 md:gap-2">
			{#each statsCols as col, i}
				<div>
					<div
						class="{i != 0 ? 'hidden md:grid' : ''} grid grid-cols-2 gap-2 text-center font-bold"
					>
						<div class="overflow-hidden text-center">分数</div>
						<div class="overflow-hidden text-center">完成度</div>
					</div>
					{#each col as stat}
						<div class="mt-1 rounded-lg bg-slate-600 px-1 py-0 md:mt-2 md:px-2 md:py-1">
							<div class="grid grid-cols-2 gap-2 px-2 text-sm md:text-base">
								<div class="overflow-hidden text-left">
									{stat.type == 'total' ? '总计' : mapType(stat.type)}
								</div>
								<div class="overflow-hidden text-right">
									{#if stat.rank}<span class="text-xs">NO.</span>{stat.rank}{/if}
								</div>
							</div>

							<div class="grid grid-cols-2 pb-1">
								<div
									class="h-full overflow-hidden rounded-l border-r-2 border-emerald-800 bg-emerald-900"
								>
									{#if stat.total_points}
										<p class="z-10 float-right mr-2 text-xs text-emerald-200 md:text-base">
											{Math.round((stat.points / stat.total_points) * 100)}%
										</p>
										<p
											class="z-10 float-left ml-2 mt-0 text-right text-xs text-emerald-200 md:mt-1"
										>
											{#if stat.total_points}{stat.points}/{stat.total_points}{/if}
										</p>
										<div
											class="h-full {stat.points == stat.total_points
												? 'rounded-l'
												: 'rounded'} bg-emerald-600"
											style="width: {(stat.points / stat.total_points) * 100}%;"
										></div>
									{:else}
										<p class="z-10 float-right mr-2 text-xs text-emerald-200 md:text-base"></p>
										<p
											class="z-10 float-left ml-2 mt-0 text-right text-xs text-emerald-200 md:mt-1"
										></p>
										<div
											class="h-full {stat.finishes == stat.total_map
												? 'rounded-l'
												: 'rounded'} bg-emerald-600"
											style="width: {(stat.finishes / stat.total_map) * 100}%;"
										></div>
									{/if}
								</div>
								<div
									class="h-full border-collapse rounded-r border-l-2 border-teal-800 bg-teal-900"
								>
									<p class="z-10 float-left ml-2 text-right text-xs text-teal-200 md:text-base">
										{Math.round((stat.finishes / stat.total_map) * 100)}%
									</p>
									<p class="z-10 float-right mr-2 mt-0 text-left text-xs text-teal-200 md:mt-1">
										{stat.finishes}/{stat.total_map}
									</p>
									<div
										class="h-full {stat.finishes == stat.total_map
											? 'rounded-r'
											: 'rounded'} bg-teal-600"
										style="margin-left: auto; width: {(stat.finishes / stat.total_map) * 100}%"
									></div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/each}
		</div>
	</div>
</div>
