<script lang="ts">
	import { page } from '$app/state';
	import { onDestroy, onMount, type Snippet } from 'svelte';

	import sqlstring from 'sqlstring';
	import { browser } from '$app/environment';
	import TeeRender from '$lib/components/TeeRender.svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { encodeAsciiURIComponent } from '$lib/link.js';
	import { fade } from 'svelte/transition';
	import { secondsToTime } from '$lib/helpers';
	import { mapType } from '$lib/ddnet/helpers.js';

	const { data } = $props();

	let tz = page.url.searchParams.get('tz') || '+08:00';

	if ((!tz.startsWith('+') && !tz.startsWith('-')) || tz.includes("'")) {
		tz = 'utc';
	}

	// artificially delay each request, just to make extra sure we don't ddos ddstats.
	// although we are routing every ddstats request through our own server, so it can only be a dos i guess.
	// either way, just a slight delay on each request is probably enough to spread out the load when multiple people are querying.
	// ideally when we have a beefier server, we can just host the stats sqlite ourselves,
	// but currently we don't have enough disk space to do that.
	const THROTTLE = 0;
	const timeout = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	interface CardTextItem {
		type: 't';
		text: string;
	}

	interface CardBannerItem {
		type: 'b';
		bg: string;
		color?: string;
		text: string;
		rotation: number;
	}

	type CardItem = CardTextItem | CardBannerItem;

	interface CardData {
		title?: string;
		content?: CardItem[];
		w?: number;
		h?: number;
		l?: number;
		t?: number;
		r?: number;
		b?: number;
		background?: string;
		mapper?: string;
		format?: Snippet<[number, CardData]>;
	}

	let totalCards = $state(null) as CardData[] | null;
	let currentCard = $state(-1);
	let scrollRoot = $state(null) as HTMLDivElement | null;
	let showContent = $state(true);

	const fetchDDStats = async (sql: string) => {
		const result = await fetch(
			`https://ddstats.teeworlds.cn/ddnet.json?sql=${encodeURIComponent(sql)}`
		);

		if (!result.ok) {
			throw new Error(`Failed to fetch data: ${result.status} ${result.statusText}`);
		}

		const json = await result.json();
		if (!json.ok) {
			throw new Error(`Failed to fetch data: ${json.error}`);
		}

		return json;
	};

	/** [map, points, lowestTime, server] */
	const findAllPointsBeforeTime = async (name: string, time: Date) => {
		let offset = 0;
		const rows = [];
		while (true) {
			const sql = `
			SELECT m.Map, m.Points, LowestTime, m.Server FROM maps m
			JOIN (SELECT Map, MIN(Time) as LowestTime FROM race 
				WHERE Name = ${sqlstring.escape(name)}
				AND datetime(Timestamp, '${tz}') <= ${sqlstring.escape(time)} GROUP BY Map
			) r
			ON m.Map = r.Map LIMIT ${offset}, 1001;`;

			const result = await fetchDDStats(sql);
			rows.push(...(result?.rows || []));
			if (!result?.truncated) {
				break;
			}
			offset += result.rows.length;
			await timeout(THROTTLE);
		}
		return rows as [string, number, number, string][];
	};

	/** [count, slice] */
	const countTimeSliceFinishes = async (
		name: string,
		timeFormat: '%H' | '%m',
		start: Date,
		end: Date
	) => {
		const sql = `
		SELECT COUNT(), strftime('${timeFormat}', datetime(Timestamp, '${tz}')) as Slice, Server FROM race
		WHERE Name=${sqlstring.escape(name)}
		AND datetime(Timestamp, '${tz}') <= ${sqlstring.escape(end)} AND datetime(Timestamp, '${tz}') > ${sqlstring.escape(start)}
		GROUP BY Slice;`;

		const result = await fetchDDStats(sql);
		return result.rows as [number, string][];
	};

	/** [map, time, timestamp] */
	const findLateNightFinishedRace = async (name: string, start: Date, end: Date) => {
		const sql = `
		SELECT Map, Time, datetime(Timestamp, '${tz}') FROM race
		WHERE Name=${sqlstring.escape(name)} AND time(Timestamp, '${tz}') < '05:00'
		AND Time <= CAST(strftime('%M', datetime(Timestamp, '${tz}')) as INT) * 60 +
			CAST(strftime('%H', datetime(Timestamp, '${tz}')) as INT) * 3600 + 7200
		AND datetime(Timestamp, '${tz}') <= ${sqlstring.escape(end)} AND datetime(Timestamp, '${tz}') > ${sqlstring.escape(start)}
		ORDER BY Time desc LIMIT 1;`;

		const result = await fetchDDStats(sql);
		return result.rows as [string, number, string][];
	};

	/** [type, total, finished] */
	const findMapFinishCount = async (name: string, start: Date, end: Date) => {
		const sql = `
		SELECT m.Server, COUNT(m.Map) as Total, COUNT(r.Map) as Finished FROM
			(SELECT Server, Map FROM maps
				WHERE datetime(Timestamp, '${tz}') <= ${sqlstring.escape(end)} AND datetime(Timestamp, '${tz}') > ${sqlstring.escape(start)}
			) m LEFT JOIN 
			(SELECT Map FROM race WHERE Name = ${sqlstring.escape(name)} GROUP BY Map) r
		ON m.Map = r.Map GROUP BY Server;`;
		const result = await fetchDDStats(sql);
		return result.rows as [string, number, number][];
	};

	/** [type, finishes] */
	const findServerFinishes = async (name: string, start: Date, end: Date) => {
		const sql = `
		SELECT m.Server, COUNT(r.Map) as Finishes FROM Maps m JOIN
			(SELECT Map FROM race
			WHERE Name = ${sqlstring.escape(name)}
			AND datetime(Timestamp, '${tz}') <= ${sqlstring.escape(end)} AND datetime(Timestamp, '${tz}') > ${sqlstring.escape(start)}) r
		ON m.Map = r.Map GROUP BY Server;`;

		const result = await fetchDDStats(sql);
		return result.rows as [string, number][];
	};

	let insercetionObserver: IntersectionObserver | null = null;

	onDestroy(() => {
		if (insercetionObserver) {
			insercetionObserver.disconnect();
			insercetionObserver = null;
		}
	});

	let referenceScrollTop = 0;

	const scrollToCard = (id: number) => {
		const card = document.querySelector(`#card-${id}`) as HTMLDivElement;
		if (scrollRoot && card) {
			// scroll card into the center of the screen
			if (overscrollAnimationTimer) {
				clearTimeout(overscrollAnimationTimer);
				overscrollAnimationTimer = null;
			}
			referenceScrollTop =
				card.offsetTop - scrollRoot.offsetTop - (scrollRoot.clientHeight - card.clientHeight) / 2;
			scrollRoot.scrollTo({
				top: referenceScrollTop,
				behavior: 'smooth'
			});
		}
	};

	$effect(() => {
		if (!browser) return;
		scrollToCard(currentCard);
	});

	let timer: Timer | null = null;

	const onResize = () => {
		if (timer != null) {
			clearTimeout(timer);
			timer = null;
		}

		timer = setTimeout(() => {
			scrollToCard(currentCard);
			timer = null;
		}, 300);
	};

	const ease = (t: number) => {
		return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
	};

	let startAnimation = true;

	const verySlowScrollAnimation = (id: number, totalTime: number) => {
		const card = document.querySelector(`#card-${id}`) as HTMLDivElement;
		if (scrollRoot && card) {
			const targetTop =
				card.offsetTop - scrollRoot.offsetTop - (scrollRoot.clientHeight - card.clientHeight) / 2;

			let start = Date.now();
			let end = start + totalTime;

			const _scrollRoot = scrollRoot;
			const startTop = _scrollRoot.scrollTop;

			// don't use scrollTo, it is too fast. we make a very slow animation that scrolls to the target in 2 seconds
			const update = () => {
				let time = Date.now();
				if (time < end) {
					const progress = ease((time - start) / (end - start));
					_scrollRoot.scrollTo({
						top: startTop + (targetTop - startTop) * progress,
						behavior: 'instant'
					});
					requestAnimationFrame(update);
				} else {
					_scrollRoot.scrollTo({
						top: targetTop,
						behavior: 'instant'
					});
				}
			};
			update();
		}
	};

	let loadingProgress = $state(-1);

	const startProcess = async () => {
		const name = data.name;
		if (!name) return goto(`/ddnet/yearly`);

		const start = new Date(`${data.year}-01-01T00:00:00`);
		const end = new Date(`${data.year}-12-31T23:59:59`);
		const lastYearEnd = new Date(`${data.year - 1}-12-31T23:59:59`);

		const totalSteps = 4;
		let currentStep = 0;
		const updateProgress = () => {
			currentStep++;
			if (currentStep > totalSteps) currentStep = totalSteps;
			loadingProgress = currentStep / totalSteps;
		};

		loadingProgress = 0;

		const d: Partial<{
			/** version */
			v: number;
			/** name */
			n: string;
			/** year */
			y: number;
			/** this year total points */
			tp: number;
			/** last year total points */
			lp: number;
			/** most point gainer [map, points] */
			mpg: [string, number];
			/** total races */
			tr: number;
			/** most hourly race [timeName, finishes] */
			mhr: [string, number];
			/** most monthly race [startMonth, endMonth, seasonName, finishes] */
			mmr: [number, number, string, number];
			/** late night finish [map, time, timestamp] */
			lnf: [string, number, string];
			/** this year's map finishes [total, finished] */
			ymf: [number, number];
			/** this year's map type finishes [server, total, finished] */
			ymfs: [string, number, number];
			/** most finishes servers [server, finishes] */
			mps: [string, number];
		}> = {};

		try {
			d.v = 1;
			d.n = data.name;
			d.y = data.year;

			const thisYearPoints = await findAllPointsBeforeTime(name, end);
			const thisYearTotalPoints = thisYearPoints.reduce((sum, [_, points]) => sum + points, 0);

			updateProgress();
			await timeout(THROTTLE);

			const lastYearPoints = await findAllPointsBeforeTime(name, lastYearEnd);
			const lastYearTotalPoints = lastYearPoints.reduce((sum, [_, points]) => sum + points, 0);

			// most point gainer that isn't in the last year
			const thisYearOnlyPoints = thisYearPoints.filter(
				([name]) => !lastYearPoints.some(([name2]) => name == name2)
			);

			const thisYearPointGainers = thisYearOnlyPoints.sort((a, b) => b[1] - a[1]);
			const mostPointGainer = thisYearPointGainers[0];

			d.tp = thisYearTotalPoints;
			d.lp = lastYearTotalPoints;

			if (mostPointGainer) {
				d.mpg = [mostPointGainer[0], mostPointGainer[1]];
			}

			updateProgress();
			await timeout(THROTTLE);

			const hourly = await countTimeSliceFinishes(name, '%H', start, end);
			const totalRaces = hourly.reduce((sum, [num, _]) => sum + num, 0);
			const hourRange = [
				[0, 3, '深夜', 0],
				[4, 7, '清晨', 0],
				[9, 12, '上午', 0],
				[13, 16, '下午', 0],
				[17, 20, '傍晚', 0],
				[21, 24, '晚上', 0]
			] as [number, number, string, number][];

			for (const hour of hourly) {
				const range = hourRange.find(
					(range) => range[0] <= parseInt(hour[1]) && parseInt(hour[1]) <= range[1]
				);
				if (range) {
					range[3] += hour[0];
				}
			}
			hourRange.sort((a, b) => b[3] - a[3]);
			const mostHourlyRaces = hourRange[0];

			d.tr = totalRaces;
			d.mhr = [mostHourlyRaces[2], mostHourlyRaces[3]];

			updateProgress();
			await timeout(THROTTLE);

			const monthly = await countTimeSliceFinishes(name, '%m', start, end);
			const monthRange = [
				[1, 3, '寒冬', 0],
				[4, 6, '盛春', 0],
				[7, 9, '热夏', 0],
				[10, 12, '晚秋', 0]
			] as [number, number, string, number][];
			for (const month of monthly) {
				const range = monthRange.find(
					(range) => range[0] <= parseInt(month[1]) && parseInt(month[1]) <= range[1]
				);
				if (range) {
					range[3] += month[0];
				}
			}
			monthRange.sort((a, b) => b[3] - a[3]);
			const mostMonthlyRaces = monthRange[0];

			d.mmr = mostMonthlyRaces;

			updateProgress();
			await timeout(THROTTLE);

			d.lnf = (await findLateNightFinishedRace(name, start, end))[0];

			updateProgress();
			await timeout(THROTTLE);

			const mapFinishesThisYear = (await findMapFinishCount(name, start, end)).sort(
				(a, b) => b[2] - a[2]
			);

			const totalFinishes = mapFinishesThisYear.reduce(
				(sum, [server, total, finishes]) => {
					if (server.toLowerCase() == 'fun') return sum;
					sum[0] += total;
					sum[1] += finishes;
					return sum;
				},
				[0, 0] as [number, number]
			);

			d.ymf = totalFinishes;
			d.ymfs = mapFinishesThisYear[0];

			updateProgress();
			await timeout(THROTTLE);

			const serverFinishes = await findServerFinishes(name, start, end);
			const sortedServerFinishes = serverFinishes.sort((a, b) => b[1] - a[1]);
			d.mps = sortedServerFinishes[0];
		} catch (e) {
			console.error(e);
		}

		const cards: CardData[] = [];
		if (d.tp && d.lp && d.tp - d.lp > 0) {
			cards.push({
				title: '今年分数',
				content: [
					{ type: 't', text: `截至 ${d.y} 岁末，一共斩获了 ${d.tp}pts` },
					{ type: 't', text: `您火力全开，你今年攀升了` },
					{ type: 'b', bg: '#fdd300', color: '#000', text: `${d.tp - d.lp}pts`, rotation: 4 }
				],
				background: '/assets/yearly/Back_in_Festivity.png',
				mapper: 'Test Mapper Text'
			});
		} else {
			cards.push({
				title: '今年分数',
				content: [
					{
						type: 't',
						text: `截至 ${data.year} 岁末，您的总分为 ${d.tp}pts`
					},
					{
						type: 't',
						text: `与往年相比，您尚未获得任何新pts`
					},
					{
						type: 't',
						text: '难不成您是某位功成身退的游戏高手？<br/>又或是因为生活琐事，无法自由地驰骋于关卡之间？<br/>不管怎样，无论是游戏里还是游戏外，瓶颈期就像黎明前的黑暗，熬过了就能迎来曙光'
					},
					{
						type: 't',
						text: '希望您知道，此时此刻绝非终点，而是另一个'
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `全新的起点`,
						rotation: -4
					}
				],
				background: '/assets/yearly/Back_in_Festivity.png',
				mapper: 'Test Mapper Text'
			});
		}
		if (d.mpg) {
			cards.push({
				title: '分数成就',
				content: [
					{
						type: 't',
						text: `在你今年新完成的地图中，分数最高的是 ${d.mpg[0]}，完成这张图能得到 ${d.mpg[1]}pts。`
					}
				],
				background: '/assets/yearly/Back_in_Festivity.png',
				mapper: 'Test Mapper Text'
			});
		}
		if (d.mhr && d.mhr[1] > 0) {
			cards.push({
				title: '常玩时间',
				content: [
					{
						type: 't',
						text: `今年一共过了 ${d.tr} 次终点。其中 ${d.mhr[1]} 次是在${d.mhr[0]}完成的。`
					}
				],
				background: '/assets/yearly/Back_in_Festivity.png',
				mapper: 'Test Mapper Text'
			});
		}
		if (d.mmr && d.mmr[3] > 0) {
			cards.push({
				title: '常来季度',
				content: [
					{
						type: 't',
						text: `你最常来的季节是${d.mmr[2]}。在${d.mmr[0]}月到${d.mmr[1]}月期间，你一共过了 ${d.mmr[3]} 次终点。`
					}
				],
				background: '/assets/yearly/Back_in_Festivity.png',
				mapper: 'Test Mapper Text'
			});
		}
		if (d.lnf) {
			const dateTime = new Date(d.lnf[2]);
			cards.push({
				title: '夜猫子',
				content: [
					{
						type: 't',
						text: `在 ${dateTime.getMonth() + 1}月${dateTime.getDate()}日 深夜 ${dateTime.toLocaleTimeString('zh-CN')}，你花了 ${secondsToTime(d.lnf[1])} 完成了 ${d.lnf[0]}。`
					}
				],
				background: '/assets/yearly/Back_in_Festivity.png',
				mapper: 'Test Mapper Text'
			});
		}
		if (d.ymf && d.ymfs && d.ymf[1] > 0) {
			cards.push({
				title: '新潮追随者',
				content: [
					{
						type: 't',
						text: `今年新发布了 ${d.ymf[0]} 张地图，你完成了其中 ${d.ymf[1]} 张。达到了 ${Math.round((d.ymf[1] / d.ymf[0]) * 100)}% 的完成率。其中 ${mapType(d.ymfs[0])} 类型完成了 ${d.ymfs[2]}/${d.ymfs[1]} 张。`
					}
				],
				background: '/assets/yearly/Back_in_Festivity.png',
				mapper: 'Test Mapper Text'
			});
		}
		if (d.mps && d.mps[1] > 0) {
			cards.push({
				title: '最爱类型',
				content: [
					{
						type: 't',
						text: `你今年最常玩的类型是【${mapType(d.mps[0])}】，今年在${mapType(d.mps[0])}图中过了 ${d.mps[1]} 次终点。`
					}
				],
				background: '/assets/yearly/Back_in_Festivity.png',
				mapper: 'Test Mapper Text'
			});
		}

		if (d.y) {
			cards.push({
				title: '新年快乐',
				content: [
					{
						type: 'b',
						bg: '#A00F2A',
						color: '#fff',
						text: `${d.y + 1}见！`,
						rotation: 0
					}
				],
				t: 80,
				l: 60,
				b: 5,
				r: 5,
				background: '/assets/yearly/year.png',
				mapper: 'Test Mapper Text'
			});
		}

		totalCards = cards;

		await timeout(700);
		verySlowScrollAnimation(0, 2000);
		await timeout(2000);
		currentCard = 0;
		startAnimation = false;
	};

	afterNavigate(() => {
		// make sure we clear the data after navigation, so we prompt the user to generate the page again

		totalCards = null;
		startAnimation = true;
		loadingProgress = -1;
		currentCard = -1;
	});

	let dragStart = 0;
	let draggingPointer = null as number | null;

	const onPointerDown = (ev: PointerEvent) => {
		if (startAnimation) return;
		if (draggingPointer) return;

		// only accept left click
		if (ev.pointerType == 'mouse' && ev.button != 0) return;

		const card = document.querySelector(`#card-${currentCard}`) as HTMLDivElement;
		if (card) {
			card.style.scale = '0.98';
		}

		dragStart = ev.clientY;
		draggingPointer = ev.pointerId;
	};

	const onPointerMove = (ev: PointerEvent) => {
		if (ev.pointerId != draggingPointer) return;

		const delta = dragStart - ev.clientY;
		if (scrollRoot)
			scrollRoot.scrollTop =
				referenceScrollTop + Math.sign(delta) * Math.pow(Math.abs(delta), 0.5) * 3;
	};

	const updateCardDelta = (delta: number) => {
		if (delta < 0) {
			if (currentCard >= (totalCards?.length || 0) - 1) {
				return;
			}
			currentCard++;
		} else if (delta > 0) {
			if (currentCard <= 0) {
				return;
			}
			currentCard--;
		}
	};

	const onPointerUp = (ev: PointerEvent) => {
		if (ev.pointerId != draggingPointer) return;

		const card = document.querySelector(`#card-${currentCard}`) as HTMLDivElement;
		if (card) {
			card.style.scale = '1';
		}

		const delta = ev.clientY - dragStart;
		if (Math.abs(delta) > 5) {
			const current = currentCard;
			updateCardDelta(delta);
			if (currentCard == current) {
				scrollToCard(currentCard);
			}
		} else {
			showContent = !showContent;
		}
		draggingPointer = null;
	};

	let wheelDebounceTimer: Timer | null = null;
	let overscrollAnimationTimer: Timer | null = null;

	const onWheel = (ev: WheelEvent) => {
		if (startAnimation) return;
		if (wheelDebounceTimer) return;

		const delta = -ev.deltaY;
		const current = currentCard;
		updateCardDelta(delta);
		if (currentCard == current) {
			// make a overscroll animation
			if (scrollRoot) {
				scrollRoot.scrollTo({
					top: referenceScrollTop - delta,
					behavior: 'smooth'
				});
				overscrollAnimationTimer = setTimeout(() => {
					overscrollAnimationTimer = null;
					if (scrollRoot) {
						scrollRoot.scrollTo({
							top: referenceScrollTop,
							behavior: 'smooth'
						});
					}
				}, 100);
			}
		}

		wheelDebounceTimer = setTimeout(() => {
			wheelDebounceTimer = null;
		}, 200);
	};

	$effect(() => {
		totalCards;
		// after review data is loaded and rendered. scroll to the bottom
		if (scrollRoot) {
			// scroll to bottom
			scrollRoot.scrollTo({
				top: scrollRoot.scrollHeight,
				behavior: 'instant'
			});
		}
	});

	let gotoName = $state('');
