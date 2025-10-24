<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import DdIdle from '$lib/components/DDIdle.svelte';
	import MapLink from '$lib/components/ddnet/MapLink.svelte';
	import PlayerLink from '$lib/components/ddnet/PlayerLink.svelte';
	import FlagSpan from '$lib/components/FlagSpan.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PointCalculation from '$lib/components/PointCalculation.svelte';
	import { secondsToDate } from '$lib/date';
	import { KNOWN_REGIONS, mapType } from '$lib/ddnet/helpers';
	import { checkMapName } from '$lib/ddnet/searches.js';
	import { secondsToTime } from '$lib/helpers';
	import { encodeAsciiURIComponent } from '$lib/link.js';
	import { share } from '$lib/share';
	import { tippy } from '$lib/tippy';
	import { faMap, faQuestionCircle } from '@fortawesome/free-solid-svg-icons';
	import { Chart } from 'chart.js/auto';
	import { onMount } from 'svelte';
	import Fa from 'svelte-fa';
	import VirtualScroll from 'svelte-virtual-scroll-list';

	let { data } = $props();

	let explaination = $state(false);
	let pointModal = $state(false);
	let mapModal = $state(false);
	let searchMap = $state('');
	let filterType = $state('all');
	let sortType = $state('finish');
	let copiedSkin = $state<string | null>(null);

	// april fools
	let qiaPoints = $state(0);
	let hasQia = page.url.searchParams.get('tool') === 'true';

	// Copy skin name to clipboard
	async function copySkinName(skinName: string) {
		try {
			await navigator.clipboard.writeText(skinName);
			copiedSkin = skinName;

			// Reset copied state after 2 seconds
			setTimeout(() => {
				if (copiedSkin === skinName) {
					copiedSkin = null;
				}
			}, 2000);

			return true;
		} catch (err) {
			console.error('Failed to copy skin name:', err);
			return false;
		}
	}

	// Get tooltip content based on copy state
	function getSkinTooltipContent(skinName: string) {
		return copiedSkin === skinName
			? `皮肤：${skinName} 已复制！`
			: `皮肤：${skinName}` || 'default';
	}

	// Update tippy content when copy state changes
	$effect(() => {
		const skinButton = document.querySelector('button[data-skin-name]');
		if (skinButton && (skinButton as any)._tippy) {
			(skinButton as any)._tippy.setContent(getSkinTooltipContent(data.skin.n || ''));
		}
	});

	let filteredMaps = $derived(() => {
		if (!searchMap) {
			let maps = [...data.maps];
			if (filterType != 'all') {
				maps = maps.filter((map) => map.type.toLowerCase().startsWith(filterType));
			}
			if (sortType == 'unfinished') {
				maps = maps.filter((map) => !map.map.first_finish);
			}
			if (sortType == 'rank') {
				maps.sort((a, b) => {
					const aRank = Math.min(a.map.team_rank || Infinity, a.map.rank || Infinity);
					const bRank = Math.min(b.map.team_rank || Infinity, b.map.rank || Infinity);
					if (aRank == bRank) {
						if (a.map.first_finish == b.map.first_finish) {
							return a.name.localeCompare(b.name);
						}
						return (b.map.first_finish || 0) - (a.map.first_finish || 0);
					}
					return aRank - bRank;
				});
			} else if (sortType == 'point') {
				maps.sort((a, b) => {
					const aPoint = a.map.first_finish ? a.map.points : 0;
					const bPoint = b.map.first_finish ? b.map.points : 0;
					if (aPoint == bPoint) {
						if (a.map.first_finish == b.map.first_finish) {
							return a.name.localeCompare(b.name);
						}
						return (b.map.first_finish || 0) - (a.map.first_finish || 0);
					}
					return bPoint - aPoint;
				});
			} else if (sortType == 'name') {
				maps.sort((a, b) => a.name.localeCompare(b.name));
			} else if (sortType == 'finish') {
				maps.sort((a, b) => {
					if (a.map.first_finish == b.map.first_finish) {
						return a.name.localeCompare(b.name);
					}
					return (b.map.first_finish || 0) - (a.map.first_finish || 0);
				});
			}
			return maps;
		}
		return data.maps.filter((map) => checkMapName(map.name, searchMap));
	});

	const hoursToColor = (value: number) => {
		const weight = value / 24;
		const h = Math.round((1.0 - weight) * 200);
		const s = Math.round(70 + weight * 30);
		const l = Math.round(40 + weight * 10);
		const a = Math.min(weight / 0.2, 1);
		return `hsl(${h}deg, ${s}%, ${l}%, ${a})`;
	};

	const playerDescription = $derived(`玩家信息：${data.player.points.points}pts`);

	afterNavigate(() => {
		share({
			icon: `${window.location.origin}/shareicon.png`,
			link: `https://teeworlds.cn/goto#p${encodeAsciiURIComponent(data.player.player)}`,
			title: data.player.player,
			desc: playerDescription
		});

		filterType = 'all';
		sortType = 'finish';
		searchMap = '';
	});

	let chart: Chart | null = null;

	onMount(() => {
		chart = new Chart(document.getElementById('growth-chart') as HTMLCanvasElement, {
			type: 'line',
			options: {
				maintainAspectRatio: false,
				interaction: {
					mode: 'index',
					axis: 'x',
					intersect: false
				},
				plugins: {
					legend: {
						display: false
					}
				},
				scales: {
					x: {
						ticks: {
							maxTicksLimit: 4,
							color: '#CBD5E1'
						}
					},
					y: {
						ticks: {
							color: '#CBD5E1'
						}
					}
				}
			},
			data: {
				datasets: [
					{
						data: [],
						segment: {
							borderDash: (ctx) => (ctx.p1.parsed.y == 0 ? [5, 5] : undefined)
						},
						borderColor: '#FB923C',
						fill: false,
						pointRadius: 0,
						tension: 0.5,
						borderWidth: 2
					}
				]
			}
		});
	});

	$effect(() => {
		data.growth;

		if (chart) {
			chart.data.labels = data.growth.map((_, index) => {
				return new Date((data.endOfDay - (364 - index) * 24 * 60 * 60) * 1000).toLocaleDateString(
					'zh-CN',
					{
						dateStyle: 'short'
					}
				);
			});
			chart.data.datasets[0].data = data.growth.map((point, index) => {
				return [index, point];
			});
			chart.update();
		}
	});

	const fakePoints = $derived(Math.floor((data.ranks[0].rank.points || 0) + qiaPoints));
	const fakeRank = $derived(() => {
		const currentPoints = data.ranks[0].rank.points || 0;
		const totalPoints = data.player.points.total || currentPoints;
		const points = currentPoints + qiaPoints;

		// Linear interpolation: rank = 1 + (maxRank - 1) * (1 - (points - minPoints) / (maxPoints - minPoints))
		const maxRank = data.ranks[0].rank.rank || 1;
		return Math.max(
			1,
			Math.round(1 + (maxRank - 1) * (1 - (points - currentPoints) / (totalPoints - currentPoints)))
		);
	});
