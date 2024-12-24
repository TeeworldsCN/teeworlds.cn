<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import Mappers from '$lib/components/ddnet/Mappers.svelte';
	import FlagSpan from '$lib/components/FlagSpan.svelte';
	import { secondsToDate } from '$lib/date';
	import { mapType, numberToStars, secondsToChineseTime, secondsToTime } from '$lib/ddnet/helpers';
	import { share } from '$lib/share';

	import type { PageData } from './$types';

	const map = (page.data as PageData).map;

	afterNavigate(() => {
		share({
			icon: new URL(map.icon, window.location.href).href,
			link: window.location.href,
			title: `${map.name}`,
			desc: `${mapType(map.type)} ${numberToStars(map.difficulty)} (${map.points}pt) 作者：${map.mapper} 均时：${secondsToTime(map.median_time)}`
		});
	});
</script>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页' },
		{ href: '/ddnet', text: 'DDNet' },
		{ href: '/ddnet/maps', text: '地图' },
		{ text: map.name }
	]}
/>

<div class="mb-4">
	<div class="text-2xl font-bold">{map.name}</div>
	<div class="text-md font-bold"><span>作者：</span><Mappers authors={map.mapper} /></div>
</div>
<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
	<div class="rounded-lg bg-slate-700 p-4 shadow-md">
		<h2 class="mb-3 text-xl font-bold">地图信息</h2>
		<img
			width="360"
			height="225"
			class="mb-4 rounded"
			src={map.thumbnail}
			alt="{map.name} thumbnail"
		/>
		<p title={map.type}>类型：{mapType(map.type)}</p>
		<p>分数：{map.points}</p>
		<p>难度：{numberToStars(map.difficulty)}</p>
		<button
			class="mt-2 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
			onclick={() =>
				(window.location.href = `https://teeworlds.cn/ddnet/mappreview/?url=map/${encodeURIComponent(map.name)}.map`)}
			>查看地图</button
		>
	</div>
	<div class="rounded-lg bg-slate-700 p-4 shadow-md">
		<h2 class="mb-3 text-xl font-bold">地图数据</h2>
		<p>
			发布日期：{map.release ? secondsToDate(map.release) : '远古'}
		</p>
		{#if map.median_time}
			<p title={`${map.median_time.toFixed(2.0)}秒`}>
				平均时间：{secondsToTime(map.median_time)}
			</p>
		{/if}
		{#if map.median_time}
			<p>完成总次数：{map.finishes}</p>
		{/if}
		{#if map.median_time}
			<p>完成玩家数：{map.finishers}</p>
		{/if}
		{#if map.biggest_team}
			<p>最大团队：{map.biggest_team} 人</p>
		{/if}
	</div>
</div>

<div class="grid grid-cols-1 gap-4 md:grid-cols-2 {map.team_ranks.length ? 'xl:grid-cols-3' : ''}">
	{#if map.team_ranks.length}
		<div class="mt-4 rounded-lg bg-slate-700 p-4 shadow-md">
			<h2 class="text-xl font-bold">团队排名</h2>
			<ul class="mt-2">
				{#each map.team_ranks as rank}
					<li>
						<span class="inline-block w-8 text-right">{rank.rank}.</span>
						<span
							title="于 {secondsToDate(rank.timestamp)} 用时 {secondsToChineseTime(rank.time)} 完成"
							class="inline-block w-20 text-right">{secondsToTime(rank.time)}</span
						>
						<FlagSpan flag={rank.country} />
						<span>{rank.players.join(', ')}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="mt-4 rounded-lg bg-slate-700 p-4 shadow-md">
		<h2 class="text-xl font-bold">个人排名</h2>
		<ul class="mt-2">
			{#each map.ranks as rank}
				<li>
					<span class="inline-block w-8 text-right">{rank.rank}.</span>
					<span
						title="于 {secondsToDate(rank.timestamp)} 用时 {secondsToChineseTime(rank.time)} 完成"
						class="inline-block w-20 text-right">{secondsToTime(rank.time)}</span
					>
					<FlagSpan flag={rank.country} />
					<span>{rank.player}</span>
				</li>
			{/each}
		</ul>
	</div>

	<div class="mt-4 rounded-lg bg-slate-700 p-4 shadow-md">
		<h2 class="text-xl font-bold">完成次数</h2>
		<ul class="mt-2">
			{#each map.max_finishes as finishes}
				<li>
					<span class="inline-block w-8 text-right">{finishes.rank}.</span>
					<span
						title="首次完成：{secondsToDate(finishes.min_timestamp)}，最后完成：{secondsToDate(
							finishes.max_timestamp
						)}，最快用时：{secondsToChineseTime(finishes.time)}"
						class="inline-block w-20 text-right">{finishes.num} 次</span
					>
					<span class="ml-3">{finishes.player}</span>
				</li>
			{/each}
		</ul>
	</div>
</div>
