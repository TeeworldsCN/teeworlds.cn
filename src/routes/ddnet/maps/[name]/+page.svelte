<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import Mappers from '$lib/components/ddnet/Mappers.svelte';
	import PlayerLink from '$lib/components/ddnet/PlayerLink.svelte';
	import FlagSpan from '$lib/components/FlagSpan.svelte';
	import { secondsToDate } from '$lib/date';
	import { mapType, numberToStars, secondsToChineseTime, secondsToTime } from '$lib/ddnet/helpers';
	import { share } from '$lib/share';

	const { data } = $props();

	afterNavigate(() => {
		share({
			icon: new URL(data.map.icon, window.location.href).href,
			link: window.location.href,
			title: `${data.map.name}`,
			desc: `${mapType(data.map.type)} ${numberToStars(data.map.difficulty)} (${data.map.points}pt) 作者：${data.map.mapper} 均时：${secondsToTime(data.map.median_time)}`
		});
	});
</script>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页' },
		{ href: '/ddnet', text: 'DDNet' },
		{ href: '/ddnet/maps', text: '地图' },
		{ text: data.map.name }
	]}
/>

<div class="mb-4">
	<div class="text-2xl font-bold">{data.map.name}</div>
	<div class="text-md font-bold"><span>作者：</span><Mappers authors={data.map.mapper} /></div>
</div>
<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
	<div class="rounded-lg bg-slate-700 p-4 shadow-md">
		<h2 class="mb-3 text-xl font-bold">地图信息</h2>
		<img
			width="360"
			height="225"
			class="mb-4 rounded"
			src={data.map.thumbnail}
			alt="{data.map.name} thumbnail"
		/>
		<p title={data.map.type}>类型：{mapType(data.map.type)}</p>
		<p>分数：{data.map.points}</p>
		<p>难度：{numberToStars(data.map.difficulty)}</p>
		<button
			class="mt-2 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
			onclick={() =>
				(window.location.href = `https://teeworlds.cn/ddnet/mappreview/?url=map/${encodeURIComponent(data.map.name)}.map`)}
			>查看地图</button
		>
	</div>
	<div class="rounded-lg bg-slate-700 p-4 shadow-md">
		<h2 class="mb-3 text-xl font-bold">地图数据</h2>
		<p>
			发布日期：{data.map.release ? secondsToDate(data.map.release) : '远古'}
		</p>
		{#if data.map.median_time}
			<p title={`${data.map.median_time.toFixed(2.0)}秒`}>
				平均时间：{secondsToTime(data.map.median_time)}
			</p>
		{/if}
		{#if data.map.median_time}
			<p>完成总次数：{data.map.finishes}</p>
		{/if}
		{#if data.map.median_time}
			<p>完成玩家数：{data.map.finishers}</p>
		{/if}
		{#if data.map.biggest_team}
			<p>最大团队：{data.map.biggest_team} 人</p>
		{/if}
	</div>
</div>

<div
	class="grid grid-cols-1 gap-4 md:grid-cols-2 {data.map.team_ranks.length ? 'xl:grid-cols-3' : ''}"
>
	{#if data.map.team_ranks.length}
		<div class="mt-4 rounded-lg bg-slate-700 p-4 shadow-md">
			<h2 class="text-xl font-bold">团队排名</h2>
			<ul class="mt-2">
				{#each data.map.team_ranks as rank}
					<li>
						<span class="inline-block w-8 text-right">{rank.rank}.</span>
						<span
							title="于 {secondsToDate(rank.timestamp)} 用时 {secondsToChineseTime(rank.time)} 完成"
							class="inline-block w-20 text-right">{secondsToTime(rank.time)}</span
						>
						<FlagSpan flag={rank.country} />
						<span>
							{#each rank.players as player, i}
								<PlayerLink {player} className="font-semibold">{player}</PlayerLink
								>{#if i == rank.players.length - 2}{' & '}{:else if i < rank.players.length - 2}{', '}{/if}
							{/each}
						</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="mt-4 rounded-lg bg-slate-700 p-4 shadow-md">
		<h2 class="text-xl font-bold">个人排名</h2>
		<ul class="mt-2">
			{#each data.map.ranks as rank}
				<li>
					<span class="inline-block w-8 text-right">{rank.rank}.</span>
					<span
						title="于 {secondsToDate(rank.timestamp)} 用时 {secondsToChineseTime(rank.time)} 完成"
						class="inline-block w-20 text-right">{secondsToTime(rank.time)}</span
					>
					<FlagSpan flag={rank.country} />
					<span
						><PlayerLink player={rank.player} className="font-semibold">{rank.player}</PlayerLink
						></span
					>
				</li>
			{/each}
		</ul>
	</div>

	<div class="mt-4 rounded-lg bg-slate-700 p-4 shadow-md">
		<h2 class="text-xl font-bold">完成次数</h2>
		<ul class="mt-2">
			{#each data.map.max_finishes as finishes}
				<li>
					<span class="inline-block w-8 text-right">{finishes.rank}.</span>
					<span
						title="首次完成：{secondsToDate(finishes.min_timestamp)}，最后完成：{secondsToDate(
							finishes.max_timestamp
						)}，最快用时：{secondsToChineseTime(finishes.time)}"
						class="inline-block w-20 text-right">{finishes.num} 次</span
					>
					<span class="ml-3"
						><PlayerLink player={finishes.player} className="font-semibold"
							>{finishes.player}</PlayerLink
						></span
					>
				</li>
			{/each}
		</ul>
	</div>
</div>