</script>

<svelte:head>
	<meta property="og:title" content="{data.player.player} - DDNet 玩家" />
	<meta property="og:type" content="website" />
	<meta
		property="og:url"
		content="https://teeworlds.cn/ddnet/players/{encodeAsciiURIComponent(data.player.player)}"
	/>
	<meta property="og:description" content={playerDescription} />
	<meta property="og:image" content="https://teeworlds.cn/shareicon.png" />
	<meta name="title" content="{data.player.player} - DDNet 玩家" />
	<meta name="description" content={playerDescription} />
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ href: '/ddnet', text: 'DDNet' },
		{ href: '/ddnet/players', text: '排名', title: 'DDNet 排名' },
		{ text: data.player.player, title: data.player.player }
	]}
/>

<div class="mb-4">
	<div class="flex w-full flex-col items-center justify-between gap-2 sm:flex-row">
		<div>
			<div class="text-md font-bold">
				<span>最近活跃：{secondsToDate(data.last_finish.timestamp)}</span>
			</div>
		</div>
		<div>
			<button
				class="cursor-pointer text-nowrap rounded bg-blue-500 px-4 py-2 font-semibold hover:bg-blue-600 active:bg-blue-500"
				onclick={() => {
					mapModal = !mapModal;
				}}><Fa class="inline" icon={faMap}></Fa> 过图数据</button
			>
			<button
				class="cursor-pointer text-nowrap rounded bg-slate-700 px-4 py-2 font-semibold hover:bg-slate-600 active:bg-slate-700"
				onclick={() => {
					pointModal = !pointModal;
				}}><Fa class="inline" icon={faQuestionCircle}></Fa> 积分说明</button
			>
		</div>
	</div>
