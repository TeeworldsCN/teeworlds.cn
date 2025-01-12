<script lang="ts">
	import { onDestroy, onMount, type Snippet } from 'svelte';

	import { browser } from '$app/environment';
	import TeeRender from '$lib/components/TeeRender.svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { encodeAsciiURIComponent } from '$lib/link.js';
	import { fade } from 'svelte/transition';
	import { dateToChineseTime, escapeHTML, secondsToChineseTime, uaIsMobile } from '$lib/helpers';
	import { mapType } from '$lib/ddnet/helpers.js';
	import { source } from 'sveltekit-sse';
	import type { YearlyData } from './event/+server.js';
	import type { MapList } from '$lib/server/fetches/maps.js';
	import qrcode from 'qrcode';
	import { share } from '$lib/share.js';

	const { data } = $props();

	const timeout = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	const isMobile = $derived(() => uaIsMobile(data.ua));

	interface CardTextItem {
		type: 't';
		text: string;
		rotation?: number;
		x?: number;
		t?: number;
		b?: number;
	}

	interface CardBannerItem {
		type: 'b';
		bg: string;
		color?: string;
		text: string;
		rotation?: number;
		x?: number;
		t?: number;
		b?: number;
	}

	type CardItem = CardTextItem | CardBannerItem;

	interface CardData {
		titles?: { bg: string; color: string; text: string }[];
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
		leftTeeTop?: number;
		leftTeeSkin?: { n: string; b?: number; f?: number } | null;
		rightTeeTop?: number;
		rightTeeSkin?: { n: string; b?: number; f?: number } | null;
	}

	let totalCards = $state(null) as {
		cards: CardData[];
		titles: { bg: string; color: string; text: string }[];
	} | null;
	let cardReady = $state(false);
	let currentCard = $state(-1);
	let scrollRoot = $state(null) as HTMLDivElement | null;
	let showContent = $state(true);

	let referenceScrollTop = 0;
	let scrollVersion = 0;

	let error = $state(false);
	let shareableQRCode = $state('');

	const leftTeePose = {
		bodyRotation: 15,
		eyesRotation: -8,
		frontFootRotation: 69,
		backFootRotation: 50,
		eyesPosition: '-4%, 0%',
		frontFootPosition: '-17%, -1%',
		backFootPosition: '-7%, -4%'
	};
	const rightTeePose = {
		bodyRotation: -17,
		eyesRotation: 3,
		frontFootRotation: -35,
		backFootRotation: -74,
		eyesPosition: '-56%, -2%',
		frontFootPosition: '-5%, -11%',
		backFootPosition: '9%, 12%'
	};

	const ENDING_PHRASE = [
		'蛇年吉祥，愿你快乐如歌。',
		'祝福你新年快乐，无忧无虑。',
		'祝你新年快乐，蒸蒸日上。',
		'新的一年，愿美好与你常在。',
		'新年快乐，愿你蛇年幸福。',
		'蛇年平安，愿你的笑容更加灿烂。',
		'祈愿蛇年，事事顺心如意！',
		'新的一年，愿你幸福绽放。',
		'蛇年伊始，祝福伴你左右。',
		'在蛇年，愿你幸福环绕每一天。',
		'蛇年祥瑞，愿你梦想成真。',
		'新年新气象，愿蛇年充满惊喜。',
		'迎接蛇年，希望好运常伴。',
		'新年新气象，万事如意。',
		'新年愿你财运亨通，富足美满。',
		'祝新年吉祥，快乐常在身边。',
		'祝愿蛇年，团团圆圆，快乐常在。',
		'蛇年大展宏图，吉祥如意！',
		'新春蛇年，心情愉快每一天。',
		'祝你蛇年幸福安康，快乐常伴。',
		'蛇年如意，生活更有滋味。',
		'新春佳节，愿你蛇年大吉。',
		'新年快乐，蛇年幸福满满。',
		'新年到来，愿你心想事成。',
		'愿蛇年好运与你紧紧相随。',
		'祝新春快乐，事业步步高升。',
		'祝新年身体健康，心情愉悦。',
		'新春佳节，阖家欢乐安康。',
		'蛇年好运连连，快乐无限！',
		'新年快乐，愿烦恼烟消云散。',
		'新年新景象，幸福安康每一天。',
		'新的一年，祝你笑口常开。',
		'祝愿新年快乐，梦想成真。',
		'蛇年里，祝福你幸福无忧。',
		'愿好运伴随你一年四季。',
		'祝你蛇年如意安康，福星高照。',
		'在蛇年，愿你的生活精彩无比。',
		'新年伊始，愿你好运连连。',
		'在蛇年里，心想事成每一天！',
		'祝蛇年财源广进，事业辉煌。',
		'蛇年到了，愿你微笑每天。',
		'蛇年来临，愿你快乐无边！',
		'新年愿你幸福相伴，快乐无边。',
		'蛇年好运，事事顺心无阻。',
		'迎来蛇年，盼望步步高升。',
		'愿蛇年带给你无尽的欢欣。',
		'祝你新年喜悦不断，幸福久久。',
		'新的一年，愿你的生活多姿多彩。'
	];

	let endingPhrase = $state(Math.floor(Math.random() * ENDING_PHRASE.length));

	const easeInOut = (t: number) => {
		return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
	};

	const easeOut = (t: number) => {
		const t1 = t - 1;
		return t1 * t1 * t1 + 1;
	};

	const scorllToPos = (top: number, totalTime: number, easing = easeOut) => {
		// scroll card into the center of the screen
		if (overscrollAnimationTimer) {
			clearTimeout(overscrollAnimationTimer);
			overscrollAnimationTimer = null;
		}

		if (scrollRoot) {
			const targetTop = top;

			let start = Date.now();
			let end = start + totalTime;

			const _scrollRoot = scrollRoot;
			const startTop = _scrollRoot.scrollTop;

			scrollVersion++;
			const version = scrollVersion;
			const update = () => {
				if (version != scrollVersion) return;
				let time = Date.now();
				if (time < end) {
					const progress = easing((time - start) / (end - start));
					const currentTop = startTop + (targetTop - startTop) * progress;
					_scrollRoot.scrollTo({
						top: currentTop,
						behavior: 'instant'
					});
					referenceScrollTop = currentTop;
					requestAnimationFrame(update);
				} else {
					_scrollRoot.scrollTo({
						top: targetTop,
						behavior: 'instant'
					});
					referenceScrollTop = targetTop;
				}
			};
			update();
		}
	};

	const scrollToCard = (id: number, totalTime: number = 500, easing = easeOut) => {
		const card = document.querySelector(`#card-${id}`) as HTMLDivElement;
		if (scrollRoot && card) {
			const targetTop =
				card.offsetTop - scrollRoot.offsetTop - (scrollRoot.clientHeight - card.clientHeight) / 2;
			scorllToPos(targetTop, totalTime);
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

	let startAnimation = $state(true);
	let loadingProgress = $state(-1);

	let maps: MapList | null = null;

	const bgMap = (map: string) =>
		`/ddnet/yearly/map/${encodeURIComponent(map).replace(/\'/g, '%27')}`;

	const startProcess = async () => {
		const name = data.name;
		if (!name)
			return goto(`/ddnet/yearly`, {
				replaceState: true
			});

		let d: Partial<YearlyData> = {};

		const getMapper = (name: string) => maps?.find((map) => map.name == name)?.mapper || '不详';
		const mapHasBonus = (name: string) =>
			maps?.find((map) => map.name == name)?.tiles.includes('BONUS');

		loadingProgress = 0;
		try {
			if (!maps) {
				maps = await (await fetch('/ddnet/maps')).json();
			}
			loadingProgress = 0.01;

			const sseSource = source(
				`/ddnet/yearly/event?name=${encodeURIComponent(name)}&year=${data.year}`
			);

			sseSource.select('progress').subscribe((progress) => {
				if (!progress) return;
				loadingProgress = parseInt(progress) / 100;
			});

			const result = await new Promise<any>((resolve, reject) => {
				sseSource.select('data').subscribe((result) => {
					if (!result) return;
					const data = JSON.parse(result);
					resolve(data);
				});
				sseSource.select('error').subscribe((error) => {
					if (!error) return;
					reject(error);
				});
			});

			d = result.d;
		} catch (e) {
			error = true;
			console.error(e);
		}

		const cards: CardData[] = [];
		const allTitles: { bg: string; color: string; text: string }[] = [];

		if (d.x) {
			// REDACTED cards
			cards.push({
				content: [
					{ type: 't', text: `截至 [REDACTED] 岁末，你总共拥有 [REDACTED]pts<br>傲视群雄` },
					{
						type: 't',
						text: `你火力全开，<span class="font-semibold text-orange-400">斩获了</span>`
					},
					{ type: 'b', bg: '#fdd300', color: '#000', text: `[REDACTED]pts`, rotation: 4 },
					{
						type: 't',
						text: `不畏浮云遮望眼，只缘身在最高层。你凭借精湛的操作与技巧，成为了实力的代言人`
					}
				],
				background: '/assets/yearly/ssu.png',
				leftTeeTop: 5,
				leftTeeSkin: data.skin,
				mapper: 'Sunny Side Up - 作者: Ravie',
				format: redactedFormat
			});

			cards.push({
				t: d.x,
				format: redactedFormat2
			});
		}

		if (d.tp && d.lp != null && d.tp - d.lp > 0) {
			let firstWord;
			let enderLevel = 1;
			const titles: { bg: string; color: string; text: string }[] = [];
			if (d.tp >= 10000) {
				firstWord = '傲视群雄';
				titles.push({ bg: '#ffba08', color: '#000', text: '傲视群雄' });
				enderLevel = 3;
			} else if (d.tp >= 3000) {
				firstWord = '成绩赫然';
				enderLevel = 2;
			} else {
				firstWord = '令人欣慰';
				enderLevel = 1;
			}

			const delta = d.tp - d.lp;
			let verb;
			if (delta >= 5000) {
				verb = '你火力全开，<span class="font-semibold text-orange-400">斩获了</span>';
				enderLevel = Math.max(enderLevel, 3);
				titles.push({ bg: '#dc2f02', color: '#fff', text: '火力全开' });
			} else if (delta >= 1000) {
				verb = '你不留余力，<span class="font-semibold text-orange-400">收获了</span>';
				enderLevel = Math.max(enderLevel, 2);
			} else {
				verb = '你脚踏实地，<span class="font-semibold text-orange-400">得到了</span>';
				enderLevel = Math.max(enderLevel, 1);
			}

			let enderText = '';
			if (enderLevel == 3) {
				enderText = '不畏浮云遮望眼，只缘身在最高层。你凭借精湛的操作与技巧，成为了实力的代言人';
			} else if (enderLevel == 2) {
				enderText =
					'千淘万漉虽辛苦，吹尽狂沙始到金。你用行动证明了你的含金量，不畏艰险，亦不畏苦难';
			} else {
				enderText = '长风破浪会有时，直挂云帆济沧海。 相信接下来的你一定会更加出色';
			}

			// 今年分数
			allTitles.push(...titles);
			cards.push({
				titles,
				content: [
					{ type: 't', text: `截至 ${d.y} 岁末，你总共拥有 ${d.tp}pts<br>${firstWord}` },
					{
						type: 't',
						text: `${verb}`
					},
					{ type: 'b', bg: '#fdd300', color: '#000', text: `${d.tp - d.lp}pts`, rotation: 4 },
					{
						type: 't',
						text: `${enderText}`
					}
				],
				background: '/assets/yearly/ssu.png',
				leftTeeTop: 5,
				leftTeeSkin: data.skin,
				mapper: 'Sunny Side Up - 作者: Ravie'
			});
		} else if (d.tp != null) {
			// 今年分数
			if (d.tp == 0) {
				const titles = [{ bg: '#caffbf', color: '#000', text: '起跑者' }];
				allTitles.push(...titles);

				cards.push({
					titles,
					content: [
						{
							type: 't',
							text: `截至 ${data.year} 岁末，还没有获得任何pts`
						},
						{
							type: 't',
							text: `但是我们的记录显示你已经开始了您的旅程`
						},
						{
							type: 't',
							text: '欢迎你的到来！希望你会喜欢这个'
						},
						{
							type: 'b',
							bg: '#fdd300',
							color: '#000',
							text: `全新的起点`,
							rotation: -4
						}
					],
					background: '/assets/yearly/lf.png',
					mapper: 'Lavender Forest - 作者: Pipou'
				});
			} else {
				const titles = [{ bg: '#b7b7a4', color: '#000', text: '隐士' }];
				allTitles.push(...titles);
				cards.push({
					titles,
					content: [
						{
							type: 't',
							text: `截至 ${data.year} 岁末，你的总分为 ${d.tp}pts`
						},
						{
							type: 't',
							text: `与往年相比，你尚未获得任何新pts`
						},
						{
							type: 't',
							text: '难不成你是某位功成身退的游戏高手？<br>又或是因为生活琐事，无法自由地驰骋于关卡之间？<br>不管怎样，无论是游戏里还是游戏外，瓶颈期就像黎明前的黑暗，熬过了就能迎来曙光'
						},
						{
							type: 't',
							text: '希望你知道，此时此刻绝非终点，而是另一个'
						},
						{
							type: 'b',
							bg: '#fdd300',
							color: '#000',
							text: `全新的起点`,
							rotation: -4
						}
					],
					background: '/assets/yearly/lf.png',
					mapper: 'Lavender Forest - 作者: Pipou'
				});
			}
		}
		if (d.mpg) {
			// 分数成就
			const titles = [];
			if (d.mpg[1] >= 34) {
				titles.push({ bg: '#a8dadc', color: '#000', text: '登峰造极' });
				allTitles.push(...titles);
				cards.push({
					titles,
					content: [
						{
							type: 't',
							text: `在今年新通过的地图中<br>这张图足以成为你的<span class="font-semibold text-orange-400">生涯亮点</span>`
						},
						{
							type: 'b',
							bg: '#fdd300',
							color: '#000',
							text: `${escapeHTML(d.mpg[0])}`,
							rotation: -24,
							x: -50
						},
						{
							type: 't',
							text: `你因此拿下足足`,
							t: -3,
							b: -3,
							rotation: -24
						},
						{
							type: 'b',
							bg: '#fdd300',
							color: '#000',
							text: `${d.mpg[1]}pts`,
							rotation: -24,
							x: 50
						},
						{
							type: 't',
							text: `这意味着你已成功攻克了疯狂难度的地图`
						},
						{
							type: 't',
							text: `期望你不会止步不前<br>而是将步伐迈向更极限的远方`
						}
					],
					background: bgMap(d.mpg[0]),
					mapper: `${d.mpg[0]} - 作者: ${getMapper(d.mpg[0])}`
				});
			} else {
				if (d.mpg[1] >= 18) titles.push({ bg: '#f1faee', color: '#000', text: '渐入佳境' });
				allTitles.push(...titles);
				cards.push({
					titles,
					content: [
						{
							type: 't',
							text: `在今年新通过的地图中<br>这张图成为了你的<span class="font-semibold text-orange-400">高光时刻</span>`
						},
						{
							type: 'b',
							bg: '#fdd300',
							color: '#000',
							text: `${escapeHTML(d.mpg[0])}`,
							rotation: -24,
							x: -50
						},
						{
							type: 't',
							text: `你因通过这张地图获得了`,
							t: -3,
							b: -3,
							rotation: -24
						},
						{
							type: 'b',
							bg: '#fdd300',
							color: '#000',
							text: `${d.mpg[1]}pts`,
							rotation: -24,
							x: 50
						},
						{
							type: 't',
							text: `期待你今后继续披荆斩棘`
						},
						{
							type: 't',
							text: `在更高分数的地图中大放异彩`
						}
					],
					background: bgMap(d.mpg[0]),
					mapper: `${d.mpg[0]} - 作者: ${getMapper(d.mpg[0])}`
				});
			}
		}
		if (d.tr && d.mhr && d.mhr[1] > 0) {
			// 常玩时间

			const titles = [];
			if (d.mhr[0] == '清晨') {
				titles.push({ bg: '#2a9d8f', color: '#000', text: '早起鸟' });
			}

			if ((d.tr || 0) >= 10 && d.mhr[1] / d.tr >= 0.5) {
				titles.push({ bg: '#e5989b', color: '#000', text: '定时打卡' });
			}

			let bg;
			switch (d.mhr[0]) {
				case '清晨':
				case '上午':
					bg = {
						background: '/assets/yearly/s.png',
						mapper: 'Spoon - 作者: Ravie'
					};
					break;
				case '下午':
				case '傍晚':
					bg = {
						background: '/assets/yearly/w.png',
						mapper: 'willow - 作者: louis'
					};
					break;
				default:
					bg = {
						background: '/assets/yearly/sp.png',
						mapper: 'Starlit Peaks - 作者: ♂S1mple♂'
					};
			}

			allTitles.push(...titles);
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: `今年你活力满满，战果颇丰<br>总共顺利<span class="font-semibold text-orange-400">冲过了终点</span>`
					},
					{
						type: 'b',
						text: `${d.tr} 次`,
						bg: '#fdd300',
						color: '#000',
						rotation: -4
					},
					{
						type: 't',
						text: `在这其中<br>有 <span class="text-orange-400">${d.mhr[1]} 次</span>冲线，都是在`,
						x: -30
					},
					{
						type: 'b',
						text: `${d.mhr[0]}`,
						bg: '#fdd300',
						color: '#000',
						rotation: 4,
						x: 125,
						t: -18,
						b: 3
					},
					{
						type: 't',
						text: '这个时间段对你来说有更加特殊的意义吗？'
					},
					{
						type: 't',
						text: '无论如何，希望你今后继续以饱满的热情，在更多地图中创造更多的奇迹'
					}
				],
				...bg
			});
		}
		if (d.mmr && d.mmr[3] > 0) {
			let word;
			let bg;
			if (d.mmr[0] == 1) {
				word = '傲雪凌霜';
				bg = {
					background: '/assets/yearly/bif.png',
					mapper: 'Back in Festivity - 作者: Silex & Pipou'
				};
			} else if (d.mmr[0] == 4) {
				word = '满面春风';
				bg = {
					background: '/assets/yearly/p2.png',
					mapper: 'powerless2 - 作者: spiritdote'
				};
			} else if (d.mmr[0] == 7) {
				word = '骄阳似火';
				bg = {
					background: '/assets/yearly/h2.png',
					mapper: 'Holidays 2 - 作者: Destoros'
				};
			} else if (d.mmr[0] == 10) {
				word = '硕果累累';
				bg = {
					background: '/assets/yearly/lt.png',
					mapper: 'Lonely Travel - 作者: QuiX'
				};
			}

			const titles = [];
			if (d.tr && d.tr >= 10 && d.mmr[3] / d.tr >= 0.5) {
				titles.push({ bg: '#e07a5f', color: '#000', text: '集中特训' });
			}

			allTitles.push(...titles);

			// 常来季度
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: `你与季节似乎有着一种奇怪的默契<br>你<span class="font-semibold text-orange-400">最常出没的季节是</span>`
					},
					{ type: 'b', bg: '#fdd300', color: '#000', text: `${d.mmr[2]}`, rotation: 5 },
					{
						type: 't',
						text: `在 <span class="text-orange-400">${d.mmr[0]} 月至 ${d.mmr[1]} 月</span>期间<br>你潇洒地通过了 <span class="text-orange-400">${d.mmr[3]} 次</span>终点<br>不留遗憾`
					},
					{
						type: 't',
						text: `不知你是否能怀念当时${word}的自己？`
					}
				],
				...bg
			});
		}
		if (d.lnf) {
			// 夜猫子
			const dateTime = new Date(d.lnf[2]);
			const titles = [];

			if (dateTime.getHours() >= 2 || d.lnf[1] >= 2 * 60 * 60) {
				titles.push({ bg: '#14213d', color: '#fff', text: '夜猫子' });
			}

			allTitles.push(...titles);
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: `有这么一个特殊的时刻<br>在 <span class="font-semibold text-orange-400">${dateTime.getMonth() + 1}月${dateTime.getDate()}日</span>`
					},
					{
						type: 't',
						text: `你耗时${secondsToChineseTime(d.lnf[1], true, true)}完成了 <span class="font-semibold text-orange-400">${escapeHTML(d.lnf[0])}</span><br>在你过终点时已是`
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `深夜${dateToChineseTime(dateTime)}`,
						rotation: -4
					},
					{
						type: 't',
						text: '周围万籁俱寂，而你却热血沸腾。你凭借着自己的专注与毅力，攻克了那最后一道难关'
					},
					{
						type: 't',
						text: '你还能回忆起当时拼搏的自己吗'
					}
				],
				background: bgMap(d.lnf[0]),
				mapper: `${d.lnf[0]} - 作者: ${getMapper(d.lnf[0])}`
			});
		}
		if (d.ymf && d.ymfs && d.ymf[1] > 0) {
			// 新潮追随者
			const titles = [];
			if (d.ymf[1] >= 80) {
				titles.push({ bg: '#a0c4ff', color: '#000', text: '新潮追随者' });
			} else if (d.ymf[1] >= 60) {
				titles.push({ bg: '#caffbf', color: '#000', text: '潮流前沿' });
			} else if (d.ymf[1] >= 40) {
				titles.push({ bg: '#ffd6a5', color: '#000', text: '宝藏猎人' });
			}
			allTitles.push(...titles);
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: `在今年新发布的 <span class="text-orange-400">${d.ymf[0]} 张</span>充满挑战的地图中<br>你成功完成了 <span class="font-semibold text-orange-400">${d.ymf[1]} 张</span><br>如此算下来，你一共完成今年新图的`
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${Math.round((d.ymf[1] / d.ymf[0]) * 100)}%`,
						rotation: -4
					},
					{
						type: 't',
						text: `在这些地图中，你尤其钟爱 <span class="text-orange-400 font-semibold">${mapType(d.ymfs[0])}</span> 类型的地图<br>总共完成了<span class="text-orange-400">${d.ymfs[2]}/${d.ymfs[1]} 张</span>`
					}
				],
				background: '/assets/yearly/p9.png',
				mapper: 'Planet 9 - 作者: Silex'
			});
		}
		if (d.nrr && d.nrr[1] < 24 * 60 * 60) {
			// 离发布最近完成
			const titles = [];
			if (d.nrr[1] < 2 * 60 * 60) {
				titles.push({ bg: '#3f37c9', color: '#fff', text: '猎鹰' });
			}
			allTitles.push(...titles);
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: `距离 ${escapeHTML(d.nrr[0])} 发布仅`
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${secondsToChineseTime(d.nrr[1], true, true)}`,
						rotation: -4
					},
					{
						type: 't',
						text: `你就完成了地图，创下了记录<br>${d.nrr[1] >= 12 * 60 * 60 ? '成为了举世无双的存在' : '成为了万众瞩目的焦点'}`
					},
					{
						type: 't',
						text: `${d.nrr[1] >= 12 * 60 * 60 ? '雄鹰的眼眸都无法捕捉到你冲向终点的身影' : '猎豹的直觉都无法感知到你冲向终点的意向'}`
					}
				],
				background: bgMap(d.nrr[0]),
				mapper: `${d.nrr[0]} - 作者: ${getMapper(d.nrr[0])}`
			});
		}
		if (d.mps && d.mps[1] > 0) {
			const titles = [];
			const type = d.mps[0].toLowerCase();
			let bg;

			if (type == 'novice') {
				bg = {
					background: '/assets/yearly/t.png',
					mapper: 'Teeasy - 作者: Tridemy & Cøke'
				};
			} else if (type == 'moderate') {
				bg = {
					background: '/assets/yearly/cs.png',
					mapper: 'Cyber Space - 作者: Kaniosek'
				};
			} else if (type == 'brutal') {
				bg = {
					background: '/assets/yearly/gt.png',
					mapper: 'GalacTees - 作者: Kaniosek'
				};
			} else if (type == 'insane') {
				bg = {
					background: '/assets/yearly/c.png',
					mapper: 'Catharsis - 作者: Doshik'
				};
			} else if (type == 'dummy') {
				bg = {
					background: '/assets/yearly/q.png',
					mapper: 'quon - 作者: yo bitch'
				};
			} else if (type == 'solo') {
				bg = {
					background: '/assets/yearly/a.png',
					mapper: 'Amethyst - 作者: ♂S1mple♂'
				};
			} else if (type.startsWith('ddmax')) {
				bg = {
					background: '/assets/yearly/nj.png',
					mapper: 'Night Jungle - 作者: JeanneDark & Knight :3'
				};
			} else if (type == 'oldschool') {
				bg = {
					background: '/assets/yearly/sr.png',
					mapper: 'Sunrise - 作者: geroy231 & Father'
				};
			} else if (type == 'race') {
				bg = {
					background: '/assets/yearly/g.png',
					mapper: 'Grenadium - 作者: texnonik'
				};
			} else {
				bg = {
					background: '/assets/yearly/qd.png',
					mapper: 'Quickdraw - 作者: FJP'
				};
			}

			if (d.mps[1] >= 20) {
				if (type == 'novice') {
					titles.push({ bg: '#10002b', color: '#fff', text: '锤锤打打' });
				} else if (type == 'moderate') {
					titles.push({ bg: '#240046', color: '#fff', text: '循序渐进' });
				} else if (type == 'brutal') {
					titles.push({ bg: '#3c096c', color: '#fff', text: '专业玩家' });
				} else if (type == 'insane') {
					titles.push({ bg: '#5a189a', color: '#fff', text: 'P.R.O' });
				} else if (type == 'dummy') {
					titles.push({ bg: '#6f1d1b', color: '#fff', text: '左脚踩右脚' });
				} else if (type == 'solo') {
					titles.push({ bg: '#bb9457', color: '#000', text: '唯我独尊' });
				} else if (type.startsWith('ddmax')) {
					titles.push({ bg: '#432818', color: '#fff', text: '经典永传' });
				} else if (type == 'oldschool') {
					titles.push({ bg: '#99582a', color: '#000', text: '传统至上' });
				} else if (type == 'race') {
					titles.push({ bg: '#ffe6a7', color: '#000', text: '奥运健将' });
				}
			}

			if (d.mps[1] >= 10 && type == 'fun') {
				titles.push({ bg: '#ffbf69', color: '#000', text: 'TRUE PLAYER' });
			}

			allTitles.push(...titles);
			if (type == 'fun') {
				cards.push({
					titles,
					content: [
						{
							type: 't',
							text: `你今年最常体验的地图类型是`
						},
						{
							type: 'b',
							bg: '#fdd300',
							color: '#000',
							text: `${mapType(d.mps[0])}`,
							rotation: 4
						},
						{
							type: 't',
							text: `你似乎发掘了 DDNet 的真正玩法`
						}
					],
					...bg
				});
			} else {
				cards.push({
					titles,
					content: [
						{
							type: 't',
							text: `你今年最常体验的地图类型是`
						},
						{
							type: 'b',
							bg: '#fdd300',
							color: '#000',
							text: `${mapType(d.mps[0])}`,
							rotation: 4
						},
						{
							type: 't',
							text: `你在${mapType(d.mps[0])}图中过了 <span class="font-semibold text-orange-400">${d.mps[1]} 次</span>终点`
						}
					],
					...bg
				});
			}
		}
		if (d.mfm && d.mfm[1] > 1) {
			// 通过最多的地图
			const map = d.mfm[0];

			const titles = [];
			if (map.startsWith('Kobra')) {
				titles.push({ bg: '#e0e1dd', color: '#000', text: '好孩子不玩蛇' });
			} else if (map == 'LearnToPlay') {
				titles.push({ bg: '#3d5a80', color: '#fff', text: '元老级萌新' });
			} else if (map == 'Sunny Side Up') {
				titles.push({ bg: '#ffc300', color: '#000', text: '旭日永存' });
			} else if (map == 'Tutorial') {
				titles.push({ bg: '#a7c957', color: '#000', text: '入门踩断门槛' });
			} else if (map == 'Epix') {
				titles.push({ bg: '#89c2d9', color: '#000', text: '狭路相逢' });
			} else if (map == 'Linear') {
				titles.push({ bg: '#e9edc9', color: '#000', text: '一人的天空' });
			}

			allTitles.push(...titles);
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: `你今年过关次数最多的地图是`
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${escapeHTML(d.mfm[0])}`,
						rotation: -3
					},
					{
						type: 't',
						text: `你在这张地图里共计冲线了 <span class="font-semibold text-orange-400">${d.mfm[1]} 次</span><br>这张地图对你来说一定有着特别的意义`
					}
				],
				background: bgMap(d.mfm[0]),
				mapper: `${d.mfm[0]} - 作者: ${getMapper(d.mfm[0])}`
			});
		}
		if (d.lf && d.lf[1] > 1) {
			// 最慢的记录
			const isBonusMap = mapHasBonus(d.lf[0]);
			const dateTime = new Date(d.lf[2]);
			const titles = [];
			if (d.lf[1] >= 12 * 60 * 60) {
				if (isBonusMap) {
					titles.push({ bg: '#f28482', color: '#000', text: '时间魔术师' });
				} else {
					titles.push({ bg: '#c8b6ff', color: '#000', text: '挂机狂魔' });
				}
			} else if (d.lf[1] >= 4 * 60 * 60) {
				titles.push({ bg: '#ffd6ff', color: '#000', text: '坚韧不拔' });
			}
			allTitles.push(...titles);

			if (isBonusMap) {
				cards.push({
					titles,
					content: [
						{
							type: 't',
							text: `今年<span class="text-orange-400 font-semibold">${dateTime.getMonth() + 1}月${dateTime.getDate()}日</span>，你用时`
						},
						{
							type: 'b',
							bg: '#fdd300',
							color: '#000',
							text: `${secondsToChineseTime(d.lf[1], true, true)}`,
							rotation: -4
						},
						{
							type: 't',
							text: `完成了 <span class="font-semibold text-orange-400">${d.lf[0]}</span>`
						},
						{
							type: 't',
							text: '这是你今年达成的<span class="font-semibold text-orange-400">最慢的通关记录</span><br>你坚韧不拔的优秀品质支撑你通过了终点'
						},
						{
							type: 't',
							text: '又或者说',
							t: -2,
							b: -2
						},
						{
							type: 't',
							text: isBonusMap ? '是某种神秘的时间魔法在作祟？' : '这仅仅是你某种奇特的兴趣爱好？'
						}
					],
					background: bgMap(d.lf[0]),
					mapper: `${d.lf[0]} - 作者: ${getMapper(d.lf[0])}`
				});
			}
		}
		if (d.mpt && d.mpt[0]) {
			// 最常玩队友
			const titles = [];
			if (d.mpt[0][1] >= 100) {
				titles.push({ bg: '#2ec4b6', color: '#000', text: '所向披靡' });
			} else if (d.mpt[0][1] >= 50) {
				titles.push({ bg: '#00509d', color: '#fff', text: '亲密无间' });
			} else if (d.mpt[0][1] >= 20) {
				titles.push({ bg: '#00296b', color: '#fff', text: '情同手足' });
			}
			allTitles.push(...titles);
			if (d.mpt[1]) {
				let leftTeeSkin = null;
				let rightTeeSkin = null;
				try {
					leftTeeSkin = await (
						await fetch(
							`/ddnet/playerskin?name=${encodeURIComponent(d.mpt[0][0])}&region=${encodeURIComponent('as:cn')}&fallback=true`
						)
					).json();
					rightTeeSkin = await (
						await fetch(
							`/ddnet/playerskin?name=${encodeURIComponent(d.mpt[1][0])}&region=${encodeURIComponent('as:cn')}&fallback=true`
						)
					).json();
				} catch {}

				cards.push({
					titles,
					content: [
						{
							type: 't',
							text: `合作游戏中，当属伙伴最为重要`
						},
						{
							type: 'b',
							bg: '#fdd300',
							color: '#000',
							text: `${escapeHTML(d.mpt[0][0])}`,
							rotation: -4
						},
						{
							type: 't',
							text: `是你的最佳拍档<br>你们一起总共获得了 <span class="font-semibold text-orange-400">${d.mpt[0][1]} 次</span>团队记录<br>合作的璀璨成果在你们心间熠熠生辉`
						},
						{
							type: 't',
							text: `另外，你还与`
						},
						{
							type: 'b',
							bg: '#fdd300',
							color: '#000',
							text: `${escapeHTML(d.mpt[1][0])}`,
							rotation: 4
						},
						{
							type: 't',
							text: `一起获得了 <span class="font-semibold text-orange-400">${d.mpt[1][1]} 次</span>团队记录，仅次于上一位搭档`
						},
						{
							type: 't',
							text: `珍惜来之不易的友谊<br>期待今后你能够继续谱写出合作的新篇章`
						}
					],
					leftTeeSkin,
					leftTeeTop: 8,
					rightTeeSkin,
					rightTeeTop: 55,
					background: '/assets/yearly/wx.png',
					mapper: 'weixun - 作者: pinfandsj'
				});
			} else {
				let rightTeeSkin = null;
				try {
					rightTeeSkin = await (
						await fetch(
							`/ddnet/playerskin?name=${encodeURIComponent(d.mpt[0][0])}&region=${encodeURIComponent('as:cn')}&fallback=true`
						)
					).json();
				} catch {}
				cards.push({
					titles,
					content: [
						{
							type: 't',
							text: `合作游戏中，当属伙伴最为重要`
						},
						{
							type: 'b',
							bg: '#fdd300',
							color: '#000',
							text: `${escapeHTML(d.mpt[0][0])}`,
							rotation: -4
						},
						{
							type: 't',
							text: `是你的最佳拍档<br>你们一起总共获得了 <span class="font-semibold text-orange-400">${d.mpt[0][1]} 次</span>团队记录<br>合作的璀璨成果在你们心间熠熠生辉`
						},
						{
							type: 't',
							text: `珍惜来之不易的友谊<br>期待今后你能够继续谱写出合作的新篇章`
						}
					],
					background: '/assets/yearly/wx.png',
					mapper: 'weixun - 作者: pinfandsj',
					rightTeeSkin,
					rightTeeTop: 20
				});
			}
		}
		if (d.bt && d.bt[0] > 4) {
			// 最大团队
			const titles = [];
			if (d.bt[0] >= 8) {
				titles.push({ bg: '#bee9e8', color: '#000', text: 'Tee军团' });
			}
			allTitles.push(...titles);
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: `众人拾柴火焰高<br>你和另外 ${d.bt[0] - 1} 名玩家组成了`
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${d.bt[0]}人团队`,
						rotation: -4
					},
					{
						type: 't',
						text: `共同完成了 <span class="font-semibold text-orange-400">${d.bt[1]}</span>`
					},
					{
						type: 't',
						text: `团队成员分别有：${escapeHTML(d.bt[2])}`
					},
					{
						type: 't',
						text: `相信回味这段经历时<br>你会再次体验到团队的成就感`
					}
				],
				background: bgMap(d.bt[1]),
				mapper: `${d.bt[1]} - 作者: ${getMapper(d.bt[1])}`
			});
		}
		if (d.map && d.map.length > 0) {
			// 地图作者
			const titles = [{ bg: '#333533', color: '#fff', text: '制图达人' }];
			allTitles.push(...titles);
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: `今年你一共参与发布了地图`
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${d.map.length} 张`,
						rotation: -4
					},
					{
						type: 't',
						text: `${d.map.length > 1 ? '分别是：' : ''}${escapeHTML(d.map.join(', '))}`
					},
					{
						type: 't',
						text: `诚挚地感谢你对 DDNet 社区做出的贡献`
					}
				],
				background: bgMap(d.map[0]),
				mapper: `${d.map[0]} - 作者: ${getMapper(d.map[0])}`
			});
		}

		if (d.y) {
			// 新年快乐
			cards.push({
				content: [
					{
						type: 'b',
						bg: '#A00F2A',
						color: '#fff',
						text: `${d.y + 1}加油！`,
						rotation: 0
					}
				],
				t: 80,
				l: 50,
				b: 5,
				r: 5,
				format: noBlurRegularFormat,
				background: '/assets/yearly/year.png'
			});
		}

		// 分享
		if (!d.x) {
			cards.push({
				format: shareFormat,
				background: '/assets/yearly/end.png'
			});
		}

		if (allTitles.length == 0) {
			allTitles.push({ bg: '#8338ec', color: '#fff', text: '深藏功与名' });
		}

		const url = new URL(window.location.href);
		url.searchParams.set('name', data.name);
		url.searchParams.set('year', data.year.toString());

		shareableQRCode = await qrcode.toDataURL(url.toString());

		totalCards = {
			cards,
			titles: allTitles
		};
		await timeout(700);
		cardReady = true;
		await timeout(500);
		scrollToCard(0, 2000, easeInOut);
		await timeout(2000);

		showContent = true;
		currentCard = 0;
		startAnimation = false;
	};

	afterNavigate(() => {
		// make sure we clear the data after navigation, so we prompt the user to generate the page again

		totalCards = null;
		error = false;
		cardReady = false;
		startAnimation = true;
		loadingProgress = -1;
		currentCard = -1;

		if (observer) {
			observer.disconnect();
			observer = null;
		}

		endingPhrase = Math.floor(Math.random() * ENDING_PHRASE.length);

		if (data.name) {
			share({
				icon: `${window.location.origin}/shareicon.png`,
				link: window.location.href,
				title: 'DDNet 年度总结 - TeeworldsCN',
				desc: `${data.name}的${data.year}年度总结`
			});
		} else {
			share({
				icon: `${window.location.origin}/shareicon.png`,
				link: window.location.href,
				title: 'DDNet 年度总结 - TeeworldsCN',
				desc: '快来查看你的年度总结吧！'
			});
		}
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
		showContent = true;
		if (delta < 0) {
			if (currentCard >= (totalCards?.cards?.length || 0) - 1) {
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
			endingPhrase = Math.floor(Math.random() * ENDING_PHRASE.length);
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

	let observer: IntersectionObserver | null = null;

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

		if (!observer) {
			observer = new IntersectionObserver((entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						(entry.target as HTMLDivElement).style.visibility = 'visible';
					} else {
						(entry.target as HTMLDivElement).style.visibility = 'hidden';
					}
				}
			});
		}

		const cards = document.querySelectorAll('.card');
		for (const card of cards) {
			observer.observe(card);
		}
	});

	let gotoName = $state('');

	let redacted = $state(null) as HTMLSpanElement | null;
	let redactedTimer = null as Timer | null;

	$effect(() => {
		if (redactedTimer) {
			clearInterval(redactedTimer);
			redactedTimer = null;
		}

		if (redacted) {
			const el = redacted;
			const updater = () => {
				const time = parseInt(el.textContent || '0');
				const delta = time - Math.round(Date.now() / 1000);
				if (el.nextSibling) el.nextSibling.textContent = delta > 0 ? delta.toString() : 'SOON';
			};
			redactedTimer = setInterval(updater, 500);
		}
	});

	let originalMeta: HTMLMetaElement | null = null;

	onMount(() => {
		// Replace meta to prevent scaling
		originalMeta = document.querySelector('meta[name="viewport"]');
		if (originalMeta) {
			originalMeta.remove();
		}
		document.head.insertAdjacentHTML(
			'beforeend',
			`<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0" />`
		);
	});

	onDestroy(() => {
		if (redactedTimer) {
			clearInterval(redactedTimer);
			redactedTimer = null;
		}
		if (browser) {
		}

		// Restore meta
		if (originalMeta) {
			const currentMeta = document.querySelector('meta[name="viewport"]');
			if (currentMeta) {
				currentMeta.remove();
			}
			document.head.appendChild(originalMeta);
		}
	});
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
		class:motion-opacity-in-50={id == currentCard}
		class:motion-opacity-out-50={id != currentCard}
		class:z-10={id == currentCard}
	>
		{#if card.mapper}
			<div
				class="motion-duration-250 absolute mt-[-10%] flex h-[10%] w-[75%] flex-col items-center justify-center overflow-hidden rounded-t-xl bg-teal-900 text-[0.5em] transition-transform"
				class:motion-translate-y-in-[100%]={id == currentCard}
				class:motion-translate-y-out-[100%]={id != currentCard}
				class:motion-delay-500={id == currentCard}
				class:translate-y-[50%]={showContent}
				class:ml-[20%]={id % 3 == 0}
				class:ml-[5%]={id % 3 == 1}
				class:ml-[13%]={id % 3 == 2}
			>
				<div class="px-[4%] transition-transform" class:translate-y-[-30%]={showContent}>
					{card.mapper}
				</div>
			</div>
		{/if}
		<div
			class="absolute h-full w-full overflow-hidden rounded-3xl bg-white shadow-2xl shadow-black"
		>
			<div
				class="absolute h-full w-full bg-cover bg-center"
				style="background-image: url({card.background})"
			>
				{@render format(id, card)}
			</div>
		</div>
		{#if card.titles}
			<div
				class="absolute bottom-[-5%] left-[5%] right-[5%] flex flex-row flex-nowrap text-[0.6em]"
			>
				{#each card.titles as title, i}
					<div
						class="m-[1%] text-nowrap rounded-3xl border border-white/50 px-[4%] py-[1%] text-center font-semibold"
						style="background-color: {title.bg};{title.color ? `color: ${title.color};` : ''}"
						class:motion-delay-1000={i == 0}
						class:motion-delay-1500={i == 1}
						class:motion-delay-2000={i == 2}
						class:motion-preset-shrink={showContent && id == currentCard}
						class:opacity-0={!showContent || id != currentCard}
					>
						{title.text}
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

{#snippet regularFormat(id: number, card: CardData)}
	<div
		class="flex h-full w-full items-center justify-center text-[0.8em] transition-[backdrop-filter] motion-delay-700"
		class:motion-opacity-in-0={id == currentCard}
		class:motion-opacity-out-0={id != currentCard}
		class:backdrop-blur-sm={showContent}
		class:backdrop-brightness-75={showContent}
		class:backdrop-saturate-50={showContent}
	>
		<div
			class="absolute flex flex-col items-center justify-center gap-[3%] transition-opacity"
			class:opacity-0={!showContent}
			style="left: {card.l ?? 5}%; top: {card.t ?? 5}%; right: {card.r ?? 5}%; bottom: {card.b ??
				5}%;"
		>
			{#if card.leftTeeSkin}
				<div
					class="absolute left-[-12.5%] h-[20%] w-[20%] motion-duration-500 motion-delay-700"
					style="top: {card.leftTeeTop ?? 0}%"
					class:motion-translate-x-in-[-50%]={showContent && id == currentCard}
					class:motion-translate-x-out-[-50%]={!showContent && id != currentCard}
					class:motion-rotate-in-[-12deg]={showContent && id == currentCard}
					class:motion-rotate-out-[-12deg]={!showContent && id != currentCard}
				>
					<TeeRender
						name={card.leftTeeSkin.n}
						body={card.leftTeeSkin.b}
						feet={card.leftTeeSkin.f}
						className="h-full w-full"
						useDefault
						alwaysFetch
						pose={leftTeePose}
					/>
				</div>
			{/if}
			{#if card.rightTeeSkin}
				<div
					class="absolute right-[-12.5%] h-[20%] w-[20%] motion-duration-500 motion-delay-700"
					style="top: {card.rightTeeTop ?? 0}%"
					class:motion-translate-x-in-[50%]={showContent && id == currentCard}
					class:motion-translate-x-out-[50%]={!showContent && id != currentCard}
					class:motion-rotate-in-[12deg]={showContent && id == currentCard}
					class:motion-rotate-out-[12deg]={!showContent && id != currentCard}
				>
					<TeeRender
						name={card.rightTeeSkin.n}
						body={card.rightTeeSkin.b}
						feet={card.rightTeeSkin.f}
						className="h-full w-full"
						useDefault
						alwaysFetch
						pose={rightTeePose}
					/>
				</div>
			{/if}
			{#if card.content}
				{#each card.content as item}
					{#if item.type == 't'}
						<div
							class="rounded-xl bg-slate-700/90 px-[4%] py-[1%] text-center text-[0.7em]"
							style="transform: rotate({item.rotation ?? 0}deg) translate({item.x ??
								0}%);margin-top: {item.t ?? 0}%;margin-bottom: {item.b ?? 0}%;"
						>
							{@html item.text}
						</div>
					{:else if item.type == 'b'}
						<div
							class="rounded px-[4.5%] py-[1.5%] text-center font-semibold"
							style="transform: rotate({item.rotation ?? 0}deg) translate({item.x ??
								0}%);background-color: {item.bg};margin-top: {item.t ??
								0}%;margin-bottom: {item.b ?? 0}%;{item.color ? `color: ${item.color};` : ''}"
						>
							{@html item.text}
						</div>
					{/if}
				{/each}
			{/if}
		</div>
	</div>
{/snippet}

{#snippet noBlurRegularFormat(id: number, card: CardData)}
	<div
		class="flex h-full w-full items-center justify-center text-[0.8em] motion-delay-700"
		class:motion-opacity-in-0={id == currentCard}
		class:motion-opacity-out-0={id != currentCard}
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

{#snippet redactedFormat(id: number, card: CardData)}
	<div class="relative h-full w-full">
		{@render regularFormat(id, card)}
		<div
			class="absolute top-[47.5%] h-[5%] w-[150%] rotate-[-49deg] bg-contain bg-repeat-x"
			style="background-image: url(/assets/yearly/chain.png)"
		></div>
		<div
			class="absolute top-[47.5%] h-[5%] w-[150%] rotate-[49deg] bg-contain bg-repeat-x"
			style="background-image: url(/assets/yearly/chain.png)"
		></div>
		<div
			class="absolute top-[47.5%] h-[5%] w-[200%] translate-x-[-50%] rotate-[-32deg] bg-contain bg-repeat-x"
			style="background-image: url(/assets/yearly/chain.png)"
		></div>
	</div>
{/snippet}

{#snippet redactedFormat2(id: number, card: CardData)}
	<div class="relative h-full w-full">
		<div
			class="flex h-full w-full items-center justify-center text-[1.5em] font-bold text-orange-600"
		>
			<span class="hidden text-white" bind:this={redacted}>{card.t}</span>
			<span></span>
		</div>
		<div
			class="absolute top-[47.5%] h-[5%] w-[150%] rotate-[49deg] bg-contain bg-repeat-x"
			style="background-image: url(/assets/yearly/chain.png)"
		></div>
		<div
			class="absolute top-[47.5%] h-[5%] w-[150%] translate-x-[-25%] translate-y-[-200%] rotate-[-24deg] bg-contain bg-repeat-x"
			style="background-image: url(/assets/yearly/chain.png)"
		></div>
	</div>
{/snippet}

{#snippet shareFormat(id: number, card: CardData)}
	<div class="flex h-full w-full items-center justify-center text-[0.6em]">
		<div
			class="absolute bottom-[2%] left-[2%] right-[2%] top-[2%] flex flex-col items-center justify-center gap-[3%]"
		>
			<div
				class="absolute bottom-[35%] left-0 right-0 top-0 flex flex-grow items-center justify-center rounded-xl border-[0.25em] border-sky-200/60 bg-sky-100/90 pt-[7%]"
			>
				<div class="flex w-full flex-row flex-wrap items-center justify-center">
					{#if totalCards?.titles}
						{#each totalCards.titles as title}
							<span
								class="m-[1%] text-nowrap rounded-3xl border border-black/50 px-[4%] py-[1%] text-center font-semibold"
								style="background-color: {title.bg};{title.color ? `color: ${title.color};` : ''}"
							>
								{title.text}
							</span>
						{/each}
					{/if}
				</div>
			</div>
			<div class="absolute top-[1%] font-semibold text-black">{data.name}的{data.year}年度称号</div>
			<div
				class="absolute left-[-9%] top-[70%] h-[20%] w-[20%] motion-duration-500 motion-delay-700"
				class:motion-translate-x-in-[-70%]={id == currentCard}
				class:motion-translate-x-out-[-70%]={id != currentCard}
				class:motion-rotate-in-[-12deg]={id == currentCard}
				class:motion-rotate-out-[-12deg]={id != currentCard}
			>
				<TeeRender
					name={data.skin?.n}
					body={data.skin?.b}
					feet={data.skin?.f}
					className="h-full w-full"
					useDefault
					alwaysFetch
					pose={leftTeePose}
				/>s
			</div>
			<div
				class="absolute bottom-[9%] left-[7%] flex h-[25%] w-[65%] flex-row items-center justify-center motion-duration-500 motion-delay-1500"
				class:motion-opacity-in-0={id == currentCard}
			>
				<div class="rounded-lg bg-red-700/80 px-[3%] py-[2%] text-center text-[0.9em] text-white">
					{ENDING_PHRASE[endingPhrase]}
				</div>
			</div>
			<div class="absolute bottom-[7.5%] right-[5%] flex h-[25%] w-[25%]">
				<div
					class="h-full w-full rounded-lg bg-white bg-cover bg-center"
					style="background-image: url({shareableQRCode});"
				></div>
			</div>
			<div class="absolute bottom-0 h-[5%] rounded bg-white/90 px-[3%] text-[0.85em] text-black">
				截图分享，长按二维码识别，查看 DDNet 年度总结
			</div>
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
				{#each totalCards.cards as card, i}
					{@render cardSnippet(i, card, card.format || regularFormat)}
				{/each}
			{/if}
			<div class="h-svh"></div>
		</div>
		<div class="absolute left-[5%] right-0 top-0 z-20 flex flex-row space-y-2">
			{#if data.player}
				<div class="rounded-b-xl bg-blue-600 px-4 py-2 font-semibold">
					{data.player.name}的{data.year}年度总结
				</div>
			{/if}
		</div>
		<div class="absolute bottom-0 left-0 right-0 z-20 flex flex-row space-y-2">
			<a
				data-sveltekit-replacestate
				href="/ddnet/yearly"
				class="rounded-tr bg-slate-600 px-4 py-2 text-white motion-translate-x-in-[-200%] motion-duration-1000 motion-delay-300 hover:bg-slate-700"
			>
				更换名字
			</a>
		</div>
		{#if currentCard == 0 && !startAnimation}
			<div
				class="absolute bottom-[5%] left-0 right-0 z-20 flex items-center justify-center text-[7svw] sm:text-[4svh]"
				out:fade
				in:fade
			>
				<div class="motion-preset-oscillate text-[0.7em]">
					↓{isMobile() ? '滑动' : '滚动'}以继续↓
				</div>
			</div>
		{/if}
	</div>
	{#if !totalCards || !cardReady || error}
		<div
			class="absolute z-50 flex h-full w-full items-center justify-center bg-slate-800 px-2"
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
					style="background-image: url(/assets/yearly/bif.png)"
				>
					<div
						class="absolute h-[150%] w-16 translate-x-[-400%] rotate-12 bg-slate-200/10 motion-translate-x-loop-[800%] motion-duration-[5000ms]"
					></div>
					{#if error}
						<div
							class="motion-preset-shake rounded-3xl bg-red-700/40 px-8 py-4 text-xl font-bold text-white backdrop-blur-lg"
						>
							服务器出错，请稍后再试
						</div>
					{:else}
						<div class="rounded-3xl bg-slate-700/40 px-8 py-4 text-xl font-bold backdrop-blur-lg">
							<div class="w-fit text-red-300 motion-scale-loop-[110%] motion-duration-2000">
								新年快乐！
							</div>
							DDNet {data.year} 年度总结
						</div>
					{/if}
				</div>
				<div class="h-full max-h-[calc(100svh-20rem)] space-y-3 p-4">
					{#if error}
						<div class="flex h-[10rem] w-full flex-col items-center justify-center gap-4">
							<div class="flex flex-col space-y-2">
								<button
									class="text-nowrap rounded bg-blue-500 px-4 py-2 text-white motion-translate-x-in-[-200%] motion-duration-1000 motion-delay-200 hover:bg-blue-600"
									onclick={() => goto(`/ddnet/yearly`)}
								>
									重新输入名字
								</button>
							</div>
						</div>
					{:else if data.player}
						{#if loadingProgress >= 0}
							<div
								class="flex h-[10rem] w-full flex-col items-center justify-center gap-4"
								out:fade
								in:fade
							>
								<div class="font-bold">{data.name}的{data.year}年度总结</div>
								<div class="flex flex-row items-center justify-center gap-2">
									<div>正在加载...</div>
									<div class="w-[3.5rem]text-center">{Math.round(loadingProgress * 100)}%</div>
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
											data-sveltekit-replacestate
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
											if (gotoName)
												goto(`/ddnet/yearly?name=${encodeAsciiURIComponent(gotoName)}`, {
													replaceState: true
												});
										}
									}}
								/>
							</div>
							<div class="flex flex-col space-y-2">
								<button
									class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:bg-blue-500 disabled:opacity-50"
									onclick={() => {
										if (gotoName)
											goto(`/ddnet/yearly?name=${encodeAsciiURIComponent(gotoName)}`, {
												replaceState: true
											});
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
