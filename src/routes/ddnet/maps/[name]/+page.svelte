<script>
	import { page } from '$app/state';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import FlagSpan from '$lib/components/FlagSpan.svelte';
	import { numberToStars, secondsToChineseTime, secondsToTime } from '$lib/ddnet/helpers';
</script>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页' },
		{ href: '/ddnet', text: 'DDNet' },
		{ href: '/ddnet/maps', text: '地图' },
		{ text: page.data.name }
	]}
/>

<div class="mb-4">
	<div class="text-2xl font-bold">{page.data.name}</div>
	<div class="text-md font-bold">作者：{page.data.mapper}</div>
</div>
<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
	<div class="rounded-lg bg-slate-700 p-4 shadow-md">
		<h2 class="mb-3 text-xl font-bold">地图信息</h2>
		<img
			width="360"
			height="225"
			class="mb-4 rounded"
			src={page.data.thumbnail}
			alt="{page.data.name} thumbnail"
		/>
		<p>类型：{page.data.type}</p>
		<p>分数：{page.data.points}</p>
		<p>难度：{numberToStars(page.data.difficulty)}</p>
		<button
			class="mt-2 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
			onclick={() =>
				(window.location.href = `https://teeworlds.cn/ddnet/mappreview/?url=map/${encodeURIComponent(page.data.name)}.map`)}
			>查看地图</button
		>
	</div>
	<div class="rounded-lg bg-slate-700 p-4 shadow-md">
		<h2 class="mb-3 text-xl font-bold">地图数据</h2>
		<p>
			发布日期：{page.data.release
				? new Date(page.data.release * 1000).toLocaleString('zh-CN')
				: '远古'}
		</p>
		{#if page.data.median_time}
			<p title={`${page.data.median_time.toFixed(2.0)}秒`}>
				平均时间：{secondsToTime(page.data.median_time)}
			</p>
		{/if}
		{#if page.data.median_time}
			<p>完成总次数：{page.data.finishes}</p>
		{/if}
		{#if page.data.median_time}
			<p>完成玩家数：{page.data.finishers}</p>
		{/if}
		{#if page.data.biggest_team}
			<p>最大团队：{page.data.biggest_team} 人</p>
		{/if}
	</div>
</div>

<div
	class="grid grid-cols-1 gap-4 md:grid-cols-2 {page.data.team_ranks.length
		? 'xl:grid-cols-3'
		: ''}"
>
	{#if page.data.team_ranks.length}
		<div class="mt-4 rounded-lg bg-slate-700 p-4 shadow-md">
			<h2 class="text-xl font-bold">团队排名</h2>
			<ul class="mt-2">
				{#each page.data.team_ranks as rank}
					<li>
						<span class="inline-block w-4 text-right">{rank.rank}.</span>
						<span
							title="于 {new Date(rank.timestamp * 1000).toLocaleString(
								'zh-CN'
							)} 用时 {secondsToChineseTime(rank.time)} 完成"
							class="inline-block w-20 text-right">{secondsToTime(rank.time)}</span
						>
						<FlagSpan flag={rank.country} />
						<span>{rank.players.join(' ')}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="mt-4 rounded-lg bg-slate-700 p-4 shadow-md">
		<h2 class="text-xl font-bold">个人排名</h2>
		<ul class="mt-2">
			{#each page.data.ranks as rank}
				<li>
					<span class="inline-block w-4 text-right">{rank.rank}.</span>
					<span
						title="于 {new Date(rank.timestamp * 1000).toLocaleString(
							'zh-CN'
						)} 用时 {secondsToChineseTime(rank.time)} 完成"
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
			{#each page.data.max_finishes as finishes}
				<li>
					<span class="inline-block w-4 text-right">{finishes.rank}.</span>
					<span
						title="首次完成：{new Date(finishes.min_timestamp * 1000).toLocaleString(
							'zh-CN'
						)}，最后完成：{new Date(finishes.max_timestamp * 1000).toLocaleString(
							'zh-CN'
						)}，最快用时：{secondsToChineseTime(finishes.time)}"
						class="inline-block w-12 text-right">{finishes.num} 次</span
					>
					<span class="ml-3">{finishes.player}</span>
				</li>
			{/each}
		</ul>
	</div>
</div>