</div>
<div class="grid grid-cols-1 gap-4 md:grid-cols-1">
	<div class="rounded-lg bg-slate-700 p-2 shadow-md md:p-4">
		<h2 class="mb-3 text-xl font-bold">
			玩家信息 <FlagSpan
				flag={data.player.favorite_server.server}
				tooltip="常玩地区：{data.player.favorite_server.server}"
			/>
			{#if data.player.pending_unknown || data.player.pending_points}
				<button
					class="cursor-pointer text-sm font-semibold text-blue-300 hover:text-blue-400"
					onclick={() => {
						explaination = !explaination;
					}}>ⓘ 数据不对？</button
				>
			{/if}
			{#if explaination}
				<span
					class="mt-2 block rounded-lg bg-slate-800 px-3 py-1 text-sm font-normal shadow-md md:float-right md:mt-0 md:inline-block"
					>里程与分数统计结算有一天的延迟，部分数据可能需要48小时后才会出现</span
				>
			{/if}
		</h2>

		<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
			{#each data.ranks as rank, i}
				<div
					class="rounded-lg bg-slate-600 px-3 py-1 shadow-md sm:py-3"
					class:opacity-50={!rank.rank.rank}
				>
					<h3 class="mb-1 text-base font-bold">
						{#if rank.icon == 'SV'}
							<FlagSpan class="text-sm" flag={data.player.favorite_server.server} />
							{KNOWN_REGIONS[data.player.favorite_server.server.toUpperCase()] || '地区'}{rank.name}
						{:else}
							{rank.icon}
							{rank.name}
						{/if}
					</h3>
					{#if i == 0 && rank.rank.rank}
						<p class="text-md">
							<span class="text-sm">No.</span>{fakeRank()} - {fakePoints}pts
							{#if rank.rank.pending || data.player.pending_unknown}
								<span
									class="cursor-pointer font-semibold text-blue-300 hover:text-blue-400"
									use:tippy={{
										content: `根据最近过图记录，有${data.player.pending_unknown ? '至少' : ''}${
											rank.rank.pending || '?'
										}分尚未结算。${
											data.player.pending_unknown
												? '今日过图超过10次，数据可能不准确，请以明日结算结果为准。'
												: ''
										}`
									}}
									>{' '}+{rank.rank.pending}{#if data.player.pending_unknown}?{/if}</span
								>
							{/if}
						</p>
					{:else if rank.rank.rank}
						<p class="text-md">
							<span class="text-sm">No.</span>{rank.rank.rank} - {rank.rank.points}pts
						</p>
					{:else if rank.icon == 'SV'}
						<p class="text-md">未进前 500 名</p>
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

			<div
				class="mt-2 rounded-lg bg-slate-600 px-3 py-1 shadow-md sm:py-3"
				class:opacity-50={!data.player.favorite_partners.length}
			>
				<h3 class="mb-1 text-base font-bold">👍 常玩队友</h3>
				{#each data.player.favorite_partners as partner}
					<p class="text-md">
						<PlayerLink player={partner.name} className="font-semibold">{partner.name}</PlayerLink> -
						组队 {partner.finishes} 次
					</p>
				{/each}
				{#if !data.player.favorite_partners.length}
					<p class="text-md">暂无团队记录</p>
				{/if}
			</div>
		</div>
		{#if data.player.data_update_time}
			<div class="mt-2">
				上次数据更新于 {new Date(data.player.data_update_time * 1000).toLocaleString('zh-CN', {
					dateStyle: 'short',
					timeStyle: 'short'
				})}
			</div>
		{/if}
	</div>
	<div class="rounded-lg bg-slate-700 p-2 shadow-md md:p-4">
		<h2 class="mb-3 text-xl font-bold">玩家数据</h2>
		<div class="grid grid-cols-1 md:grid-cols-2 md:gap-2">
			{#each data.statsCols as col, i}
				<div>
					<div
						class="{i != 0 ? 'hidden md:grid' : ''} grid grid-cols-2 gap-2 text-center font-bold"
					>
						<div class="overflow-hidden text-center">里程</div>
						<div class="overflow-hidden text-center">完成度</div>
					</div>
					{#each col as stat}
						<div class="mt-1 rounded-lg bg-slate-600 px-1 py-0 md:mt-2 md:px-2 md:py-1">
							<div class="grid grid-cols-2 gap-2 px-2 text-sm md:text-base">
								<div class="overflow-hidden text-left">
									{stat.type == 'points' ? '总计' : mapType(stat.type)}
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
											{Math.floor((stat.points / stat.total_points) * 100)}%
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
										{Math.floor((stat.finishes / stat.total_map) * 100)}%
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
	<div class="rounded-lg bg-slate-700 p-2 shadow-md md:p-4">
		<h2 class="mb-3 text-xl font-bold">玩家活跃</h2>
		<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
			<div class="rounded-lg bg-slate-600 px-3 py-1 shadow-md sm:py-3">
				<h3 class="mb-1 text-base font-bold">首次记录</h3>
				<p>
					<MapLink map={data.player.first_finish.map} className="font-semibold"
						>{data.player.first_finish.map}</MapLink
					> ({secondsToTime(data.player.first_finish.time)})
				</p>
				<p>于 {secondsToDate(data.player.first_finish.timestamp)} 完成</p>
			</div>
			<div
				class="rounded-lg bg-slate-600 px-3 py-1 shadow-md sm:py-3"
				class:opacity-50={!data.player.hours_played_past_365_days}
			>
				<h3 class="mb-1 text-base font-bold">活跃时间</h3>
				{#if data.player.hours_played_past_365_days}
					<p>
						<span class="font-semibold">365天内游玩：</span>{data.player.hours_played_past_365_days}
						小时
					</p>
				{:else}
					<p>过去 365 天未游玩</p>
				{/if}
			</div>
		</div>
		<div class="mt-2 rounded-lg bg-slate-600 px-3 py-1 shadow-md sm:py-3">
			<h3 class="mb-1 text-base font-bold">活跃记录</h3>
			<div class="mx-auto max-w-fit rounded bg-slate-700 p-1 sm:p-2 md:p-3">
				<div class="flex flex-row flex-nowrap gap-2">
					<div class="hidden flex-col text-xs sm:flex">
						<p class="-mt-1 flex-grow text-nowrap">周一</p>
						<p class="text-nowrap">周日</p>
					</div>
					<div class="flex flex-col flex-nowrap lg:gap-[0.125rem]">
						{#each data.activity as row}
							<div
								class="flex flex-row flex-nowrap border-slate-800 first:border-t lg:gap-[0.125rem] lg:border-none"
							>
								{#each row as col}
									{#if col.date}
										<div
											use:tippy={{ content: `${col.date} - ${col.hours} 小时` }}
											class="h-[calc((100svw-5rem)/54)] w-[calc((100svw-5rem)/54)] border-b border-r border-slate-800 first:border-l sm:h-[0.6rem] sm:w-[0.6rem] md:h-3 md:w-3 lg:border-l lg:border-t"
											style="background-color: {hoursToColor(col.hours)}"
										></div>
									{:else}
										<div
											class="h-[calc((100svw-5rem)/54)] w-[calc((100svw-5rem)/54)] sm:h-[0.6rem] sm:w-[0.6rem] md:h-3 md:w-3"
										></div>
									{/if}
								{/each}
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
		<div class="mt-2 rounded-lg bg-slate-600 px-3 py-1 shadow-md sm:py-3">
			<h3 class="mb-1 text-base font-bold">增长趋势</h3>
			<div class="mx-auto h-48 w-full rounded bg-slate-700 p-3">
				<canvas id="growth-chart" class="h-full w-full"></canvas>
			</div>
		</div>
	</div>
</div>

{#if hasQia}
	<DdIdle
		skin={data.skin.n}
		body={data.skin.b}
		feet={data.skin.f}
		bind:points={qiaPoints}
		name={data.player.player}
	></DdIdle>
{/if}

<Modal bind:show={pointModal}>
	<PointCalculation></PointCalculation>
</Modal>

<Modal bind:show={mapModal}>
	<div class="container rounded-l-lg rounded-br-lg bg-slate-700 p-2 shadow-md md:p-4">
		<h2 class="mb-3 text-xl font-bold">过图数据</h2>
		<div class="rounded-lg bg-slate-600 p-2">
			<div class="mb-4 flex-col space-y-2 md:flex md:flex-row md:space-x-2 md:space-y-0">
				<input
					type="text"
					placeholder="搜索地图名"
					class="w-full cursor-text rounded border border-slate-600 bg-slate-700 px-4 py-2 text-slate-300 md:mb-0 md:flex-1"
					bind:value={searchMap}
				/>
				<select
					class="rounded border border-slate-600 bg-slate-700 px-4 py-2 text-slate-300 disabled:opacity-50"
					disabled={!!searchMap}
					bind:value={sortType}
				>
					<option value="finish">最近完成</option>
					<option value="rank">最高排名</option>
					<option value="point">最高里程</option>
					<option value="name">首字母排序</option>
					<option value="unfinished">仅未完成</option>
				</select>
				<select
					class="rounded border border-slate-600 bg-slate-700 px-4 py-2 text-slate-300 disabled:opacity-50"
					disabled={!!searchMap}
					bind:value={filterType}
				>
					<option value="all">全部</option>
					<option value="novice">新手</option>
					<option value="moderate">中阶</option>
					<option value="brutal">高阶</option>
					<option value="insane">疯狂</option>
					<option value="ddmax">古典</option>
					<option value="oldschool">传统</option>
					<option value="dummy">分身</option>
					<option value="solo">单人</option>
					<option value="race">竞速</option>
					<option value="fun">娱乐</option>
				</select>
			</div>
			<div
				class="scrollbar-subtle h-[calc(100svh-15rem)] overflow-hidden md:h-[calc(100svh-13rem)]"
			>
				<div class="hidden cursor-default text-nowrap rounded-t bg-slate-700 text-center sm:block">
					<span class="inline-block w-32 overflow-hidden pl-2 text-left lg:w-48">地图</span>
					<span class="hidden w-8 overflow-hidden text-left md:inline-block lg:w-16">类型</span>
					<span class="inline-block w-8 overflow-hidden sm:w-16">里程</span>
					<span class="hidden w-16 overflow-hidden text-right md:inline-block">团队排名</span>
					<span class="hidden w-16 overflow-hidden text-right md:inline-block">个人排名</span>
					<span class="inline-block w-16 overflow-hidden text-right sm:w-24">最短记录</span>
					<span class="hidden w-16 overflow-hidden md:inline-block">次数</span>
					<span class="inline-block w-32 overflow-hidden lg:w-40">首次完成</span>
				</div>
				<div class="block cursor-default text-nowrap rounded-t bg-slate-700 text-center sm:hidden">
					<span class="inline-block">地图</span>
					<span class="inline-block">里程</span>
					<span class="inline-block">记录</span>
					<span class="inline-block">完成</span>
				</div>
				<div class="h-[calc(100%-1rem)]">
					<VirtualScroll
						keeps={75}
						data={filteredMaps()}
						key="name"
						estimateSize={30}
						let:data
						let:index
					>
						<div slot="footer" class="rounded-lg bg-slate-800 text-center">到底了</div>
						{@const isTeamTop10 = data.map.team_rank && data.map.team_rank <= 10}
						{@const isRankTop10 = data.map.rank && data.map.rank <= 10}
						<div
							class="min-w-fit cursor-default flex-col text-nowrap text-center"
							class:bg-slate-700={index % 2 == 1}
							class:bg-slate-600={index % 2 == 0}
						>
							<span class="inline-block w-32 overflow-hidden pl-2 text-left lg:w-48"
								><MapLink className="font-semibold" map={data.name}>{data.name}</MapLink></span
							>
							<span class="hidden w-8 overflow-hidden text-left md:inline-block lg:w-20"
								>{mapType(data.type)}</span
							>
							<span class="inline-block w-8 overflow-hidden sm:w-16">{data.map.points}</span>
							{#if data.map.pending}
								<span
									class="hidden w-16 overflow-hidden text-right md:inline-block"
									class:text-blue-300={data.map.pending}>......</span
								>
								<span
									class="hidden w-16 overflow-hidden text-right md:inline-block"
									class:text-blue-300={data.map.pending}>......</span
								>
							{:else}
								<span
									class="hidden w-16 overflow-hidden text-right md:inline-block"
									class:text-orange-500={isTeamTop10}
									>{data.map.team_rank ? data.map.team_rank + '.' : ''}</span
								>
								<span
									class="hidden w-16 overflow-hidden text-right md:inline-block"
									class:text-orange-500={isRankTop10}
									>{data.map.rank ? data.map.rank + '.' : ''}</span
								>
							{/if}
							<span class="inline-block w-16 overflow-hidden text-right sm:w-24"
								>{data.map.time ? secondsToTime(data.map.time) : ''}</span
							>
							<span class="hidden w-16 overflow-hidden md:inline-block">{data.map.finishes}</span>
							<span
								class="inline-block w-32 overflow-hidden lg:w-40"
								class:text-blue-300={data.map.pending}
								>{data.map.first_finish
									? new Date(data.map.first_finish * 1000).toLocaleString('zh-CN', {
											dateStyle: 'short',
											timeStyle: 'short'
										})
									: ''}</span
							>
						</div>
					</VirtualScroll>
				</div>
			</div>
		</div>
	</div>
</Modal>
