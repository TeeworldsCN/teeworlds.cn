<script lang="ts">
	import TeeRender, { type TeePose } from '$lib/components/TeeRender.svelte';
	import TeeCardView from '$lib/components/TeeCard.svelte';
	import { EMOTE } from '$lib/stores/skins';
	import {
		applyDiceMods,
		cappedLevelId,
		DICE_PIPS,
		ROLL_LEVELS,
		getRollLevel,
		hitIndices,
		isVoidFace,
		judgeRoll,
		rollDice,
		sampleDice,
		showPip,
		type RollLevel
	} from '$lib/midautumn';
	import { RARITY_INFO, drawCards, type TeeCard, type TeeEffect, CARDS } from '$lib/teecards';
	import {
		BUFF_BY_ID,
		BUFF_CARDS,
		drawShopItems,
		type AppliedBuff,
		type BuffCard
	} from '$lib/items';
	import {
		BASE_ROLLS,
		playerDiceMods,
		mergeMods,
		TEAM_LIMIT,
		activeReady,
		activeSkills,
		applyBuffLevelFloor,
		applyGrowth,
		calcTeeScore,
		tickCharge,
		calcTeamTotal,
		cardById,
		collectSetOps,
		decayBuffs,
		effectiveEffects,
		economyReward,
		BOSSES,
		getBoss,
		getBossById,
		getSave,
		hasRerollAllOnNone,
		isBossRound,
		overflowReward,
		rollsAllowed,
		roundReward,
		roundTarget,
		saveResult,
		selfDiceMods,
		shuffle,
		upgradeLevel,
		withBossMods,
		type Boss,
		type EffectiveEffect,
		type GrowthMap,
		type ScoreBreakdown,
		type ActiveSkill,
		type ScoreInput,
		type SetOp,
		type TeamTee
	} from '$lib/game';
	import {
		initSfx,
		loadSfxPref,
		setSfxEnabled,
		sfxClick,
		sfxEnabled,
		sfxLog,
		sfxLevel,
		sfxLose,
		sfxRoll,
		sfxSetRate,
		sfxStep,
		sfxTotal,
		sfxWin
	} from '$lib/sfx';
	import { onMount } from 'svelte';
	import { setLayoutTheme } from '$lib/layoutTheme.svelte';
	import Fa from 'svelte-fa';
	import {
		faBolt,
		faLock,
		faLockOpen,
		faRotate,
		faStore,
		faTrophy
	} from '@fortawesome/free-solid-svg-icons';

	// ---- 自定义 layout 背景（夜空渐变铺满、去掉默认内边距） ----

	onMount(() => {
		setLayoutTheme({
			bg: 'linear-gradient(180deg, #070b1f 0%, #101a3f 45%, #1d2a5c 75%, #2c2a55 100%)',
			pad: false
		});
		return () => setLayoutTheme({});
	});

	// ---- 极端矮屏:整体等比缩放（不再挤面板/换布局） ----

	/**
	 * 各宽度下「全阶段零溢出」需要的可用高度（实测,已向上取整）。
	 * 三档与布局断点一致，因为需求由布局决定:
	 * - 手机(≤639):矮屏(≤624)时队伍单行横滑 → 590；否则 660（集市/商店 6 张卡换行,最费）
	 * - 平板(640~767):6 张队伍卡一定换行 + 商店面板 → 800
	 * - 桌面(≥768):卡片一行放得下 → 700（商店面板最大）
	 * 可用高度低于这值时，不压面板，直接把整个活动区等比缩小。
	 */
	const minHeightFor = (w: number, h: number) =>
		w >= 768 ? 700 : w >= 640 ? 800 : h <= 624 ? 590 : 660;
	/** 活动区可用高度(px,不含 header/footer) */
	let availH = $state(0);
	let minH = $state(660);
	const fitScale = $derived(availH > 0 && availH < minH ? availH / minH : 1);

	// 可用高度必须从视口量:父容器(main)是 flex 项,min-height:auto 会被内容撑着不缩,
	// 量它只会量到内容自己的自然高度 → 缩放比例会自己吃掉自己。
	$effect(() => {
		const measure = () => {
			const chrome =
				(document.querySelector('header')?.offsetHeight ?? 0) +
				(document.querySelector('footer')?.offsetHeight ?? 0);
			availH = Math.max(0, document.documentElement.clientHeight - chrome);
			minH = minHeightFor(window.innerWidth, availH);
		};
		measure();
		window.addEventListener('resize', measure);
		window.visualViewport?.addEventListener('resize', measure);
		return () => {
			window.removeEventListener('resize', measure);
			window.visualViewport?.removeEventListener('resize', measure);
		};
	});

	// ---- 皮肤（主 Tee） ----

	/** 「我」固定用兔子皮肤(不再让玩家填 DDNet 皮肤名) */
	const SELF_SKIN = 'tuzi';

	// ---- 存档 ----

	let save = $state(getSave());
	let mooncakes = $state(0);

	// ---- 游戏状态 ----

	type Phase =
		| 'idle'
		| 'draft'
		| 'intro'
		| 'rolling'
		| 'round_confirm'
		| 'round_end'
		| 'reward'
		| 'shop'
		| 'game_over';
	let phase = $state<Phase>('idle');

	let round = $state(1);
	let boss = $state<Boss | null>(null);
	let target = $state(0);
	let currentScore = $state(0);
	/** 结算动画期间的显示偏移(负数 → 0):让进度条跟着动画往上走,而不污染真实分数 */
	let settlePreview = $state(0);
	/** 界面上显示的分数 = 真实分 + 动画偏移 */
	const displayScore = $derived(currentScore + settlePreview);
	let team = $state<TeamTee[]>([]);
	let growth = $state<GrowthMap>({});

	let dice = $state<number[]>([1, 1, 1, 1, 1, 1]);
	let rolling = $state(false);
	let currentTee = $state(0);
	let rerollAllUsed = $state(false);
	let lastLevel = $state(getRollLevel('none'));
	let lastBreakdown: ScoreBreakdown = $state({
		base: 0,
		chips: 0,
		mult: 1,
		teamMult: 1,
		total: 0,
		sources: []
	});
	let diceSum = $state(0); // 本回合判定用的骰子点数和
	/** 结算文字容器(行数多时可滚动,弹出新行要自动跟到底) */
	let stepsEl: HTMLElement | undefined = $state();
	// 结算动画： 一条一条弹出（Boss 效果 → 等级 → 加成卡 → 总分）
	type SettleKind = 'level' | 'chip' | 'mult' | 'total';
	let settleSteps = $state<{ text: string; cls: string; kind: SettleKind }[]>([]);
	let settleIdx = $state(-1);
	let settling = $state(false);

	// 结算信息
	let roundTotal = $state(0);
	/** 本局累计总分(每关结算后累加)—— 最高纪录记的是它,不是单关分 */
	let runScore = $state(0);
	let roundRewardGained = $state(0);
	let overflowGained = $state(0);
	let economyGained = $state(0);
	let finalScore = $state(0);
	/** 本局累计总分(结算画面展示用) */
	let finalRunScore = $state(0);
	let finalRound = $state(0);
	let isNewBest = $state(false);

	// 开局选卡（5 选 2）
	let draftChoices = $state<TeeCard[]>([]);
	let draftPicked = $state<number[]>([]);

	// 集市
	let rewardChoices = $state<TeeCard[]>([]);
	let shopBuffs = $state<BuffCard[]>([]);
	/** 商店里选中的加成卡(先看说明再买,避免误点) */
	let shopPick = $state<BuffCard | null>(null);
	/** 本轮货架已经买掉的格子:留占位不删,避免后面的芯片往上跳(位移) */
	let shopSold = $state<string[]>([]);
	/**
	 * 商店锁定:每格存「锁住的加成卡 id」(null = 没锁)。
	 * 锁住的格子**刷新和下次进商店都不变** —— 卡池越来越厚之后,
	 * 「看到想要但买不起」不会白丢,玩家可以攒钱回头买。
	 * 一次新开一局才清(局内跨关保留)。
	 */
	let shopLocks = $state<(string | null)[]>([null, null, null, null, null, null]);
	let lastRewardIdx = $state(-1);

	// 道具库存（加成卡）
	let buffInventory = $state<Record<string, number>>({});
	let selectedBuff = $state<BuffCard | null>(null);
	// 团队结算动画（回合确认后： 团队倍率卡一条一条弹）
	let teamSettleSteps = $state<{ text: string; cls: string; kind: SettleKind }[]>([]);
	let teamSettleIdx = $state(-1);
	/** 骰面九个点位在 24×24 viewBox 里的坐标(与旧 CSS 的格心一致:4/12/20) */
	const PIP_POS: [number, number][] = [
		[4, 4],
		[12, 4],
		[20, 4],
		[4, 12],
		[12, 12],
		[20, 12],
		[4, 20],
		[12, 20],
		[20, 20]
	];
	let teamSettling = $state(false);

	// ---- 加成卡 / 重构卡工具 ----

	const buffEntries = $derived(Object.entries(buffInventory) as [string, number][]);

	const onBuffDragStart = (e: DragEvent, card: BuffCard) => {
		if (phase !== 'intro') {
			e.preventDefault();
			return;
		}
		e.dataTransfer?.setData('text/plain', card.id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
	};

	const onTeeDrop = (e: DragEvent, idx: number) => {
		e.preventDefault();
		const id = e.dataTransfer?.getData('text/plain');
		if (!id) return;
		const card = BUFF_BY_ID.get(id);
		if (card) applyBuffToTee(card, idx);
	};

	const toggleSelectBuff = (card: BuffCard) => {
		if (phase !== 'intro') return;
		selectedBuff = selectedBuff?.id === card.id ? null : card;
	};

	/** 掷骰前把加成卡挂到 Tee 身上(消耗 1 张库存) */
	const applyBuffToTee = (card: BuffCard, idx: number) => {
		if (phase !== 'intro' && phase !== 'shop') return;
		const cur = buffInventory[card.id] ?? 0;
		if (cur <= 0) return;
		const next: Record<string, number> = {};
		for (const [k, v] of Object.entries(buffInventory)) {
			if (k === card.id) {
				if (v > 1) next[k] = v - 1;
			} else {
				next[k] = v;
			}
		}
		buffInventory = next;
		team[idx].buffs = [...team[idx].buffs, { cardId: card.id, turnsLeft: card.turns }];
		selectedBuff = null;
	};

	/** 队伍卡 tooltip 明细: 加成项目+剩余回合、成长卡当前数值 */
	const teeTipList = (tee: TeamTee) => {
		const lines: { text: string; cls?: string }[] = [];
		const card = cardOf(tee);
		const i = team.indexOf(tee);
		if (tee.buffs.some((b) => BUFF_BY_ID.get(b.cardId)?.effect.type === 'clear_void'))
			lines.push({ text: '🌑 月食：本关点数不作废', cls: 'text-emerald-300' });
		for (const sk of activeSkills(effectiveEffects(teamCards, i), tee.buffs)) {
			const nm = cardById(sk.srcId)?.name ?? sk.srcId;
			const what =
				sk.skill === 'chips'
					? `+${formatScore(sk.value)} 分`
					: sk.skill === 'left_chips'
						? `左侧 +${formatScore(sk.value)} 分`
						: '本关重掷';
			lines.push({
				text: `⚡ ${nm}:${what}${(tee.charge ?? 0) > 0 ? `(冷却 ${tee.charge} 关)` : '（可发动）'}`,
				cls: (tee.charge ?? 0) > 0 ? 'text-slate-400' : 'text-fuchsia-300'
			});
		}
		if (card?.effect.type === 'scaling_mult') {
			const layers = growth[card.id] ?? 0;
			lines.push({ text: `成长: ×${1 + layers}(已叠 ${layers} 层)`, cls: 'text-emerald-300' });
		}
		for (const b of tee.buffs) {
			const bc = BUFF_BY_ID.get(b.cardId);
			if (bc) {
				lines.push({
					text: `${bc.name}: ${bc.desc} · 剩 ${b.turnsLeft} 回合`,
					cls: 'text-amber-300'
				});
			}
		}
		return lines;
	};

	// 交互（改点/重掷）
	type PendingAction =
		| { kind: 'set_point'; count: number; point: number; srcId?: string }
		| { kind: 'set_any'; count: number; pick?: number; srcId?: string }
		| { kind: 'bump'; count: number; srcId?: string }; // 月牙尺:点一颗骰子,它的点数 +1
	let pendingAction = $state<PendingAction | null>(null);
	let pointPicker = $state(false); // set_any 的点数选择
	/** 待执行的改点操作队列(卡牌 + 加成卡) */
	let setQueue: SetOp[] = [];

	// ---- 投掷次数（每 Tee 默认 2 次，之间可自选保留重掷） ----
	let rollsLeft = $state(0); // 还能重掷几次
	/** 本回合当前 Tee 重掷了几颗骰子(per_reroll 类卡牌用),换人/开新回合清零 */
	let rerollCount = $state(0);
	/** 本回合当前 Tee 真正用掉的改点来源(未使用的可归还道具要还回去) */
	let usedOpSrc = $state<string[]>([]);
	/** 结算动画播完、等玩家决定是否发动主动技能 */
	let pendingActive = $state<ActiveSkill | null>(null);
	let choosing = $state(false); // 正在选要重掷的骰子
	let rerollSel = $state<boolean[]>(Array(6).fill(false));
	/** 本次动画里真正在翻滚的骰子(整轮掷骰时 6 颗全转,重掷时只转选中的) */
	let rollMask = $state<boolean[]>(Array(6).fill(true));
	const dieRolling = (i: number) => rolling && rollMask[i];
	/** 波浪延迟只按「参与翻滚的骰子」排号,避免留下空档 */
	const dieDelay = (i: number) => {
		let n = 0;
		for (let k = 0; k < i; k++) if (rollMask[k]) n++;
		return n * 0.05;
	};

	// ---- 动画速率 & 骰子高亮 & 规则 ----

	const SPEEDS = [0.5, 1, 2];
	const SPEED_LABELS = [1, 2, 3]; // 档位标签: 1x / 2x / 3x
	let speedIdx = $state(0);
	let speed = $derived(SPEEDS[speedIdx]); // 默认 0.5x(当前默认速度的一半)
	let hitDice = $state<number[]>([]);
	/** 卖卡攒倍率:本局累计(永久)与「本回合已计入」——每回合最多往累计里加 2 */
	let soldTees = $state(0);
	let soldThisRound = $state(0);
	/** 本回合被玩家手动改过点的骰子(豁免「视为」,并在骰面上标 overlay) */
	let optedDice = $state<number[]>([]); // 本次判定命中的骰子索引
	let showRules = $state(false);
	/** 音效开关(状态存 localStorage) */
	let sfxOn = $state(true);
	const toggleSfx = () => {
		sfxOn = !sfxOn;
		setSfxEnabled(sfxOn);
		if (sfxOn) sfxClick();
	};
	let rollDur = $state(0.75); // 旋转动画单次时长(秒),角速度恒定

	let rollIter = $state(1); // 旋转重复次数(慢速档多转几圈)
	let rollTotal = $state(1000); // 摇骰总时长(毫秒,含波浪延迟)

	// ---- Tee 动画 ----

	let teeEmote = $state(EMOTE.normal);
	let teePose = $state<TeePose>({
		bodyRotation: 0,
		eyesRotation: 0,
		frontFootRotation: 0,
		backFootRotation: 0,
		eyesPosition: '',
		frontFootPosition: '',
		backFootPosition: ''
	});
	let teeAnim = $state('');

	const THROW_POSE: TeePose = {
		bodyRotation: -14,
		eyesRotation: -10,
		frontFootRotation: -25,
		backFootRotation: 20,
		eyesPosition: '2% -3%',
		frontFootPosition: '6% 8%',
		backFootPosition: '-4% 2%'
	};
	const IDLE_POSE: TeePose = {
		bodyRotation: 0,
		eyesRotation: 0,
		frontFootRotation: 0,
		backFootRotation: 0,
		eyesPosition: '',
		frontFootPosition: '',
		backFootPosition: ''
	};

	onMount(() => {
		sfxOn = loadSfxPref();
		sfxSetRate(speed);
		// 作弊引擎： DEV 或 URL 带 ？cheat 时启用
		if (import.meta.env.DEV || new URLSearchParams(location.search).has('cheat')) {
			(window as unknown as Record<string, unknown>).__sfxLog = sfxLog;
			enableCheat();
		}
	});

	// ---- 工具 ----

	const cardOf = (tee: TeamTee): TeeCard | null => (tee.cardId ? cardById(tee.cardId) : null);
	const allCards = (): TeeCard[] => team.map(cardOf).filter((c): c is TeeCard => c !== null);
	const rarityOf = (c: TeeCard | null) => RARITY_INFO[c?.rarity ?? 'common'];

	const rollSingle = () => 1 + Math.floor(Math.random() * 6);

	// ---- 作弊引擎（测试用）： URL 带 ？cheat 或 DEV 时启用， window.__cheat 可直接 JS 操纵 ----
	let cheatNextRoll = $state<number[] | null>(null); // 强制下一次掷骰结果
	let cheatNextDie = $state<number | null>(null); // 强制下一次单骰重掷结果
	const cheatRoll = (): number[] => {
		if (cheatNextRoll) {
			const d = cheatNextRoll;
			cheatNextRoll = null;
			return d;
		}
		return rollDice();
	};
	const cheatSingle = (): number => {
		if (cheatNextDie !== null) {
			const v = cheatNextDie;
			cheatNextDie = null;
			return v;
		}
		return rollSingle();
	};
	const enableCheat = () => {
		/**
		 * 作弊接口的 id 校验:传错卡 id 会让 TeeCard 的 tooltip 在渲染时抛
		 * `null.rarity`,整个页面直接卡死(DOM 停在上一帧、状态却还在变),极难排查。
		 * 所以这里一律先校验,不合法就 warn + 忽略。
		 */
		const warnId = (kind: string, id: string) => {
			console.warn(`[作弊引擎] 未知${kind} id: ${id}(已忽略)`);
		};
		const api = {
			/** 设置月饼币 */
			mooncakes: (n: number) => (mooncakes = n),
			/** 所有 Boss id(scan 用,免得手抄清单漂移) */
			bossIds: () => BOSSES.map((b) => b.id),
			/** 当前 3 选 1 的三张卡 id(自检用:点了第几张、进队伍的是不是同一张) */
			rewardIds: () => rewardChoices.map((c) => c.id),
			/** 本局累计总分(自检用:最高纪录记的是它) */
			runScore: () => runScore,
			/** 直接设主动技能冷却(0 = 立即可发动) */
			charge: (i: number, n: number) => {
				if (!team[i]) return warnId('Tee（下标）', String(i));
				team[i].charge = n;
			},
			/** 队伍里所有带主动技能的 Tee 立刻可用 */
			readyActives: () => {
				team.forEach((t, i) => {
					if (activeSkills(effectiveEffects(teamCards, i), t.buffs).length > 0) t.charge = 0;
				});
			},
			/** 加成卡入库存 addBuff('yuefu', 2) */
			addBuff: (id: string, n = 1) => {
				if (!BUFF_BY_ID.has(id)) return warnId('加成卡', id);
				buffInventory = { ...buffInventory, [id]: (buffInventory[id] ?? 0) + n };
			},
			/** 直接把加成卡挂到 Tee(不耗库存) buff(0, 'manyuezhufu') */
			buff: (teeIdx: number, buffId: string) => {
				const bc = BUFF_BY_ID.get(buffId);
				if (!bc) return warnId('加成卡', buffId);
				if (!team[teeIdx]) return warnId('Tee（下标）', String(teeIdx));
				team[teeIdx].buffs = [...team[teeIdx].buffs, { cardId: buffId, turnsLeft: bc.turns }];
			},
			/** 直接换掉某个 Tee 的卡 card(1, 'shangxian') —— 自检用 */
			card: (teeIdx: number, cardId: string | null) => {
				if (cardId !== null && !CARDS.some((c) => c.id === cardId)) return warnId('Tee 卡', cardId);
				const slot = team[teeIdx];
				if (!slot) return warnId('Tee（下标）', String(teeIdx));
				slot.cardId = cardId;
				// 清掉这个 Tee 上次的结果,免得看着旧分数误判
				slot.lastScore = 0;
				slot.lastLevelId = 'none';
				slot.lastDice = [1, 1, 1, 1, 1, 1];
			},
			/** 强制下一次掷骰结果 nextRoll([2,3,5,6,1,2]) */
			nextRoll: (dice: number[]) => {
				cheatNextRoll = dice;
			},
			/** 强制下一次单骰重掷结果 */
			nextDie: (v: number) => {
				cheatNextDie = v;
			},
			/** Tee 卡直接入队(可超 6 人) addCard('guanghangong') */
			addCard: (cardId: string) => {
				const c = cardById(cardId);
				if (!c) return warnId('Tee 卡', cardId);
				team = [
					...team,
					{
						cardId: c.id,
						lastScore: 0,
						lastLevelId: 'none',
						lastDice: [1, 1, 1, 1, 1, 1],
						buffs: []
					}
				];
			},
			/** 成长卡层数 grow('guanghangong', 3) */
			grow: (cardId: string, layers: number) => {
				if (!cardById(cardId)) return warnId('Tee 卡', cardId);
				growth = { ...growth, [cardId]: layers };
			},
			/** 直接覆盖队伍(首位 null = 玩家自己): setTeam([null,'yutu','yupan']) */
			setTeam: (ids: (string | null)[]) => {
				ids.forEach((id) => {
					if (id !== null && !cardById(id)) warnId('Tee 卡', id);
				});
				team = ids.map((id) => ({
					cardId: id,
					playerSkin: id === null ? SELF_SKIN : undefined,
					lastScore: 0,
					lastLevelId: 'none',
					lastDice: [1, 1, 1, 1, 1, 1],
					buffs: []
				}));
				currentTee = 0;
			},
			/**
			 * 直接跳到某个阶段,不用真打一遍:
			 *   jump('intro', { round: 3, boss: 'miyue' })
			 *   jump('rolling', { settleLines: 0 })  // 结果区一条都不弹
			 *   jump('rolling', { choosing: true })  // 停在「选骰子重掷」那一步
			 *   jump('draft', { picked: [0, 2] })    // 开局选卡界面
			 * boss: 指定 Boss id(或 null 表示无 Boss),不传则用随机的那个。
			 * settleLines: rolling 阶段显示几条结算文字,默认全显示。
			 */
			jump: (
				p: Phase,
				opts: {
					round?: number;
					boss?: string | null;
					settleLines?: number;
					choosing?: boolean;
					picked?: number[];
				} = {}
			) => {
				if (opts.round !== undefined) round = opts.round;
				beginRound(); // 重置本关状态并把 phase 落到 intro
				if (opts.boss !== undefined) {
					boss = opts.boss === null ? null : getBossById(opts.boss);
					target = Math.round(roundTarget(round) * (boss?.targetMult ?? 1));
				}
				if (p === 'idle') {
					phase = 'idle';
					return;
				}
				if (p === 'draft') {
					draftChoices = shuffle(CARDS.filter((c) => c.rarity === 'common')).slice(0, 5);
					draftPicked = opts.picked ? [...opts.picked] : [];
					phase = 'draft';
					return;
				}
				if (p === 'intro') return;

				// 给全队塞一份「已掷完」的合法结果
				const levelIds = [
					'zhuang_yuan_chajinhua',
					'dui_tang',
					'liu_bo_hei',
					'san_hong',
					'er_ju',
					'yi_xiu'
				];
				let sum = 0;
				team.forEach((t, i) => {
					const lv = getRollLevel(levelIds[i % levelIds.length]);
					const sample = sampleDice(lv); // 示例带 X,补成真实手牌再计分
					t.lastDice = [...sample];
					t.lastLevelId = lv.id;
					t.lastScore = calcTeeScore(scoreInput(i, lv.id, sample)).total;
					sum += t.lastScore;
				});
				currentScore = sum;
				dice = [...team[0].lastDice];
				currentTee = 0;
				rolling = false;
				pendingAction = null;
				hitDice = hitIndices(dice, team[0].lastLevelId, boss?.mods);
				lastLevel = getRollLevel(team[0].lastLevelId);
				lastBreakdown = calcTeeScore(scoreInput(0, team[0].lastLevelId, team[0].lastDice));
				settleSteps = buildSettleSteps(team[0].lastLevelId, lastLevel, team[0]);
				settleIdx = opts.settleLines === undefined ? settleSteps.length - 1 : opts.settleLines - 1;

				if (p === 'rolling') {
					phase = 'rolling';
					if (opts.choosing) {
						rollsLeft = Math.max(
							1,
							rollsAllowed(
								effectiveEffects(teamCards, 0),
								team[0]?.buffs ?? [],
								boss?.rollsBonus ?? 0
							) - 1
						);
						choosing = true;
						rerollSel = [false, true, false, true, false, false];
					} else {
						choosing = false;
						rollsLeft = 0;
					}
					return;
				}
				if (p === 'round_confirm') {
					phase = 'round_confirm';
					return;
				}

				roundTotal = calcTeamTotal(
					team.map((t) => t.lastScore),
					team.map(cardOf) // 按位置对齐:回流要认左右邻居
				).total;
				roundRewardGained = roundReward(round);
				overflowGained = overflowReward(roundTotal, target);
				economyGained = economyReward(allCards(), mooncakes);

				if (p === 'round_end') {
					phase = 'round_end';
					return;
				}
				if (p === 'reward') {
					rewardChoices = drawCards(3);
					lastRewardIdx = -1;
					phase = 'reward';
					return;
				}
				if (p === 'shop') {
					shopBuffs = drawShopItems(shopLocks);
					shopPick = null;
					shopSold = [];
					phase = 'shop';
					return;
				}
				if (p === 'game_over') {
					finalScore = roundTotal;
					finalRound = round;
					isNewBest = false;
					phase = 'game_over';
				}
			},
			/** 当前游戏状态快照 */
			state: () => ({
				phase,
				round,
				currentTee,
				mooncakes,
				target,
				currentScore,
				buffInventory,
				team: team.map((t) => ({
					cardId: t.cardId,
					lastScore: t.lastScore,
					lastLevelId: t.lastLevelId,
					buffs: t.buffs
				}))
			})
		};
		(window as unknown as Record<string, unknown>).__cheat = api;
		console.log(
			"%c[作弊引擎] __cheat 已启用: nextRoll([2,3,5,6,1,2]) 强制骰子 · buff(0,'manyuezhufu') 挂卡 · addBuff/addRework 加库存",
			'color:#fbbf24;font-weight:bold'
		);
	};

	// ---- 游戏流程 ----

	/** 重置一局的公共状态 */
	/**
	 * 跨局数据:只有开新一局才清(主菜单「开始博饼」、结算页「再来一局」)。
	 * 本关数据不要写这里 —— 那是 resetRoundState 的职责。
	 */
	const resetRunState = () => {
		growth = {};
		runScore = 0;
		mooncakes = 0;
		buffInventory = {};
		selectedBuff = null;
		round = 1;
		soldTees = 0;
		soldThisRound = 0;
		shopLocks = [null, null, null, null, null, null]; // 局内保留,跨局清空
	};

	/**
	 * 本关数据:每关开头都要清。**两个入口都必须调它** ——
	 * ① beginRound():正常过关、选完卡开打、作弊 jump;
	 * ② resetRun():重开直接落到 draft,不经过 beginRound。
	 * ②漏清过一次真 bug:上一局的 Boss 横幅(「迷月:本关骰子的 6 视为 3」)挂到了
	 * 新一局的开局 HUD 上,因为 boss 只在 beginRound 里清。
	 * scan 里有对应回归检查(qa.sh scan →「重开清场」)。
	 */
	const resetRoundState = () => {
		boss = null; // 第 1 关没有 Boss;beginRound 会按 round 重新指派
		target = roundTarget(1); // 开局 HUD 显示第 1 关目标;beginRound 会按 round 覆盖
		currentScore = 0;
		roundTotal = 0;
		currentTee = 0;
		dice = [1, 1, 1, 1, 1, 1];
		rerollAllUsed = false;
		rerollCount = 0;
		usedOpSrc = [];
		pendingActive = null;
		pendingAction = null;
		pointPicker = false;
		choosing = false;
		rollsLeft = 0;
		rerollSel = Array(6).fill(false);
		teamSettleSteps = [];
		teamSettleIdx = -1;
		teamSettling = false;
	};

	const resetRun = () => {
		resetRunState();
		resetRoundState();
	};

	const startGame = () => {
		sfxClick();
		resetRun();
		// 开局先抽 5 张普通卡给玩家挑 2 张 —— 3 人队伍起步，避免第一关纯看运气
		draftChoices = shuffle(CARDS.filter((c) => c.rarity === 'common')).slice(0, 5);
		draftPicked = [];
		team = [];
		phase = 'draft';
	};

	const toggleDraftPick = (idx: number) => {
		sfxClick();
		if (draftPicked.includes(idx)) draftPicked = draftPicked.filter((i) => i !== idx);
		else if (draftPicked.length < 2) draftPicked = [...draftPicked, idx];
	};

	/** 选完 2 张 → 组队开打 */
	const confirmDraft = () => {
		if (draftPicked.length !== 2) return;
		sfxClick();
		const starters = draftPicked.map((i) => draftChoices[i]);
		team = [
			{
				cardId: null,
				playerSkin: SELF_SKIN,
				lastScore: 0,
				lastLevelId: 'none',
				lastDice: [1, 1, 1, 1, 1, 1],
				buffs: []
			},
			...starters.map((c) => ({
				cardId: c.id,
				lastScore: 0,
				lastLevelId: 'none',
				lastDice: [1, 1, 1, 1, 1, 1],
				buffs: []
			}))
		];
		phase = 'intro';
		beginRound();
	};

	/** 每关开始: 加成卡回合数 -1, 归零移除 */
	const decayBuffsForRound = () => {
		decayBuffs(team);
	};

	/** 掷完展示后: 进入下一个 Tee / 回回合确认(重掷后) / 全队掷完 */
	/** 队伍卡牌(null = 主 Tee),用于解析 copy_right / bundle */
	const teamCards = $derived(team.map((t) => (t.cardId ? cardById(t.cardId) : null)));
	/** 第 i 个 Tee 实际生效的效果 */
	const selfEffects = (i: number): EffectiveEffect[] => effectiveEffects(teamCards, i);
	/** 全队效果(team_chips 之类) */
	const allEffects = (): EffectiveEffect[] =>
		teamCards.flatMap((_, i) => effectiveEffects(teamCards, i));
	/** 组装一次计分所需的全部上下文(联动类效果需要位置/队友/主 Tee 信息) */
	const scoreInput = (i: number, levelId: string, diceForSum: number[]): ScoreInput => ({
		levelId,
		self: selfEffects(i),
		allSelf: teamCards.map((_, k) => effectiveEffects(teamCards, k)),
		index: i,
		teamCards,
		growth,
		buffs: team[i]?.buffs ?? [],
		teamSize: team.length,
		diceSum: diceForSum.reduce((a, b) => a + b, 0),
		ownDice: [...diceForSum],
		rerolled: rerollCount,
		playerLevelId: i === 0 ? levelId : (team[0]?.lastLevelId ?? 'none'),
		playerDice: i === 0 ? diceForSum : (team[0]?.lastDice ?? []),
		// 重复牌倍率要数**原始**骰面(已变成 4 的数不出来)。只有主 Tee 用得上,
		// 所以 i > 0 时传什么都无所谓,这里用主 Tee 存下来的骰子兼顶。
		playerRawDice: i === 0 ? [...dice] : (team[0]?.lastDice ?? []),
		// 新机制的上下文：经济流用币、成长/负分用关数、支援流用左邻已结算的分
		coins: mooncakes,
		round,
		leftScore: i > 0 ? (team[i - 1]?.lastScore ?? 0) : (team[team.length - 1]?.lastScore ?? 0),
		soldCount: soldTees
	});

	/** 该 Tee 本回合可投掷几次 */
	const rollsFor = (i: number) =>
		rollsAllowed(selfEffects(i), team[i]?.buffs ?? [], boss?.rollsBonus ?? 0);
	/** 该 Tee 判定用的点数修饰(自己的改造 + Boss 的) */
	const modsFor = (i: number) =>
		withBossMods(
			mergeMods(
				{ fixed: optedDice },
				mergeMods(
					selfDiceMods(selfEffects(i), team[i]?.buffs ?? []),
					// 只有主 Tee 吃队友的「我掷出的 X 视为 4」规则
					i === 0 ? playerDiceMods(teamCards) : undefined
				)
			),
			boss?.mods
		);

	/** 骰面覆盖用:变换后的「实际点数」(与判定/和值同一个 applyDiceMods) */
	const shownDice = $derived(applyDiceMods(dice, modsFor(currentTee)));
	/** 第 i 颗骰子是不是被本关作废的点数(骰面打红叉) */
	const dieVoid = (i: number) => !dieRolling(i) && isVoidFace(dice[i], modsFor(currentTee));
	/** 第 i 颗骰子的点数是否被 Boss/卡牌改造过 */
	const diceModded = (i: number) =>
		optedDice.includes(i) || (!dieRolling(i) && (dieVoid(i) || shownDice[i] !== dice[i]));
	/** 手动改过点的骰子也要标 overlay(它豁免了「视为」,和自动映射不是一回事) */

	/** 一个 Tee 掷完: 换下一个人;全队掷完则进回合确认 */
	const advanceAfterTee = () => {
		teeAnim = '';
		if (currentTee + 1 < team.length) {
			currentTee += 1;
			rerollCount = 0;
			usedOpSrc = [];
			pendingActive = null;
			dice = [1, 1, 1, 1, 1, 1];
			teeEmote = EMOTE.normal;
			rollCurrent();
		} else {
			finishRound();
		}
	};

	const beginRound = () => {
		decayBuffsForRound();
		tickCharge(team); // 主动技能冷却 -1
		resetRoundState();
		// 本关专属：按 round 指派 Boss 与目标（可能带 Boss 倍率）
		boss = isBossRound(round) ? getBoss(round) : null;
		target = Math.round(roundTarget(round) * (boss?.targetMult ?? 1));
		for (const t of team) {
			t.lastScore = 0;
			t.lastLevelId = 'none';
			t.lastDice = [1, 1, 1, 1, 1, 1];
		}
		phase = 'intro';
	};

	const startRolling = () => {
		sfxClick();
		phase = 'rolling';
		selectedBuff = null;
		rollCurrent();
	};

	/** 掷一次骰子(动画 + 定格) */
	const rollCurrent = () => {
		if (rolling) return;
		rolling = true;
		hitDice = [];
		optedDice = [];
		soldThisRound = 0;
		// 清掉上一个 Tee 的结算文字，否则新人掷骰时会误以为那是当前骰子的结果
		settleSteps = [];
		settleIdx = -1;
		rollsLeft = rollsFor(currentTee) - 1;
		rerollCount = 0;
		usedOpSrc = [];
		rollMask = Array(6).fill(true);
		rerollSel = Array(6).fill(false);
		choosing = false;
		teeEmote = EMOTE.angry;
		teePose = THROW_POSE;
		teeAnim = 'throw';

		// 旋转角速度恒定（0.75s 转 540°）；慢速档重复播放更多圈，总时长随之变长
		rollDur = Math.min(0.75, 0.75 / speed);
		rollIter = speed < 1 ? 1 / speed : 1;
		rollTotal = 250 + rollDur * rollIter * 1000; // 250ms = 波浪延迟预算(5×50ms)

		const timer = setInterval(() => {
			dice = rollDice();
		}, 90 / speed);

		setTimeout(() => {
			clearInterval(timer);
			dice = cheatRoll(); // 定格最终点数(nextRoll 在此消费)
		}, rollTotal * 0.8);

		sfxRoll(rollTotal / 1000, 6);
		setTimeout(() => {
			rolling = false;
			teePose = IDLE_POSE;
			afterRoll();
		}, rollTotal);
	};

	/** 掷出后: 还有重掷机会就先让玩家挑骰子,否则进入改点/判定 */
	const afterRoll = () => {
		if (rollsLeft > 0) {
			choosing = true;
			rerollSel = Array(6).fill(false);
			return;
		}
		beginSetOps();
	};

	/** 点骰子: 选/取消要重掷的那几颗 */
	const toggleReroll = (i: number) => {
		if (!choosing) return;
		sfxClick();
		const next = [...rerollSel];
		next[i] = !next[i];
		rerollSel = next;
	};

	/** 确认重掷: 只重投被选中的骰子 */
	const confirmReroll = () => {
		if (!choosing || rolling) return;
		sfxClick();
		const sel = [...rerollSel];
		const n = sel.filter(Boolean).length;
		if (n === 0) return;
		rollsLeft -= 1;
		rerollCount += n;
		choosing = false;
		rolling = true;
		rollMask = [...sel]; // 只有选中的骰子播翻滚动画
		teeEmote = EMOTE.angry;
		teePose = THROW_POSE;
		teeAnim = 'throw';

		rollDur = Math.min(0.75, 0.75 / speed);
		rollIter = speed < 1 ? 1 / speed : 1;
		rollTotal = 250 + rollDur * rollIter * 1000;

		const timer = setInterval(() => {
			dice = dice.map((v, i) => (sel[i] ? rollSingle() : v));
		}, 90 / speed);

		setTimeout(() => {
			clearInterval(timer);
			dice = dice.map((v, i) => (sel[i] ? cheatSingle() : v));
		}, rollTotal * 0.8);

		sfxRoll(rollTotal / 1000, n);
		setTimeout(() => {
			rolling = false;
			teePose = IDLE_POSE;
			afterRoll();
		}, rollTotal);
	};

	/** 不再重掷: 直接进入改点/判定 */
	const skipReroll = () => {
		if (!choosing) return;
		sfxClick();
		choosing = false;
		rollsLeft = 0;
		beginSetOps();
	};

	/** 改点阶段: 依次执行卡牌/加成卡带来的改点操作 */
	const beginSetOps = () => {
		setQueue = collectSetOps(selfEffects(currentTee), team[currentTee]?.buffs ?? []);
		nextSetOp();
	};

	const nextSetOp = () => {
		const op = setQueue.shift();
		if (!op) {
			pendingAction = null;
			finalizeTee();
			return;
		}
		if (op.kind === 'point')
			pendingAction = { kind: 'set_point', count: op.count, point: op.point ?? 4, srcId: op.srcId };
		else if (op.kind === 'bump') pendingAction = { kind: 'bump', count: op.count, srcId: op.srcId };
		else pendingAction = { kind: 'set_any', count: op.count, srcId: op.srcId };
	};

	const onDieClick = (i: number) => {
		const act = pendingAction;
		if (!act) return;

		const markOpted = () => {
			if (!optedDice.includes(i)) optedDice = [...optedDice, i];
		};
		if (act.kind === 'set_point') {
			dice[i] = act.point;
			markOpted();
			act.count -= 1;
			if (act.srcId && !usedOpSrc.includes(act.srcId)) usedOpSrc = [...usedOpSrc, act.srcId];
		} else if (act.kind === 'bump') {
			// 月牙尺：+1（6 点封顶，再点没意义）
			if (dice[i] >= 6) return;
			dice[i] = dice[i] + 1;
			markOpted();
			act.count -= 1;
			if (act.srcId && !usedOpSrc.includes(act.srcId)) usedOpSrc = [...usedOpSrc, act.srcId];
		} else if (act.kind === 'set_any') {
			markOpted();
			act.pick = i;
			pointPicker = true;
			return;
		}

		if (act.count <= 0) {
			pendingAction = null;
			nextSetOp();
		}
	};

	const pickPoint = (v: number) => {
		const act = pendingAction;
		if (!act || act.kind !== 'set_any' || act.pick === undefined) return;
		dice[act.pick] = v;
		act.count -= 1;
		if (act.srcId && !usedOpSrc.includes(act.srcId)) usedOpSrc = [...usedOpSrc, act.srcId];
		pointPicker = false;
		if (act.count <= 0) {
			pendingAction = null;
			nextSetOp();
		} else {
			pendingAction = { kind: 'set_any', count: act.count, srcId: act.srcId };
		}
	};

	const cancelAction = () => {
		pendingAction = null;
		pointPicker = false;
		setQueue = [];
		finalizeTee();
	};

	/** 判定 + 计分 + 下一个 Tee */
	/** Boss 点效简写(结算动画第一步展示) */
	const BOSS_EFFECT_SHORT: Record<string, string> = {
		miyue: '6 视为 3',
		yingyue: '4 视为 2',
		shiyue: '点数 -1',
		wuyue: '6 视为 1'
	};

	/**
	 * 低压道具:本关没用掉的「可归还」加成卡回到库存(回合数不减,不进 decay)。
	 * 返回归还的道具名,交给结算动画播出来。
	 */
	const refundUnusedItems = (i: number): string[] => {
		const tee = team[i];
		if (!tee) return [];
		const back: AppliedBuff[] = [];
		const keep: AppliedBuff[] = [];
		for (const b of tee.buffs) {
			const card = BUFF_BY_ID.get(b.cardId);
			if (card?.refund && !usedOpSrc.includes(b.cardId)) back.push(b);
			else keep.push(b);
		}
		if (back.length === 0) return [];
		team[i].buffs = keep;
		const inv = { ...buffInventory };
		for (const b of back) inv[b.cardId] = (inv[b.cardId] ?? 0) + 1;
		buffInventory = inv;
		return back.map((b) => BUFF_BY_ID.get(b.cardId)?.name ?? b.cardId);
	};

	/** 构建结算步骤:每条得分来源各占一行,一眼能看出分从哪来 */
	const buildSettleSteps = (
		rawLevelId: string,
		level: RollLevel,
		tee: TeamTee,
		refunds: string[] = []
	) => {
		const steps: { text: string; cls: string; kind: SettleKind }[] = [];
		// 1） 牌型 + 固定分（Boss 有改点时加前缀，不单占一行 —— 完整说明在 HUD 上常驻）
		const prefix = boss?.mods ? `${boss.emoji} ${boss.name} · ` : '';
		steps.push({
			text: `${prefix}${level.emoji} ${level.name} ${formatScore(level.score)}`,
			cls:
				level.score >= 320
					? 'text-amber-300'
					: level.score > 0
						? 'text-emerald-300'
						: 'text-slate-400',
			kind: 'level'
		});
		// 3） 卡牌 / 加成卡逐条
		// 引擎是「先加完再乘完」((base + chips) x mult),所以结算也分两段播:
		// 加算行全部先出现,乘算行跟在后面 —— 播放顺序 = 真实计算顺序。
		const nameOf = (src: (typeof lastBreakdown.sources)[number]) =>
			src.kind === 'card'
				? (cardById(src.srcId)?.name ?? src.srcId)
				: (BUFF_BY_ID.get(src.srcId)?.name ?? src.srcId);
		// 3a) 加算阶段
		for (const src of lastBreakdown.sources) {
			if (!src.chips) continue;
			steps.push({
				text: `${nameOf(src)} +${formatScore(src.chips)}`,
				cls: 'text-amber-300',
				kind: 'chip'
			});
		}
		// 3b) 乘算阶段
		for (const src of lastBreakdown.sources) {
			if (src.mult === 1) continue;
			steps.push({
				text: `${nameOf(src)} ×${Number(src.mult.toFixed(2))}`,
				cls: 'text-purple-300',
				kind: 'mult'
			});
		}
		// 4） 合计
		// 4） 低压道具：没用掉就归还（也走结算动画，不然玩家不知道东西还在）
		for (const name of refunds)
			steps.push({ text: `🔄 没用上,${name} 归还库存`, cls: 'text-cyan-300', kind: 'chip' });
		// 5） 合计
		steps.push({
			text: `= ${formatScore(lastBreakdown.total)} 分`,
			cls: 'font-bold text-amber-200',
			kind: 'total'
		});
		return steps;
	};

	const finalizeTee = () => {
		const tee = team[currentTee];
		const self = selfEffects(currentTee);
		const mods = modsFor(currentTee);

		const rawLevel = judgeRoll(dice, mods);
		// 等级提升（玉兔捣药） → 加成卡保底
		let up = 0;
		for (const { eff } of self) if (eff.type === 'level_up') up += eff.count;
		const afterUp = up > 0 ? upgradeLevel(rawLevel.id, up) : rawLevel.id;
		// 升级卡可能把等级顶过 Boss 的封顶（血月），这里再套一次
		const level = getRollLevel(cappedLevelId(applyBuffLevelFloor(afterUp, tee.buffs), mods));

		// 后羿： 再接再厉时自动重掷全部（每回合 1 次）
		if (level.id === 'none' && hasRerollAllOnNone(self) && !rerollAllUsed) {
			rerollAllUsed = true;
			rerollCount += 6;
			rolling = true;
			rollMask = Array(6).fill(true);
			rollDur = Math.min(0.6, 0.6 / speed);
			rollIter = speed < 1 ? 1 / speed : 1;
			rollTotal = 250 + rollDur * rollIter * 1000;
			const timer = setInterval(() => {
				dice = rollDice();
			}, 90 / speed);
			setTimeout(() => {
				clearInterval(timer);
				dice = cheatRoll();
			}, rollTotal * 0.8);
			setTimeout(() => {
				rolling = false;
				teePose = IDLE_POSE;
				finalizeTee();
			}, rollTotal);
			return;
		}

		// 和值按「变换后的点数」算，和判定保持一致
		const shown = applyDiceMods(dice, mods);
		diceSum = shown.reduce((a, b) => a + b, 0);
		hitDice = hitIndices(dice, level.id, mods);
		lastLevel = level;
		lastBreakdown = calcTeeScore(scoreInput(currentTee, level.id, shown));

		tee.lastDice = [...dice];
		tee.lastLevelId = level.id;
		tee.lastScore = lastBreakdown.total;
		currentScore += lastBreakdown.total;

		// Tee 表情
		if (level.score >= 320) {
			teeEmote = EMOTE.surprised;
			teeAnim = 'celebrate';
		} else if (level.score > 0) {
			teeEmote = EMOTE.smile;
			teeAnim = 'happy';
		} else {
			teeEmote = EMOTE.angry;
			teeAnim = 'sad';
		}

		// 结算动画： 一条一条弹出（Boss → 等级 → 加成卡 → 归还 → 总分）
		settleSteps = buildSettleSteps(rawLevel.id, level, tee, refundUnusedItems(currentTee));
		settleIdx = -1;
		settling = true;
		const stepMs = 380 / speed;
		// 进度条跟着结算动画走。
		// 注意:分数在 finalizeTee 里**已经加过**了(currentScore += lastBreakdown.total),
		// 所以这里只做一个「倒着补」的显示偏移:从 -total 渐升到 0 —— 进度条会一行一行
		// 往上走,动画结束时正好落在真实分数上,而不是把分数再加一遍(那样会翻倍)。
		const settleTotal = lastBreakdown.total;
		settlePreview = -settleTotal;
		settleSteps.forEach((_, i) => {
			setTimeout(
				() => {
					settleIdx = i;
					settlePreview = -settleTotal + Math.round(settleTotal * ((i + 1) / settleSteps.length));
					const st = settleSteps[i];
					if (!st) return;
					if (st.kind === 'total') sfxTotal(lastBreakdown.total > 0);
					else sfxStep(i, st.kind, level.score);
					// 行数超出可见高度时，自动滚到最新一行
					// 只有真的超出可视高度（而不是被 flex 挤压）才跟到底
					if (stepsEl && stepsEl.scrollHeight > stepsEl.clientHeight + 1)
						stepsEl.scrollTop = stepsEl.scrollHeight;
				},
				(i + 1) * stepMs
			);
		});
		setTimeout(
			() => {
				settling = false;
				settlePreview = 0;
				teeAnim = '';
				setTimeout(afterSettle, 600 / speed);
			},
			(settleSteps.length + 1) * stepMs
		);
	};

	/** 本关该 Tee 可发动的主动技能(「调分左侧 Tee」在 0 号位没有目标) */
	const usableActive = (i: number): ActiveSkill | null => {
		const tee = team[i];
		if (!tee) return null;
		for (const sk of activeSkills(selfEffects(i), tee.buffs)) {
			if (!activeReady(tee, sk)) continue;
			if (sk.skill === 'left_chips' && i === 0) continue;
			return sk;
		}
		return null;
	};

	/** 结算动画结束后:能发技能就停下来等玩家决定,否则直接换人 */
	const afterSettle = () => {
		const sk = usableActive(currentTee);
		if (sk) {
			pendingActive = sk;
			return;
		}
		advanceAfterTee();
	};

	/** 发动主动技能 */
	const useActive = () => {
		const sk = pendingActive;
		const i = currentTee;
		const tee = team[i];
		if (!sk || !tee) return;
		sfxClick();
		pendingActive = null;
		tee.charge = sk.cooldown; // 进入冷却
		const name = cardById(sk.srcId)?.name ?? sk.srcId;
		if (sk.skill === 'retry') {
			// 重试本关：全队分数清零重掷（目标/Boss 不变）
			retryRound();
			return;
		}
		const to = sk.skill === 'left_chips' ? team[i - 1] : tee;
		if (!to) {
			advanceAfterTee();
			return;
		}
		to.lastScore += sk.value;
		currentScore += sk.value;
		const who = sk.skill === 'left_chips' ? `左侧 ${cardOf(to)?.name ?? '我'}` : '本 Tee';
		settleSteps = [
			...settleSteps,
			{
				text: `⚡ ${name} · ${who} +${formatScore(sk.value)}`,
				cls: 'text-fuchsia-300',
				kind: 'chip'
			}
		];
		settleIdx = settleSteps.length - 1;
		sfxTotal(true);
		setTimeout(advanceAfterTee, 700 / speed);
	};

	/** 跳过主动技能 */
	const skipActive = () => {
		sfxClick();
		pendingActive = null;
		advanceAfterTee();
	};

	/** 重试本关(时轮):全队重掷,分数清零 */
	const retryRound = () => {
		for (const t of team) {
			t.lastScore = 0;
			t.lastLevelId = 'none';
			t.lastDice = [1, 1, 1, 1, 1, 1];
		}
		currentScore = 0;
		currentTee = 0;
		rerollCount = 0;
		usedOpSrc = [];
		rerollAllUsed = false;
		settleSteps = [];
		settleIdx = -1;
		pendingAction = null;
		choosing = false;
		dice = [1, 1, 1, 1, 1, 1];
		rollCurrent();
	};

	/** 全队掷完: 进入回合确认(可买加成卡再重开, 或直接结算) */
	const finishRound = () => {
		phase = 'round_confirm';
	};

	/** 结算回合: 团队倍率卡一条一条弹, 然后判定过关/失败 */
	const confirmRound = () => {
		sfxClick();
		if (teamSettling || phase !== 'round_confirm') return;
		const cards = allCards();
		const steps: { text: string; cls: string; kind: SettleKind }[] = [];
		for (const c of cards) {
			if (c.effect.type === 'team_mult') {
				steps.push({
					text: `${c.name}:团队总分 ×${c.effect.value}`,
					cls: 'text-cyan-300',
					kind: 'mult'
				});
			}
		}
		const sum = team.reduce((s, t) => s + t.lastScore, 0);
		const { total, teamMult, relay, relayLines } = calcTeamTotal(
			team.map((t) => t.lastScore),
			team.map(cardOf) // 同上:位置对齐
		);
		roundTotal = total;
		// 接力回流:一张卡一行,数字由引擎算好(relayLines)
		for (const rl of relayLines) {
			steps.push({
				text: `🔄 接力回流 ${cardById(rl.cardId)?.name ?? rl.cardId} +${formatScore(rl.value)} 分`,
				cls: 'text-cyan-300',
				kind: 'mult'
			});
		}
		steps.push({
			text:
				teamMult !== 1
					? `${formatScore(sum + relay)} × ${teamMult} = ${formatScore(total)} 分`
					: `${formatScore(total)} 分`,
			cls: 'font-bold text-amber-200',
			kind: 'total'
		});
		teamSettleSteps = steps;
		teamSettleIdx = -1;
		teamSettling = true;
		const stepMs = 500 / speed;
		steps.forEach((_, i) => {
			setTimeout(
				() => {
					teamSettleIdx = i;
					// 回流/倍率播的时候进度条也往上走(终点正好是 total)
					currentScore = Math.round(sum + (total - sum) * ((i + 1) / steps.length));
				},
				(i + 1) * stepMs
			);
		});
		setTimeout(
			() => {
				teamSettling = false;
				settleRound();
			},
			(steps.length + 1) * stepMs
		);
	};

	/** 判定过关/失败(团队结算动画播完后) */
	const settleRound = () => {
		const total = roundTotal;
		runScore += total;
		if (total >= target) {
			// 过关
			const base = roundReward(round);
			const overflow = overflowReward(total, target);
			const eco = economyReward(allCards(), mooncakes);
			const gained = base + overflow + eco;
			roundRewardGained = base;
			overflowGained = overflow;
			economyGained = eco;
			mooncakes += gained;
			growth = applyGrowth(allCards(), growth);
			sfxWin();
			phase = 'round_end';
		} else {
			// 失败
			finalScore = total;
			finalRound = round;
			finalRunScore = runScore;
			const prevBest = save.bestScore;
			// 记的是**本局累计总分**（单关分会让"前面掷得再多、最后一把掷少了"不算数）
			save = saveResult(runScore, round);
			isNewBest = runScore > prevBest && runScore > 0;
			sfxLose();
			phase = 'game_over';
		}
	};

	const nextReward = () => {
		sfxClick();
		phase = 'reward';
		rewardChoices = drawCards(3);
		lastRewardIdx = -1;
	};

	const refreshReward = () => {
		sfxClick();
		if (mooncakes < 2) return;
		mooncakes -= 2;
		rewardChoices = drawCards(3);
		lastRewardIdx = -1;
	};

	const pickReward = (idx: number) => {
		if (team.length >= TEAM_LIMIT) return;
		const card = rewardChoices[idx];
		if (!card) return;
		team = [
			...team,
			{
				cardId: card.id,
				lastScore: 0,
				lastLevelId: 'none',
				lastDice: [1, 1, 1, 1, 1, 1],
				buffs: []
			}
		];
		lastRewardIdx = idx;
		// 选中后短暂展示选中效果，自动进入商店
		setTimeout(openShop, 450);
	};

	const openShop = () => {
		sfxClick();
		phase = 'shop';
		shopBuffs = drawShopItems(shopLocks);
		shopPick = null;
		shopSold = [];
	};

	const refreshShop = () => {
		sfxClick();
		if (mooncakes < 2) return;
		mooncakes -= 2;
		shopBuffs = drawShopItems(shopLocks);
		shopPick = null;
		shopSold = [];
	};

	/** 锁/解锁一格:锁上时记住是哪张卡,解锁后下次刷新就会换掉它 */
	const toggleLock = (i: number) => {
		sfxClick();
		shopLocks = shopLocks.map((id, k) => (k === i ? (id ? null : (shopBuffs[i]?.id ?? null)) : id));
	};

	const buyBuff = (card: BuffCard) => {
		if (mooncakes < card.price) return;
		mooncakes -= card.price;
		buffInventory = { ...buffInventory, [card.id]: (buffInventory[card.id] ?? 0) + 1 };
		shopSold = [...shopSold, card.id];
		// 买走之后这格自动解锁：免得「已买」永远占着货架
		shopLocks = shopLocks.map((id, k) => (shopBuffs[k]?.id === card.id && id ? null : id));
		shopPick = null;
	};

	const sellTee = (idx: number) => {
		if (idx === 0) return; // 主 Tee 不可卖
		const card = cardOf(team[idx]);
		if (card) {
			mooncakes += rarityOf(card).sell;
			// 卖卡攒倍率：累计，但每回合最多计 2 个（避免靠狂卖刷爆倍率）
			if (soldThisRound < 2) {
				soldThisRound += 1;
				soldTees += 1;
			}
		}
		team = team.filter((_, i) => i !== idx);
		if (currentTee >= team.length) currentTee = team.length - 1;
	};

	const nextRound = () => {
		sfxClick();
		round += 1;
		beginRound();
	};

	const restart = () => {
		sfxClick();
		phase = 'idle';
		draftChoices = [];
		draftPicked = [];
		save = getSave();
	};

	// ---- 展示 ----

	/** 真实进度(可以 >1):目标达成后继续堆分时,让玩家看到 340% 这种数字 */
	const rawProgress = $derived(target > 0 ? displayScore / target : 0);
	const moonPhase = $derived(Math.min(1, rawProgress));
	/** 月相遮罩位移(0-100%,100% 即遮罩完全移出=满月)。
	 *  幂函数 p^1.5 压缩低进度:10% 进度时位移仅 3%(细月牙),
	 *  50% 接近上弦,100% 满月 */
	const moonShiftPct = $derived(Math.min(100, Math.pow(Math.max(0, moonPhase), 1.5) * 100));
	/** 进度条填充宽度:永远夹在 100,条子不许溢出 */
	const progressFillPct = $derived(Math.min(100, Math.round(rawProgress * 100)));
	/** 显示用的百分比:不夹上限(超了就显示 340%),负数/无目标时按 0 */
	const progressPct = $derived(Math.max(0, Math.round(rawProgress * 100)));
	const currentTeeCard = $derived(cardOf(team[currentTee] ?? team[0]));
	const canPickReward = $derived(team.length < TEAM_LIMIT);

	const formatScore = (n: number) => n.toLocaleString('zh-CN');

	const teeAnimClass = $derived(
		teeAnim === 'celebrate'
			? 'tee-celebrate'
			: teeAnim === 'happy'
				? 'tee-happy'
				: teeAnim === 'sad'
					? 'tee-sad'
					: teeAnim === 'throw'
						? 'tee-throw'
						: ''
	);

	// ---- 分阶段布局（移动端单屏）----
	// 手机屏幕只有 ~590px 可用高度，一律铺开必然要滚动。
	// 按阶段只保留该阶段真正要用的面板，其余收成一行道具条。

	/** 集市/商店阶段:矮屏放不下 6 张普通卡换行 → 单行横滑 */
	const marketTeam = $derived(phase === 'reward' || phase === 'shop');
	/** 加成卡货架(掷骰前要拖/点应用,完整展示) */
	// 商店阶段也显示（只看不用：挂卡只在掷骰前），否则卖掉/买卡的决策少了信息
	const showBuffShelf = $derived((phase === 'intro' || phase === 'shop') && buffEntries.length > 0);
	/** 精简道具条:不可操作但需要知道手里有什么的阶段 */
	const showItemBar = $derived(phase === 'round_end' && buffEntries.length > 0);
	/**
	 * 本轮结算文字最多几行(Boss 效果 + 等级 + 各 Tee 身上的加成 + 总分)。
	 * 用最长的那个 Tee 做上界,给结果区占位,逐条弹出时骰子才不会被顶上去。
	 */
	const settleReserveLines = $derived(
		(boss?.mods ? 1 : 0) + 1 + Math.max(0, ...team.map((_, i) => potentialSources(i))) + 1
	);

	/** 该 Tee 最多能产生几条得分来源(等级 1 条 + 总分 1 条另算) */
	const potentialSources = (i: number): number => {
		let n = 0;
		const count = (eff: TeeEffect) => {
			switch (eff.type) {
				case 'chips':
				case 'mult':
				case 'chips_mult':
				case 'cond':
				case 'team_chips':
				case 'per_team_chips':
				case 'scaling_mult':
				case 'sum_chips':
				case 'player_die':
				case 'per_buff':
				case 'per_tag':
				case 'on_player':
				case 'neighbor':
					n += 1;
					break;
				case 'bundle':
					eff.parts.forEach(count);
					break;
				default:
					break;
			}
		};
		for (const { eff } of selfEffects(i)) count(eff);
		for (const b of team[i]?.buffs ?? []) {
			const e = BUFF_BY_ID.get(b.cardId)?.effect;
			if (e && (e.type === 'chips' || e.type === 'mult' || e.type === 'chips_mult')) n += 1;
		}
		return n;
	};

	/** 团队结算文字最多几行(团队倍率卡 + 接力回流 各占一行,+ 总分一行) */
	const teamSettleReserveLines = $derived(
		Math.max(
			1,
			allCards().filter((c) => {
				const j = JSON.stringify(c.effect);
				return j.includes('team_mult') || j.includes('relay_pct');
			}).length + 1
		)
	);

	/** 队伍面板只在真正需要操作/看结果的阶段完整展示 */
	const showTeamPanel = $derived(phase !== 'round_end' && phase !== 'game_over');
</script>

<svelte:head>
	<title>中秋博饼大会 - TeeworldsCN</title>
	<meta property="og:title" content="中秋博饼大会 - TeeworldsCN" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://teeworlds.cn/zhongqiu" />
	<meta
		property="og:description"
		content="月宫掷骰：带队 Tee 排队博饼，兑换 Tee 卡构筑队伍，冲击无限高分！"
	/>
	<meta property="og:image" content="https://teeworlds.cn/shareicon.png" />
	<meta
		name="description"
		content="月宫掷骰：带队 Tee 排队博饼，兑换 Tee 卡构筑队伍，冲击无限高分！"
	/>
</svelte:head>

<div
	class="relative flex min-h-full flex-col overflow-hidden text-slate-200"
	style={fitScale < 1 ? `height: ${availH}px` : ''}
>
	{#snippet buffPop(card: BuffCard, cls: string)}
		<!-- 加成卡说明浮层:绝对定位不参与布局,描述可以完整显示不用截断 -->
		<div
			class="pointer-events-none z-50 w-max max-w-[17rem] rounded-lg border border-sky-400/50 bg-slate-950/95 px-2.5 py-1.5 text-center text-[11px] leading-snug shadow-xl {cls}"
		>
			<div class="font-semibold text-amber-300">
				{card.name}
				<span class="ml-1 font-normal text-sky-300">持续 {card.turns} 关</span>
			</div>
			<div class="mt-0.5 text-slate-300">{card.desc}</div>
			<div class="mt-1 text-[10px] text-slate-400">点队伍里的 Tee 挂上</div>
		</div>
	{/snippet}

	{#snippet buffChip(card: BuffCard, count: number, interactive = false)}
		<!-- 加成卡芯片:所有宽度统一形态(不再用大卡);掷骰前可点选/拖到 Tee 上 -->
		{@const state =
			selectedBuff?.id === card.id
				? 'border-amber-400 bg-amber-400/15'
				: interactive
					? 'border-sky-500/40 bg-slate-800/70'
					: 'border-slate-700/60 bg-slate-800/60'}
		{#snippet inner()}
			<span class="h-5 w-5 shrink-0 sm:h-6 sm:w-6"
				><TeeRender name={card.skin} className="h-full w-full" /></span
			>
			<span class="text-[11px] leading-tight font-semibold text-slate-200 sm:text-xs"
				>{card.name}</span
			>
			<span class="text-[10px] font-bold text-amber-300 sm:text-[11px]">×{count}</span>
		{/snippet}
		{#if interactive}
			<button
				class="flex shrink-0 cursor-grab items-center gap-1 rounded-lg border px-1.5 py-0.5 transition sm:gap-1.5 sm:px-2 sm:py-1 {state}"
				draggable
				ondragstart={(e) => onBuffDragStart(e, card)}
				onclick={() => toggleSelectBuff(card)}
				title="拖到队伍 Tee 上使用(或点选后再点 Tee)"
			>
				{@render inner()}
			</button>
		{:else}
			<div
				class="flex shrink-0 items-center gap-1 rounded-lg border px-1.5 py-0.5 transition sm:gap-1.5 sm:px-2 sm:py-1 {state}"
				title={`${card.name}:${card.desc} · 持续 ${card.turns} 关`}
			>
				{@render inner()}
			</div>
		{/if}
	{/snippet}
	<!-- 夜空背景:固定在可视区域内(fixed),内容再长也不会把月亮推走 -->
	<div class="sky pointer-events-none fixed inset-x-0 top-11 bottom-8">
		{#each Array.from({ length: 40 }, (_, i) => i) as i}
			<span
				class="star"
				style={`left: ${(i * 37 + 13) % 100}%; top: ${(i * 53 + 7) % 60}%; animation-delay: ${(i % 7) * 0.6}s; width: ${(i % 3) + 1}px; height: ${(i % 3) + 1}px;`}
			></span>
		{/each}
		<div class="moon" class:dim={phase !== 'idle'}></div>
		<div class="cloud cloud-1"></div>
		<div class="cloud cloud-2"></div>
		<div class="cloud cloud-3"></div>
	</div>

	<!-- 矮屏缩放:按 minH 布局再整体缩小(transform-origin 左上,宽高补偿回去) -->
	<div
		class="flex min-h-0 flex-1 flex-col"
		style={fitScale < 1
			? `flex: none; width: ${100 / fitScale}%; height: ${availH / fitScale}px; transform: scale(${fitScale}); transform-origin: top left`
			: ''}
	>
		<div
			class="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col px-2 pt-2 pb-2 max-[365px]:pt-1 max-[365px]:pb-1 sm:px-6 sm:pt-4 sm:pb-6"
		>
			{#snippet hud()}
				<!-- ================= HUD ================= -->
				<div
					class="rounded-xl border border-amber-500/25 bg-slate-900/70 px-2.5 py-2 backdrop-blur-sm max-[365px]:py-1 sm:rounded-2xl sm:px-4 sm:py-3"
				>
					<div class="flex items-center gap-x-2 text-xs sm:gap-x-3 sm:text-sm">
						<div class="font-bold text-amber-200">
							第 {round} 关<span class="ml-1 text-[10px] font-normal text-slate-500"
								>A{Math.ceil(round / 3)}</span
							>
						</div>
						<div class="ml-auto flex items-center gap-2 sm:gap-3">
							<span class="text-slate-400"
								>目标 <b class="text-slate-100">{formatScore(target)}</b></span
							>
							<span class="text-slate-400"
								>当前 <b class="text-emerald-300">{formatScore(displayScore)}</b></span
							>
							<span class="rounded-full bg-amber-400/15 px-2 py-0.5 font-bold text-amber-300"
								>🥮 {mooncakes}</span
							>
						</div>
					</div>

					{#if boss && phase !== 'shop' && phase !== 'reward'}
						<div
							class="mt-0.5 flex items-start gap-1 rounded-md border border-red-400/40 bg-red-400/10 px-1.5 text-[10px] leading-tight text-red-200 sm:items-center sm:py-0.5 sm:text-xs"
						>
							<span class="shrink-0">{boss.emoji}</span>
							<span class="line-clamp-2">{boss.name}:{boss.desc}</span>
						</div>
					{/if}

					<!-- 月饼进度(月相) + 工具 -->
					<div class="mt-1.5 flex items-center gap-1.5 sm:gap-2">
						<div class="mooncake relative h-6 w-6 shrink-0 sm:h-8 sm:w-8">
							<div
								class="mooncake-mask"
								style={`transform: translateX(${moonShiftPct * -1}%)`}
							></div>
						</div>
						<div class="h-2 grow overflow-hidden rounded-full bg-slate-700/70 sm:h-2.5">
							<div
								class="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-700"
								style={`width: ${progressFillPct}%`}
							></div>
						</div>
						<span class="shrink-0 text-[10px] font-semibold text-slate-400 sm:text-xs"
							>{progressPct}%</span
						>
						<button
							class="flex shrink-0 items-center gap-0.5 rounded-lg border border-slate-600/70 bg-slate-800/70 px-1.5 py-0.5 text-[11px] font-semibold text-slate-300 transition hover:bg-slate-700 sm:gap-1 sm:px-2.5 sm:py-1 sm:text-xs"
							title="切换动画速度（1x / 2x / 3x）"
							onclick={() => {
								sfxClick();
								speedIdx = (speedIdx + 1) % SPEEDS.length;
								sfxSetRate(speed);
							}}
						>
							<Fa icon={faBolt} class="text-amber-400" />
							<span>{SPEED_LABELS[speedIdx]}x</span>
						</button>
						<button
							class="shrink-0 rounded-lg border border-slate-600/70 bg-slate-800/70 px-1.5 py-0.5 text-[11px] font-semibold text-slate-300 transition hover:bg-slate-700 sm:px-2.5 sm:py-1 sm:text-xs"
							title={sfxOn ? '静音' : '开启音效'}
							onclick={toggleSfx}
						>
							{sfxOn ? '🔊' : '🔇'}
						</button>
						<button
							class="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300 transition hover:bg-amber-500/20 sm:px-2.5 sm:py-1 sm:text-xs"
							onclick={() => {
								sfxClick();
								showRules = true;
							}}
						>
							📖
						</button>
					</div>
				</div>
			{/snippet}

			{#if phase === 'idle'}
				<!-- ================= 主菜单 ================= -->
				<div class="panel-fill mx-auto w-full max-w-2xl text-center">
					<div class="text-4xl motion-safe:animate-bounce sm:text-5xl">🌕</div>
					<h1
						class="mt-1 text-2xl font-bold text-amber-200 drop-shadow-[0_0_12px_rgba(251,191,36,0.35)] sm:mt-2 sm:text-4xl"
					>
						月宫掷骰
					</h1>
					<p class="mt-1 text-xs text-slate-300 sm:mt-2 sm:text-sm">中秋博饼大会</p>

					<div
						class="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-amber-200/90 sm:mt-4 sm:text-sm"
					>
						<span class="flex items-center gap-1">
							<Fa icon={faTrophy} class="inline" /> 最高总分
							<span class="font-bold"
								>{save.bestScore > 0 ? formatScore(save.bestScore) : '暂无'}</span
							>
						</span>
						<span class="text-slate-400"
							>({save.bestRound > 0 ? `第 ${save.bestRound} 关` : '—'})</span
						>
						<span class="text-slate-500">共游玩 {save.plays} 局</span>
					</div>

					<button
						class="mt-4 w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-8 py-3 text-lg font-bold text-amber-950 shadow-lg shadow-amber-900/40 transition hover:from-amber-300 hover:to-amber-500 active:scale-95 sm:mt-5 sm:py-3.5 sm:text-xl"
						onclick={startGame}
					>
						🎲 开始博饼
					</button>

					<!-- 规则:始终展开(不折叠) -->
					<div
						class="mt-3 w-full rounded-xl border border-slate-700/60 bg-slate-900/70 p-3 text-left backdrop-blur-sm sm:mt-5 sm:rounded-2xl sm:p-4"
					>
						<div class="mb-1.5 text-sm font-bold text-amber-200">📜 玩法说明</div>
						<ul class="space-y-1 text-xs leading-snug text-slate-400 sm:space-y-1.5 sm:text-sm">
							<li>
								① 开局 <b class="text-slate-200">5 选 2</b>、<b class="text-slate-200">3 人成队</b
								>；全队轮流掷 6 骰,总分达标即过关
							</li>
							<li>
								② 每人每回合掷 <b class="text-cyan-300">2 次</b>:第一掷后可挑骰子<b>重掷</b>
								,卡牌能加到 3 次以上
							</li>
							<li>
								③ 有<b class="text-emerald-300">改点</b>的卡,掷完可点骰子改点数(如把 1 颗改成 4 点)
							</li>
							<li>
								④ 过关进<b class="text-amber-300">中秋集市</b>:免费 3 选 1 换卡,商店买<b
									class="text-sky-300">加成卡</b
								>
							</li>
							<li>
								⑤ <b class="text-sky-300">加成卡</b>掷骰前挂到 Tee 上,持续 1~3 关,可叠加
							</li>
							<li>
								⑥ 每 3 关一位<b class="text-red-300">月宫守卫</b>:目标翻倍、点数生变
							</li>
							<li>⑦ 队伍最多 {TEAM_LIMIT} 人,不限局数,冲击无限高分</li>
						</ul>
						<button
							class="mt-2 w-full rounded-lg border border-amber-500/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/20 active:scale-[0.98] sm:text-sm"
							onclick={() => (showRules = true)}
						>
							🎲 博饼等级一览
						</button>
					</div>
				</div>
			{:else if phase === 'draft'}
				<!-- ================= 开局选卡(5 选 2) ================= -->
				{@render hud()}
				<div
					class="panel-fill panel-auto mt-2.5 rounded-xl border border-amber-500/30 bg-slate-900/80 px-2.5 py-2.5 backdrop-blur-sm sm:mt-4 sm:rounded-2xl sm:p-6"
				>
					<div class="text-center">
						<div class="text-base font-bold text-amber-200 sm:text-xl">🎲 挑 2 张 Tee 卡开局</div>
						<div class="mt-0.5 text-[11px] text-slate-400 sm:text-xs">
							点卡查看效果 · 已选 <b class="text-amber-300">{draftPicked.length}</b>/2 · 角标 =
							出战顺序(左→右)
						</div>
					</div>
					<div class="mt-2.5 flex flex-wrap justify-center gap-2 sm:mt-4 sm:gap-3">
						{#each draftChoices as card, idx}
							<TeeCardView
								{card}
								desc={card.desc}
								selected={draftPicked.includes(idx)}
								badge={draftPicked.includes(idx) ? String(draftPicked.indexOf(idx) + 1) : undefined}
								badgeClass="bg-emerald-500/90 text-emerald-950"
							>
								{#snippet actions()}
									<button
										class="w-full rounded-lg border py-1 text-xs font-bold transition {draftPicked.includes(
											idx
										)
											? 'border-emerald-400/60 bg-emerald-500/80 text-emerald-950'
											: 'border-amber-500/40 bg-amber-500/80 text-amber-950 hover:bg-amber-400'}"
										onclick={() => toggleDraftPick(idx)}
									>
										{draftPicked.includes(idx) ? '已选 ✓' : '选择'}
									</button>
								{/snippet}
							</TeeCardView>
						{/each}
					</div>
					<div class="mt-3 flex justify-center">
						<button
							class="w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-8 py-2.5 text-base font-bold text-amber-950 shadow-lg transition hover:from-amber-300 hover:to-amber-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:from-amber-400 disabled:hover:to-amber-600 sm:w-auto sm:px-10 sm:text-lg"
							onclick={confirmDraft}
							disabled={draftPicked.length !== 2}
						>
							开始博饼 →
						</button>
					</div>
				</div>
			{:else}
				{@render hud()}

				<!-- ================= 队伍 & 道具 ================= -->
				{#if showTeamPanel}
					<div
						class="mt-2.5 rounded-xl border border-slate-700/60 bg-slate-900/60 px-2.5 py-2 backdrop-blur-sm max-[365px]:mt-1.5 max-[365px]:py-1 sm:mt-4 sm:rounded-2xl sm:p-3"
					>
						<div
							class="flex items-center justify-between gap-2 text-[11px] text-slate-400 sm:text-xs"
						>
							<span class="shrink-0">👥 博饼队伍({team.length}/{TEAM_LIMIT})</span>

							<span class="hidden text-slate-500 sm:inline">轮流上前掷骰，队伍总分为总奖品</span>
						</div>

						<!-- 加成卡:掷骰前拖/点到 Tee 身上,故排在最前 -->
						{#if showBuffShelf}
							<div class="mt-1 border-t border-sky-500/20 pt-1">
								<div class="flex items-center justify-between gap-2 text-[11px] text-slate-400">
									<span>
										✨ 加成卡
										{#if phase === 'intro'}
											<span class="text-sky-300">· 点选后点 Tee 挂上</span>
										{/if}
									</span>
									<span class="shrink-0 text-slate-500">持续 1~3 关</span>
								</div>
								<!-- 所有宽度统一芯片:手机单行横滑,桌面换行 -->
								<div class="relative">
									<div
										class="mt-1.5 flex gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:gap-2 sm:overflow-visible"
									>
										{#each buffEntries as [id, count]}
											{@const card = BUFF_BY_ID.get(id)!}
											<div class="relative shrink-0">
												{@render buffChip(card, count, phase === 'intro')}
												{#if selectedBuff?.id === card.id}
													<!-- 桌面:说明浮在选中的芯片上方 -->
													{@render buffPop(
														card,
														'absolute bottom-full left-0 mb-1 hidden sm:block'
													)}
												{/if}
											</div>
										{/each}
									</div>
									{#if selectedBuff}
										<!-- 手机:横滑容器会裁掉芯片内的绝对定位,说明居中挂在容器上 -->
										{@render buffPop(
											selectedBuff,
											'absolute bottom-full left-1/2 mb-1 -translate-x-1/2 sm:hidden'
										)}
									{/if}
								</div>
							</div>
						{/if}

						<!-- 队伍:商店阶段也用普通卡(去掉结果行省高度) -->
						<div class="mt-2 flex flex-wrap gap-1.5 sm:gap-2 {marketTeam ? 'market-team' : ''}">
							{#each team as tee, i (i)}
								<div
									role="button"
									tabindex={phase === 'intro' && selectedBuff ? 0 : -1}
									class="rounded-xl p-0.5 transition {phase === 'intro' && selectedBuff
										? 'bg-amber-400/5 ring-1 ring-amber-400/70'
										: ''}"
									ondragover={(e) => {
										if (phase === 'intro') e.preventDefault();
									}}
									ondrop={(e) => onTeeDrop(e, i)}
									onclick={() => selectedBuff && applyBuffToTee(selectedBuff, i)}
									onkeydown={(e) => {
										if ((e.key === 'Enter' || e.key === ' ') && selectedBuff) {
											e.preventDefault();
											applyBuffToTee(selectedBuff, i);
										}
									}}
								>
									{#snippet sellBtn()}
										{#if (phase === 'reward' || phase === 'shop') && i > 0 && tee.cardId}
											<button
												class="absolute -top-1.5 -right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/90 text-[10px] font-bold text-white shadow transition hover:bg-red-400"
												title="卖出 {cardOf(tee)?.name},得 {rarityOf(cardOf(tee)).sell} 🥮"
												onclick={() => sellTee(i)}
											>
												×
											</button>
										{/if}
									{/snippet}
									<TeeCardView
										card={cardOf(tee)}
										skin={tee.playerSkin ?? 'x_spec'}
										name="我"
										desc={cardOf(tee)?.desc}
										tipExtra={tee.cardId ? `卖出得 ${rarityOf(cardOf(tee)).sell} 🥮` : undefined}
										tipList={teeTipList(tee)}
										badge={[
											tee.buffs.length > 0 ? `✨${tee.buffs.length}` : '',
											activeSkills(effectiveEffects(teamCards, i), tee.buffs).length > 0
												? (tee.charge ?? 0) > 0
													? `⚡${tee.charge}`
													: '⚡'
												: ''
										]
											.filter(Boolean)
											.join(' ') || undefined}
										emote={i === currentTee ? teeEmote : EMOTE.normal}
										pose={i === currentTee ? teePose : IDLE_POSE}
										active={i === currentTee && phase === 'rolling'}
										animate={i === currentTee ? teeAnimClass : ''}
										sellBtn={(phase === 'reward' || phase === 'shop') && i > 0 && tee.cardId
											? sellBtn
											: undefined}
									>
										{#snippet actions()}
											<!-- 两种状态都占两行:待掷(1 行)→ 点数+等级(2 行)会让整队高度跳 14px -->
											{#if phase === 'shop'}
												<!-- 商店阶段:回合已结算,结果看结算面板;省一行高度给 6 人满队 -->
											{:else if tee.lastScore > 0}
												<div class="text-[10px] font-bold text-amber-300">
													{formatScore(tee.lastScore)}
												</div>
												<div class="text-[9px] text-slate-500">
													{getRollLevel(tee.lastLevelId).name}
												</div>
											{:else}
												<div class="text-[10px] font-bold text-slate-600">
													待掷<span class="text-slate-500">·{rollsFor(i)}次</span>
												</div>
												<div class="text-[9px] text-slate-500">&nbsp;</div>
											{/if}
										{/snippet}
									</TeeCardView>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- ================= 精简道具条(不需要操作道具的阶段) ================= -->
				{#if showItemBar}
					<div
						class="mt-2.5 flex items-center gap-1.5 overflow-x-auto rounded-xl border border-sky-500/20 bg-slate-900/60 px-2.5 py-1.5 backdrop-blur-sm sm:mt-4 sm:flex-wrap sm:overflow-visible sm:rounded-2xl"
					>
						{#each buffEntries as [id, count]}
							{@const card = BUFF_BY_ID.get(id)!}
							{@render buffChip(card, count)}
						{/each}
					</div>
				{/if}

				<!-- ================= 骰子区 ================= -->
				{#if phase === 'intro' || phase === 'rolling'}
					<div
						class="panel-fill mt-2.5 rounded-xl border border-amber-500/25 bg-slate-900/70 px-2.5 py-2 backdrop-blur-sm max-[365px]:mt-1.5 max-[365px]:py-1.5 sm:mt-4 sm:rounded-2xl sm:p-4"
					>
						{#if phase === 'intro'}
							<!-- Boss 说明已在 HUD 上,这里不重复(小屏高度宝贵) -->
							<div class="w-full text-center">
								<button
									class="w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-8 py-2.5 text-base font-bold text-amber-950 shadow-lg transition hover:from-amber-300 hover:to-amber-500 active:scale-95 max-[365px]:py-2 sm:w-auto sm:px-10 sm:text-lg"
									onclick={startRolling}
								>
									🎲 {boss ? '迎战掷骰' : '开始掷骰'}
								</button>
							</div>
						{:else}
							<!-- 单颗骰子封顶 56px(行宽 = 6×56 + 5×间隙):手机宽屏/平板/PC 都不再放大 -->
							<div
								class="mx-auto grid w-full max-w-[22.25rem] grid-cols-6 gap-1 sm:max-w-[23.5rem] sm:gap-2"
							>
								{#each [0, 1, 2, 3, 4, 5] as i}
									<button
										class="die min-w-0 {dieRolling(i) ? 'rolling' : ''} {hitDice.includes(i)
											? 'hit'
											: ''} {choosing && rerollSel[i] ? 'marked' : ''} {diceModded(i)
											? 'moded'
											: ''} {choosing || pendingAction
											? 'cursor-pointer hover:scale-110'
											: 'cursor-default'}"
										style={`animation-duration: ${rollDur}s; animation-delay: ${dieDelay(i)}s; animation-iteration-count: ${rollIter}`}
										onclick={() => (choosing ? toggleReroll(i) : pendingAction && onDieClick(i))}
										disabled={!choosing && !pendingAction}
										class:voided={dieVoid(i)}
									>
										<!-- 骰面用内联 SVG:不依赖 ::after/container-query/:has(),老浏览器也能渲染 -->
										<svg class="die-face" viewBox="0 0 24 24" aria-hidden="true">
											{#each PIP_POS as [cx, cy], idx}
												{#if showPip(dice[i], idx + 1)}
													<circle {cx} {cy} r="2.6" class:red={!dieRolling(i) && dice[i] === 4} />
												{/if}
											{/each}
										</svg>
										{#if diceModded(i)}
											<!-- 点数被改造:原始点阵淡化,叠一个半透明的「实际点数」 -->
											{#if dieVoid(i)}
												<span class="die-void" title={`${dice[i]} 点本关作废:不算任何牌型`}>✕</span>
											{:else}
												<span class="die-mod" class:is-four={shownDice[i] === 4}
													>{shownDice[i]}</span
												>
											{/if}
										{/if}
										{#if choosing && rerollSel[i]}
											<span class="reroll-mark">↻</span>
										{/if}
									</button>
								{/each}
							</div>

							<!-- 交互提示 -->
							<div
								class="mt-1.5 flex items-center justify-center gap-2 text-center text-xs max-[365px]:mt-1 max-[365px]:text-[10px] sm:text-sm"
							>
								{#if pendingActive}
									<!-- 充能技能:结算播完,等玩家决定要不要发动 -->
									<span class="text-fuchsia-300">
										⚡ <b>{cardById(pendingActive.srcId)?.name ?? '技能'}</b>
										{#if pendingActive.skill === 'chips'}
											+{formatScore(pendingActive.value)} 分
										{:else if pendingActive.skill === 'left_chips'}
											左侧 +{formatScore(pendingActive.value)} 分
										{:else}
											本关重掷
										{/if}
										<span class="text-slate-500">(冷却 {pendingActive.cooldown} 关)</span>
									</span>
									<button
										class="shrink-0 rounded-lg bg-gradient-to-b from-fuchsia-400 to-fuchsia-600 px-3 py-0.5 text-xs font-bold whitespace-nowrap text-fuchsia-950 shadow transition hover:from-fuchsia-300 hover:to-fuchsia-500 active:scale-95 sm:px-5 sm:py-1 sm:text-sm"
										onclick={useActive}
									>
										⚡ 发动
									</button>
									<button
										class="shrink-0 rounded-lg border border-slate-500 bg-slate-700 px-3 py-0.5 text-xs font-semibold whitespace-nowrap text-slate-200 transition hover:bg-slate-600 sm:px-4 sm:py-1 sm:text-sm"
										onclick={skipActive}
									>
										留着
									</button>
								{:else if choosing}
									<span class="hidden text-cyan-300 sm:inline">
										点骰子挑出要<b>重掷</b>的(还能重掷 {rollsLeft} 次)
									</span>
									<button
										class="rounded-lg bg-gradient-to-b from-cyan-400 to-cyan-600 px-4 py-0.5 text-xs font-bold text-cyan-950 shadow transition hover:from-cyan-300 hover:to-cyan-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:from-cyan-400 disabled:hover:to-cyan-600 sm:px-5 sm:py-1 sm:text-sm"
										onclick={confirmReroll}
										disabled={!rerollSel.some(Boolean)}
									>
										🎲 重掷 {rerollSel.filter(Boolean).length} 颗
									</button>
									<button
										class="rounded-lg border border-slate-500 bg-slate-700 px-3 py-0.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-600 sm:px-4 sm:py-1 sm:text-sm"
										onclick={skipReroll}
									>
										保留全部
									</button>
								{:else if pendingAction?.kind === 'set_point'}
									<span class="text-cyan-300"
										>✨ 点骰子改为 {pendingAction.point} 点{#if pendingAction.count > 1}(还剩
											{pendingAction.count} 颗){/if}</span
									>
								{:else if pendingAction?.kind === 'bump'}
									<span class="text-cyan-300"
										>✨ 点骰子让它 +1{#if pendingAction.count > 1}(还剩 {pendingAction.count} 颗){/if}</span
									>
								{:else if pendingAction?.kind === 'set_any'}
									<span class="text-cyan-300"
										>✨ 点骰子选点数{#if pendingAction.count > 1}(还剩 {pendingAction.count} 颗){/if}</span
									>
								{:else if rolling}
									<span class="text-slate-400">{currentTeeCard?.name ?? '我'} 正在博饼...</span>
								{:else}
									<span class="text-slate-400">{currentTeeCard?.name ?? '我'} 掷出了...</span>
								{/if}
								{#if pendingAction}
									<button class="ml-2 text-xs text-slate-500 underline" onclick={cancelAction}
										>跳过改点</button
									>
								{/if}
							</div>

							<!-- 点数选择(set_any) -->
							{#if pointPicker}
								<div class="mt-1 flex justify-center gap-2">
									{#each [1, 2, 3, 4, 5, 6] as v}
										<button
											class="h-8 w-8 rounded-lg bg-slate-700 font-bold text-slate-200 transition hover:bg-amber-500 hover:text-amber-950 {v ===
											4
												? 'ring-2 ring-red-400'
												: ''}"
											onclick={() => pickPoint(v)}
										>
											{v}
										</button>
									{/each}
								</div>
							{/if}

							<!-- 最近结果: 结算动画逐条弹出 -->
							<!-- 结果区按本轮行数预先占位:未弹出的行用不可见空行顶着,
						     文字逐条弹出时高度不变,居中的骰子不会被顶上去 -->
							<div
								bind:this={stepsEl}
								class="mt-0.5 flex max-h-[4.8rem] shrink-0 flex-col items-center justify-start gap-0 overflow-y-auto text-xs leading-[1.1] max-[365px]:mt-0.5 max-[365px]:max-h-[4rem] max-[365px]:text-[10px] max-[365px]:leading-[1.1] sm:max-h-none sm:overflow-visible sm:text-sm sm:leading-normal"
							>
								{#each Array.from({ length: Math.max(settleReserveLines, settleSteps.length) }, (_, i) => i) as i (i)}
									{#if i <= settleIdx && settleSteps[i]}
										<div class="settle-step {settleSteps[i].cls}">{settleSteps[i].text}</div>
									{:else}
										<div class="invisible" aria-hidden="true">&nbsp;</div>
									{/if}
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				<!-- ================= 回合确认(全队掷完, 结算前) ================= -->
				{#if phase === 'round_confirm'}
					<div
						class="panel-fill mt-2.5 rounded-xl border border-amber-500/25 bg-slate-900/70 px-2.5 py-2.5 text-center backdrop-blur-sm max-[365px]:py-2 sm:mt-4 sm:rounded-2xl sm:p-4"
					>
						<div class="hidden text-sm font-bold text-amber-200 sm:block sm:text-lg">
							🌕 回合结算
						</div>
						<!-- 结算区按本轮行数预先占位(未弹的行用不可见空行顶着):
					     否则团队倍率卡一条条弹出时,下面的按钮会被顶下去 -->
						<div class="mt-1 flex flex-col items-center justify-center gap-0.5 text-xs sm:text-sm">
							{#each Array.from({ length: Math.max(teamSettleReserveLines, teamSettleSteps.length) }, (_, i) => i) as i (i)}
								{#if teamSettleSteps.length === 0 && i === 0}
									<div class="text-[11px] text-slate-400 sm:text-xs">
										全队已掷完,各 Tee 得分合计
										<span class="font-bold text-slate-200"
											>{formatScore(team.reduce((s, t) => s + t.lastScore, 0))}</span
										>
									</div>
								{:else if teamSettleSteps[i] && i <= teamSettleIdx}
									<div class="settle-step {teamSettleSteps[i].cls}">{teamSettleSteps[i].text}</div>
								{:else}
									<div class="invisible" aria-hidden="true">&nbsp;</div>
								{/if}
							{/each}
						</div>
						<!-- 结算期间保持按钮占位,不换成一行文字:44px 塌成 20px 会把上面的结算文字顶下去 -->
						<button
							class="mt-2.5 w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-8 py-2.5 text-base font-bold text-amber-950 shadow-lg transition hover:from-amber-300 hover:to-amber-500 active:scale-95 disabled:cursor-default disabled:opacity-60 disabled:hover:from-amber-400 disabled:hover:to-amber-600 sm:w-auto sm:px-10 sm:text-lg"
							onclick={confirmRound}
							disabled={teamSettling}
						>
							{teamSettling ? '结算中...' : '🥮 结算回合'}
						</button>
					</div>
				{/if}

				<!-- ================= 过关结算 ================= -->
				{#if phase === 'round_end'}
					<div
						class="panel-fill mt-2.5 rounded-xl border border-emerald-400/40 bg-slate-900/80 px-3 py-3 text-center backdrop-blur-sm max-[365px]:py-2 sm:mt-4 sm:rounded-2xl sm:p-6"
					>
						<div class="result-banner">
							<div class="text-3xl sm:text-4xl">🌕</div>
							<div class="mt-1 text-xl font-bold text-emerald-300 sm:text-2xl">
								过关！月饼到手！
							</div>
							<div class="mt-1.5 text-xs text-slate-300 sm:text-sm">
								本关得分 <span class="font-bold text-amber-300">{formatScore(roundTotal)}</span> /
								目标
								{formatScore(target)}
							</div>
							<div class="mt-1 text-xs text-slate-400 sm:text-sm">
								本局总分 <span class="font-bold text-amber-200">{formatScore(runScore)}</span>
							</div>
							<div
								class="mx-auto mt-2.5 flex max-w-md flex-col gap-1 text-xs text-slate-400 sm:text-sm"
							>
								<div class="flex justify-between rounded bg-slate-800/60 px-3 py-1">
									<span>过关奖励</span><span class="font-bold text-amber-300"
										>+{roundRewardGained} 🥮</span
									>
								</div>
								{#if overflowGained > 0}
									<div class="flex justify-between rounded bg-slate-800/60 px-3 py-1">
										<span>溢出奖励（每超出目标 50% +1，上限 8）</span><span
											class="font-bold text-amber-300">+{overflowGained} 🥮</span
										>
									</div>
								{/if}
								{#if economyGained > 0}
									<div class="flex justify-between rounded bg-slate-800/60 px-3 py-1">
										<span>经商收益</span><span class="font-bold text-amber-300"
											>+{economyGained} 🥮</span
										>
									</div>
								{/if}
							</div>
							<button
								class="mt-3.5 w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-8 py-2.5 text-base font-bold text-amber-950 shadow-lg transition hover:from-amber-300 hover:to-amber-500 active:scale-95 sm:w-auto sm:px-10 sm:text-lg"
								onclick={nextReward}
							>
								🏮 去中秋集市
							</button>
						</div>
					</div>
				{/if}

				<!-- ================= 集市: 3 选 1 ================= -->
				{#if phase === 'reward'}
					<div
						class="panel-fill panel-auto mt-2.5 rounded-xl border border-amber-500/30 bg-slate-900/80 px-2.5 py-2.5 backdrop-blur-sm sm:mt-4 sm:rounded-2xl sm:p-6"
					>
						<div class="text-center">
							<div class="text-base font-bold text-amber-200 sm:text-xl">
								🏮 中秋集市 · 免费选 1 张 Tee 卡
							</div>
							<div class="mt-0.5 text-[11px] text-slate-400 sm:text-xs">
								{canPickReward ? '选卡后自动进入商店 · 刷新需 2 🥮' : '（队伍已满，先去商店卖卡）'}
								· 当前 🥮 {mooncakes}
							</div>
						</div>
						<div class="mt-2.5 flex justify-center gap-2 sm:mt-4 sm:gap-4">
							{#each rewardChoices as card, idx}
								<TeeCardView {card} desc={card.desc} selected={lastRewardIdx === idx}>
									{#snippet actions()}
										<button
											class="w-full rounded-lg border border-amber-500/40 bg-amber-500/80 py-1 text-xs font-bold text-amber-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40 max-[365px]:py-0.5"
											onclick={() => canPickReward && pickReward(idx)}
											disabled={lastRewardIdx >= 0 || !canPickReward}
										>
											{lastRewardIdx === idx ? '已选 ✓' : '选择'}
										</button>
									{/snippet}
								</TeeCardView>
							{/each}
						</div>
						<div class="mt-3 flex justify-center gap-2 sm:gap-3">
							<button
								class="rounded-lg border border-slate-500 bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-600 disabled:opacity-40 sm:px-4 sm:py-2 sm:text-sm"
								onclick={refreshReward}
								disabled={mooncakes < 2 || lastRewardIdx >= 0}
							>
								<Fa icon={faRotate} class="mr-1 inline" />刷新(2 🥮)
							</button>
							<button
								class="rounded-lg border border-slate-500 bg-slate-700 px-5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-600 sm:px-6 sm:py-2 sm:text-sm"
								onclick={openShop}
							>
								<Fa icon={faStore} class="mr-1 inline" />跳过 →
							</button>
						</div>
					</div>
				{/if}

				<!-- ================= 商店 ================= -->
				{#if phase === 'shop'}
					<div
						class="panel-fill mt-2.5 rounded-xl border border-amber-500/30 bg-slate-900/80 px-2.5 py-1.5 backdrop-blur-sm max-[365px]:py-1 sm:mt-4 sm:rounded-2xl sm:p-6"
					>
						<div class="flex items-center justify-between">
							<div class="text-base font-bold text-amber-200 sm:text-xl">🛒 商店</div>
							<div class="text-xs text-amber-300 sm:text-sm">🥮 {mooncakes}</div>
						</div>

						<div class="mt-1 flex items-baseline justify-between sm:mt-3">
							<div class="text-xs font-bold text-sky-300 sm:text-sm">✨ 加成卡</div>
							<div class="text-[10px] text-slate-500">掷骰前挂到 Tee 身上</div>
						</div>
						<!-- 商店货架:和队伍面板同款的小芯片,固定 3 列等宽(两排对齐) -->
						<div class="mt-1 grid grid-cols-3 gap-1.5 max-[365px]:gap-1 sm:mt-2 sm:gap-2">
							{#each shopBuffs as card, ci}
								{@const picked = shopPick?.id === card.id}
								{@const sold = shopSold.includes(card.id)}
								{@const locked = !!shopLocks[ci]}
								<div class="relative">
									<button
										class="flex h-8 w-full items-center gap-1 rounded-lg border py-0 pr-5 pl-1.5 text-left transition {locked
											? 'border-amber-400/70 bg-amber-400/10'
											: sold
												? 'border-slate-700/50 bg-slate-900/50 opacity-45'
												: picked
													? 'border-amber-400 bg-amber-400/15'
													: ci === 5
														? 'border-fuchsia-400/50 bg-slate-800/70'
														: 'border-sky-500/40 bg-slate-800/70'} {!sold && mooncakes < card.price
											? 'opacity-50'
											: ''}"
										onclick={() => !sold && (shopPick = picked ? null : card)}
										disabled={sold}
									>
										<span class="h-4 w-4 shrink-0"
											><TeeRender name={card.skin} className="h-full w-full" /></span
										>
										<span
											class="min-w-0 flex-1 truncate text-[10px] leading-tight font-semibold text-slate-200"
											>{card.name}</span
										>
										<span class="shrink-0 text-[10px] font-bold text-amber-300"
											>{sold ? '已买' : `🥮${card.price}`}</span
										>
									</button>
									<!-- 锁定:锁住的格子刷新/下次进商店都不变 -->
									<button
										class="absolute top-0 right-0 flex h-8 w-5 items-center justify-center text-[10px] {locked
											? 'text-amber-300'
											: 'text-slate-500 hover:text-slate-300'}"
										title={locked ? '已锁定：刷新和下次进商店都不会变' : '锁定这格商品'}
										aria-label={locked ? '解锁' : '锁定'}
										onclick={(e) => {
											e.stopPropagation();
											toggleLock(ci);
										}}
									>
										<Fa icon={locked ? faLock : faLockOpen} />
									</button>
								</div>
							{/each}
						</div>

						<!-- 说明条常驻(未选中时是一条提示):高度写死,免得选中/取消把下面的按钮顶来顶去 -->
						<div
							class="mt-1.5 flex h-11 items-center gap-2 rounded-lg border px-2 {shopPick
								? 'border-amber-500/30 bg-slate-950/60'
								: 'border-slate-700/40 bg-slate-950/30'}"
						>
							{#if shopPick}
								<div class="line-clamp-2 min-w-0 flex-1 text-[11px] leading-snug text-slate-300">
									<b class="text-amber-300">{shopPick.name}</b>
									· {shopPick.desc} · 持续 {shopPick.turns} 关
								</div>
								<button
									class="shrink-0 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 px-3 py-0.5 text-[11px] font-bold whitespace-nowrap text-amber-950 transition hover:from-amber-300 hover:to-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
									onclick={() => buyBuff(shopPick!)}
									disabled={mooncakes < shopPick.price}
								>
									买 🥮{shopPick.price}
								</button>
							{:else}
								<span class="text-[11px] text-slate-500"
									>点道具看说明 · 🔒 锁住的格子刷新/下关都不变</span
								>
							{/if}
						</div>

						<div class="mt-1.5 flex justify-center gap-2 sm:gap-3">
							<button
								class="rounded-lg border border-slate-500 bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-600 disabled:opacity-40 sm:px-4 sm:py-2 sm:text-sm"
								onclick={refreshShop}
								disabled={mooncakes < 2 || shopLocks.every((l) => l)}
							>
								<Fa icon={faRotate} class="mr-1 inline" />刷新(2 🥮)
							</button>
							<button
								class="rounded-lg bg-gradient-to-b from-amber-400 to-amber-600 px-6 py-1.5 text-xs font-bold text-amber-950 transition hover:from-amber-300 hover:to-amber-500 sm:px-8 sm:py-2 sm:text-sm"
								onclick={nextRound}
							>
								下一关 →
							</button>
						</div>
					</div>
				{/if}

				<!-- ================= 游戏结束 ================= -->
				{#if phase === 'game_over'}
					<div
						class="panel-fill panel-auto mt-2.5 rounded-xl border border-slate-600/60 bg-slate-900/85 px-3 py-3 text-center backdrop-blur-sm sm:mt-4 sm:rounded-2xl sm:p-6"
					>
						<div class="text-3xl sm:text-4xl">🌘</div>
						<div class="mt-1 text-xl font-bold text-slate-200 sm:text-2xl">博饼结束</div>
						<div class="mt-2 text-xs text-slate-400 sm:text-sm">
							倒在了 <span class="font-bold text-slate-200">第 {finalRound} 关</span> · 本关得分
							<span class="font-bold text-slate-100">{formatScore(finalScore)}</span> / {formatScore(
								target
							)}
							<div class="mt-1">
								本局总分 <span class="font-bold text-amber-300">{formatScore(finalRunScore)}</span>
							</div>
						</div>
						{#if isNewBest}
							<div
								class="result-banner mx-auto mt-2.5 inline-block rounded-full border border-amber-400/60 bg-amber-400/15 px-4 py-1 text-xs font-bold text-amber-300 sm:text-sm"
							>
								🏆 新纪录!
							</div>
						{/if}
						<div class="mt-2.5 flex justify-center gap-2 text-xs sm:gap-6 sm:text-sm">
							<div class="rounded-lg bg-slate-800/70 px-3 py-1.5 sm:px-4 sm:py-2">
								<div class="text-base font-bold text-amber-300 sm:text-lg">
									{formatScore(save.bestScore)}
								</div>
								<div class="text-[10px] text-slate-400 sm:text-xs">最高总分</div>
							</div>
							<div class="rounded-lg bg-slate-800/70 px-3 py-1.5 sm:px-4 sm:py-2">
								<div class="text-base font-bold text-slate-100 sm:text-lg">{save.bestRound}</div>
								<div class="text-[10px] text-slate-400 sm:text-xs">最高关数</div>
							</div>
							<div class="rounded-lg bg-slate-800/70 px-3 py-1.5 sm:px-4 sm:py-2">
								<div class="text-base font-bold text-slate-100 sm:text-lg">{save.plays}</div>
								<div class="text-[10px] text-slate-400 sm:text-xs">总游玩局数</div>
							</div>
						</div>
						<div class="mt-3 flex justify-center gap-2 sm:gap-3">
							<button
								class="rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-6 py-2.5 text-base font-bold text-amber-950 shadow-lg transition hover:from-amber-300 hover:to-amber-500 active:scale-95 sm:px-10 sm:text-lg"
								onclick={startGame}
							>
								🎲 再来一局
							</button>
							<button
								class="rounded-xl border border-slate-500 bg-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-600 sm:px-6 sm:text-sm"
								onclick={restart}
							>
								返回菜单
							</button>
						</div>
					</div>
				{/if}
			{/if}

			<div
				class="mt-auto pt-2.5 text-center text-[10px] leading-tight text-slate-500 max-[365px]:hidden sm:pt-5 sm:text-xs"
			>
				祝大家中秋快乐,阖家团圆!🌕
			</div>
		</div>
	</div>

	<!-- ================= 规则弹窗 ================= -->
	{#if showRules}
		<div
			class="fixed inset-0 z-50 flex cursor-default items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
			role="presentation"
			onclick={(e) => {
				if (e.target === e.currentTarget) showRules = false;
			}}
		>
			<div
				class="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-amber-500/30 bg-slate-900 p-4 sm:p-5"
			>
				<div class="flex items-center justify-between">
					<div class="text-lg font-bold text-amber-200">📖 博饼规则</div>
					<button
						class="rounded-lg bg-slate-700/60 px-2.5 py-1 text-sm font-bold text-slate-300 transition hover:bg-slate-600"
						onclick={() => (showRules = false)}
					>
						✕
					</button>
				</div>
				<div class="mt-1 text-xs text-slate-400">
					每次掷 6 颗骰子,按骰型得分。队伍轮流掷骰,总分达到目标即过关,掷出越高等级得分越多 🥮
				</div>
				<div class="mt-3 space-y-2">
					{#each ROLL_LEVELS as lvl}
						<div
							class="flex items-center gap-2.5 rounded-xl border border-slate-700/60 bg-slate-800/40 p-2.5"
						>
							<div class="w-7 shrink-0 text-center text-xl">{lvl.emoji}</div>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-baseline gap-x-2">
									<span class="text-sm font-bold text-slate-100">{lvl.name}</span>
									<span class="text-xs font-semibold text-amber-300"
										>{formatScore(lvl.score)} 分</span
									>
								</div>
								<div class="mt-0.5 text-xs leading-snug text-slate-400">{lvl.desc}</div>
							</div>
							<div class="flex shrink-0 gap-0.5">
								{#each lvl.example as v}
									<span class="mini-die {v === 4 ? 'mini-four' : ''} {v === 'X' ? 'mini-any' : ''}"
										>{v}</span
									>
								{/each}
							</div>
						</div>
					{/each}
				</div>
				<div class="mt-3 text-center text-[11px] text-slate-500">
					红色点数为 4 点 🎯 掷中 4 点是博饼的关键
				</div>
				<div
					class="mt-2 rounded-xl border border-slate-700/60 bg-slate-800/40 p-2.5 text-xs leading-snug text-slate-400"
				>
					Boss 关可能让某个点数
					<b class="text-red-300">作废</b>（骰面上打红叉）：作废的骰子<b class="text-slate-200"
						>不算任何牌型</b
					> —— 4 点系、同点组合、对堂都不算,就当它没掷出来。
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* ---- 夜空 ---- */
	/* 渐变背景由 layout 提供(main 自定义背景),这里只留装饰 */

	.star {
		position: absolute;
		border-radius: 9999px;
		background: #fff;
		opacity: 0.7;
		animation: twinkle 3s ease-in-out infinite;
	}

	@keyframes twinkle {
		0%,
		100% {
			opacity: 0.15;
		}
		50% {
			opacity: 0.9;
		}
	}

	.moon {
		position: absolute;
		/* 贴右上角:再往下就会跟主菜单标题/副标题迭在一起 */
		top: 0;
		right: 5%;
		width: 72px;
		height: 72px;
		border-radius: 9999px;
		background: radial-gradient(
			circle at 38% 35%,
			#fffdf0 0%,
			#ffe9a8 45%,
			#f7c948 80%,
			#e0a82e 100%
		);
		box-shadow:
			0 0 40px 12px rgba(255, 224, 130, 0.35),
			0 0 120px 40px rgba(255, 200, 80, 0.15);
	}

	.moon.dim {
		opacity: 0.22;
	}

	.moon::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 9999px;
		background:
			radial-gradient(circle at 65% 35%, rgba(180, 130, 40, 0.25) 0 6%, transparent 7%),
			radial-gradient(circle at 30% 60%, rgba(180, 130, 40, 0.2) 0 9%, transparent 10%),
			radial-gradient(circle at 55% 75%, rgba(180, 130, 40, 0.22) 0 5%, transparent 6%);
	}

	.cloud {
		position: absolute;
		border-radius: 9999px;
		background: rgba(190, 200, 235, 0.08);
		filter: blur(14px);
		animation: drift linear infinite;
	}

	.cloud-1 {
		width: 340px;
		height: 56px;
		top: 18%;
		left: -20%;
		animation-duration: 90s;
	}

	.cloud-2 {
		width: 260px;
		height: 44px;
		top: 38%;
		left: -30%;
		animation-duration: 130s;
		animation-delay: -40s;
	}

	.cloud-3 {
		width: 400px;
		height: 60px;
		top: 62%;
		left: -25%;
		animation-duration: 110s;
		animation-delay: -70s;
	}

	@keyframes drift {
		from {
			transform: translateX(0);
		}
		to {
			transform: translateX(150vw);
		}
	}

	/* ---- 月饼(月相进度) ---- */
	.mooncake {
		border-radius: 9999px;
		background: radial-gradient(circle at 35% 30%, #ffe9a8 0%, #f7c948 55%, #d99a2b 100%);
		box-shadow: 0 0 16px rgba(255, 200, 80, 0.35);
		overflow: hidden;
	}

	.mooncake::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 9999px;
		background:
			radial-gradient(circle at 30% 40%, rgba(180, 120, 30, 0.3) 0 7%, transparent 8%),
			radial-gradient(circle at 65% 65%, rgba(180, 120, 30, 0.25) 0 9%, transparent 10%),
			radial-gradient(circle at 60% 25%, rgba(180, 120, 30, 0.2) 0 5%, transparent 6%);
	}

	.mooncake-mask {
		position: absolute;
		inset: 0;
		border-radius: 9999px;
		background: #0d1330;
		transition: transform 0.6s ease;
	}

	/* ---- 骰子 ---- */
	/* 6 颗骰子排一行:交给 grid 六等分,靠 aspect-ratio 自适应;
	   小屏(320px)也绝不换行/溢出 */
	.die {
		position: relative;
		/* 骰面是一整块 SVG,不需要 3×3 网格;覆盖数字用 rem,也不需要 container-query */
		display: block;
		width: 100%;
		aspect-ratio: 1;
		/* 没有 aspect-ratio 的老浏览器:至少给个高度,别让骰子塌成 0 */
		min-height: 2.75rem;
		padding: 12%;
		border-radius: 10px;
		background: linear-gradient(145deg, #fdfbf5 0%, #ece4d0 100%);
		box-shadow:
			0 4px 10px rgba(0, 0, 0, 0.45),
			inset 0 -2px 4px rgba(0, 0, 0, 0.15);
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease;
	}

	.die:disabled {
		opacity: 1;
	}

	.die.rolling {
		animation: dice-shake 0.75s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
	}

	/* 集市/商店阶段的队伍:矮屏放不下 6 张普通卡换行(2015 年的 375×667 就是矮屏),
	 * 改为单行横滑;高屏(如 419×942)有富余空间,直接换行铺开全部可见 */
	@media (max-width: 639px) and (max-height: 700px) {
		.market-team {
			flex-wrap: nowrap;
			overflow-x: auto;
			padding-bottom: 2px;
		}
	}

	/* 点数被改造(Boss 特效 / 卡牌 / 加成卡)的骰子:
	 * 骰面仍显示真实掷出的点阵(淡化),上面透明覆盖「实际算几」——
	 * 「4 视为 2」「点数 -1」这类效果以前只能看 HUD 文字,现在骰子自己会说 */
	.die.moded .die-face circle {
		opacity: 0.28;
	}

	/* 作废的骰子点阵压淡,但还看得出原来是几点,红叉是主角(:has 在旧浏览器不可用,改用类名) */
	.die.voided .die-face circle {
		opacity: 0.22;
	}

	/* 算成 4 点时用 4 的红,和骰面红点同色:一眼看出「这颗现在算 4」 */
	.die-mod.is-four {
		color: rgb(214 50 50 / 0.78);
	}

	/* 作废点数:整颗打红叉,一眼看出「这颗不算」—— 贴底居中,不再盖住中间的骰点 */
	.die-void {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 2%;
		font-size: 1.5rem;
		font-weight: 900;
		line-height: 1;
		color: rgb(220 38 38 / 0.85);
		text-shadow:
			0 0 3px rgb(255 255 255 / 0.95),
			0 0 8px rgb(255 255 255 / 0.7);
		pointer-events: none;
		user-select: none;
	}

	/* 实际点数:贴底居中(原来正居中,把中间的骰点盖住 —— 3 看成 2、5 看成 4) */
	.die-mod {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 2%;
		font-size: 1.35rem;
		font-weight: 900;
		line-height: 1;
		color: rgb(109 40 217 / 0.75);
		text-shadow:
			0 0 3px rgb(255 255 255 / 0.9),
			0 0 7px rgb(255 255 255 / 0.75);
		pointer-events: none;
		user-select: none;
	}

	/* 标记「待重掷」的骰子:斜纹 + 角标,不动尺寸也不会 shift */
	.die.marked {
		background: repeating-linear-gradient(45deg, #e8f4ff 0 6px, #cfe6ff 6px 12px);
		box-shadow:
			0 0 0 2px rgba(34, 211, 238, 0.9),
			0 4px 10px rgba(0, 0, 0, 0.45);
	}

	.reroll-mark {
		position: absolute;
		top: -6px;
		right: -6px;
		display: grid;
		place-items: center;
		width: 16px;
		height: 16px;
		border-radius: 9999px;
		background: #06b6d4;
		color: #06283a;
		font-size: 11px;
		font-weight: 700;
		line-height: 1;
	}

	.die.hit {
		animation: hit-glow 1.1s ease-in-out infinite;
	}

	@keyframes hit-glow {
		0%,
		100% {
			box-shadow:
				0 0 0 2px rgba(251, 191, 36, 0.85),
				0 0 14px rgba(251, 191, 36, 0.45),
				0 4px 10px rgba(0, 0, 0, 0.45);
		}
		50% {
			box-shadow:
				0 0 0 3px rgba(251, 191, 36, 1),
				0 0 26px rgba(251, 191, 36, 0.8),
				0 4px 10px rgba(0, 0, 0, 0.45);
		}
	}

	@keyframes dice-shake {
		0% {
			transform: rotate(0deg) translateY(0) scale(1);
		}
		15% {
			transform: rotate(110deg) translateY(-10px) scale(1.08);
		}
		35% {
			transform: rotate(200deg) translateY(3px) scale(0.94);
		}
		55% {
			transform: rotate(310deg) translateY(-7px) scale(1.05);
		}
		75% {
			transform: rotate(430deg) translateY(4px) scale(0.96);
		}
		100% {
			transform: rotate(540deg) translateY(0) scale(1);
		}
	}

	/* 骰面:内联 SVG,不依赖 ::after / container-query(旧浏览器里 CSS 点阵会整片消失) */
	.die-face {
		display: block;
		width: 100%;
		height: 100%;
	}

	.die-face circle {
		fill: #2b2b33;
	}

	.die-face circle.red {
		fill: #d63232;
	}

	/* ---- 规则面板迷你骰子 ---- */
	.mini-die {
		display: grid;
		place-items: center;
		width: 19px;
		height: 19px;
		border-radius: 4px;
		background: linear-gradient(145deg, #fdfbf5 0%, #ece4d0 100%);
		color: #2b2b33;
		font-size: 10px;
		font-weight: 700;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
	}

	.mini-die.mini-four {
		color: #d63232;
	}

	/* 示例里的「X」= 与牌型无关的散牌 */
	.mini-die.mini-any {
		color: #64748b;
		background: rgba(100, 116, 139, 0.12);
	}

	/* ---- Tee 动画(已移入 TeeCard.svelte) ---- */
	/* ---- 卡片样式已移入 TeeCard.svelte ---- */

	/* 阶段面板吃满剩余高度、内容垂直居中。
	 * 用 safe center:内容比容器高时退化成 flex-start,不会把顶部裁到滚不到 */
	.panel-fill {
		display: flex;
		flex: 1 1 0%;
		flex-direction: column;
		justify-content: safe center;
	}

	/* 结算/结束这类「信息型」面板不跟着屏幕无限长高:撑满会变成中间一块内容、
	 * 上下各几百像素的空盒子,所以回到内容高度再整体居中。
	 * (集市/商店不在此列 —— 它们跟游戏阶段一样铺满剩余高度) */
	.panel-auto {
		flex: 0 1 auto;
		margin-block: auto;
	}

	/* ---- 结果横幅 ---- */
	.settle-step {
		animation: settle-pop 0.3s ease both;
		text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
	}

	@keyframes settle-pop {
		from {
			opacity: 0;
			transform: translateY(6px) scale(0.92);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.result-banner {
		animation: banner-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
	}

	@keyframes banner-pop {
		0% {
			transform: scale(0.85);
			opacity: 0;
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}
</style>