</script>

<svelte:window on:resize={onResize} />

{#snippet cardSnippet(id: number, card: CardData, format: Snippet<[number, CardData]>)}
	<div
		id="card-{id}"
		class="card relative mx-auto my-8 aspect-square max-w-full select-none text-[7svw] transition-[scale] sm:h-[70%] sm:text-[4svh]"
		class:odd:motion-translate-x-in-[30%]={id == currentCard}
		class:odd:motion-translate-x-out-[30%]={id != currentCard}
		class:odd:motion-rotate-in-[12deg]={id == currentCard}
		class:odd:motion-rotate-out-[12deg]={id != currentCard}
		class:even:motion-translate-x-in-[-30%]={id == currentCard}
		class:even:motion-translate-x-out-[-30%]={id != currentCard}
		class:even:motion-rotate-in-[-12deg]={id == currentCard}
		class:even:motion-rotate-out-[-12deg]={id != currentCard}
		class:motion-blur-in-md={id == currentCard}
		class:motion-blur-out-md={id != currentCard}
		class:motion-opacity-in-20={id == currentCard}
		class:motion-opacity-out-20={id != currentCard}
		class:z-10={id == currentCard}
	>
		{#if card.mapper}
			<div
				class="motion-duration-250 absolute mt-[-10%] flex h-[10%] w-[75%] flex-col items-center justify-center overflow-hidden rounded-t-xl bg-teal-900 text-[0.5em]"
				class:motion-translate-y-in-[100%]={id == currentCard}
				class:motion-translate-y-out-[100%]={id != currentCard}
				class:motion-delay-500={id == currentCard}
				class:ml-[20%]={id % 3 == 0}
				class:ml-[5%]={id % 3 == 1}
				class:ml-[13%]={id % 3 == 2}
			>
				<div>{card.mapper}</div>
			</div>
		{/if}
		<div class="absolute h-full w-full overflow-hidden rounded-3xl shadow-2xl shadow-black">
			<div
				class="absolute h-full w-full bg-cover bg-center"
				style="background-image: url({card.background})"
			>
				{@render format(id, card)}
			</div>
		</div>
	</div>
{/snippet}

{#snippet regularFormat(id: number, card: CardData)}
	<div
		class="flex h-full w-full items-center justify-center text-[0.8em] transition-[backdrop-filter] motion-delay-700"
		class:motion-opacity-in-0={id == currentCard}
		class:motion-opacity-out-0={id != currentCard}
		class:backdrop-blur-sm={showContent}
	>
		<div
			class="absolute flex flex-col items-center justify-center gap-[3%] transition-opacity"
			class:opacity-0={!showContent}
			style="left: {card.l ?? 5}%; top: {card.t ?? 5}%; right: {card.r ?? 5}%; bottom: {card.b ??
				5}%;"
		>
			{#if card.content}
				{#each card.content as item}
					{#if item.type == 't'}
						<div class="rounded-lg bg-slate-700/80 px-2 py-1 text-center text-[0.7em]">
							{@html item.text}
						</div>
					{:else if item.type == 'b'}
						<div
							class="rounded px-4 py-2 text-center font-semibold"
							style="transform: rotate({item.rotation}deg);background-color: {item.bg};{item.color
								? `color: ${item.color};`
								: ''}"
						>
							{@html item.text}
						</div>
					{/if}
				{/each}
			{/if}
		</div>
	</div>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed bottom-[2rem] left-0 right-0 top-[2.75rem] md:bottom-[3.5rem] md:top-[3.75rem]">
	<div
		class="absolute h-full w-full touch-none"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onwheel={onWheel}
	>
		<div
			bind:this={scrollRoot}
			class="scrollbar-hide pointer-events-none h-full w-full flex-col gap-1 overflow-y-scroll"
		>
			<div class="h-svh"></div>
			{#if totalCards}
				{#each totalCards as card, i}
					{@render cardSnippet(i, card, card.format || regularFormat)}
				{/each}
			{/if}
			<div class="h-svh"></div>
		</div>
		<div class="absolute left-[5%] right-0 top-0 flex flex-row space-y-2">
			{#if data.player}
				<div class="rounded-b-xl bg-blue-600 px-4 py-2 font-semibold">
					{data.player.name}的{data.year}年度总结
				</div>
			{/if}
		</div>
		<div class="absolute bottom-0 left-0 right-0 flex flex-row space-y-2">
			<a
				href="/ddnet/yearly"
				class="rounded-tr bg-slate-600 px-4 py-2 text-white motion-translate-x-in-[-200%] motion-duration-1000 motion-delay-300 hover:bg-slate-700"
			>
				更换名字
			</a>
		</div>
	</div>
	{#if !totalCards}
		<div
			class="absolute z-20 flex h-full w-full items-center justify-center bg-slate-800 px-2"
			out:fade
			in:fade
		>
			<div
				class="relative w-96 overflow-hidden rounded-lg border border-slate-600 bg-slate-700 shadow-md transition-all duration-500"
				class:h-[18rem]={!data.player}
				class:h-[20.5rem]={data.player}
			>
				<div
					class="relative flex h-32 items-center justify-center overflow-hidden rounded-t-lg bg-cover bg-center"
					style="background-image: url(/assets/yearly/Back_in_Festivity.png)"
				>
					<div
						class="absolute h-[150%] w-16 translate-x-[-400%] rotate-12 bg-slate-200/10 motion-translate-x-loop-[800%] motion-duration-[5000ms]"
					></div>
					<div class="rounded-3xl bg-slate-700/40 px-8 py-4 text-xl font-bold backdrop-blur-lg">
						<div class="w-fit text-red-300 motion-scale-loop-[110%] motion-duration-2000">
							新年快乐！
						</div>
						欢迎来到{data.year}年度总结
					</div>
				</div>
				<div class="h-full max-h-[calc(100svh-20rem)] space-y-3 p-4">
					{#if data.player}
						{#if loadingProgress >= 0}
							<div
								class="flex h-[10rem] w-full flex-col items-center justify-center gap-4"
								out:fade
								in:fade
							>
								<div class="font-bold">{data.name}的{data.year}年度总结</div>
								<div class="flex flex-row items-center justify-center gap-2">
									<div>正在加载...</div>
									<div class="w-[3.5rem]text-center">{loadingProgress * 100}%</div>
								</div>
								<div class="h-5 w-full overflow-hidden rounded border border-sky-700 bg-sky-900">
									<div
										class="h-full rounded bg-sky-600"
										style="width: {loadingProgress * 100}%;"
									></div>
								</div>
							</div>
						{:else}
							{#key data.player.name}
								<div out:fade>
									<div
										class="flex flex-row items-center justify-center gap-8 motion-translate-x-in-[-200%] motion-rotate-in-12 motion-duration-1000 motion-delay-100"
									>
										<TeeRender
											className="relative h-20 w-20"
											name={data.skin?.n}
											body={data.skin?.b}
											feet={data.skin?.f}
											useDefault
											alwaysFetch
										/>
										<div class="flex flex-col">
											<div class="font-semibold text-slate-300">{data.player.name}</div>
											<div>目前分数：{data.player.points.points}pts</div>
											<div>分数排名：No.{data.player.points.rank}</div>
										</div>
									</div>
									<div class="flex flex-col space-y-2">
										<button
											class="text-nowrap rounded bg-blue-500 px-4 py-2 text-white motion-translate-x-in-[-200%] motion-duration-1000 motion-delay-200 hover:bg-blue-600"
											onclick={startProcess}
										>
											查看{data.name}的{data.year}年度总结
										</button>
									</div>
									<div class="absolute bottom-0 left-0 right-0 flex flex-row space-y-2">
										<a
											href="/ddnet/yearly"
											class="rounded-tr bg-slate-800 px-4 py-2 text-white motion-translate-x-in-[-200%] motion-duration-1000 motion-delay-300 hover:bg-slate-900"
										>
											更换名字
										</a>
									</div>
								</div>
							{/key}
						{/if}
					{:else}
						{#key 'entry'}
							<div class="flex flex-col space-y-2">
								<div class="text-sm text-slate-300">
									输入玩家名
									{#if data.error}
										<span class="text-red-500 motion-text-loop-red-400">
											{data.error}
										</span>
									{/if}
								</div>
								<input
									type="text"
									class="w-full rounded border border-slate-500 bg-slate-600 px-3 py-2 text-sm font-normal shadow-md md:flex-1"
									bind:value={gotoName}
									onkeydown={(ev) => {
										if (ev.key == 'Enter') {
											if (gotoName) goto(`/ddnet/yearly?name=${encodeAsciiURIComponent(gotoName)}`);
										}
									}}
								/>
							</div>
							<div class="flex flex-col space-y-2">
								<button
									class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:bg-blue-500 disabled:opacity-50"
									onclick={() => {
										if (gotoName) goto(`/ddnet/yearly?name=${encodeAsciiURIComponent(gotoName)}`);
									}}
								>
									查询
								</button>
							</div>
						{/key}
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
</style>
