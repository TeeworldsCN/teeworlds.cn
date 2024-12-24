<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import MapLink from '$lib/components/ddnet/MapLink.svelte';
	import PlayerLink from '$lib/components/ddnet/PlayerLink.svelte';
	import FlagSpan from '$lib/components/FlagSpan.svelte';
	import { secondsToDate } from '$lib/date';
	import { mapType, secondsToTime } from '$lib/ddnet/helpers';
	import { share } from '$lib/share';

	let { data } = $props();

	afterNavigate(() => {
		share({
			icon: `${window.location.origin}/shareicon.png`,
			link: window.location.href,
			title: data.player.player,
			desc: `玩家信息：${data.player.points.points}pts`
		});
	});
</script>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ href: '/ddnet', text: 'DDNet' },
		{ href: '/ddnet/players', text: '排名', title: 'DDNet 排名' },
		{ text: data.player.player, title: data.player.player }
	]}
/>

<div class="mb-4">
	<div class="text-2xl font-bold">{data.player.player}</div>
	<div class="text-md font-bold">
		<span>最近活跃：{secondsToDate(data.last_finish.timestamp)}</span>
	</div>
</div>
<div class="grid grid-cols-1 gap-4 md:grid-cols-1">
	<div class="rounded-lg bg-slate-700 p-4 shadow-md">
		<h2 class="mb-3 text-xl font-bold">
			玩家信息 <FlagSpan
				flag={data.player.favorite_server.server}
				title="常玩地区：{data.player.favorite_server.server}"
			/>
		</h2>

		<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
			{#each data.ranks as rank}
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

		<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
			<div class="mt-2 rounded-lg bg-slate-600 px-3 py-1 shadow-md sm:py-3">
				<h3 class="mb-1 text-base font-bold">🏁 最近完成</h3>
				{#each data.player.last_finishes as finish}
					<p class="text-md">
						<span class="text-sm">{secondsToDate(finish.timestamp)}</span>
						<FlagSpan flag={finish.country} />
						<MapLink map={finish.map} className="font-semibold"
							>[{mapType(finish.type)}] {finish.map}</MapLink
						> - {secondsToTime(finish.time)}
					</p>
				{/each}
			</div>

			<div class="mt-2 rounded-lg bg-slate-600 px-3 py-1 shadow-md sm:py-3">
				<h3 class="mb-1 text-base font-bold">👍 常玩队友</h3>
				{#each data.player.favorite_partners as partner}
					<p class="text-md">
						<PlayerLink player={partner.name} className="font-semibold">{partner.name}</PlayerLink> -
						组队 {partner.finishes} 次
					</p>
				{/each}
			</div>
		</div>
	</div>
	<div class="rounded-lg bg-slate-700 p-4 shadow-md">
		<h2 class="mb-3 text-xl font-bold">玩家数据</h2>
		<div class="grid grid-cols-1 md:grid-cols-2 md:gap-2">
			{#each data.statsCols as col, i}
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
