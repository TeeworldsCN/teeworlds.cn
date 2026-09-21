<script lang="ts">
	import { ZQ_TEST_BUILD } from '$lib/zhongqiu/test-build';
	import TeeRender, { type TeePose } from '$lib/components/TeeRender.svelte';
	import TeeCardView from '$lib/zhongqiu/TeeCard.svelte';
	import Codex from '$lib/zhongqiu/Codex.svelte';
	import BuffTip from '$lib/zhongqiu/BuffTip.svelte';
	import CardTip from '$lib/zhongqiu/CardTip.svelte';
	import {
		unlockTees,
		unlockBuffs,
		unlockBuffIds,
		codexReset,
		codexUnlockAll,
		codexRaw,
		teeUnlockedCount,
		buffUnlockedCount
	} from '$lib/zhongqiu/codex.svelte';
	import { EMOTE } from '$lib/stores/skins';
	import {
		applyDiceMods,
		cappedLevelId,
		DICE_PIPS,
		ROLL_LEVELS,
		getRollLevel,
		hitIndices,
		isVoidDie,
		isVoidFace,
		judgeRoll,
		liveDiceValues,
		rawLiveDice,
		rollDice,
		sampleDice,
		showPip,
		type DiceMods,
		type RollLevel
	} from '$lib/zhongqiu/midautumn';
	import {
		RARITY_INFO,
		cardBorderColor,
		drawCards,
		CARD_BY_ID,
		type TeeCard,
		type TeeEffect,
		CARDS
	} from '$lib/zhongqiu/teecards';
	import {
		BUFF_BY_ID,
		BUFF_CARDS,
		drawShopItems,
		type AppliedBuff,
		type BuffCard
	} from '$lib/zhongqiu/items';
	import {
		BASE_ROLLS,
		playerDiceMods,
		mergeMods,
		TEAM_LIMIT,
		normalizeSelf,
		activeReady,
		holderActiveSkills,
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
		playerActiveSkills,
		roundReward,
		roundTarget,
		saveResult,
		saveRun,
		loadRun,
		clearRun,
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
		type TeamTee,
		type RunSave
	} from '$lib/zhongqiu/game';
	import {
		initSfx,
		loadSfxPref,
		setSfxEnabled,
		sfxClick,
		sfxCoin,
		sfxEnabled,
		sfxLog,
		sfxLevel,
		sfxLose,
		sfxPick,
		sfxRoll,
		sfxSell,
		sfxSetRate,
		sfxStep,
		sfxTotal,
		sfxWin
	} from '$lib/zhongqiu/sfx';
	import { onMount, tick } from 'svelte';
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

	onMount(() => {
		setLayoutTheme({
			bg: 'linear-gradient(180deg, #070b1f 0%, #101a3f 45%, #1d2a5c 75%, #2c2a55 100%)',
			pad: false
		});
		return () => setLayoutTheme({});
	});

	// ---- 极端矮屏:整体等比缩放（不再挤面板/换布局） ----

	/**
	 * 矮屏等比缩放的「最小布局高度」:可用高度低于它,就把整个界面等比缩小。
	 *
	 * ≥1024(lg)起是两列:队伍/仓库在左、阶段面板在右,最坏情况(6 人满队 +
	 * 满货架 + Boss 关 + 9 行结算)实测在 1024 宽时需要 620 布局 px ——
	 * 所以只要可用高度 ≥ 620 就 1:1 显示,不再把字缩小(这正是以前的做法:
	 * 1024 宽时 minH=700,1266×731 的窗口也被缩到 0.94,字小一号)。
	 * 低于 620 才退回缩放 —— 极矮窗口里缩小总比把按钮裁掉强。
	 */
	const minHeightFor = (w: number, h: number) => {
		if (w >= 1024) return 620;
		return w >= 768 ? 700 : w >= 640 ? 800 : h <= 624 ? 590 : 660;
	};
	/** 活动区可用高度(px,不含 header/footer) */
	let availH = $state(0);
	let minH = $state(660);
	const fitScale = $derived(availH > 0 && availH < minH ? availH / minH : 1);

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

	// ---- 存档 ----

	let save = $state(getSave());
	/** 打赏入口(爱发电) —— 至少玩过一局后,亮在「返回标题」上方 */
	const DONATE_URL =
		'https://ifdian.net/order/create?user_id=86452e60dba811ed862c5254001e7c00&remark=%E4%B8%BA%E4%B8%AD%E7%A7%8B%E5%8D%9A%E9%A5%BC%E5%A4%A7%E4%BC%9A%E6%89%93%E8%B5%8F&affiliate_code=ddnet-zq';
	/** 至少玩过一局之后才亮出来(plays 在每局结束时 +1) */
	const showDonate = $derived(save.plays >= 1);
	let mooncakes = $state(0);

	/**
	 * 夜空星群:4 个 SVG。位置/宽度用百分比(跟窗口一起缩放)。
	 * 星点用种子 PRNG 生成 —— 原来用 i*61%300 这种线性取模,出来是斜线/晶格,
	 * 一眼就看得出规律;又不能用 Math.random(SSR 预渲染和客户端必须算同一批坐标)。
	 */
	const starRnd = (seed: number) => {
		let a = seed >>> 0;
		return () => {
			a = (a + 0x6d2b79f5) >>> 0;
			let t = Math.imul(a ^ (a >>> 15), 1 | a);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	};
	const STAR_FIELDS = [
		{ left: '-4%', top: '-6%', w: '52%', seed: 1337, n: 22 },
		{ left: '44%', top: '-8%', w: '54%', seed: 7331, n: 20 },
		{ left: '6%', top: '24%', w: '50%', seed: 2027, n: 18 },
		{ left: '58%', top: '28%', w: '48%', seed: 4921, n: 16 }
	].map((f) => {
		const rnd = starRnd(f.seed);
		return {
			...f,
			stars: Array.from({ length: f.n }, () => ({
				x: +(rnd() * 300).toFixed(1),
				y: +(rnd() * 170).toFixed(1),
				r: +(0.45 + rnd() * 0.85).toFixed(2),
				o: +(0.25 + rnd() * 0.6).toFixed(2)
			}))
		};
	});

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
	let settlePreview = $state(0);
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
	type SettleKind = 'level' | 'chip' | 'mult' | 'total' | 'swap';
	let settleSteps = $state<{ text: string; cls: string; kind: SettleKind }[]>([]);
	let settleIdx = $state(-1);
	let stepsEl: HTMLElement | undefined = $state();
	/** 骰子面板(测结算区能放几行用) */
	let dicePanelEl: HTMLElement | undefined = $state();
	/** 结算区实测能放下的行数(矮屏少放、高屏多放;由 measureStepsFit 刷新) */
	let stepsFitLines = $state(3);
	/** 结算区的 max-height(布局 px):实际行数超过就滚动,不超过就全部展开 */
	let stepsMaxH = $state(0);
	/** 「当前行可见」应处的 scrollTop —— 用它回弹用户的手动滚动 */
	let settleScrollTarget = 0;
	let settling = $state(false);

	// 结算信息
	let roundTotal = $state(0);
	let countedTee = $state(-1);
	let runScore = $state(0);
	let roundRewardGained = $state(0);
	let overflowGained = $state(0);
	let economyGained = $state(0);
	let finalScore = $state(0);
	let finalRunScore = $state(0);
	let finalRound = $state(0);
	let isNewBest = $state(false);

	// 开局选卡（5 选 2）
	let draftChoices = $state<TeeCard[]>([]);
	let draftPicked = $state<number[]>([]);

	// 集市
	let rewardChoices = $state<TeeCard[]>([]);
	let shopBuffs = $state<BuffCard[]>([]);
	let shopPick = $state<BuffCard | null>(null);
	let shopSold = $state<string[]>([]);
	let shopLocks = $state<(string | null)[]>([null, null, null, null, null, null]);
	/** 集市刷新价:刷一次 +1,重新进集市(组建 Tee 队 / 中秋集市)时回到 2 */
	let refreshPrice = $state(1); // 初始刷新价:1(每刷一次 +1)
	let lastRewardIdx = $state(-1);

	// 道具库存（加成卡）
	let buffInventory = $state<Record<string, number>>({});
	let selectedBuff = $state<BuffCard | null>(null);
	/** 仅查看说明的加成卡(没选中的芯片 hover / 点按):仓库里的卡点一下看说明 */
	let peekBuff = $state<BuffCard | null>(null);
	/**
	 * 加成卡说明浮层的锚点(芯片本身)。浮层走 CardTip:portal 到 body + fixed ——
	 * 以前挂在芯片旁边的一个 absolute div,而队伍面板在 lg 既是 overflow-y-auto 的
	 * 滚动区、又带 backdrop-blur(自成一个层叠上下文),提示框一冒头就被裁/被 HUD 盖住。
	 */
	let buffTipAnchor = $state<HTMLElement | undefined>();
	/** 中秋集市货架的悬停说明(和 peekBuff 分开:同一屏里仓库和货架会同时存在) */
	let shopPeek = $state<BuffCard | null>(null);
	/** 同一时刻只弹一个说明浮层:悬停优先于选中,否则两个浮层会叠在一起。
	 *  选中只在开局编队有效——到了中秋集市它挂不上任何东西,别把上一次的选中带过来。 */
	const shownBuff = $derived(peekBuff ?? (phase === 'intro' ? selectedBuff : null));
	const shownShopBuff = $derived(shopPeek ?? shopPick);
	// 阶段一切换,悬停说明就作废 —— 指针的 leave 事件不会补发,
	// 否则上一屏 hover 过的那张会拖着一张陈旧浮层跟到下一屏。
	$effect(() => {
		phase;
		peekBuff = null;
		shopPeek = null;
	});
	/** 待确认的出售:被点 ✕ 的 Tee 下标(null = 没弹窗) */
	let sellAsk = $state<number | null>(null);
	// 团队结算动画（回合确认后： 团队倍率卡一条一条弹）
	let teamSettleSteps = $state<{ text: string; cls: string; kind: SettleKind }[]>([]);
	let teamSettleIdx = $state(-1);
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

	const toggleSelectBuff = (card: BuffCard) => {
		if (!canEquipBuff) return;
		selectedBuff = selectedBuff?.id === card.id ? null : card;
	};

	/**
	 * 加成卡只能在开局编队(intro)挂到 Tee 上 —— 中秋集市里只买不挂。
	 * 时机也是对的:衰减发生在「结算回合」那一刻(settleRound → decayBuffs),
	 * 在中秋集市买的道具到下一关开局挂,正好吃满卡面的持续关数。
	 */
	const canEquipBuff = $derived(phase === 'intro');

	/** 一次性提示(挂载被拒之类):2.6 秒后自己消失,下一次提示重新计时 */
	let toast = $state<string | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | undefined;
	const showToast = (msg: string) => {
		clearTimeout(toastTimer);
		toast = msg;
		toastTimer = setTimeout(() => (toast = null), 2600);
	};

	const applyBuffToTee = (card: BuffCard, idx: number) => {
		if (!canEquipBuff) return;
		const cur = buffInventory[card.id] ?? 0;
		if (cur <= 0) return;
		// 全局规则:同一只 Tee 上同名加成卡只能挂 1 张(不同类型不同名的可以叠)。
		// 田螺那条路上卡不进 buffs,所以两边都查。
		if (
			(team[idx].buffs ?? []).some((b) => b.cardId === card.id) ||
			(team[idx].refundPending ?? []).some((r) => r.cardId === card.id)
		) {
			sfxClick();
			// 只听见「嗒」一声、卡没上去,玩家不知道发生了什么 —— 说清楚
			showToast(`这只 Tee 上已经有「${card.name}」了，同名加成卡只能挂 1 张`);
			return;
		}
		const next: Record<string, number> = {};
		for (const [k, v] of Object.entries(buffInventory)) {
			if (k === card.id) {
				if (v > 1) next[k] = v - 1;
			} else {
				next[k] = v;
			}
		}
		buffInventory = next;
		if (hasBuffRefund(idx)) {
			// 田螺:这只 Tee 身上的加成卡不生效 —— 所以**不挂载**,只记「哪张卡、原价多少月饼币」,
			// 掷完之后按原价返还(结算动画逐张弹),见 settleTianluo
			team[idx].refundPending = [
				...(team[idx].refundPending ?? []),
				{ cardId: card.id, coins: card.price }
			];
		} else {
			team[idx].buffs = [...team[idx].buffs, { cardId: card.id, turnsLeft: card.turns }];
		}
		selectedBuff = null;
		peekBuff = null;
	};

	const teeTipList = (tee: TeamTee) => {
		const lines: { text: string; cls?: string; name?: string; nameColor?: string }[] = [];
		const card = cardOf(tee);
		const i = team.indexOf(tee);
		const voidBuff = buffsOf(i).find((b) => BUFF_BY_ID.get(b.cardId)?.effect.type === 'clear_void');
		if (voidBuff) {
			// 半影卡是玩家挑一个点数,月食卡是整关全解除 —— 提示要分开
			const picked = clearedVoid[team.indexOf(tee)];
			const half = BUFF_BY_ID.get(voidBuff.cardId)?.effect.pick;
			lines.push({
				text: half
					? picked
						? `🌗 半影：本关 ${picked} 点不作废`
						: '🌗 半影：本关挑一个点数不作废'
					: '🌑 月食：本关点数不作废',
				cls: 'text-emerald-300'
			});
		}
		for (const sk of skillsFor(i)) {
			// 田螺的停靠不在这里单独说:它既是技能说明也是返还清单,
			// 合并到文末那一行(下面 parkedSk 那段),免得两行各说一套
			if (sk.skill === 'parked') continue;
			const nm = cardById(sk.srcId)?.name ?? sk.srcId;
			const what =
				sk.skill === 'chips'
					? `${sk.value < 0 ? '−' : '+'}${formatScore(Math.abs(sk.value))} 分`
					: sk.skill === 'left_chips'
						? `左侧 +${formatScore(sk.value)} 分`
						: sk.skill === 'sum'
							? '按本 Tee 点数和结算'
							: sk.skill === 'mult'
								? `该 Tee 得分 ×${formatMult(sk.mult ?? 1)}（花 🥮 ${sk.cost ?? 0}）`
								: sk.skill === 'end_round'
									? `结束本关 · 未投角色 +🥮 ${sk.perTee ?? 0}`
									: sk.skill === 'sell_self'
										? `回合结算时出售「我」 +🥮 ${sk.coins ?? 0}`
										: '本关重掷';
			lines.push({
				// 时机(掷完可发动)卡牌 desc 里已经写全,这里只说还能不能发动
				text: `⚡ ${nm}:${what}${(tee.charge ?? 0) > 0 ? `(冷却 ${tee.charge} 关)` : '（可发动）'}`,
				cls: (tee.charge ?? 0) > 0 ? 'text-slate-400' : 'text-fuchsia-300'
			});
		}
		if (card?.effect.type === 'scaling_mult') {
			const layers = growth[card.id] ?? 0;
			lines.push({ text: `成长: ×${1 + layers}(已叠 ${layers} 层)`, cls: 'text-emerald-300' });
		}
		for (const b of buffsOf(i)) {
			const bc = BUFF_BY_ID.get(b.cardId);
			if (bc) {
				// 名字按稀有度上色(和芯片描边同一套色),描述仍是中性色
				lines.push({
					name: bc.name,
					nameColor: RARITY_INFO[bc.rarity].color,
					text: `: ${bc.desc} · 剩 ${b.turnsLeft} 回合`,
					cls: 'text-slate-400'
				});
			}
		}
		// 田螺:停靠的加成卡既是「技能说明」也是「返还清单」—— 合成一行。
		// 以前是两行各算一套(⚡ 那行只看得见掷完的 parkRows,🐚 那行只看得见掷之前的
		// refundPending),于是挂着 6 张卡时提示里写着「停靠 0 张」。
		const parkedSk = skillsFor(i).find((sk) => sk.skill === 'parked');
		if (parkedSk && hasBuffRefund(i)) {
			const rows = parkedCards(i);
			const total = rows.reduce((s, r) => s + r.coins, 0);
			const gain = Math.round(total * parkedPer(parkedSk.srcId));
			const nm = cardById(parkedSk.srcId)?.name ?? '田螺';
			const paid = rows.length > 0 && rows[0].paid;
			let text: string;
			if (total === 0) {
				text = `🐚 ${nm}:身上的加成卡不生效，掷完按原价返还 · 发动可把停靠卡折成基础分 ×12，返还减半（身上没有停靠的卡）`;
			} else {
				const list = rows.map((r) => `${r.name} +🥮 ${r.coins}`).join('、');
				// 状态:还没掷 → 能不能发动;掷完还没答 → 正在等;答完 → 这一手发没发动
				const asked = (tee.askedSkills ?? []).includes(`${parkedSk.srcId}|parked`);
				const state = !paid
					? (tee.charge ?? 0) > 0
						? `（冷却 ${tee.charge} 关）`
						: '（可发动）'
					: tee.refundHalved
						? `（已发动，返还收回 🥮 ${Math.ceil(total / 2)}）`
						: asked
							? '（这一关没发动，原价已入账）'
							: '（正在等发动）';
				text = `🐚 ${nm}:${paid ? '已按原价返还' : '掷完原价返还'} ${list}（共 🥮 ${total}）· 发动可折成基础分 +${formatScore(gain)}，返还减半${state}`;
			}
			lines.push({ text, cls: 'text-cyan-300' });
		}
		return lines;
	};

	// 交互（改点/重掷）
	// 半影卡:挑一个点数,本关该点数不作废(不点骰子,点点数按钮)
	type VoidPick = { kind: 'voidpick'; count: number; srcId?: string };
	type PendingAction =
		| VoidPick
		| { kind: 'set_point'; count: number; point: number; srcId?: string; from?: number }
		| {
				kind: 'set_any';
				count: number;
				pick?: number;
				srcId?: string;
				from?: number;
				options?: number[];
		  }
		| { kind: 'bump'; count: number; step?: number; srcId?: string }; // 月牙尺 +1 / 缺月尺 −1:点一颗骰子
	let pendingAction = $state<PendingAction | null>(null);
	let pointPicker = $state(false); // set_any / clear_void 的点数选择
	/** 半影卡:第 i 个 Tee 本关挑选的「不作废」点数 */
	let clearedVoid = $state<number[]>([]);
	let setQueue: SetOp[] = [];

	let rollsLeft = $state(0); // 还能重掷几次
	let rerollCount = $state(0);
	let usedOpSrc = $state<string[]>([]);
	/** 本关每个道具 id **用掉的张数** —— 同一个 id 可能挂好几张(两张素月盘),退款要按张算 */
	let usedOpCount = $state<Record<string, number>>({});
	let pendingActive = $state<ActiveSkill | null>(null);
	/** 花生:本回合**按下标**作废的骰子(回合初始投掷整把作废,重掷过的那几颗解除) */
	let hsVoid = $state<number[]>([]);
	/** 上面那份清单属于哪个 Tee(换人就失效) */
	let hsVoidTee = $state(-1);
	/** 蜜枣:本回合已经抽过那 1% 的 Tee(每人每回合只抽一次,读档也不能重抽) */
	let jackpotDone = $state<number[]>([]);
	/** 猜谜:本回合这只 Tee「重掷之后点数没变」的次数 */
	let stuckRerolls = $state(0);
	/** 高照抄牌时,模板那一手哪些骰子作废(抄来的作废状态只作用于这一手) */
	let sharedVoid = $state<number[] | null>(null);
	/** 上面这份作废状态属于哪个 Tee */
	let sharedVoidTee = $state(-1);
	/** 归家:已发动、等回合结算时出售「我」。null = 没发动;数字 = 换多少月饼币 */
	let homingSell = $state<number | null>(null);
	let choosing = $state(false); // 正在选要重掷的骰子
	let rerollSel = $state<boolean[]>(Array(6).fill(false));
	/** 拖拽多选:按下那一刻定的「这一笔是选中(true)还是取消(false)」,null = 没在拖 */
	let paintMode: boolean | null = null;
	/** 这一笔最后落到的骰子;手快划过时用它把中间跳过的补上 */
	let paintLast = -1;
	let rollMask = $state<boolean[]>(Array(6).fill(true));
	/**
	 * 动画代次。每开一次掷骰/重掷动画 +1;重开、读档、退出游戏也 +1 ——
	 * 这样还在 await/定时器里的收尾一看自己不是当前代次就直接放弃,
	 * 不会把上一局(或已经退回标题)的动画收尾打到新局上。
	 */
	let animGen = 0;
	const dieRolling = (i: number) => rolling && rollMask[i];
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
	/** 累计卖出过几个 Tee(饼铺掌柜的基础分按它算) */
	let soldTees = $state(0);
	/** 已经卖出、还没被「下回合」消费掉(夜市饼摊) */
	let sellBoostPending = $state(false);
	/** 本回合开始前卖过 Tee → 本回合该 Tee 得分 ×2 */
	let sellBoost = $state(false);
	let optedDice = $state<number[]>([]); // 本次判定命中的骰子索引
	let showRules = $state(false);
	/** 队友图鉴(跨局元进度,不解锁也能开) */
	let showCodex = $state(false);
	/** 音效开关(状态存 localStorage) */
	let sfxOn = $state(true);
	const toggleSfx = () => {
		sfxOn = !sfxOn;
		setSfxEnabled(sfxOn);
		if (sfxOn) sfxClick();
	};
	let rollDur = $state(0.75); // 旋转动画单次时长(秒),角速度恒定

	let rollIter = $state(1); // 旋转重复次数(慢速档多转几圈)
	/** 每次掷骰/重掷动画 +1,写进 style 里 —— 只切 class 不重启 CSS 动画:
	 *  同一帧里先摘后加,浏览器看不到变化,animationstart 根本不触发
	 *  (射日仙「手动重掷 → 自动重掷」连着两次时,第二次就完全不播)。
	 *  把代次塞进 style,值一变 CSS 就当作新动画从头播。 */
	let rollKey = $state(0);
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
		// 作弊引擎:只在开发态或**测试 build** 里启用(见 $lib/zhongqiu/test-build)。
		// 生产构建里这两个条件都是常量 false → 整段被 DCE 掉,不只是「藏起来」。
		if (import.meta.env.DEV || ZQ_TEST_BUILD) {
			(window as unknown as Record<string, unknown>).__sfxLog = sfxLog;
			enableCheat();
		}
	});

	// ---- 工具 ----

	const cardOf = (tee: TeamTee): TeeCard | null => (tee.cardId ? cardById(tee.cardId) : null);
	const allCards = (): TeeCard[] => team.map(cardOf).filter((c): c is TeeCard => c !== null);
	const rarityOf = (c: TeeCard | null) => RARITY_INFO[c?.rarity ?? 'common'];

	const rollSingle = () => 1 + Math.floor(Math.random() * 6);

	let cheatNextRoll = $state<number[] | null>(null); // 强制下一次掷骰结果
	let cheatNextDie = $state<number | null>(null); // 强制下一次单骰重掷结果
	/** 强制接下来几次单骰重掷的结果(按顺序消费;QA 要一次重掷多颗时用) */
	let cheatDieQueue = $state<number[]>([]);
	/** 强制下一次蜜枣 1% 的判定结果(QA 用;null = 按概率抽) */
	let cheatJackpot = $state<boolean | null>(null);
	const cheatRoll = (): number[] => {
		if (cheatNextRoll) {
			const d = cheatNextRoll;
			cheatNextRoll = null;
			return d;
		}
		return rollDice();
	};
	const cheatSingle = (): number => {
		if (cheatDieQueue.length) return cheatDieQueue.shift()!;
		if (cheatNextDie !== null) {
			const v = cheatNextDie;
			cheatNextDie = null;
			return v;
		}
		return rollSingle();
	};
	const enableCheat = () => {
		const warnId = (kind: string, id: string) => {
			console.warn(`[作弊引擎] 未知${kind} id: ${id}(已忽略)`);
		};
		const api = {
			/** 设置月饼币 */
			mooncakes: (n: number) => (mooncakes = n),
			/** 所有 Boss id(scan 用,免得手抄清单漂移) */
			bossIds: () => BOSSES.map((b) => b.id),
			rewardIds: () => rewardChoices.map((c) => c.id),
			runScore: () => runScore,
			charge: (i: number, n: number) => {
				if (!team[i]) return warnId('Tee（下标）', String(i));
				team[i].charge = n;
			},
			readyActives: () => {
				team.forEach((t, i) => {
					if (skillsFor(i).length > 0) t.charge = 0;
				});
			},
			/** 加成卡入库存 addBuff('yuefu', 2) */
			addBuff: (id: string, n = 1) => {
				if (!BUFF_BY_ID.has(id)) return warnId('加成卡', id);
				buffInventory = { ...buffInventory, [id]: (buffInventory[id] ?? 0) + n };
				unlockBuffs([{ id }]);
			},
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
			/** 强制接下来 n 颗重掷结果(按顺序) nextDice([5,6]) */
			nextDice: (vals: number[]) => {
				cheatDieQueue = [...vals];
			},
			/** 清掉存档(QA 开跑前保证干净) */
			clearSave: () => clearRun(),
			/** 直接挂上归家的 pending(QA:测卖「我」之后的队伍状态) */
			homing: (coins = 8) => {
				homingSell = coins;
			},
			/** 直接卖某只(绕过按钮):QA 验「最后一只卖不掉」的兕底守卫 */
			sell: (i: number) => {
				if (!team[i]) return warnId('Tee（下标）', String(i));
				sellTee(i);
			},
			/** 直接跑一次回合结算(QA:会触发归家卖「我」) */
			settle: () => settleRound(),
			/** 直接进失败结算屏(QA:测「返回菜单 → 刷新」有没有清局内存档) */
			gameOver: () => abandonRun(),
			/** 某个 Tee 现在挂着哪些主动技(QA 排查用) */
			skills: (i: number) => skillsFor(i),
			/** 相当于点「返回菜单」:清局内存档 + 回到标题页(QA 要用标题页的入口) */
			title: () => restart(),
			/**
			 * 给某个 Tee 用指定骰面算一次分(QA:验证「我」的身份判定 / 星河这类加成归属)。
			 * 不碰真实战局状态,只调引擎 —— 返回 total 与明细行。
			 */
			scoreWith: (i: number, dice: number[]) => {
				const mods = modsFor(i);
				const level = judgeRoll(dice, mods);
				const shown = liveDiceValues(dice, mods);
				const b = calcTeeScore(scoreInput(i, level.id, shown));
				return {
					levelId: level.id,
					total: b.total,
					lines: b.sources.map((s) => `${s.srcId} +${s.chips} x${s.mult}`)
				};
			},
			/**
			 * 模拟「我」先掷出这一手(把骰面记到「我」身上),再给任意一只 Tee 算分。
			 * 星河那类「按我作废几颗给该 Tee 加成」的效果必须这样测 —— 单看某一只
			 * Tee 的 scoreWith 时,「我」的骰面还是空的,自然吃不到加成。
			 */
			scoreWithSelfDice: (dice: number[]) => {
				const meIdx = team.findIndex((t) => t.isSelf === true);
				if (meIdx < 0) return { error: '队伍里没有「我」' };
				// 记「我」这一手(和 finalizeTee 一样:存原始骰面 + 判定的等级)
				const mods = modsFor(meIdx);
				const lv = judgeRoll(dice, mods);
				team[meIdx].lastDice = [...dice];
				team[meIdx].lastLevelId = lv.id;
				// 每只 Tee 都用同一手「我」的骰面算一遍,方便对照
				return team.map((_, k) => {
					const m = modsFor(k);
					const l2 = judgeRoll(dice, m);
					const sh = liveDiceValues(dice, m);
					const b = calcTeeScore(scoreInput(k, l2.id, sh));
					return {
						i: k,
						cardId: team[k].cardId,
						isSelf: team[k].isSelf === true,
						levelId: l2.id,
						total: b.total,
						lines: b.sources.map((s) => `${s.srcId} +${s.chips} x${s.mult}`)
					};
				});
			},
			/** 直接设「累计卖出几个 Tee」+ 挂上「卖过卡」标记(QA 快测饼铺掌柜/夜市饼摊) */
			sold: (n: number) => {
				soldTees = n;
				sellBoostPending = n > 0;
			},
			/** 动画速度档位(0=1x 1=2x 2=3x),QA 跑流程时调快 */
			speed: (i: number) => {
				speedIdx = Math.max(0, Math.min(SPEEDS.length - 1, i));
			},
			/** 走真实挂载逻辑(会认田螺的「不挂载」) equip(1,'jinsuo') */
			equip: (teeIdx: number, buffId: string) => {
				const bc = BUFF_BY_ID.get(buffId);
				if (!bc) return warnId('加成卡', buffId);
				if (!team[teeIdx]) return warnId('Tee（下标）', String(teeIdx));
				buffInventory = { ...buffInventory, [buffId]: (buffInventory[buffId] ?? 0) + 1 };
				unlockBuffs([bc]);
				applyBuffToTee(bc, teeIdx);
			},
			/** 强制下一次蜜枣的 1% 判定(不传 = 必定中) */
			jackpot: (v = true) => {
				cheatJackpot = v;
			},
			/** Tee 卡直接入队(可超 6 人) addCard('guanghangong') */
			addCard: (cardId: string) => {
				const c = cardById(cardId);
				if (!c) return warnId('Tee 卡', cardId);
				team = [
					...team,
					{
						cardId: c.id,
						isSelf: false,
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
			setTeam: (ids: (string | null)[]) => {
				ids.forEach((id) => {
					if (id !== null && !cardById(id)) warnId('Tee 卡', id);
				});
				// 「我」= cardId 为 null 的那个;normalizeSelf 会把它归位到队首
				team = normalizeSelf(
					ids.map((id) => ({
						cardId: id,
						isSelf: id === null,
						lastScore: 0,
						lastLevelId: 'none',
						lastDice: [1, 1, 1, 1, 1, 1],
						buffs: []
					}))
				);
				currentTee = 0;
			},
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
					drawDraftChoices();
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
					t.lastScore = calcTeeScore(
						scoreInput(i, lv.id, liveDiceValues(sample, modsFor(i)))
					).total;
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
							rollsAllowed(effectiveEffects(teamCards, 0), buffsOf(0), boss?.rollsBonus ?? 0) - 1
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
					drawRewardChoices();
					phase = 'reward';
					return;
				}
				if (p === 'shop') {
					drawShopChoices();
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
				bossId: boss?.id ?? null,
				currentScore,
				buffInventory,
				settling,
				rolling,
				choosing,
				rollsLeft,
				pendingActiveKey: pendingActive ? `${pendingActive.srcId}|${pendingActive.skill}` : null,
				pendingActionKind: pendingAction?.kind ?? null,
				pointPicker,
				hsVoid,
				hsVoidTee,
				jackpotDone,
				homingSell,
				stuckRerolls,
				settleText: settleSteps.map((s) => s.text).join(' | '),
				teamSettleText: teamSettleSteps.map((s) => s.text).join(' | '),
				team: team.map((t) => ({
					cardId: t.cardId,
					// 身份必须存:读档时不能靠下标猜「我」是谁
					isSelf: t.isSelf === true,
					lastScore: t.lastScore,
					lastLevelId: t.lastLevelId,
					buffs: t.buffs,
					refundPending: t.refundPending ?? [],
					skillChips: t.skillChips ?? [],
					skillMult: t.skillMult,
					refundHalved: t.refundHalved ?? false,
					charge: t.charge ?? 0,
					lastDice: t.lastDice,
					lastVoid: t.lastVoid ?? [],
					parkRows: t.parkRows ?? [],
					askedSkills: t.askedSkills ?? []
				}))
			}),

			/** 图鉴:QA / 调试入口 */
			codexOpen: () => (showCodex = true),
			codexClose: () => (showCodex = false),
			codexReset: () => codexReset(),
			codexUnlockAll: () => codexUnlockAll(),
			codexRaw: () => codexRaw(),
			codexCounts: () => ({ tee: teeUnlockedCount(), buff: buffUnlockedCount() })
		};
		(window as unknown as Record<string, unknown>).__cheat = api;
		console.log(
			"%c[作弊引擎] __cheat 已启用: nextRoll([2,3,5,6,1,2]) 强制骰子 · buff(0,'manyuezhufu') 挂卡 · addBuff/addRework 加库存",
			'color:#fbbf24;font-weight:bold'
		);
	};

	// ---- 游戏流程 ----

	/** 重置一局的公共状态 */
	const resetRunState = () => {
		growth = {};
		runScore = 0;
		mooncakes = 0;
		buffInventory = {};
		selectedBuff = null;
		peekBuff = null;
		round = 1;
		soldTees = 0;
		sellBoost = false;
		sellBoostPending = false;
		shopLocks = [null, null, null, null, null, null]; // 局内保留,跨局清空
		refreshPrice = 1;
	};

	const resetRoundState = () => {
		// 本关重来 / 换关:在飞的掷骰·结算·收尾定时器全部作废
		// (读档/重开走 resetRun,那里还会再 ++ 一次,多一次无害)
		animGen += 1;
		boss = null; // 第 1 关没有 Boss;beginRound 会按 round 重新指派
		target = roundTarget(1); // 开局 HUD 显示第 1 关目标;beginRound 会按 round 覆盖
		currentScore = 0;
		roundTotal = 0;
		countedTee = -1;
		currentTee = 0;
		dice = [1, 1, 1, 1, 1, 1];
		rerollAllUsed = false;
		rerollCount = 0;
		usedOpSrc = [];
		usedOpCount = {};
		pendingActive = null;
		pendingAction = null;
		pointPicker = false;
		clearedVoid = [];
		choosing = false;
		rollsLeft = 0;
		rerollSel = Array(6).fill(false);
		// 动画态也一并清:如果上一段流程卡在「掷骰中/结算中」(中途读档、动画被代次守卫掐掉),
		// animGen 只能让回调不再跑,`rolling` 会永远停在 true → 新一关点「开始掷骰」没反应。
		rolling = false;
		settling = false;
		teeAnim = '';
		settlePreview = 0;
		teePose = IDLE_POSE;
		teeEmote = EMOTE.normal;
		// 本轮的四张新状态:花生按下标作废、蜜枣抽过没、归家待出售
		hsVoid = [];
		hsVoidTee = -1;
		jackpotDone = [];
		homingSell = null;
		stuckRerolls = 0;
		sharedVoid = null;
		sharedVoidTee = -1;
		teamSettleSteps = [];
		teamSettleIdx = -1;
		teamSettling = false;
	};

	const resetRun = () => {
		animGen += 1; // 作废还在飞的掷骰/重掷动画(退回标题、重开一局)
		resetRunState();
		resetRoundState();
	};

	const startGame = () => {
		sfxClick();
		resetRun();
		clearRun(); // 新开一局:把上一局的存档清掉
		drawDraftChoices();
		draftPicked = [];
		team = [];
		phase = 'draft';
	};

	const backToTitle = () => {
		sfxClick();
		clearRun();
		resetRun();
		draftChoices = [];
		draftPicked = [];
		rewardChoices = [];
		team = [];
		phase = 'idle';
	};

	// ---- 局内存档:全量快照 ----
	//
	let settledDice = [1, 1, 1, 1, 1, 1];
	let pendingAutoRoll = false;
	let pendingRollKind: 'roll' | 'reroll' | 'finalize' = 'roll';
	let pendingActiveKey: string | null = null;

	const runSnapshot = (): Omit<RunSave, 'v'> => {
		if (!rolling) settledDice = [...dice];
		return {
			phase,
			round,
			bossId: boss?.id ?? null,
			target,
			mooncakes,
			runScore,
			growth,
			team: team.map((t) => ({
				cardId: t.cardId,
				// 身份必须存:读档时不能靠下标猜「我」是谁
				isSelf: t.isSelf === true,
				buffs: t.buffs.map((b) => ({ cardId: b.cardId, turnsLeft: b.turnsLeft })),
				lastScore: t.lastScore,
				lastLevelId: t.lastLevelId,
				lastDice: t.lastDice,
				lastVoid: t.lastVoid ?? [],
				charge: t.charge ?? 0,
				refundPending: t.refundPending ?? [],
				skillChips: t.skillChips ?? [],
				skillMult: t.skillMult,
				refundHalved: t.refundHalved ?? false,
				parkRows: t.parkRows ?? [],
				askedSkills: t.askedSkills ?? []
			})),
			soldTees,
			sellBoost,
			sellBoostPending,
			shopBuffs: shopBuffs.map((b) => b.id),
			shopSold,
			shopLocks,
			buffInventory,
			draftChoices: draftChoices.map((c) => c.id),
			draftPicked,
			rewardChoices: rewardChoices.map((c) => c.id),
			// ---- 回合内细节 ----
			dice: settledDice,
			currentTee,
			currentScore,
			roundTotal,
			countedTee,
			settlePreview,
			diceSum,
			lastLevelId: lastLevel.id,
			rollsLeft,
			rerollCount,
			rerollAllUsed,
			choosing,
			rerollSel,
			rollMask,
			usedOpSrc,
			usedOpCount,
			optedDice,
			clearedVoid,
			pendingAction,
			pointPicker,
			setQueue,
			pendingActiveKey: pendingActive ? `${pendingActive.srcId}|${pendingActive.skill}` : null,
			roundRewardGained,
			overflowGained,
			economyGained,
			finalScore,
			finalRunScore,
			finalRound,
			isNewBest,
			lastRewardIdx,
			shopPickId: shopPick?.id ?? null,
			selectedBuffId: selectedBuff?.id ?? null,
			speedIdx,
			wasRolling: rolling,
			rollKind: pendingRollKind,
			// ---- 重做卡的本关状态 ----
			hsVoid,
			hsVoidTee,
			jackpotDone,
			homingSell,
			stuckRerolls,
			sharedVoid,
			sharedVoidTee
		};
	};

	const restoreRun = (d: RunSave) => {
		animGen += 1; // 存档是权威状态,之前在飞的动画一律作废
		round = d.round;
		boss = d.bossId ? getBossById(d.bossId) : null;
		target = d.target;
		mooncakes = d.mooncakes;
		runScore = d.runScore;
		growth = d.growth;
		team = normalizeSelf(
			d.team.map((t) => ({
				cardId: t.cardId,
				// 新存档带 isSelf;老存档没这字段 → normalizeSelf 按 cardId===null 推
				isSelf: t.isSelf,
				lastScore: t.lastScore,
				lastLevelId: t.lastLevelId,
				lastDice: t.lastDice,
				lastVoid: t.lastVoid ?? [],
				buffs: t.buffs.map((b) => ({ cardId: b.cardId, turnsLeft: b.turnsLeft })),
				charge: t.charge ?? 0,
				refundPending: t.refundPending ?? [],
				skillChips: t.skillChips ?? [],
				skillMult: t.skillMult,
				refundHalved: t.refundHalved ?? false,
				parkRows: t.parkRows ?? [],
				askedSkills: t.askedSkills ?? []
			}))
		);
		soldTees = d.soldTees;
		sellBoost = d.sellBoost ?? false;
		sellBoostPending = d.sellBoostPending ?? false;
		shopBuffs = d.shopBuffs.map((id) => BUFF_BY_ID.get(id)).filter((b): b is BuffCard => !!b);
		// 老存档 / 跨会话:货架上和仓库里的卡补登记一次图鉴
		unlockBuffs(shopBuffs);
		unlockBuffIds(Object.keys(d.buffInventory));
		shopSold = d.shopSold;
		shopLocks = d.shopLocks;
		buffInventory = d.buffInventory;
		draftChoices = d.draftChoices.map((id) => CARD_BY_ID.get(id)).filter((c): c is TeeCard => !!c);
		draftPicked = d.draftPicked;
		rewardChoices = d.rewardChoices
			.map((id) => CARD_BY_ID.get(id))
			.filter((c): c is TeeCard => !!c);
		// ---- 回合内细节 ----
		dice = [...d.dice];
		settledDice = [...d.dice];
		currentTee = Math.min(d.currentTee, Math.max(0, team.length - 1));
		currentScore = d.currentScore;
		roundTotal = d.roundTotal;
		countedTee = d.countedTee ?? -1;
		settlePreview = 0;
		diceSum = d.diceSum;
		lastLevel = getRollLevel(d.lastLevelId);
		rollsLeft = d.rollsLeft;
		rerollCount = d.rerollCount;
		rerollAllUsed = d.rerollAllUsed;
		choosing = d.choosing;
		rerollSel = d.rerollSel;
		rollMask = d.rollMask;
		usedOpSrc = d.usedOpSrc;
		usedOpCount = d.usedOpCount ?? {};
		clearedVoid = d.clearedVoid ?? [];
		optedDice = d.optedDice;
		pendingAction = d.pendingAction;
		pointPicker = d.pointPicker;
		setQueue = d.setQueue ?? [];
		// 重做卡的本关状态(老存档没这些字段 → 兜底)
		hsVoid = d.hsVoid ?? [];
		hsVoidTee = d.hsVoidTee ?? -1;
		jackpotDone = d.jackpotDone ?? [];
		homingSell = d.homingSell ?? null;
		stuckRerolls = d.stuckRerolls ?? 0;
		sharedVoid = d.sharedVoid ?? null;
		sharedVoidTee = d.sharedVoidTee ?? -1;
		roundRewardGained = d.roundRewardGained;
		overflowGained = d.overflowGained;
		economyGained = d.economyGained;
		finalScore = d.finalScore;
		finalRunScore = d.finalRunScore;
		finalRound = d.finalRound;
		isNewBest = d.isNewBest;
		lastRewardIdx = d.lastRewardIdx;
		shopPick = d.shopPickId ? (BUFF_BY_ID.get(d.shopPickId) ?? null) : null;
		selectedBuff = d.selectedBuffId ? (BUFF_BY_ID.get(d.selectedBuffId) ?? null) : null;
		speedIdx = d.speedIdx ?? 0;
		// 瞬时状态一律归零:动画重播,或从"这一步开始前"接
		rolling = false;
		settling = false;
		teamSettling = false;
		hitDice = [];
		teeAnim = '';
		teeEmote = EMOTE.normal;
		settleSteps = [];
		settleIdx = -1;
		teamSettleSteps = [];
		teamSettleIdx = -1;
		phase = d.phase as Phase;
		// 这两个要等脚本剩下的常量都初始化完再处理(onMount 里做)
		pendingAutoRoll = d.wasRolling === true;
		pendingRollKind = (d.rollKind as typeof pendingRollKind) ?? 'roll';
		pendingActiveKey = d.pendingActiveKey;
	};

	$effect(() => {
		const snap = runSnapshot();
		if (snap.phase === 'idle') return; // 标题页没有进度可存
		const timer = setTimeout(() => saveRun(snap), 200);
		return () => clearTimeout(timer);
	});

	{
		const saved = loadRun();
		if (saved && saved.phase !== 'idle') restoreRun(saved);
	}

	// 读档后的收尾:此时脚本里剩下的函数/常量都已就绪
	onMount(() => {
		if (pendingActiveKey) {
			const key = pendingActiveKey;
			pendingActiveKey = null;
			pendingActive = skillsFor(currentTee).find((s) => `${s.srcId}|${s.skill}` === key) ?? null;
		}
		// 存盘时掷骰动画正在播:让一帧,等恢复后的骰子渲染出来再重掷这个 Tee
		if (pendingAutoRoll) {
			pendingAutoRoll = false;
			const kind = pendingRollKind;
			console.log(
				'[resume] kind =',
				kind,
				'| rollMask =',
				JSON.stringify(rollMask),
				'| rollsLeft =',
				rollsLeft
			);
			const replayGen = animGen;
			setTimeout(() => {
				if (replayGen !== animGen) return; // 这 60ms 里退了/重开了
				if (kind === 'reroll') playRerollAnim(rollMask, afterRoll);
				else if (kind === 'finalize') playRerollAnim(rollMask, finalizeTee);
				else rollCurrent();
			}, 60);
			return;
		}
		resumeRun();
	});

	const resumeRun = () => {
		if (phase !== 'rolling') return;
		const tee = team[currentTee];
		if (!tee) return;

		if (countedTee >= currentTee) {
			const level = getRollLevel(tee.lastLevelId);
			dice = [...tee.lastDice];
			lastLevel = level;
			diceSum = liveDiceValues(tee.lastDice, modsFor(currentTee)).reduce((a, b) => a + b, 0);
			// 田螺的主动技还没答(提示在结算动画之前弹的):刷新回来要停在这一步等答案,
			// 不能像「已经结算完」那样直接推进 —— 否则读一次档就把发动机会跳过去了。
			if (pendingActive) {
				settleSteps = [];
				settleIdx = -1;
				settling = false;
				settlePreview = 0;
				return;
			}
			// 不传 refunds:道具在判定时已经归还过了,这里只是补个显示
			settleSteps = buildSettleSteps(level.id, level, tee, [], tee.parkRows ?? []);
			settleIdx = settleSteps.length - 1;
			settling = false;
			settlePreview = 0;
			setTimeout(advanceAfterTee, 500);
			return;
		}

		// ② 正等玩家操作(选骰子 / 改点 / 选点数) → 保持原样
		if (choosing || pendingAction || pointPicker) return;

		// ③ 骰子已落定、只是没接上 → 回到「要不要重掷」
		if (rollsLeft > 0) {
			choosing = true;
			return;
		}

		// ④ 没重掷机会了 → 继续走改点/判定
		startSetPhase();
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
				isSelf: true,
				lastScore: 0,
				lastLevelId: 'none',
				lastDice: [1, 1, 1, 1, 1, 1],
				buffs: []
			},
			...starters.map((c) => ({
				cardId: c.id,
				isSelf: false,
				lastScore: 0,
				lastLevelId: 'none',
				lastDice: [1, 1, 1, 1, 1, 1],
				buffs: []
			}))
		];
		phase = 'intro';
		beginRound();
	};

	const decayBuffsForRound = () => {
		decayBuffs(team);
	};

	/** 队伍卡牌(null = 主 Tee),用于解析 copy_right / bundle */
	const teamCards = $derived(team.map((t) => (t.cardId ? cardById(t.cardId) : null)));
	/** 第 i 个 Tee 实际生效的效果 */
	const selfEffects = (i: number): EffectiveEffect[] => effectiveEffects(teamCards, i);
	/** 全队效果(team_chips 之类) */
	const allEffects = (): EffectiveEffect[] =>
		teamCards.flatMap((_, i) => effectiveEffects(teamCards, i));

	/** 田螺:这只 Tee 身上的加成卡全部不生效(挂载时已经拦下,这里是兑底 + 结算用) */
	const hasBuffRefund = (i: number): boolean => {
		for (const { eff } of selfEffects(i)) if (eff.type === 'buff_refund') return true;
		return false;
	};
	/** 该 Tee 身上**真正生效**的加成卡(田螺 → 空)。所有读 buffs 的地方都走这里 */
	/**
	 * 这只 Tee 是不是「我」。
	 *
	 * 一律用这个判断 —— 不要写 `i === 0`:那是位置,不是身份。
	 * 队伍会被重排(归家卖「我」)、读档、作弊注入;而且「我」可能不在队里。
	 */
	const selfOf = (i: number) => team[i]?.isSelf === true;
	const buffsOf = (i: number): AppliedBuff[] => (hasBuffRefund(i) ? [] : (team[i]?.buffs ?? []));
	/**
	 * 该 Tee 可用的主动技。
	 * 「我」= 自己的 + 别人卡上**授予「我」**的(toPlayer);
	 * 其他人 = 只有自己卡上的 —— 授予「我」的技能不留在卡上,所以持卡者那边要用
	 * `holderActiveSkills` 剔掉。否则「我」被归家卖掉之后,那张卡会把技能带回来:
	 * 新队首每回合都能再「卖一次我」拿 8 币,而队里早已没有「我」。
	 */
	const skillsFor = (i: number): ActiveSkill[] =>
		selfOf(i) ? playerActiveSkills(teamCards) : holderActiveSkills(selfEffects(i), buffsOf(i));
	/** 花生:这只 Tee 回合初始投掷整把作废 */
	const hasFirstRollVoid = (i: number): boolean => {
		for (const { eff } of selfEffects(i)) if (eff.type === 'first_roll_void') return true;
		return false;
	};
	/** 效果里(含 bundle)有没有这一种 */
	const hasEffect = (eff: TeeEffect, type: TeeEffect['type']): boolean =>
		eff.type === type || (eff.type === 'bundle' && eff.parts.some((p) => hasEffect(p, type)));
	/**
	 *「我」的皮肤:固定 tuzi。
	 *
	 * 这里是**写死的常量**,不是可配置字段 —— 「我」没有自定义皮肤功能。
	 * 以前 TeamTee 上挂过一个 `selfSkin` 外观字段,但它从来没人赋值(所有建队点
	 * 都没写它),渲染只能靠 `?? 'x_spec'` 兜底,等于「我」一直显示的是 x_spec。
	 * 现在直接固定成 tuzi,并把那个空转的字段整条拆掉。
	 */
	const SELF_SKIN = 'tuzi';
	/** 高照这条线的四张卡:谁先投掷谁当模板,**也只抄给这四张** */
	/**
	 * 高照:队伍里有高照时,「高照/串珠/七星灯/连珠灯」里**首先投掷**的那只 Tee 的最终骰面,
	 * 决定**这条线里其他 Tee** 回合内首次投掷的点数(不是「我」,是这四张里的第一个)。
	 *
	 * ⚠️ 抄的**范围只有这条线自己**(denglong/zhideng/qixingdeng/lianzhudeng)——
	 * 不加这层过滤的话,模板后面所有 Tee 都会被换成模板的骰面,等于「全队陪跑」:
	 * 一条 4 张的连线会把队伍里不相关的 Tee 也一起改写,「其他 Tee」被误读成「全队其他人」。
	 *
	 * 模板自己没得抄;排在她前面投的 Tee 也没得抄(那时模板还没产生);
	 * 不在线上(或没挂卡)的 Tee 一律照常自己掷。
	 * 投掷顺序就是队伍下标顺序,countedTee = 最后一只结算完的 Tee。
	 */
	const SHARE_CARDS = ['denglong', 'zhideng', 'qixingdeng', 'lianzhudeng'];
	const sharedFirstDice = (i: number): number[] | null => {
		if (!allCards().some((c) => hasEffect(c.effect, 'shared_first_roll'))) return null;
		let src = -1;
		for (let k = 0; k < team.length; k++) {
			const cid = team[k]?.cardId;
			if (!cid || !SHARE_CARDS.includes(cid)) continue;
			if (k <= countedTee) src = k; // 这一只已经投过了 = 这条线里首个投掷者
			break; // 只看这四张里的第一只,它没投就还没模板
		}
		if (src < 0 || src === i) return null;
		// 只有这条线上的 Tee 才吃复制(「其他 Tee」= 这条线里的其他 Tee)
		const selfCid = team[i]?.cardId;
		if (!selfCid || !SHARE_CARDS.includes(selfCid)) return null;
		const first = team[src]?.lastDice;
		if (!first || first.length !== 6) return null;
		// 作废状态也一起抄:先记下来,rollCurrent 定格那一步挂到这一手上
		sharedVoid = [...(team[src]?.lastVoid ?? [])];
		sharedVoidTee = i;
		return [...first];
	};
	/** 蜜枣:这只 Tee 的「首次投掷大奖」 */
	const jackpotOf = (i: number) => {
		for (const { eff } of selfEffects(i)) if (eff.type === 'jackpot') return eff;
		return null;
	};
	const scoreInput = (i: number, levelId: string, diceForSum: number[]): ScoreInput => {
		// 「我」是谁:身份看 isSelf,不看下标(队伍可能被重排,「我」也可能不在队里)
		const isMe = team[i]?.isSelf === true;
		const selfIdx = team.findIndex((t) => t.isSelf === true);
		const selfTee = selfIdx >= 0 ? team[selfIdx] : undefined;
		const selfLiveDice = liveDiceValues(selfTee?.lastDice ?? [], modsFor(selfIdx));
		const selfRawDice = rawLiveDice(selfTee?.lastDice ?? [], modsFor(selfIdx));
		return {
			// 寒月/凛月:本关加成卡的加值与乘值分别失效
			buffChipsScale: boss?.mods?.buffChipsScale ?? 1,
			buffMultScale: boss?.mods?.buffMultScale ?? 1,
			levelId,
			self: selfEffects(i),
			allSelf: teamCards.map((_, k) => effectiveEffects(teamCards, k)),
			index: i,
			isSelf: team[i]?.isSelf === true,
			hasSelf: team.some((t) => t.isSelf === true),
			teamCards,
			growth,
			buffs: buffsOf(i),
			// 田螺:身上那批「不生效」的卡不进 buffs(它们不能生效),单独给计分折算用
			// 发动过的主动技加值(卡面写「计入基础分」那类):和筹码一起进乘算
			skillChips: team[i]?.skillChips ?? [],
			skillMult: team[i]?.skillMult,
			teamSize: team.length,
			diceSum: diceForSum.reduce((a, b) => a + b, 0),
			ownDice: [...diceForSum],
			rerolled: rerollCount,
			// 多出来的投掷机会(per_extra_roll 用)
			extraRolls: Math.max(0, rollsFor(i) - BASE_ROLLS),
			stuckRerolls,
			playerLevelId: isMe ? levelId : (selfTee?.lastLevelId ?? 'none'),
			playerDice: isMe ? diceForSum : selfLiveDice,
			// 原样点数:只剔作废,不做 map/shift(重复牌倍率要数真实骰面)
			playerRawDice: isMe ? rawLiveDice(dice, modsFor(i)) : selfRawDice,
			// 新机制的上下文：经济流用币、成长/负分用关数、支援流用左邻已结算的分
			coins: mooncakes,
			round,
			leftScore: i > 0 ? (team[i - 1]?.lastScore ?? 0) : (team[team.length - 1]?.lastScore ?? 0),
			soldCount: soldTees,
			sellBoost
		};
	};

	/** 该 Tee 本回合可投掷几次 */
	const rollsFor = (i: number) => rollsAllowed(selfEffects(i), buffsOf(i), boss?.rollsBonus ?? 0);
	const modsFor = (i: number) => {
		// 花生:按下标作废 —— 只有正在结算的那只 Tee 吃这份清单
		const extra: DiceMods = { fixed: optedDice };
		const vi = i === hsVoidTee && hsVoid.length ? hsVoid : undefined;
		if (vi) extra.voidIdx = vi;
		// 高照:抄来的那一手连作废状态一起抄 —— 盖掉本关的点数作废,只认抄来的位置
		if (i === sharedVoidTee && sharedVoid) {
			extra.voidOverride = true;
			extra.voidIdx = [...sharedVoid]; // 覆盖:抄来的那一手只认模板的作废位置
		}
		const base = withBossMods(
			mergeMods(
				extra,
				mergeMods(
					selfDiceMods(selfEffects(i), buffsOf(i)),
					// 只有「我」吃队友的「我掷出的 X 视为 4」「我掷出的 4 作废」规则
					selfOf(i) ? playerDiceMods(teamCards) : undefined
				)
			),
			boss?.mods
		);
		// 半影卡:本关挑中的点数不再作废(作废来自 Boss 还是自己的卡都算)
		const cleared = clearedVoid[i];
		return cleared ? mergeMods(base, { clearVoidFaces: [cleared] }) : base;
	};

	/** 半影卡的候选:这一掷里实际被作废的点数 */
	const voidedFaces = () => {
		const out = new Set<number>();
		for (const d of dice) if (isVoidFace(d, modsFor(currentTee))) out.add(d);
		return [...out].sort((a, b) => a - b);
	};

	const shownDice = $derived(applyDiceMods(dice, modsFor(currentTee)));
	const dieVoid = (i: number) => !dieRolling(i) && isVoidDie(dice, i, modsFor(currentTee));
	const diceModded = (i: number) =>
		optedDice.includes(i) || (!dieRolling(i) && (dieVoid(i) || shownDice[i] !== dice[i]));

	const advanceAfterTee = () => {
		teeAnim = '';
		if (currentTee + 1 < team.length) {
			currentTee += 1;
			rerollCount = 0;
			usedOpSrc = [];
			usedOpCount = {};
			pendingActive = null;
			dice = [1, 1, 1, 1, 1, 1];
			teeEmote = EMOTE.normal;
			rollCurrent();
		} else {
			finishRound();
		}
	};

	/**
	 * 每关清一次:主动技的加值/乘算是**这一关这一手**的基础分,不能漏到下一关。
	 * (以前没人清 skillChips —— 田螺 / 点数和发动过一次之后,之后每一关都白拿那笔分。)
	 */
	const clearRoundSkillState = () => {
		for (const t of team) {
			t.skillChips = [];
			t.skillMult = undefined;
			t.refundHalved = false;
			t.parkRows = [];
			t.askedSkills = [];
		}
	};

	const beginRound = () => {
		// 夜市饼摊:上一段间隙(集市/结算)里卖过 Tee → 本回合 ×2
		sellBoost = sellBoostPending;
		sellBoostPending = false;
		resetRoundState();
		clearRoundSkillState();
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
		peekBuff = null;
		rollCurrent();
	};

	/** 掷一次骰子(动画 + 定格) */
	const rollCurrent = () => {
		if (rolling) return;
		const gen = ++animGen;
		pendingRollKind = 'roll';
		rollKey += 1;
		rolling = true;
		hitDice = [];
		optedDice = [];
		settleSteps = [];
		settleIdx = -1;
		rollsLeft = rollsFor(currentTee) - 1;
		rerollCount = 0;
		usedOpSrc = [];
		usedOpCount = {};
		rollMask = Array(6).fill(true);
		rerollSel = Array(6).fill(false);
		choosing = false;
		// 花生:回合初始投掷整把作废(重掷过的那几颗才解除)。换 Tee / 重开本关都在这里重置
		// 蜜枣:本回合的 1% 每个 Tee 只抽一次(jackpotDone 记着;读档也不重抽)
		hsVoidTee = hasFirstRollVoid(currentTee) ? currentTee : -1;
		hsVoid = hsVoidTee >= 0 ? [0, 1, 2, 3, 4, 5] : [];
		sharedVoid = null; // 这一手还没抄到
		sharedVoidTee = -1;
		stuckRerolls = 0; // 猜谜:白掷计数随每只 Tee 的回合重置
		teeEmote = EMOTE.angry;
		teePose = THROW_POSE;
		teeAnim = 'throw';

		rollDur = Math.min(0.75, 0.75 / speed);
		rollIter = speed < 1 ? 1 / speed : 1;
		rollTotal = 250 + rollDur * rollIter * 1000; // 250ms = 波浪延迟预算(5×50ms)

		const timer = setInterval(() => {
			if (gen !== animGen) {
				clearInterval(timer);
				return;
			}
			dice = rollDice();
		}, 90 / speed);

		setTimeout(() => {
			if (gen !== animGen) return;
			clearInterval(timer);
			const forced = cheatRoll(); // 定格最终点数(nextRoll 在此消费)
			// 高照:队伍里有这张卡时,首个投掷者的最终骰面就是这一手(自己那手照常)
			dice = sharedFirstDice(currentTee) ?? forced;
			// 蜜枣:该回合**首次投掷**抽一次 1% —— 中了就直接把骰面换成四个四点(不管 boss 怎么改)
			const jp = jackpotOf(currentTee);
			if (jp && rerollCount === 0 && !jackpotDone.includes(currentTee)) {
				jackpotDone = [...jackpotDone, currentTee];
				const hit = cheatJackpot ?? Math.random() < jp.chance;
				cheatJackpot = null;
				if (hit) dice = [...jp.faces];
			}
		}, rollTotal * 0.8);

		sfxRoll(rollTotal / 1000, 6);
		setTimeout(() => {
			if (gen !== animGen) return;
			rolling = false;
			teePose = IDLE_POSE;
			afterRoll();
		}, rollTotal);
	};

	const afterRoll = () => {
		if (rollsLeft > 0) {
			choosing = true;
			rerollSel = Array(6).fill(false);
			return;
		}
		startSetPhase();
	};

	const toggleReroll = (i: number) => {
		if (!choosing) return;
		const next = [...rerollSel];
		next[i] = !next[i];
		rerollSel = next;
		sfxPick(next.filter(Boolean).length, next[i]);
	};

	/** 把某颗骰子设成指定选中态(拖拽整笔用)。状态真的变了才发声。 */
	const setReroll = (i: number, v: boolean) => {
		if (i < 0 || i > 5 || rerollSel[i] === v) return;
		const next = [...rerollSel];
		next[i] = v;
		rerollSel = next;
		sfxPick(next.filter(Boolean).length, v);
	};

	/** 屏幕坐标落在哪颗骰子上(-1 = 没落在骰子上) */
	const dieIndexAt = (x: number, y: number) => {
		const el = document.elementFromPoint(x, y);
		// 骰面上还压着 svg / 点数 / ↻ 这些子元素,靠 closest 找回按钮
		const host = el?.closest?.('[data-die]') as HTMLElement | null;
		const v = Number(host?.dataset.die);
		return Number.isInteger(v) && v >= 0 && v <= 5 ? v : -1;
	};

	/**
	 * 按下骰子:没选中的 → 这一笔是「批量选中」;已选中的 → 这一笔是「批量取消」。
	 * 按下的这一颗立刻生效(所以轻点仍然是切换),之后划过的都跟随同一笔。
	 */
	const startPaint = (i: number, e: PointerEvent) => {
		if (!choosing || rolling) return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		paintMode = !rerollSel[i];
		paintLast = i;
		setReroll(i, paintMode);
	};

	/** 拖拽经过:整笔统一成 paintMode;手快跳过的骰子也补齐 */
	const dragPaint = (e: PointerEvent) => {
		if (paintMode === null) return;
		const i = dieIndexAt(e.clientX, e.clientY);
		if (i < 0) return;
		if (paintLast >= 0) {
			for (let k = Math.min(paintLast, i); k <= Math.max(paintLast, i); k += 1)
				setReroll(k, paintMode);
		}
		paintLast = i;
	};

	const endPaint = () => {
		paintMode = null;
		paintLast = -1;
	};

	const confirmReroll = () => {
		if (!choosing || rolling) return;
		sfxClick();
		const sel = [...rerollSel];
		const n = sel.filter(Boolean).length;
		if (n === 0) return;
		rollsLeft -= 1;
		rerollCount += n;
		choosing = false;
		playRerollAnim(sel, afterRoll);
	};

	/**
	 * 重掷动画。连续两次重掷之间(手动重掷 → 再接再厉触发自动重掷)必须让 DOM
	 * 真正更新一帧:上一轮的收尾是 `rolling = false; done()` 同步跑完的,
	 * 如果 done() 里立刻又开一轮,`rolling` 从没变回 false 落到 DOM 上,
	 * 已经在转的那几颗骰子 class 没变化 → 浏览器不会重播 shake 动画(用户报过)。
	 * 所以这里先摘掉 rolling、等一帧、再挂上,强制所有选中的骰子重播。
	 */
	const playRerollAnim = async (sel: boolean[], done: () => void) => {
		const gen = ++animGen;
		// 猜谜:先记下「挑出去重掷的那几颗」重掷前的点数,定格时对比(动画期间 dice 一直在跳)
		const beforeReroll = sel.map((s, i) => (s ? dice[i] : null));
		pendingRollKind = 'reroll'; // 提前记:存档要读它
		rolling = false;
		await tick();
		// 等这一帧的工夫里可能读了档 / 退回标题 / 重开一局 —— 那就别再启动动画了
		if (gen !== animGen) return;
		rolling = true;
		rollKey += 1;
		rollMask = [...sel];
		// 被重掷的骰子不再算「改点」:它的点数已经不是我们改出来的那个了。
		// 撤掉 overlay,同时把 fixed 豁免一起摘掉 —— 否则重掷出来的新点数还豁免点数映射
		// (「6 视为 4」这类),判定会跟显示对不上。
		if (sel.some(Boolean)) optedDice = optedDice.filter((i) => !sel[i]);
		teeEmote = EMOTE.angry;
		teePose = THROW_POSE;
		teeAnim = 'throw';

		rollDur = Math.min(0.75, 0.75 / speed);
		rollIter = speed < 1 ? 1 / speed : 1;
		rollTotal = 250 + rollDur * rollIter * 1000;

		const timer = setInterval(() => {
			if (gen !== animGen) {
				clearInterval(timer);
				return;
			}
			dice = dice.map((v, i) => (sel[i] ? rollSingle() : v));
		}, 90 / speed);

		setTimeout(() => {
			if (gen !== animGen) return;
			clearInterval(timer);
			dice = dice.map((v, i) => (sel[i] ? cheatSingle() : v));
			// 猜谜:重掷出来的点数全和重掷前一样 → 白掷 +1(全都没变才算一次)
			if (beforeReroll.every((v, i) => v === null || v === dice[i])) stuckRerolls += 1;
			// 高照:一重掷就丢掉抄来的作废状态,新点数按本关正常规则判作废
			if (sharedVoidTee === currentTee) {
				sharedVoid = null;
				sharedVoidTee = -1;
			}
			reflowVoid(sel); // 花生:重掷解除作废 + 重掷后同点数作废
		}, rollTotal * 0.8);

		sfxRoll(rollTotal / 1000, sel.filter(Boolean).length);
		setTimeout(() => {
			if (gen !== animGen) return;
			rolling = false;
			teePose = IDLE_POSE;
			done();
		}, rollTotal);
	};

	/**
	 * 花生:重掷之后重算「按下标作废」的清单。
	 * 规则(定稿):重掷过的骰子解除作废;然后按**下标顺序**逐个判 ——
	 * 当前未作废的骰子里只要有一颗和它同点数(不含自己),它就被作废。
	 * 顺序判定 ⇒ 两颗重掷出同一个点数时,只有靠前的那颗被作废。
	 */
	const reflowVoid = (sel: boolean[]) => {
		if (hsVoidTee < 0 || hsVoidTee !== currentTee) return;
		const voided = hsVoid.filter((i) => !sel[i]); // 没重掷的仍然作废
		for (let i = 0; i < 6; i++) {
			if (!sel[i]) continue; // 只判这一轮重掷的骰子
			const v = dice[i];
			// 「当前未作废的骰子」里(不含自己)有没有和它同点数的 —— 有就作废
			if (dice.some((dv, j) => j !== i && !voided.includes(j) && dv === v)) voided.push(i);
		}
		hsVoid = [...voided].sort((a, b) => a - b);
	};

	const skipReroll = () => {
		if (!choosing) return;
		sfxClick();
		choosing = false;
		rollsLeft = 0;
		startSetPhase();
	};

	/** 会改骰子的主动技(连珠灯):必须在改点之前发动,它改出来的 4 点要让改点卡看得见 */
	const diceActive = (i: number): ActiveSkill | null => {
		const tee = team[i];
		if (!tee) return null;
		for (const sk of skillsFor(i)) if (sk.skill === 'to_four' && activeReady(tee, sk)) return sk;
		return null;
	};

	/** 改点阶段入口:先给「改骰子的主动技」一次机会,玩家跳过/用完了才进改点 */
	const startSetPhase = () => {
		const sk = diceActive(currentTee);
		if (sk) {
			pendingActive = sk;
			return;
		}
		beginSetOps();
	};

	const beginSetOps = () => {
		setQueue = collectSetOps(selfEffects(currentTee), buffsOf(currentTee));
		nextSetOp();
	};

	/** 跳过**当前这一个**改点:队列里还有就继续下一个,全部跳完才结算 */
	const skipSetOp = () => {
		pendingAction = null;
		pointPicker = false;
		nextSetOp();
	};

	/** 改点操作来自哪张卡(加成卡或 Tee 卡) */
	const opSrcName = (id?: string) =>
		id ? (BUFF_BY_ID.get(id)?.name ?? (CARD_BY_ID.get(id)?.name || id)) : '';

	const nextSetOp = () => {
		const op = setQueue.shift();
		if (!op) {
			pendingAction = null;
			finalizeTee();
			return;
		}
		// 「只认 4 点」的改点(拆 4 系列):场上没有可挑的 4 点就直接跳过这张,
		// 不算用掉 → 结算时按「没用掉就归还」退回库存
		if (op.from !== undefined && !shownDice.includes(op.from)) {
			nextSetOp();
			return;
		}
		// 半影卡:本关没有任何点数被作废 → 没得挑,跳过
		if (op.kind === 'voidpick' && voidedFaces().length === 0) {
			nextSetOp();
			return;
		}
		if (op.kind === 'point')
			pendingAction = {
				kind: 'set_point',
				count: op.count,
				point: op.point ?? 4,
				from: op.from,
				srcId: op.srcId
			};
		else if (op.kind === 'bump')
			pendingAction = { kind: 'bump', count: op.count, step: op.step ?? 1, srcId: op.srcId };
		else if (op.kind === 'voidpick') {
			pendingAction = { kind: 'voidpick', count: op.count, srcId: op.srcId };
			pointPicker = true; // 半影卡没有骰子可点,选点面板直接弹出来
		} else
			pendingAction = {
				kind: 'set_any',
				count: op.count,
				from: op.from,
				options: op.options,
				srcId: op.srcId
			};
	};

	const onDieClick = (i: number) => {
		const act = pendingAction;
		if (!act) return;
		if (act.kind === 'voidpick') return; // 半影卡点的是点数按钮,不是骰子
		// 「只认 4 点」的改点:点到别的点数没反应(判定用的是玩家看到的点数)
		if (act.kind !== 'bump' && act.from !== undefined && shownDice[i] !== act.from) return;

		const markOpted = () => {
			if (!optedDice.includes(i)) optedDice = [...optedDice, i];
		};
		if (act.kind === 'set_point') {
			dice[i] = act.point;
			markOpted();
			act.count -= 1;
			if (act.srcId && !usedOpSrc.includes(act.srcId)) usedOpSrc = [...usedOpSrc, act.srcId];
			if (act.srcId)
				usedOpCount = { ...usedOpCount, [act.srcId]: (usedOpCount[act.srcId] ?? 0) + 1 };
		} else if (act.kind === 'bump') {
			// 月牙尺 +1(6 点封顶) / 缺月尺 −1(1 点封底),够不到就再点没意义
			const step = act.step ?? 1;
			if (step > 0 ? dice[i] >= 6 : dice[i] <= 1) return;
			dice[i] = dice[i] + step;
			markOpted();
			act.count -= 1;
			if (act.srcId && !usedOpSrc.includes(act.srcId)) usedOpSrc = [...usedOpSrc, act.srcId];
			if (act.srcId)
				usedOpCount = { ...usedOpCount, [act.srcId]: (usedOpCount[act.srcId] ?? 0) + 1 };
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
		if (act?.kind === 'voidpick') {
			// 用 0 当「没挑」的哨兵:空数组上 map 是空转,必须按长度补齐(踩过)
			const next = [...clearedVoid];
			while (next.length <= currentTee) next.push(0);
			next[currentTee] = v;
			clearedVoid = next;
			if (act.srcId && !usedOpSrc.includes(act.srcId)) usedOpSrc = [...usedOpSrc, act.srcId];
			if (act.srcId)
				usedOpCount = { ...usedOpCount, [act.srcId]: (usedOpCount[act.srcId] ?? 0) + 1 };
			pointPicker = false;
			pendingAction = null;
			nextSetOp();
			return;
		}
		if (!act || act.kind !== 'set_any' || act.pick === undefined) return;
		dice[act.pick] = v;
		act.count -= 1;
		if (act.srcId && !usedOpSrc.includes(act.srcId)) usedOpSrc = [...usedOpSrc, act.srcId];
		if (act.srcId) usedOpCount = { ...usedOpCount, [act.srcId]: (usedOpCount[act.srcId] ?? 0) + 1 };
		pointPicker = false;
		if (act.count <= 0) {
			pendingAction = null;
			nextSetOp();
		} else {
			pendingAction = {
				kind: 'set_any',
				count: act.count,
				from: act.from,
				options: act.options,
				srcId: act.srcId
			};
		}
	};

	/** set_any 的点数候选:拆 4 系列只给指定点数(1/6 或 2/5) */
	const pointChoices = () => {
		if (pendingAction?.kind === 'voidpick') return voidedFaces();
		if (pendingAction?.kind === 'set_any') return pendingAction.options ?? [1, 2, 3, 4, 5, 6];
		return [1, 2, 3, 4, 5, 6];
	};

	/** 拆 4 系列:只认 4 点的改点,非 4 点的骰子点不动 → 画暗一点 */
	const dieOffTarget = (i: number) =>
		!!pendingAction &&
		(pendingAction.kind === 'set_point' || pendingAction.kind === 'set_any') &&
		pendingAction.from !== undefined &&
		shownDice[i] !== pendingAction.from;

	const cancelAction = () => {
		pendingAction = null;
		pointPicker = false;
		setQueue = [];
		finalizeTee();
	};

	/** 判定 + 计分 + 下一个 Tee */
	const BOSS_EFFECT_SHORT: Record<string, string> = {
		miyue: '6 视为 3',
		yingyue: '4 视为 2',
		shiyue: '点数 -1',
		wuyue: '6 视为 1'
	};

	/**
	 * 田螺:身上的加成卡不生效 —— 它们**从来没被挂上**(见 applyBuffToTee 里的分支),
	 * 这里把记账的原价付掉;同时兜底「先挂了卡、后来才拿到田螺」的情形。
	 * 返还是一次性的:付完就把 buffs / refundPending 一起清空。
	 */
	const settleTianluo = (i: number): { name: string; coins: number }[] => {
		const tee = team[i];
		if (!tee || !hasBuffRefund(i)) return [];
		const rows = parkedCards(i);
		if (!rows.length) return [];
		const out = rows.map((r) => ({ name: r.name, coins: r.coins }));
		// 这几行留着:提示里要写「发动值多少分」,结算动画要逐张弹 ——
		// 而且读档回来还要重画(存盘带着走)
		team[i].parkRows = out;
		team[i].buffs = [];
		team[i].refundPending = [];
		mooncakes += out.reduce((s, x) => s + x.coins, 0);
		sfxCoin();
		return out;
	};

	const refundUnusedItems = (i: number): string[] => {
		const tee = team[i];
		if (!tee) return [];
		const back: AppliedBuff[] = [];
		const keep: AppliedBuff[] = [];
		// 按 id 统计「挂了 N 张 / 本关用掉几张」:用掉几张就留几张,剩下的归还。
		// 以前只判断 id 有没有出现过 —— 两张素月盘用掉一张时,两张都被留下,
		// 没用的那张永远回不了库存(用户报的就是这个)。
		const attached = new Map<string, number>();
		for (const b of tee.buffs) {
			const card = BUFF_BY_ID.get(b.cardId);
			if (card?.refund) attached.set(b.cardId, (attached.get(b.cardId) ?? 0) + 1);
		}
		const keepQuota = new Map<string, number>();
		for (const [id, n] of attached) keepQuota.set(id, Math.min(n, usedOpCount[id] ?? 0));
		for (const b of tee.buffs) {
			const card = BUFF_BY_ID.get(b.cardId);
			const quota = card?.refund ? (keepQuota.get(b.cardId) ?? 0) : 0;
			if (card?.refund && quota > 0) {
				keepQuota.set(b.cardId, quota - 1);
				keep.push(b);
			} else if (card?.refund) {
				back.push(b);
			} else keep.push(b);
		}
		if (back.length === 0) return [];
		team[i].buffs = keep;
		const inv = { ...buffInventory };
		for (const b of back) inv[b.cardId] = (inv[b.cardId] ?? 0) + 1;
		buffInventory = inv;
		return back.map((b) => BUFF_BY_ID.get(b.cardId)?.name ?? b.cardId);
	};

	const buildSettleSteps = (
		rawLevelId: string,
		level: RollLevel,
		tee: TeamTee,
		refunds: string[] = [],
		buffBack: { name: string; coins: number }[] = []
	) => {
		const steps: { text: string; cls: string; kind: SettleKind }[] = [];
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
		// 加算行全部先出现,乘算行跟在后面 —— 播放顺序 = 真实计算顺序。
		const nameOf = (src: (typeof lastBreakdown.sources)[number]) =>
			src.kind === 'card'
				? (cardById(src.srcId)?.name ?? src.srcId)
				: (BUFF_BY_ID.get(src.srcId)?.name ?? src.srcId);
		// 来源自带的一句话注解(「我作废 2 颗」「连号 5 颗」「等级分 ×3」)—— 存了却一直没渲染
		const whyOf = (src: (typeof lastBreakdown.sources)[number]) =>
			src.from ? ` · ${src.from}` : '';
		// 3a) 加算阶段
		for (const src of lastBreakdown.sources) {
			// 逆向:不是加算,是「改写」。只写「多少 → 多少」
			// (卡面自己会说「基础分替换为…」,动画再啰嗦一遍就太长了)
			if (src.swap) {
				steps.push({
					text: `${nameOf(src)} ${formatScore(src.swap.from)} → ${formatScore(src.chips)}`,
					cls: 'text-rose-300',
					kind: 'swap'
				});
				continue;
			}
			if (!src.chips) continue;
			steps.push({
				text: `${nameOf(src)} ${src.chips < 0 ? '−' : '+'}${formatScore(Math.abs(src.chips))}${whyOf(src)}`,
				cls: 'text-amber-300',
				kind: 'chip'
			});
		}
		// 3b) 乘算阶段
		for (const src of lastBreakdown.sources) {
			if (src.mult === 1) continue;
			steps.push({
				text: `${nameOf(src)} ×${formatMult(src.mult)}${whyOf(src)}`,
				cls: 'text-purple-300',
				kind: 'mult'
			});
		}
		// 4） 合计
		// 4） 低压道具：没用掉就归还（也走结算动画，不然玩家不知道东西还在）
		for (const name of refunds)
			steps.push({ text: `🔄 没用上,${name} 归还库存`, cls: 'text-cyan-300', kind: 'chip' });
		// 4b） 田螺：加成卡不生效，掷完按原价返还（逐张一行）
		for (const b of buffBack)
			steps.push({
				text: `🐚 田螺：「${b.name}」+🥮 ${b.coins}`,
				cls: 'text-cyan-300',
				kind: 'chip'
			});
		// 4c） 田螺发动了主动技：把那批返还的一半收回。
		// 上面几行照旧是**原价**（钱先进来、动画里看得见），这里单独一行说清扣多少 ——
		// 比「逐行改成减半后的数」清楚，也不会出现「按行取整加起来对不上」的情况。
		if (tee.refundHalved && buffBack.length) {
			const back = Math.ceil(buffBack.reduce((s, b) => s + b.coins, 0) / 2);
			steps.push({
				text: `🐚 田螺：发动技能 -🥮 ${back}`,
				cls: 'text-cyan-300',
				kind: 'chip'
			});
		}
		// 5） 合计
		steps.push({
			text: `= ${formatScore(lastBreakdown.total)} 分`,
			cls: 'font-bold text-amber-200',
			kind: 'total'
		});
		return steps;
	};

	/**
	 * 「改基础分」的主动技:必须在结算动画**之前**问,答完才播动画 ——
	 * 它们改的是计分入参,动画里就该是最终数字。
	 * 其余的(归家 / 云海 / 调分左侧 / 换一张)仍问在动画之后:改的是「已结算分」,
	 * 或要等这一手的结果出来才有意义。
	 */
	const SCORE_ACTIVES = new Set<ActiveSkill['skill']>(['parked', 'sum']);

	const finalizeTee = () => {
		const tee = team[currentTee];
		const self = selfEffects(currentTee);
		const mods = modsFor(currentTee);

		const rawLevel = judgeRoll(dice, mods);
		// 等级提升（玉兔捣药） → 加成卡保底。前提:这一手不是「再接再厉」(掷空不给抬)
		let up = 0;
		for (const { eff } of self) if (eff.type === 'level_up') up += eff.count;
		const afterUp = up > 0 && rawLevel.id !== 'none' ? upgradeLevel(rawLevel.id, up) : rawLevel.id;
		// 升级卡可能把等级顶过 Boss 的封顶（血月），这里再套一次
		const level = getRollLevel(
			cappedLevelId(applyBuffLevelFloor(afterUp, buffsOf(currentTee)), mods)
		);

		// 后羿： 再接再厉时自动重掷全部（每回合 1 次）
		if (level.id === 'none' && hasRerollAllOnNone(self) && !rerollAllUsed) {
			rerollAllUsed = true;
			rerollCount += 6;
			playRerollAnim(Array(6).fill(true), finalizeTee);
			return;
		}

		// 和值按「变换后的点数」算,并剔除作废的骰子 —— 和判定(liveDice)同口径
		const shown = liveDiceValues(dice, mods);
		diceSum = shown.reduce((a, b) => a + b, 0);
		hitDice = hitIndices(dice, level.id, mods);
		lastLevel = level;
		lastBreakdown = calcTeeScore(scoreInput(currentTee, level.id, shown));

		tee.lastDice = [...dice];
		// 记下这一手被判作废的骰子(高照抄牌面时要连作废状态一起抄)
		tee.lastVoid = dice.map((_, k) => (isVoidDie(dice, k, mods) ? k : -1)).filter((k) => k >= 0);
		tee.lastLevelId = level.id;
		tee.lastScore = lastBreakdown.total;
		currentScore += lastBreakdown.total;
		countedTee = currentTee;

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

		// 田螺:身上的加成卡不生效 —— 挂载时就不入库,掷完按原价返还(逐张一行)
		const buffBack = settleTianluo(currentTee);
		// 结算参数留着:动画是在主动技答完之后才播的,那时才建这几行
		lastSettle = { levelId: rawLevel.id, refunds: refundUnusedItems(currentTee), buffBack };
		// 改基础分的主动技(田螺的停靠、潮汐/望月的点数和)在结算动画**之前**问:
		// 答完动画里就是最终数字。
		// (以前问在动画之后,只能「播完了再改数字」:要重写已经弹过的行,而且「这一关问过没有」
		//   没人管 —— 上一关的加值会漏到下一关。)
		const act = usableActive(currentTee);
		if (act && SCORE_ACTIVES.has(act.skill)) {
			pendingActive = act;
			return;
		}
		playSettle();
	};

	/**
	 * 播当前这只 Tee 的结算动画。数字必须已经**定稿**(主动技要么没问、要么问完了),
	 * 所以这里只负责把 settleSteps 一行行弹出来,末尾接 next()。
	 */
	const playSettle = (next: () => void = afterSettle) => {
		const tee = team[currentTee];
		const lv = lastLevel;
		if (!tee || !lv) return;
		// 读档回来时 lastSettle 不在(没存),用 Tee 身上留着的那批停靠行补显示
		const refunds = lastSettle?.refunds ?? [];
		const buffBack = lastSettle?.buffBack ?? tee.parkRows ?? [];
		settleSteps = buildSettleSteps(
			lastSettle?.levelId ?? tee.lastLevelId,
			lv,
			tee,
			refunds,
			buffBack
		);
		settleIdx = -1;
		settling = true;
		const stepMs = 380 / speed;
		// 进度条跟着结算动画走。
		// 注意:分数在 finalizeTee 里**已经加过**了(currentScore += lastBreakdown.total),
		const settleTotal = tee.lastScore ?? 0;
		settlePreview = -settleTotal;
		settleSteps.forEach((_, i) => {
			setTimeout(
				() => {
					settleIdx = i;
					settlePreview = -settleTotal + Math.round(settleTotal * ((i + 1) / settleSteps.length));
					const st = settleSteps[i];
					if (!st) return;
					if (st.kind === 'total') sfxTotal(settleTotal > 0);
					else sfxStep(i, st.kind, lv.score);
					// 只把「正在展示的这一行」滚进可视区,不做「永远贴底」——
					// 结算框里那些不可见的占位行会把 scrollHeight 撑得很大,贴底就会把上面的行推走
					if (stepsEl) {
						const line = stepsEl.children[i] as HTMLElement | undefined;
						if (line) {
							const lb = line.getBoundingClientRect();
							const sb = stepsEl.getBoundingClientRect();
							if (lb.bottom > sb.bottom) stepsEl.scrollTop += lb.bottom - sb.bottom;
							else if (lb.top < sb.top) stepsEl.scrollTop -= sb.top - lb.top;
							settleScrollTarget = stepsEl.scrollTop;
						}
					}
				},
				(i + 1) * stepMs
			);
		});
		const gen = animGen;
		setTimeout(
			() => {
				if (gen !== animGen) return; // 这中间读了档/重开/换人 → 这段流程作废
				settling = false;
				settlePreview = 0;
				teeAnim = '';
				setTimeout(() => {
					if (gen !== animGen) return;
					next();
				}, 600 / speed);
			},
			(settleSteps.length + 1) * stepMs
		);
	};

	const usableActive = (i: number): ActiveSkill | null => {
		const tee = team[i];
		if (!tee) return null;
		for (const sk of skillsFor(i)) {
			if (!activeReady(tee, sk)) continue;
			// 「左侧」不能指向自己(归家/云海那类「我」的主动技不在此列)
			if (sk.skill === 'left_chips' && selfOf(i)) continue;
			if (sk.skill === 'to_four') continue; // 改骰子的主动技在判定前就处理掉了
			// 猜谜:月饼币不够就不弹(弹了也点不动)
			if (sk.cost && mooncakes < sk.cost) continue;
			// 归家:队里只剩「我」一个就没人可卖;本关已经发动过也不再弹
			if (sk.skill === 'sell_self' && (team.length <= 1 || homingSell !== null)) continue;
			// 云海:自己已经是最后一个 Tee(没有「尚未投掷」的角色)就不弹了
			if (sk.skill === 'end_round' && i >= team.length - 1) continue;
			// 田螺:没有停靠的卡就没什么可折的(弹了也只能「白白减半」)
			if (sk.skill === 'parked' && !tee.parkRows?.length) continue;
			// 这一关已经问过的不再弹 —— 冷却 0 的田螺否则会在动画之后又弹一次
			if (tee.askedSkills?.includes(`${sk.srcId}|${sk.skill}`)) continue;
			return sk;
		}
		return null;
	};

	/**
	 * 田螺:这批停靠卡有几张、原价共多少(提示里要写清发动值多少分)。
	 * 掷完那一刻 refundPending 就清空了(原价已付),但 settleTianluo 把行留在了
	 * `tee.parkRows` 上 —— 存盘也带着,所以读档回来提示与动画都还在。
	 */
	/**
	 * 田螺身上那批「停靠」的加成卡 —— **两段状态合成一份清单**:
	 * 掷之前挂在 `refundPending` / `buffs` 上(还没返还),掷完落到 `parkRows`(原价已付)。
	 * 提示、发动提示、结算动画都读这一份 —— 以前两边各算一套(一个只看 parkRows、
	 * 一个只看 refundPending),所以挂着 6 张卡时提示里写的是「停靠 0 张」。
	 */
	const parkedCards = (i: number): { name: string; coins: number; paid: boolean }[] => {
		const tee = team[i];
		if (!tee) return [];
		if (tee.parkRows?.length) return tee.parkRows.map((r) => ({ ...r, paid: true }));
		const nameOf = (cardId: string) => BUFF_BY_ID.get(cardId)?.name ?? cardId;
		return [
			...tee.buffs.map((b) => ({
				name: nameOf(b.cardId),
				coins: BUFF_BY_ID.get(b.cardId)?.price ?? 0,
				paid: false
			})),
			...(tee.refundPending ?? []).map((r) => ({
				name: nameOf(r.cardId),
				coins: r.coins,
				paid: false
			}))
		];
	};

	/** 田螺:这批停靠卡的原价合计(发动提示里要写清折多少分) */
	const parkedPrice = (i: number): number => parkedCards(i).reduce((s, r) => s + r.coins, 0);

	/** 田螺主动技的折算率(卡里写的是 12) */
	const parkedPer = (srcId: string): number => {
		let per = 12;
		const walk = (e: unknown) => {
			if (!e || typeof e !== 'object') return;
			const o = e as { type?: string; skill?: string; perPrice?: number; parts?: unknown[] };
			if (o.type === 'bundle') o.parts?.forEach(walk);
			else if (o.type === 'active' && o.skill === 'parked' && o.perPrice) per = o.perPrice;
		};
		walk(cardById(srcId)?.effect);
		return per;
	};

	const afterSettle = () => {
		const sk = usableActive(currentTee);
		if (sk) {
			pendingActive = sk;
			return;
		}
		advanceAfterTee();
	};

	/** 本次结算要显示的那几行参数(动画要等主动技答完才播,所以先存在这) */
	let lastSettle: {
		levelId: string;
		refunds: string[];
		buffBack: { name: string; coins: number }[];
	} | null = null;

	/**
	 * 主动技改了「基础分」之后重算这只 Tee:乘算必须吃到这份加值 ——
	 * 所以不是 `lastScore += x`,而是把加值当计分入参重跑一遍
	 * (加值那行会自然排在乘算行**前面**,和卡面「计入基础分」一致)。
	 * 结算行不用在这里重建:改基础分的主动技都在动画之前问,playSettle 会重build。
	 */
	const rescoreTee = (i: number) => {
		const lv = lastLevel;
		if (!lv || !team[i]) return;
		const prev = team[i].lastScore ?? 0;
		lastBreakdown = calcTeeScore(
			scoreInput(i, lv.id, liveDiceValues(team[i].lastDice ?? [], modsFor(i)))
		);
		team[i].lastScore = lastBreakdown.total;
		currentScore += lastBreakdown.total - prev;
	};

	/** 记下「这一关这只需 Tee 的这个技能已经答过了」(发动 / 留着都算答) */
	const markAsked = (sk: ActiveSkill | null) => {
		const tee = team[currentTee];
		if (!sk || !tee) return;
		const key = `${sk.srcId}|${sk.skill}`;
		if (!(tee.askedSkills ?? []).includes(key)) tee.askedSkills = [...(tee.askedSkills ?? []), key];
	};

	/** 发动主动技能 */
	const useActive = () => {
		const sk = pendingActive;
		const i = currentTee;
		const tee = team[i];
		if (!sk || !tee) return;
		sfxClick();
		const gen = animGen; // 结算/读档会 ++animGen,下面那些收尾回调都要对代次
		markAsked(sk); // 答过了 —— 提示里那行状态、usableActive 都靠这个
		pendingActive = null;
		tee.charge = sk.cooldown; // 进入冷却
		const name = cardById(sk.srcId)?.name ?? sk.srcId;
		if (sk.skill === 'retry') {
			// 重试本关：全队分数清零重掷（目标/Boss 不变）
			retryRound();
			return;
		}
		if (sk.skill === 'to_four') {
			// 主动技只加自己那一步(改 1 颗为 4 点),排在改点队列最前面 ——
			// 顺序就是「主动技 → 卡牌改点 → 加成卡」。把 4 点改成任意点数是卡自带的
			// 恒定效果,不管技能用没用都会在队列里(collectSetOps 收的)。
			setQueue = [
				{ kind: 'point', count: 1, point: 4, srcId: sk.srcId },
				...collectSetOps(selfEffects(currentTee), buffsOf(currentTee))
			];
			nextSetOp();
			return;
		}
		const to = sk.skill === 'left_chips' ? team[i - 1] : tee;
		if (!to) {
			advanceAfterTee();
			return;
		}
		// 猜谜:先扣币,再把这只 Tee 已结算的得分乘一层(和值技能同一套路:事后补一行)
		if (sk.skill === 'mult') {
			const cost = sk.cost ?? 0;
			if (mooncakes < cost) {
				advanceAfterTee();
				return;
			}
			mooncakes -= cost;
			sfxCoin();
			const before = tee.lastScore;
			const after = Math.round(before * (sk.mult ?? 1));
			tee.lastScore = after;
			currentScore += after - before;
			settleSteps = [
				...settleSteps,
				{
					// 这是**总分**乘数(结算完再乘),不是链里的叠加倍率 —— 用「合计」同款粗体 + before → after,
					// 和紫色的叠加行区分开
					text: `⚡ ${name} · 总分 ×${formatMult(sk.mult ?? 1)}：${formatScore(before)} → ${formatScore(after)}${cost > 0 ? `（−🥮 ${cost}）` : ''}`,
					cls: 'font-bold text-amber-200',
					kind: 'total'
				}
			];
			settleIdx = settleSteps.length - 1;
			sfxTotal(true);
			setTimeout(() => {
				if (gen !== animGen) return;
				advanceAfterTee();
			}, 700 / speed);
			return;
		}
		// 云海:立刻结束本关 —— 直接跳到结算按钮,还没投掷的角色按人头给币
		if (sk.skill === 'end_round') {
			const left = Math.max(0, team.length - 1 - i);
			const gain = left * (sk.perTee ?? 0);
			if (gain > 0) {
				mooncakes += gain;
				sfxCoin();
			}
			settleSteps = [
				...settleSteps,
				{
					text: `⚡ ${name} · 结束本关${gain > 0 ? ` · 未投 ${left} 人 +🥮 ${gain}` : ''}`,
					cls: 'text-fuchsia-300',
					kind: 'chip'
				}
			];
			settleIdx = settleSteps.length - 1;
			sfxTotal(true);
			const gen = animGen;
			setTimeout(() => {
				if (gen !== animGen) return;
				finishRound();
			}, 700 / speed);
			return;
		}
		// 归家:只记状态 —— 真正的出售放在回合结算(那里没有下标跳人的问题)
		if (sk.skill === 'sell_self') {
			homingSell = sk.coins ?? 8;
			settleSteps = [
				...settleSteps,
				{
					text: `⚡ ${name} · 回合结算时出售「我」 +🥮 ${homingSell}`,
					cls: 'text-cyan-300',
					kind: 'chip'
				}
			];
			settleIdx = settleSteps.length - 1;
			sfxTotal(true);
			setTimeout(() => {
				if (gen !== animGen) return;
				advanceAfterTee();
			}, 700 / speed);
			return;
		}
		// 田螺:停靠的卡**已经按原价返还过**,发动就把它们折成基础分,并把返还收回一半。
		// 这一步在结算动画**之前**(finalizeTee 里就问),所以动画里那几行原价照旧,
		// 只多一行「发动技能 -🥮 N」;答完才播动画 —— 不用再改已经弹出去的数字。
		if (sk.skill === 'parked') {
			const rows = lastSettle?.buffBack ?? tee.parkRows ?? [];
			const paid = rows.reduce((s2, r) => s2 + r.coins, 0);
			if (paid > 0) {
				tee.skillChips = [
					{ srcId: sk.srcId, chips: paid * parkedPer(sk.srcId), from: `停靠 ${rows.length} 张` }
				];
				mooncakes -= Math.ceil(paid / 2);
				sfxCoin();
				tee.refundHalved = true;
				rescoreTee(i);
			}
			playSettle(advanceAfterTee);
			return;
		}
		if (sk.skill === 'sum') {
			const eff = cardById(sk.srcId)?.effect;
			const pr = eff && eff.type === 'active' && eff.skill === 'sum' ? eff : null;
			// 作废的骰子不计入和值(和判定同口径)
			const sum = liveDiceValues(tee.lastDice ?? [], modsFor(i)).reduce((a, b) => a + b, 0);
			const gain = Math.round(sum * (pr?.per ?? 1));
			const m =
				pr?.mult && pr.from !== undefined && sum > pr.from ? Math.pow(pr.mult, sum - pr.from) : 1;
			// 卡面是「点数和 ×N **计入基础分**」—— 设成计分入参再重算,这份分才吃得到倍率链
			// (以前是 lastScore += gain,加在乘算之后)。
			to.skillChips = [{ srcId: sk.srcId, chips: gain, from: `点数和 ${sum}` }];
			to.skillMult = m > 1 ? { srcId: sk.srcId, mult: m, from: `点数和 ${sum}` } : undefined;
			rescoreTee(i);
			playSettle(advanceAfterTee); // 和停靠同理:改完基础分再播动画
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
		setTimeout(() => {
			if (gen !== animGen) return;
			advanceAfterTee();
		}, 700 / speed);
	};

	/** 跳过主动技能 */
	const skipActive = () => {
		sfxClick();
		const wasDice = pendingActive?.skill === 'to_four';
		const wasScoreAct = !!pendingActive && SCORE_ACTIVES.has(pendingActive.skill);
		markAsked(pendingActive);
		pendingActive = null;
		// 改骰子的主动技跳过了,不是收尾 —— 还要接着走改点/判定
		if (wasDice) {
			beginSetOps();
			return;
		}
		// 改基础分的主动技(田螺/点数和):结算动画还在等这个答案 —— 答完这里才播
		if (wasScoreAct) {
			playSettle(advanceAfterTee);
			return;
		}
		advanceAfterTee();
	};

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
		usedOpCount = {};
		rerollAllUsed = false;
		countedTee = -1; // 本关重来 → 所有 Tee 回到「待掷」
		clearRoundSkillState(); // 主动技的加值也是「本关一次」,重来就要收回
		settleSteps = [];
		settleIdx = -1;
		pendingAction = null;
		choosing = false;
		dice = [1, 1, 1, 1, 1, 1];
		jackpotDone = []; // 本关重来 → 蜜枣的 1% 重新抽
		rollCurrent();
	};

	const finishRound = () => {
		phase = 'round_confirm';
	};

	/** 用户手动滚动结算框一律无视:立刻回到「当前行可见」的位置 */
	const keepSettleScroll = () => {
		if (stepsEl && Math.abs(stepsEl.scrollTop - settleScrollTarget) > 1)
			stepsEl.scrollTop = settleScrollTarget;
	};

	const confirmRound = () => {
		sfxClick();
		if (teamSettling || phase !== 'round_confirm') return;
		const cards = allCards();
		const steps: { text: string; cls: string; kind: SettleKind }[] = [];
		// 队伍里还有没有「我」——注意 allCards() 已经把 null 过滤掉了,得看原队伍
		const hasMe = team.some((t) => !t.cardId);
		for (const c of cards) {
			if (c.effect.type === 'team_mult') {
				steps.push({
					// 总分乘数(作用在团队总分上)—— 粗体亮青,和每个 Tee 里的紫「叠加倍率」分开
					text: `Σ ${c.name}：总分 ×${c.effect.value}`,
					cls: 'font-bold text-cyan-200',
					kind: 'mult'
				});
			}
			// 饼铺掌柜(二):「我」被卖掉了,队伍总分 ×2
			const noMe =
				c.effect.type === 'no_me_team_mult'
					? c.effect.mult
					: c.effect.type === 'bundle'
						? (
								c.effect.parts.find((p) => p.type === 'no_me_team_mult') as
									{ mult: number } | undefined
							)?.mult
						: undefined;
			if (noMe && !hasMe)
				steps.push({
					// 不写「队伍里没有我」——条件玩家自己清楚,结算行动画越短越好
					text: `Σ 🏪 ${c.name}：总分 ×${noMe}`,
					cls: 'font-bold text-cyan-200',
					kind: 'mult'
				});
		}
		const sum = team.reduce((s, t) => s + t.lastScore, 0);
		const { total, teamMult, relay, ratioBonus, relayLines, ratioLines } = calcTeamTotal(
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
		// 压分辅助(月上广寒):「我」这一份按 (邻居/自己) 放大后加进总分
		for (const rl of ratioLines) {
			steps.push({
				text: `❄️ ${cardById(rl.cardId)?.name ?? rl.cardId}：「我」×${formatScore(Math.round(rl.mult * 10) / 10)} +${formatScore(Math.round(rl.bonus))} 分`,
				cls: 'text-cyan-300',
				kind: 'mult'
			});
		}
		// 归家:本关发动过 —— 出售「我」的换币摆在这一屏(结算动画里的那一行)
		if (homingSell !== null)
			steps.push({
				text: `🏠 归家:出售「我」 +🥮 ${homingSell}`,
				cls: 'text-cyan-300',
				kind: 'mult'
			});
		steps.push({
			text:
				teamMult !== 1
					? `${formatScore(sum + relay + ratioBonus)} × ${teamMult} = ${formatScore(total)} 分`
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
					// 每出一条加一声(和每个 Tee 的结算同一套):最后那条「合计」用 total 音
					const st = steps[i];
					if (st) {
						if (st.kind === 'total') sfxTotal(total > 0);
						else sfxStep(i, st.kind, 0);
					}
					// 回流/倍率播的时候进度条也往上走(终点正好是 total)
					currentScore = Math.round(sum + (total - sum) * ((i + 1) / steps.length));
				},
				(i + 1) * stepMs
			);
		});
		const gen = animGen;
		setTimeout(
			() => {
				if (gen !== animGen) return;
				teamSettling = false;
				settleRound();
			},
			(steps.length + 1) * stepMs
		);
	};

	/**
	 * 归家:回合结算时**出售「我」**。
	 * 刻意不走 sellTee —— 那个会按稀有度给币、还会动卖卡计数;而且关卡中途卖人会让
	 * currentTee 这类下标错位。这里在回合末整队重排一次。
	 *
	 * ⚠️ 「我」是个**单独的 Tee**(只是默认不能卖、默认没有能力),不是什么可以转让的
	 * 「玩家身份」—— 卖掉之后队伍里就没有「我」了,依赖「我」的效果随之失效。
	 * 剩下的人照常排队,新队首是普通 Tee(可以正常出售)。
	 */
	const homingSettle = () => {
		const coins = homingSell;
		if (coins === null) return;
		homingSell = null;
		// 「我」已经不在队里(上一关卖过了)→ **没人可卖**:不发币、不记销量、不动队伍。
		// 正常玩不到这里(技能跟着「我」一起消失),但作弊注入 / 异常存档能造出来;
		// 那时绝不能退而求其次去卖队首 —— 那是把「我」的身份错安在别人头上。
		if (!team.some((t) => t.isSelf)) return;
		mooncakes += coins;
		// 「我」被卖也算一次(夜市饼摊/饼铺掌柜都要算上)
		soldTees += 1;
		sellBoostPending = true;
		sfxSell();
		if (team.length <= 1) return; // 只剩「我」一个时就别卖了(入口已经拦过,兑底)
		// 移除**真正的「我」**(isSelf 那个),而不是「保留下标 0 之外」——
		// 后者在队伍被重排过时会卖掉别人。卖完剩下的人重新归位。
		team = normalizeSelf(team.filter((t) => !t.isSelf));
		currentTee = 0;
		countedTee = Math.min(countedTee, Math.max(0, team.length - 1));
	};

	const settleRound = () => {
		// 回合制衰减放在**结算时**:点了「结算回合」立刻能看到道具少一关、
		// 技能冷却少一回合 —— 放在下一关开始时,玩家点完结算看到的是旧数值。
		// (顺带修正一个 off-by-one:集市里买的「持续 2 关」道具,原来会在下一关
		//  开始就被扣掉 1,实际只生效 1 关;现在按卡面「每过一关 -1」算,正好 2 关。)
		homingSettle(); // 归家:先把「我」卖掉(它自己身上没有任何卡,不影响下面的卡池计算)
		decayBuffsForRound();
		tickCharge(team); // 主动技能冷却 -1
		const total = roundTotal;
		runScore += Math.min(total, target);
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
			// 桂树(own_face_grow):把本关掷出的颗数记进去 —— 从**下一关**开始吃到。
			// 数和引擎计分同一口径(最终骰子),只数这一关真掷过的:countedTee 之后的是
			// 被「云海」提前收关、根本没投掷的 Tee(它们的 lastDice 还是上一关的)。
			{
				const grown: GrowthMap = { ...growth };
				let any = false;
				team.forEach((_, k) => {
					if (k > countedTee) return;
					const shown = liveDiceValues(team[k].lastDice ?? [], modsFor(k));
					for (const { eff, srcId } of selfEffects(k)) {
						if (eff.type !== 'own_face_grow') continue;
						const n = shown.filter((v) => v === eff.face).length;
						if (n > 0) {
							grown[srcId] = (grown[srcId] ?? 0) + n;
							any = true;
						}
					}
				});
				if (any) growth = grown;
			}
			sfxWin();
			phase = 'round_end';
		} else {
			// 失败
			finalScore = total;
			finalRound = round;
			finalRunScore = runScore;
			const prevBest = save.bestScore;
			save = saveResult(runScore, round);
			isNewBest = runScore > prevBest && runScore > 0;
			sfxLose();
			phase = 'game_over';
		}
	};

	/** 放弃结算并结束游戏：本轮分数不计，直接按当前总分收场（按钮在结算按钮右下，小一号防误触） */
	const abandonRun = () => {
		sfxClick();
		if (teamSettling) return; // 结算动画播到一半不给点，和「结算回合」一致
		finalScore = 0;
		finalRound = round;
		finalRunScore = runScore;
		const prevBest = save.bestScore;
		save = saveResult(runScore, round);
		isNewBest = runScore > prevBest && runScore > 0;
		sfxLose();
		phase = 'game_over';
	};

	/** 抽 3 选 1 并登记图鉴 —— 刷出来过就算解锁,不用真的选它 */
	const drawRewardChoices = () => {
		rewardChoices = drawCards(3);
		lastRewardIdx = -1;
		unlockTees(rewardChoices);
	};

	/** 抽货架并登记图鉴 —— 摆出来过就算解锁 */
	const drawShopChoices = () => {
		shopBuffs = drawShopItems(shopLocks);
		unlockBuffs(shopBuffs);
	};

	/** 抽开局 5 选 2 并登记图鉴 —— 刷出来过就算解锁(和 3 选 1 同理) */
	const drawDraftChoices = () => {
		draftChoices = shuffle(CARDS.filter((c) => c.rarity === 'common')).slice(0, 5);
		unlockTees(draftChoices);
	};

	const nextReward = () => {
		sfxClick();
		phase = 'reward';
		drawRewardChoices();
		refreshPrice = 1; // 新的一次选卡 = 新的一轮集市,刷新价从头算
	};

	const refreshReward = () => {
		sfxClick();
		if (mooncakes < refreshPrice) return;
		mooncakes -= refreshPrice;
		refreshPrice += 1; // 越刷越贵
		drawRewardChoices();
	};

	const pickReward = (idx: number) => {
		if (team.length >= TEAM_LIMIT) return;
		const card = rewardChoices[idx];
		if (!card) return;
		team = [
			...team,
			{
				cardId: card.id,
				isSelf: false,
				lastScore: 0,
				lastLevelId: 'none',
				lastDice: [1, 1, 1, 1, 1, 1],
				buffs: []
			}
		];
		lastRewardIdx = idx;
		// 同步进中秋集市,不搞"选中特效 + 延时跳转" ——
		// 卡牌那时已经真的进队了,只要这个延时里刷新页面,就会卡在组建 Tee 队
		// (队伍里多了一张卡、界面却还在等着你选)。
		openShop();
	};

	const openShop = () => {
		sfxClick();
		phase = 'shop';
		drawShopChoices();
		shopPick = null;
		shopPeek = null;
		shopSold = [];
		refreshPrice = 1; // 重新进中秋集市,刷新价恢复
	};

	const refreshShop = () => {
		sfxClick();
		if (mooncakes < refreshPrice) return;
		mooncakes -= refreshPrice;
		refreshPrice += 1; // 越刷越贵
		drawShopChoices();
		shopPick = null;
		shopPeek = null;
		shopSold = [];
	};

	const toggleLock = (i: number) => {
		sfxClick();
		shopLocks = shopLocks.map((id, k) => (k === i ? (id ? null : (shopBuffs[i]?.id ?? null)) : id));
	};

	/** 最近一次按下是不是鼠标 —— 中秋集市的「双击购买」只给鼠标用(touch 上双击=缩放/误触) */
	let lastPointerWasMouse = false;

	const buyBuff = (card: BuffCard) => {
		if (mooncakes < card.price) return;
		mooncakes -= card.price;
		if (sfxOn) sfxCoin();
		buffInventory = { ...buffInventory, [card.id]: (buffInventory[card.id] ?? 0) + 1 };
		unlockBuffs([card]); // 进过仓库的卡一定算见过(商店之外拿到的也走这里)
		shopSold = [...shopSold, card.id];
		// 买走之后这格自动解锁：免得「已买」永远占着货架
		shopLocks = shopLocks.map((id, k) => (shopBuffs[k]?.id === card.id && id ? null : id));
		shopPick = null;
	};

	/** 出售确认弹窗里要列的东西:卖掉这只 Tee 会一起没的加成卡 */
	const sellLossList = (i: number): { name: string; note: string; color?: string }[] => {
		const t = team[i];
		if (!t) return [];
		// 田螺不算:它身上那批卡本来就不生效、掷完按原价返还,卖掉时当场折成月饼币退给玩家
		// (见 sellTee)—— 一件都不会白丢,没什么可警告的。
		if (hasBuffRefund(i)) return [];
		return (t.buffs ?? []).map((b) => {
			const c = BUFF_BY_ID.get(b.cardId);
			return {
				name: c?.name ?? b.cardId,
				note: `剩 ${b.turnsLeft} 回合`,
				color: c ? RARITY_INFO[c.rarity].color : undefined
			};
		});
	};

	const sellTee = (idx: number) => {
		// 「我」不能卖 —— 认身份,不认下标。「我」离队后新队首是普通 Tee,可以卖。
		if (team[idx]?.isSelf) return;
		// 队里只剩这一只也不能卖:卖掉队伍就空了 —— 那不是「更弱的队伍」,是没队伍。
		// (踩过:归家卖完「我」之后,最后一只照样挂着出售按钮,卖了 team=[] / currentTee=-1。)
		if (team.length <= 1) return;
		// 田螺:还没掷的那批「停靠」卡本来掷完就按原价返还 —— 直接卖就别让饼铺白吞,
		// 当场退给玩家。(掷完的那批在 settleTianluo 里已经退过,不会重复。卖卡阶段在结算
		// 之后,所以正常流程本来就走不到这里,只有云海提前收关那种情况才用得上。)
		const soldTee = team[idx];
		if (soldTee && hasBuffRefund(idx)) {
			const pend =
				(soldTee.buffs ?? []).reduce((n, b) => n + (BUFF_BY_ID.get(b.cardId)?.price ?? 0), 0) +
				(soldTee.refundPending ?? []).reduce((n, r) => n + r.coins, 0);
			if (pend > 0) mooncakes += pend;
		}
		sfxSell(); // 收银机「ka-ching」
		const card = cardOf(team[idx]);
		if (card) {
			mooncakes += rarityOf(card).sell;
			// 卖卡计数:累计给饼铺掌柜的基础分,同时给夜市饼摊挂上「下回合 ×2」
			soldTees += 1;
			sellBoostPending = true;
		}
		team = team.filter((_, i) => i !== idx);
		if (currentTee >= team.length) currentTee = team.length - 1;
	};

	/** 确认出售(弹窗里那个按钮):关闭弹窗并真的卖 */
	const confirmSell = () => {
		const idx = sellAsk;
		sellAsk = null;
		if (idx !== null) sellTee(idx);
	};

	/**
	 * 这只 Tee 能不能卖(出售按钮 / 卡面提示 / sellTee 兕底共用这一条,不要各写一份)。
	 *
	 * 除了阶段和身份,还要看**卖完还剩不剩人**:队伍可以少到只剩 1 只,
	 * 但不能归零 —— 归零之后没队伍可掷、currentTee 也会变成 -1。
	 */
	const canSellTee = (i: number): boolean =>
		(phase === 'reward' || phase === 'shop') &&
		team.length > 1 &&
		!team[i]?.isSelf &&
		!!team[i]?.cardId;

	/** 卡面提示里的附加行:能卖报卖价,最后一只要说明为什么没按钮 */
	const teeTipExtra = (i: number): string | undefined => {
		const t = team[i];
		if (!t?.cardId) return undefined; // 「我」没卡,谈不上卖
		return team.length > 1 ? `卖出得 🥮 ${rarityOf(cardOf(t)).sell}` : '最后一个 Tee 不能出售';
	};

	const nextRound = () => {
		sfxClick();
		round += 1;
		beginRound();
	};

	const restart = () => {
		sfxClick();
		// 结束界面点「返回菜单」= 这一局到此为止:必须清掉局内存档,
		// 否则刷新时 loadRun() 还会读到 phase='game_over' 的快照,直接跳回结束界面
		clearRun();
		resetRun();
		team = [];
		phase = 'idle';
		draftChoices = [];
		draftPicked = [];
		save = getSave(); // 元存档(最高分/累计游玩)保留
	};

	// ---- 展示 ----

	const rawProgress = $derived(target > 0 ? displayScore / target : 0);
	const moonPhase = $derived(Math.min(1, rawProgress));
	const moonShiftPct = $derived(Math.min(100, Math.pow(Math.max(0, moonPhase), 1.5) * 100));
	const progressFillPct = $derived(Math.min(100, Math.round(rawProgress * 100)));
	const progressPct = $derived(Math.max(0, Math.round(rawProgress * 100)));
	const currentTeeCard = $derived(cardOf(team[currentTee] ?? team.find((t) => t.isSelf)));
	const canPickReward = $derived(team.length < TEAM_LIMIT);

	/** 倍率显示:最多两位小数、去掉末尾 0
	 *  (×2.25 → ×2.25、×1.15 → ×1.15、×2.3 → ×2.3、×2 → ×2)。
	 *
	 *  引擎的倍率本来就不保证是一位小数 —— 桂树 1.15、per_tag 1.42^2=2.0164、射日仙 1.5^3=3.375、
	 *  全队 ×1.35 —— 只显示一位的话,玩家拿计算器一验就对不上(最坏差 4.35%)。
	 *  所以是**提高显示精度**,而不是把引擎数值 round 到一位(那是在改平衡)。 */
	const formatMult = (m: number): string => {
		// 先固定两位再削掉末尾 0:2.00 → 2、1.30 → 1.3、1.15 → 1.15
		return (Math.round(m * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
	};

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

	// 只剩「过关结算」阶段要这条无标题的精简道具条(那里队伍面板已收起)。
	// 3 选 1 改用队伍上方的货架了,不再重复摆一遍。
	// 货架在桌面(两列 lg+)会换行长高 → 已在货架上压 lg:max-h + overflow-y-auto,否则
	// 收了很多加成卡时 reward/shop 会被顶出屏幕(实测 1280×800 溢出 85px)。

	// ---- 分阶段布局（移动端单屏）----
	// 手机屏幕只有 ~590px 可用高度，一律铺开必然要滚动。
	// 按阶段只保留该阶段真正要用的面板，其余收成一行道具条。

	const marketTeam = $derived(phase === 'reward' || phase === 'shop');
	// 中秋集市阶段也显示（只看不用：挂卡只在掷骰前），否则卖掉/买卡的决策少了信息
	// 3 选 1(reward)同样要摆:那里能卖 Tee、要决定留哪些卡 —— 且要和别的界面一样
	// 放在**队伍上方**带「✨ 加成卡」标题,而不是缩到面板下方的无标题道具条。
	const showBuffShelf = $derived(
		(phase === 'intro' || phase === 'shop' || phase === 'reward') && buffEntries.length > 0
	);
	// 只剩「过关结算」阶段要这条无标题的精简道具条(那里队伍面板已收起)。
	// 3 选 1 改用队伍上方的货架了,不再重复摆一遍。
	// 货架在桌面(两列 lg+)会换行长高 → 已在货架上压 lg:max-h + overflow-y-auto,否则
	// 收了很多加成卡时会被顶出屏幕(实测 1280×800 reward 溢出 85px)。
	const showItemBar = $derived(phase === 'round_end' && buffEntries.length > 0);

	const settleReserveLines = $derived(
		Math.min(
			(boss?.mods ? 1 : 0) + 1 + Math.max(0, ...team.map((_, i) => potentialSources(i))) + 1,
			stepsFitLines
		)
	);

	/**
	 * 结算区能放几行:按面板高度实测。
	 * 内容在面板里是上下居中的 —— 结算区多一行,上下留白各少半行,
	 * 所以能放的行数 = (面板内容高 - 固定部分 - 上下各留的 minGap) / 行高。
	 * 「固定部分」= 标题行顶到结算区顶的距离,和结算行数无关。
	 */
	const measureStepsFit = () => {
		const p = dicePanelEl;
		const s = stepsEl;
		if (!p || !s) return;
		const row = p.querySelector('.order-first');
		if (!(row instanceof HTMLElement)) return;
		const cs = getComputedStyle(p);
		// 全部用布局 px(offsetHeight 不受祖先 transform: scale 影响)
		const innerH = p.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
		const fixed = s.offsetTop - row.offsetTop + parseFloat(getComputedStyle(row).marginTop);
		const lineH =
			(s.firstElementChild instanceof HTMLElement && s.firstElementChild.offsetHeight) || 13;
		const minGap = 8; // 上下各自留白(布局 px)
		stepsFitLines = Math.max(1, Math.floor((innerH - 2 * minGap - fixed) / lineH));
		// 实际行数(带加成卡时会多于预留)超过能放的就滚动,否则全展开
		stepsMaxH = stepsFitLines * lineH;
	};

	$effect(() => {
		if (!dicePanelEl || !stepsEl) return;
		measureStepsFit();
		// 面板尺寸(矮屏缩放 / 旋转 / 换断点)和内容高度(换卡、加 Boss)变了都要重测
		const ro = new ResizeObserver(measureStepsFit);
		ro.observe(dicePanelEl);
		ro.observe(stepsEl);
		return () => ro.disconnect();
	});

	/**
	 * 本 Tee 结算时可能出现几行(结算区按它预留高度,少算了动画半途会被顶上去)。
	 * 三块加起来:自己卡的效果 + 别人卡上的「全队效果」+ 身上每张加成卡。
	 */
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
		// 别人的「全队效果」也会在我这轮被我记上一行(引擎里在 allSelf 那一轮落下来)
		const teamWide = (e: TeeEffect) =>
			e.type === 'team_chips' ||
			e.type === 'per_team_chips' ||
			(e.type === 'on_player' && e.teamWide) ||
			(e.type === 'per_tag' && e.teamWide) ||
			e.type === 'face_count_chips';
		for (let j = 0; j < team.length; j++) {
			if (j === i) continue;
			for (const { eff } of selfEffects(j)) {
				if (teamWide(eff)) n += 1;
				else if (eff.type === 'bundle') for (const p of eff.parts) if (teamWide(p)) n += 1;
			}
		}
		// 加成卡:只要有实际效果,结算里就占 1 行(以前只数了加算/乘算三种)
		for (const b of team[i]?.buffs ?? []) {
			if (BUFF_BY_ID.get(b.cardId)?.effect) n += 1;
		}
		// 田螺:返还是逐张一行的(含兜底清掉的那些已挂载卡)
		if (hasBuffRefund(i)) n += (team[i]?.refundPending?.length ?? 0) + (team[i]?.buffs.length ?? 0);
		return n;
	};

	const teamSettleReserveLines = $derived(
		Math.max(
			1,
			allCards().filter((c) => {
				const j = JSON.stringify(c.effect);
				return j.includes('team_mult') || j.includes('relay_pct') || j.includes('no_me_team_mult');
			}).length +
				1 +
				(homingSell !== null ? 1 : 0)
		)
	);

	const showTeamPanel = $derived(phase !== 'round_end' && phase !== 'game_over');

	/**
	 * 桌面(lg+)双列:左「仓库 + 队伍」,右「掷骰 / 3 选 1 / 集市 / 结算」。
	 * 单列时容器宽 1024px 而内容只有 ~600px,右边大片留白;分栏后左列固定
	 * 22rem、右列吃掉剩余宽度,同时解掉「队伍 + 面板」抢竖直空间的问题
	 * (reward 面板本身高,以前和队伍叠着放,1280×800 会溢出)。
	 * 只在队伍面板存在时分栏;结算/结束那种整屏面板仍走单列。
	 */
	const deskSplit = $derived(showTeamPanel);
</script>

<svelte:head>
	<title>中秋博饼大会 - TeeworldsCN</title>
	<meta property="og:title" content="中秋博饼大会 - TeeworldsCN" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://teeworlds.cn/zhongqiu" />
	<meta
		property="og:description"
		content="中秋博饼大会：带上你的 Tee 排队博饼，兑换 Tee 卡构筑队伍，冲击无限高分！"
	/>
	<meta property="og:image" content="https://teeworlds.cn/shareicon.png" />
	<meta
		name="description"
		content="中秋博饼大会：带上你的 Tee 排队博饼，兑换 Tee 卡构筑队伍，冲击无限高分！"
	/>
</svelte:head>

<!-- 拖拽多选:手指/鼠标可能停在骰子外面松开,收笔必须挂在 window 上 -->
<svelte:window onpointerup={endPaint} onpointercancel={endPaint} onblur={endPaint} />

<!-- 禁选:这是个游戏,连点带拖时不该把面板文字选中(图鉴里单独放开,见 Codex) -->
<div
	class="relative flex min-h-full flex-col overflow-hidden text-slate-200 select-none"
	style={fitScale < 1 ? `height: ${availH}px` : ''}
>
	{#snippet buffPop(card: BuffCard, cls: string)}
		<!-- 加成卡说明浮层:绝对定位不参与布局,描述可以完整显示不用截断 -->
		<div
			class="pointer-events-none z-50 w-max max-w-[17rem] rounded-lg border border-sky-400/50 bg-slate-950/95 px-2.5 py-1.5 text-center text-[11px] leading-snug shadow-xl {cls}"
		>
			<BuffTip {card} />
		</div>
	{/snippet}

	{#snippet buffChip(card: BuffCard, count: number, interactive = false)}
		<!-- 加成卡芯片:所有宽度统一形态(不再用大卡);掷骰前点选,再点 Tee 挂上 -->
		<!-- 描边 = 稀有度色(普通灰 / 稀有蓝 / 传说金);选中改用外圈 ring,免得盖掉稀有度 -->
		{@const state =
			selectedBuff?.id === card.id
				? 'ring-2 ring-amber-400 bg-amber-400/15'
				: interactive
					? 'bg-slate-800/70'
					: 'bg-slate-800/60'}
		{@const rarityColor = RARITY_INFO[card.rarity].color}
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
				type="button"
				class="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border px-1.5 py-0.5 transition select-none sm:gap-1.5 sm:px-2 sm:py-1 {state}"
				style="border-color: {cardBorderColor(rarityColor)}"
				onpointerdown={(e) => {
					lastPointerWasMouse = e.pointerType === 'mouse';
					buffTipAnchor = e.currentTarget as HTMLElement;
				}}
				onpointerenter={(e) => {
					if (e.pointerType === 'touch') return;
					peekBuff = card;
					buffTipAnchor = e.currentTarget as HTMLElement;
				}}
				onpointerleave={(e) => {
					if (e.pointerType !== 'touch' && peekBuff?.id === card.id) peekBuff = null;
				}}
				onclick={(e) => {
					buffTipAnchor = e.currentTarget as HTMLElement;
					toggleSelectBuff(card);
				}}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						buffTipAnchor = e.currentTarget as HTMLElement;
						toggleSelectBuff(card);
					}
				}}
			>
				{@render inner()}
			</button>
		{:else}
			<div
				class="flex shrink-0 items-center gap-1 rounded-lg border px-1.5 py-0.5 transition sm:gap-1.5 sm:px-2 sm:py-1 {state}"
				style="border-color: {cardBorderColor(rarityColor)}"
				role="button"
				tabindex="0"
				onpointerdown={(e) => {
					lastPointerWasMouse = e.pointerType === 'mouse';
					buffTipAnchor = e.currentTarget as HTMLElement;
				}}
				onpointerenter={(e) => {
					if (e.pointerType === 'touch') return;
					peekBuff = card;
					buffTipAnchor = e.currentTarget as HTMLElement;
				}}
				onpointerleave={(e) => {
					if (e.pointerType !== 'touch' && peekBuff?.id === card.id) peekBuff = null;
				}}
				onclick={(e) => {
					// 触屏没 hover:点一下看说明,再点收起(鼠标已经有 hover 了,不抢点击)
					buffTipAnchor = e.currentTarget as HTMLElement;
					if (!lastPointerWasMouse) peekBuff = peekBuff?.id === card.id ? null : card;
				}}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						buffTipAnchor = e.currentTarget as HTMLElement;
						peekBuff = peekBuff?.id === card.id ? null : card;
					}
				}}
			>
				{@render inner()}
			</div>
		{/if}
	{/snippet}
	<!-- 夜空背景:固定在可视区域内(fixed),内容再长也不会把月亮推走 -->
	<!-- 夜空:四个星群 SVG。以前是 40 个带动画的 span + 3 片 blur(14px) 的云 ——
	     移动的模糊层要逐帧重算,星星又一直在动,而上面的面板全都带 backdrop-blur,
	     三者叠在一起就是耗电大头。现在星空是静态的(4 个节点),背后的模糊只算一次。 -->
	<div class="sky pointer-events-none fixed inset-x-0 top-11 bottom-8 overflow-hidden">
		{#each STAR_FIELDS as f}
			<svg
				class="starfield"
				viewBox="0 0 300 170"
				style={`left: ${f.left}; top: ${f.top}; width: ${f.w}`}
				aria-hidden="true"
			>
				{#each f.stars as s}
					<circle cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />
				{/each}
			</svg>
		{/each}
		<div class="moon" class:dim={phase !== 'idle'}></div>
	</div>

	<!-- 矮屏缩放:按 minH 布局再整体缩小(transform-origin 左上,宽高补偿回去) -->
	<div
		class="flex min-h-0 flex-1 flex-col"
		style={fitScale < 1
			? `flex: none; width: ${100 / fitScale}%; height: ${availH / fitScale}px; transform: scale(${fitScale}); transform-origin: top left`
			: ''}
	>
		<div
			class="relative z-10 mx-auto flex w-full max-w-5xl {deskSplit
				? 'lg:max-w-7xl'
				: ''} flex-1 flex-col px-2 pt-2 pb-2 max-[365px]:pt-1 max-[365px]:pb-1 sm:px-6 sm:pt-4 sm:pb-6"
		>
			{#snippet recordsBar()}
				<!-- 标题屏同款的战绩条:选卡阶段用它代替关卡 HUD(那时还没有关卡) -->
				<div
					class="rounded-xl border border-amber-500/25 bg-slate-900/70 px-2.5 py-2 text-center text-xs text-amber-200/90 backdrop-blur-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm"
				>
					<span class="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
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
					</span>
				</div>
			{/snippet}

			{#snippet hud()}
				<!-- ================= HUD ================= -->
				<div
					class="rounded-xl border border-amber-500/25 bg-slate-900/70 px-2.5 py-2 backdrop-blur-sm max-[365px]:py-1 sm:rounded-2xl sm:px-4 sm:py-3"
				>
					<div class="flex items-center gap-x-2 text-xs sm:gap-x-3 sm:text-sm">
						<div class="font-bold text-amber-200">
							第 {round} 关
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
						中秋博饼大会
					</h1>
					<p class="mt-1 text-xs text-slate-300 sm:mt-2 sm:text-sm">带上你的 Tee，博一个状元</p>

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
						<!-- 玩法说明只讲「这是个什么游戏」,不写步骤 —— 细节留给
						     「博饼等级一览」和「队友图鉴」两个弹窗 -->
						<div class="space-y-2 text-xs leading-snug text-slate-400 sm:text-sm">
							<p>
								组建你的投掷 <b class="text-amber-300">Tee 队</b>，轮流投掷骰子，得分达标即可过关。
							</p>
							<p>
								过关可获得<b class="text-amber-300">月饼币</b>，利用 Tee 的<b
									class="text-fuchsia-300">技能</b
								>和中秋集市购买的<b class="text-sky-300">加成卡</b>努力闯关吧！
							</p>
						</div>
						<button
							class="mt-2 w-full rounded-lg border border-amber-500/30 bg-amber-400/10 px-3 py-1.5 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/20 active:scale-[0.98]"
							onclick={() => (showRules = true)}
						>
							🎲 博饼等级一览
						</button>
						<button
							class="mt-1.5 w-full rounded-lg border border-sky-500/30 bg-sky-400/10 px-3 py-1.5 text-sm font-semibold text-sky-200 transition hover:bg-sky-400/20 active:scale-[0.98]"
							onclick={() => (showCodex = true)}
						>
							📖 队友图鉴
						</button>
					</div>
				</div>
			{:else if phase === 'draft'}
				<!-- ================= 开局选卡(5 选 2) ================= -->
				{@render recordsBar()}
				<div
					class="panel-fill panel-auto mt-2.5 rounded-xl border border-amber-500/30 bg-slate-900/80 px-2.5 py-2.5 backdrop-blur-sm sm:mt-4 sm:rounded-2xl sm:p-6"
				>
					<div class="text-center">
						<div class="text-base font-bold text-amber-200 sm:text-xl">🎲 选择初始 Tee</div>
						<div class="mt-0.5 text-[11px] text-slate-400 sm:text-xs">
							点卡查看效果 · 已选 <b class="text-amber-300">{draftPicked.length}</b>/2
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
							{draftPicked.length === 2 ? '开始博饼 →' : '请选择两个 Tee'}
						</button>
					</div>
				</div>

				<!-- 回标题:放弃本局(存档一并清掉) -->
				<div
					class="panel-auto mt-2.5 rounded-xl border border-slate-700/60 bg-slate-900/70 px-2.5 py-2.5 backdrop-blur-sm sm:mt-4 sm:rounded-2xl sm:p-4"
				>
					{#if showDonate}
						<div
							class="mb-2.5 rounded-xl border border-[#946ce6]/40 bg-[#946ce6]/10 px-3 py-2.5 text-center"
						>
							<div class="text-[11px] text-purple-200/85 sm:text-xs">如果很喜欢，请考虑打赏</div>
							<a
								class="mt-2 inline-block rounded-xl bg-[#946ce6] px-5 py-2 text-sm font-bold text-white shadow-lg transition hover:bg-[#7f4be7] active:scale-95 sm:px-6 sm:py-2.5 sm:text-base"
								href={DONATE_URL}
								target="_blank"
								rel="noopener noreferrer">通过爱发电打赏</a
							>
						</div>
					{/if}
					<button
						class="w-full rounded-xl border border-slate-500 bg-slate-700/80 px-6 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-600 active:scale-95 sm:py-2.5 sm:text-base"
						onclick={backToTitle}
					>
						← 返回标题
					</button>
					<div class="mt-1.5 text-center text-[10px] text-slate-500 sm:text-xs">
						回标题会放弃这一局（不保留进度）
					</div>
				</div>
			{:else}
				{@render hud()}

				<!-- 桌面双列:左列 = 仓库 + 队伍,右列 = 阶段面板。
				     contents 让移动端完全等价于「没有这两个 div」:flex 链不断,
				     panel-fill 照样吃得到高度。 -->
				<div
					class="contents {deskSplit
						? 'lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-stretch lg:gap-4'
						: ''}"
				>
					<div
						class="contents {deskSplit ? 'lg:flex lg:min-h-0 lg:flex-col lg:overflow-y-auto' : ''}"
					>
						<!-- ================= 队伍 & 道具 ================= -->
						{#if showTeamPanel}
							<div
								class="mt-2.5 rounded-xl border border-slate-700/60 bg-slate-900/60 px-2.5 py-2 backdrop-blur-sm max-[365px]:mt-1.5 max-[365px]:py-1 sm:mt-4 sm:rounded-2xl sm:p-3"
							>
								<div
									class="flex items-center justify-between gap-2 text-[11px] text-slate-400 sm:text-xs"
								>
									<span class="shrink-0">👥 博饼队伍({team.length}/{TEAM_LIMIT})</span>

									<span class="hidden text-slate-500 sm:inline">轮流上前掷骰，队伍总分为总奖品</span
									>
								</div>

								<!-- 加成卡:掷骰前点选再点到 Tee 身上,故排在最前 -->
								{#if showBuffShelf}
									<div class="mt-1 border-t border-sky-500/20 pt-1">
										<div class="flex items-center justify-between gap-2 text-[11px] text-slate-400">
											<span>✨ 加成卡</span>
											<span class="shrink-0 text-slate-500">持续 1~3 关</span>
										</div>
										<!-- 芯片行:单列(手机/平板)单行横滑;两列 PC(lg+)才换行 + 限高内滚 ——
										     和 deskSplit 用同一个断点(sm: 会让「单列但 ≥640px」错用竖排版式)。
										     选中态那圈 ring 画在盒子**外面**,贴着滚动区边缘会被裁掉 ——
										     所以留内边距给 outline:窄屏 p-0.5(只多 2px 高),lg 下 p-1
										     (限高同步 +0.5rem,不然少了 8px 内容高会少显示小半行) -->
										<div class="relative">
											<div
												class="mt-1.5 flex gap-1.5 overflow-x-auto p-0.5 lg:max-h-[5.25rem] lg:flex-wrap lg:gap-2 lg:overflow-y-auto lg:p-1"
											>
												{#each buffEntries as [id, count]}
													{@const card = BUFF_BY_ID.get(id)!}
													<div class="shrink-0">
														{@render buffChip(card, count, canEquipBuff)}
													</div>
												{/each}
											</div>
											{#if shownBuff}
												<!-- 浮层走 CardTip(portal 到 body + fixed):既不会被滚动区裁,也不会被 HUD 盖 -->
												<CardTip anchor={buffTipAnchor} hover={true} color="#38bdf8" wide>
													<BuffTip card={shownBuff} />
												</CardTip>
											{/if}
										</div>
									</div>
								{/if}

								<!-- 队伍:中秋集市阶段也用普通卡(去掉结果行省高度) -->
								<div class="mt-2 flex flex-wrap gap-1.5 sm:gap-2 {marketTeam ? 'market-team' : ''}">
									{#each team as tee, i (i)}
										<div
											role="button"
											tabindex={canEquipBuff && selectedBuff ? 0 : -1}
											class="rounded-xl p-0.5 transition {canEquipBuff && selectedBuff
												? 'bg-amber-400/5 ring-1 ring-amber-400/70'
												: ''}"
											onclick={() => selectedBuff && applyBuffToTee(selectedBuff, i)}
											onkeydown={(e) => {
												if ((e.key === 'Enter' || e.key === ' ') && selectedBuff) {
													e.preventDefault();
													applyBuffToTee(selectedBuff, i);
												}
											}}
										>
											{#snippet sellBtn()}
												{#if canSellTee(i)}
													<button
														class="absolute -top-1.5 -right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/90 text-[10px] font-bold text-white shadow transition hover:bg-red-400"
														title="卖出 {cardOf(tee)?.name},得 🥮 {rarityOf(cardOf(tee)).sell}"
														onclick={() => {
															sfxClick();
															sellAsk = i; // 先问一句,确认了再真卖
														}}
													>
														×
													</button>
												{/if}
											{/snippet}
											<TeeCardView
												card={cardOf(tee)}
												skin={SELF_SKIN}
												name="我"
												desc={cardOf(tee)?.desc}
												tipExtra={teeTipExtra(i)}
												tipList={teeTipList(tee)}
												badge={(team[i]?.refundPending?.length ?? 0) > 0
													? `🐚${team[i]?.refundPending?.length}`
													: tee.buffs.length > 0
														? `✨${tee.buffs.length}`
														: undefined}
												skillBadge={skillsFor(i).length > 0
													? (tee.charge ?? 0) > 0
														? `⚡${tee.charge}`
														: '⚡'
													: undefined}
												emote={i === currentTee ? teeEmote : EMOTE.normal}
												pose={i === currentTee ? teePose : IDLE_POSE}
												active={i === currentTee && phase === 'rolling'}
												animate={i === currentTee ? teeAnimClass : ''}
												sellBtn={canSellTee(i) ? sellBtn : undefined}
											>
												{#snippet actions()}
													<!-- 两种状态都占两行:待掷(1 行)→ 点数+等级(2 行)会让整队高度跳 14px -->
													{#if phase === 'shop'}
														<!-- 中秋集市阶段:回合已结算,结果看结算面板;省一行高度给 6 人满队 -->
													{:else if i <= countedTee}
														<!-- 投过了就显示分数:0 分/负分也算结果,别退回「待掷」(countedTee = 最后一只结算完的) -->
														<div
															class="text-[10px] font-bold {tee.lastScore > 0
																? 'text-amber-300'
																: 'text-slate-400'}"
														>
															{formatScore(tee.lastScore)}
														</div>
														<div class="text-[9px] text-slate-500">
															{getRollLevel(tee.lastLevelId).name}
														</div>
													{:else}
														<!-- 不写投掷次数:角标已经有加成卡(右)和技能(左)两处计数,玩家自己数 -->
														<div class="text-[10px] font-bold text-slate-600">待掷</div>
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
							<div class="relative mt-2.5">
								<div
									class="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-sky-500/20 bg-slate-900/60 px-2.5 py-1.5 backdrop-blur-sm sm:max-h-24 sm:flex-wrap sm:overflow-x-hidden sm:overflow-y-auto sm:rounded-2xl"
								>
									{#each buffEntries as [id, count]}
										{@const card = BUFF_BY_ID.get(id)!}
										<div class="shrink-0">
											{@render buffChip(card, count)}
										</div>
									{/each}
								</div>
								{#if peekBuff}
									<!-- 同上:走 CardTip(portal + fixed),不受道具条滚动区 / HUD 限制 -->
									<CardTip anchor={buffTipAnchor} hover={true} color="#38bdf8" wide>
										<BuffTip card={peekBuff} />
									</CardTip>
								{/if}
							</div>
						{/if}
					</div>

					<!-- 右列:掷骰 / 3 选 1 / 集市 / 结算 -->
					<div class="contents {deskSplit ? 'lg:flex lg:min-h-0 lg:flex-col' : ''}">
						<!-- ================= 骰子区 ================= -->
						{#if phase === 'intro' || phase === 'rolling'}
							<div
								bind:this={dicePanelEl}
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
										class="mx-auto mt-2 grid w-full max-w-[22.25rem] grid-cols-6 gap-1 max-[365px]:mt-1.5 sm:mt-2.5 sm:max-w-[23.5rem] sm:gap-2"
										role="group"
										aria-label="骰子(选重掷时可拖拽多选)"
										onpointermove={dragPaint}
									>
										{#each [0, 1, 2, 3, 4, 5] as i}
											<button
												class="die min-w-0 {dieOffTarget(i) ? 'opacity-30' : ''} {dieRolling(i)
													? 'rolling'
													: ''} {hitDice.includes(i) ? 'hit' : ''} {choosing && rerollSel[i]
													? 'marked'
													: ''} {diceModded(i) ? 'moded' : ''} {choosing ||
												(pendingAction && pendingAction.kind !== 'voidpick')
													? 'cursor-pointer hover:scale-110'
													: 'cursor-default'}"
												style={`animation-duration: ${rollDur}s; animation-delay: ${dieDelay(i)}s; animation-iteration-count: ${rollIter}`}
												disabled={!choosing &&
													(!pendingAction || pendingAction.kind === 'voidpick')}
												class:voided={dieVoid(i)}
												data-die={i}
												class:selecting={choosing}
												onpointerdown={(e) => startPaint(i, e)}
												oncontextmenu={(e) => choosing && e.preventDefault()}
												onclick={(e) => {
													if (choosing) {
														// 选中已经在 pointerdown 里做完了,指针合成的 click 必须吞掉,
														// 否则轻点会切两次(按下选中 → 松手取消)。
														// 判据是 detail:指针的 click 带点击计数(detail ≥ 1),
														// 键盘 Space/Enter 与程序化 click 都是 detail === 0。
														// ⚠️ 别改成「看刚才有没有 pointerdown」的时间窗:触摸合成的 click
														// 可能比 pointerup 晚几百毫秒,时间窗会失效。
														if (e.detail === 0) toggleReroll(i);
														return;
													}
													if (pendingAction) onDieClick(i);
												}}
											>
												<!-- 骰面用内联 SVG:不依赖 ::after/container-query/:has(),老浏览器也能渲染 -->
												<svg class="die-face" viewBox="0 0 24 24" aria-hidden="true">
													{#each PIP_POS as [cx, cy], idx}
														{#if showPip(dice[i], idx + 1)}
															<circle
																{cx}
																{cy}
																r="2.6"
																class:red={!dieRolling(i) && dice[i] === 4}
															/>
														{/if}
													{/each}
												</svg>
												{#if diceModded(i)}
													<!-- 点数被改造:原始点阵淡化,叠一个半透明的「实际点数」 -->
													{#if dieVoid(i)}
														<span class="die-void" title={`${dice[i]} 点本关作废:不算任何牌型`}
															>✕</span
														>
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

									<!-- 交互提示:视觉上排在骰子上面(order-first) ——
							     发动 / 重掷的标题和按钮紧贴骰子,拇指按下去不会盖住骰面。
							     高度按最高的状态预留(min-h),换状态时骰子不会上下跳。 -->
									<div
										class="order-first mt-1.5 flex min-h-6 items-center justify-center gap-2 text-center text-xs max-[365px]:text-[10px] sm:mt-2 sm:min-h-8 sm:text-sm"
									>
										{#if pointPicker}
											<!-- 点数选择直接顶掉标题行:不占下方布局,骰子一动不动 -->
											{#each pointChoices() as v}
												<button
													class="h-6 w-7 shrink-0 rounded-lg bg-slate-700 text-xs font-bold text-slate-200 transition hover:bg-amber-500 hover:text-amber-950 max-[365px]:w-6 sm:h-8 sm:w-10 sm:text-sm {pendingAction?.kind ===
														'set_any' && v === 4
														? 'ring-2 ring-red-400'
														: ''}"
													onclick={() => pickPoint(v)}
												>
													{v}
												</button>
											{/each}
										{:else if pendingActive}
											<!-- 充能技能,等玩家决定要不要发动。改基础分的(停靠/点数和)问在结算动画
											     **之前**,其余问在动画之后 -->
											<span class="text-fuchsia-300">
												⚡ <b>{cardById(pendingActive.srcId)?.name ?? '技能'}</b>
												{#if pendingActive.skill === 'chips'}
													+{formatScore(pendingActive.value)} 分
												{:else if pendingActive.skill === 'left_chips'}
													左侧 +{formatScore(pendingActive.value)} 分
												{:else if pendingActive.skill === 'sum'}
													按本 Tee 点数和结算
												{:else if pendingActive.skill === 'mult'}
													该 Tee 总分 ×{formatMult(pendingActive.mult ?? 1)}{pendingActive.cost
														? ` · 花 🥮 ${pendingActive.cost}`
														: ''}
												{:else if pendingActive.skill === 'end_round'}
													结束本关 · 未投角色 +🥮 {pendingActive.perTee ?? 0}
												{:else if pendingActive.skill === 'sell_self'}
													回合结算时出售「我」 +🥮 {pendingActive.coins ?? 0}
												{:else if pendingActive.skill === 'to_four'}
													把一颗骰子改为 4 点，之后可反复改四点
												{:else if pendingActive.skill === 'parked'}
													<!-- 代价 → 收益:那批原价返还等会儿在结算动画里逐张弹,这里不写「共 🥮 N」 -->
													是否要：减半的月饼数 → 基础分 +{formatScore(
														Math.round(parkedPrice(currentTee) * parkedPer(pendingActive.srcId))
													)}
												{:else}
													本关重掷
												{/if}
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
												>{opSrcName(pendingAction.srcId)} ✨ 选一颗{#if pendingAction.from}&nbsp;{pendingAction.from}
													点{/if}骰子改为 {pendingAction.point} 点{#if pendingAction.count > 1}(还剩
													{pendingAction.count} 颗){/if}</span
											>
										{:else if pendingAction?.kind === 'bump'}
											<span class="text-cyan-300"
												>{opSrcName(pendingAction.srcId)} ✨ 点骰子让它 {(pendingAction.step ?? 1) <
												0
													? '−1'
													: '+1'}{#if pendingAction.count > 1}(还剩
													{pendingAction.count} 颗){/if}</span
											>
										{:else if pendingAction?.kind === 'voidpick'}
											<span class="text-cyan-300"
												>{opSrcName(pendingAction.srcId)} ✨ 选一个点数,本关该点数不作废</span
											>
										{:else if pendingAction?.kind === 'set_any'}
											<span class="text-cyan-300"
												>{opSrcName(pendingAction.srcId)} ✨ 选一颗{#if pendingAction.from}&nbsp;{pendingAction.from}
													点{/if}骰子{#if pendingAction.options}改为 {pendingAction.options.join(
														' / '
													)} 点{:else}改为任意点数{/if}{#if pendingAction.count > 1}(还剩
													{pendingAction.count} 颗){/if}</span
											>
										{:else if rolling}
											<span class="text-slate-400">{currentTeeCard?.name ?? '我'} 正在博饼...</span>
										{:else}
											<span class="text-slate-400">{currentTeeCard?.name ?? '我'} 掷出了...</span>
										{/if}
										{#if pendingAction}
											<button
												class="shrink-0 rounded-lg border border-slate-500 bg-slate-700 px-3 py-0.5 text-xs font-semibold whitespace-nowrap text-slate-200 transition hover:bg-slate-600 sm:px-4 sm:py-1 sm:text-sm"
												onclick={skipSetOp}
											>
												跳过改点
											</button>
										{/if}
									</div>

									<!-- 最近结果: 结算动画逐条弹出 -->
									<!-- 结果区按本轮行数预先占位:未弹出的行用不可见空行顶着,
						     文字逐条弹出时高度不变,居中的骰子不会被顶上去 -->
									<div
										bind:this={stepsEl}
										onscroll={keepSettleScroll}
										class="no-scrollbar mt-2 flex shrink-0 flex-col items-center justify-start gap-0 overflow-y-auto overscroll-contain text-xs leading-[1.1] max-[365px]:mt-1.5 max-[365px]:text-[10px] max-[365px]:leading-[1.1] sm:mt-2.5 sm:overflow-visible sm:text-sm sm:leading-normal"
										style={stepsMaxH ? `max-height: ${stepsMaxH}px` : ''}
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
								<!-- 主内容在「剩余空间」里居中,好让下面的放弃按钮贴到面板底沿 -->
								<div class="my-auto w-full">
									<div class="hidden text-sm font-bold text-amber-200 sm:block sm:text-lg">
										🌕 回合结算
									</div>
									<!-- 结算区按本轮行数预先占位(未弹的行用不可见空行顶着):
					     否则团队倍率卡一条条弹出时,下面的按钮会被顶下去 -->
									<div
										class="mt-1 flex flex-col items-center justify-center gap-0.5 text-xs sm:text-sm"
									>
										{#each Array.from({ length: Math.max(teamSettleReserveLines, teamSettleSteps.length) }, (_, i) => i) as i (i)}
											{#if teamSettleSteps.length === 0 && i === 0}
												<div class="text-[11px] text-slate-400 sm:text-xs">
													全队已掷完,各 Tee 得分合计
													<span class="font-bold text-slate-200"
														>{formatScore(team.reduce((s, t) => s + t.lastScore, 0))}</span
													>
												</div>
											{:else if teamSettleSteps[i] && i <= teamSettleIdx}
												<div class="settle-step {teamSettleSteps[i].cls}">
													{teamSettleSteps[i].text}
												</div>
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
								<!-- 放弃：小一号字 + 右下角 + 宽度自适应（不铺满），免得点「结算回合」时误触 -->
								<div class="mt-2 flex w-full justify-end">
									<button
										class="rounded-lg px-2 py-1 text-[11px] text-slate-500 transition hover:bg-slate-800/70 hover:text-slate-300 active:scale-95 disabled:opacity-40 sm:text-xs"
										onclick={abandonRun}
										disabled={teamSettling}
									>
										放弃结算并结束游戏
									</button>
								</div>
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
										本关得分 <span class="font-bold text-amber-300">{formatScore(roundTotal)}</span>
										/ 目标
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
												>🥮 +{roundRewardGained}</span
											>
										</div>
										{#if overflowGained > 0}
											<div class="flex justify-between rounded bg-slate-800/60 px-3 py-1">
												<span>溢出奖励（每超出目标 50% +1，上限 8）</span><span
													class="font-bold text-amber-300">🥮 +{overflowGained}</span
												>
											</div>
										{/if}
										{#if economyGained > 0}
											<div class="flex justify-between rounded bg-slate-800/60 px-3 py-1">
												<span>经商收益</span><span class="font-bold text-amber-300"
													>🥮 +{economyGained}</span
												>
											</div>
										{/if}
									</div>
									<button
										class="mt-3.5 w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-8 py-2.5 text-base font-bold text-amber-950 shadow-lg transition hover:from-amber-300 hover:to-amber-500 active:scale-95 sm:w-auto sm:px-10 sm:text-lg"
										onclick={nextReward}
									>
										🏮 去组建 Tee 队
									</button>
								</div>
							</div>
						{/if}

						<!-- ================= 集市: 3 选 1 ================= -->
						{#if phase === 'reward'}
							<div
								class="panel-fill panel-auto panel-fill-lg mt-2.5 rounded-xl border border-amber-500/30 bg-slate-900/80 px-2.5 py-2.5 backdrop-blur-sm sm:mt-4 sm:rounded-2xl sm:p-6"
							>
								<div class="text-center">
									<div class="text-base font-bold text-amber-200 sm:text-xl">
										🏮 组建 Tee 队 · 免费选 1 张 Tee 卡
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
										disabled={mooncakes < refreshPrice || lastRewardIdx >= 0}
									>
										<Fa icon={faRotate} class="mr-1 inline" />刷新(🥮 {refreshPrice})
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

						<!-- ================= 中秋集市 ================= -->
						{#if phase === 'shop'}
							<div
								class="panel-fill mt-2.5 rounded-xl border border-amber-500/30 bg-slate-900/80 px-2.5 py-1.5 backdrop-blur-sm max-[365px]:py-1 sm:mt-4 sm:rounded-2xl sm:p-6"
							>
								<div class="flex items-center justify-between">
									<div class="text-base font-bold text-amber-200 sm:text-xl">🛒 中秋集市</div>
									<div class="text-xs text-amber-300 sm:text-sm">🥮 {mooncakes}</div>
								</div>

								<div class="mt-1 flex items-baseline justify-between sm:mt-3">
									<div class="text-xs font-bold text-sky-300 sm:text-sm">✨ 加成卡</div>
									<div class="text-[10px] text-slate-500">掷骰前挂到 Tee 身上</div>
								</div>
								<!-- 中秋集市货架:和队伍面板同款的小芯片,固定 3 列等宽(两排对齐) -->
								<div
									class="relative mt-1 grid grid-cols-3 gap-1.5 max-[365px]:gap-1 sm:mt-2 sm:gap-2"
								>
									{#each shopBuffs as card, ci}
										{@const picked = shopPick?.id === card.id}
										{@const sold = shopSold.includes(card.id)}
										{@const locked = !!shopLocks[ci]}
										<div class="relative">
											<!-- 格子:手机两行(名字一行、价格+锁定一行,四字名才放得下),sm 起恢复单行 -->
											<div
												role="button"
												tabindex={sold ? -1 : 0}
												aria-disabled={sold}
												class="flex w-full flex-col gap-0.5 rounded-lg border px-1.5 py-1 text-left transition {sold
													? 'cursor-default'
													: 'cursor-pointer'} sm:h-8 sm:flex-row sm:items-center sm:gap-1 sm:py-0 sm:pr-5 {locked
													? 'border-dashed border-violet-400/70 bg-violet-400/10'
													: sold
														? 'border-slate-700/50 bg-slate-900/50 opacity-45'
														: 'bg-slate-800/70'} {picked
													? 'bg-amber-400/15 ring-2 ring-amber-400'
													: ''} {!sold && mooncakes < card.price ? 'opacity-50' : ''}"
												style={!locked && !sold
													? `border-color: ${cardBorderColor(RARITY_INFO[card.rarity].color)}`
													: ''}
												onpointerdown={(e) => (lastPointerWasMouse = e.pointerType === 'mouse')}
												onclick={() => !sold && (shopPick = picked ? null : card)}
												ondblclick={() => {
													// 触摸设备上双击会被浏览器当成缩放,而且误触代价是直接花钱
													if (!lastPointerWasMouse) return;
													if (!sold) buyBuff(card);
												}}
												onkeydown={(e) => {
													if ((e.key === 'Enter' || e.key === ' ') && !sold) {
														e.preventDefault();
														shopPick = picked ? null : card;
													}
												}}
												onpointerenter={(e) => {
													if (e.pointerType !== 'touch') shopPeek = card;
												}}
												onpointerleave={(e) => {
													if (e.pointerType !== 'touch' && shopPeek?.id === card.id)
														shopPeek = null;
												}}
											>
												<span class="flex min-w-0 items-center gap-1">
													<span class="h-4 w-4 shrink-0 sm:h-5 sm:w-5"
														><TeeRender name={card.skin} className="h-full w-full" /></span
													>
													<span
														class="min-w-0 flex-1 truncate text-[11px] leading-tight font-semibold text-slate-200 sm:text-xs"
														>{card.name}</span
													>
												</span>
												<!-- 第二行:手机上是价格(右侧让位给锁定按钮),sm 起 contents 把它摊回同一行 -->
												<span class="flex items-center pr-6 sm:contents">
													<span class="text-[10px] font-bold text-amber-300 sm:text-[11px]"
														>{sold ? '已买' : `🥮 ${card.price}`}</span
													>
												</span>
											</div>
											<!-- 锁定:锁住的格子刷新/下次进中秋集市都不变(手机放右下,sm 起回到右上) -->
											<button
												class="absolute right-0 bottom-0 flex h-6 w-6 items-center justify-center text-[10px] sm:top-0 sm:bottom-auto sm:h-8 sm:w-5 {locked
													? 'text-violet-300'
													: 'text-slate-500 hover:text-slate-300'}"
												title={locked ? '已锁定：刷新和下次进中秋集市都不会变' : '锁定这格商品'}
												aria-label={locked ? '解锁' : '锁定'}
												onclick={(e) => {
													e.stopPropagation();
													toggleLock(ci);
												}}
											>
												<Fa icon={locked ? faLock : faLockOpen} />
											</button>
											<!-- 悬停/选中时的说明浮层(同一时刻只渲染一张):按列对齐,免得左右两列超出面板 -->
											{#if shownShopBuff?.id === card.id}
												{@render buffPop(
													card,
													`absolute bottom-full z-50 mb-1 hidden sm:block ${
														ci % 3 === 0
															? 'left-0'
															: ci % 3 === 1
																? 'left-1/2 -translate-x-1/2'
																: 'right-0'
													}`
												)}
											{/if}
										</div>
									{/each}
									<!-- 手机没有 hover:选中的那张居中浮在货架上方 -->
									{#if shownShopBuff}
										{@render buffPop(
											shownShopBuff,
											'absolute bottom-full left-1/2 mb-1 -translate-x-1/2 sm:hidden'
										)}
									{/if}
								</div>

								<!-- 说明改由 tooltip 承担(悬停/点按货架格子),这里只留一行锁的提示 -->
								<div class="mt-1 text-[10px] leading-none text-slate-500">
									点道具看说明 · 🔒 锁住的格子刷新/下关都不变
								</div>

								<!-- 购买和「下一关」分置两端:一个花钱、一个离开,挨在一起太容易点错 -->
								<div class="mt-1.5 flex items-center justify-between gap-2 sm:mt-2 sm:gap-3">
									<div class="flex items-center gap-1.5 sm:gap-2">
										<button
											class="rounded-lg border border-slate-500 bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-600 disabled:opacity-40 sm:px-4 sm:py-2 sm:text-sm"
											onclick={refreshShop}
											disabled={mooncakes < refreshPrice || shopLocks.every((l) => l)}
										>
											<Fa icon={faRotate} class="mr-1 inline" />刷新(🥮 {refreshPrice})
										</button>
										<button
											class="rounded-lg border border-emerald-400/60 bg-emerald-500/20 px-3 py-1.5 text-xs font-bold whitespace-nowrap text-emerald-200 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4 sm:py-2 sm:text-sm"
											onclick={() => shopPick && buyBuff(shopPick)}
											disabled={!shopPick || mooncakes < shopPick.price}
										>
											{shopPick ? `买 🥮 ${shopPick.price}` : '买'}
										</button>
									</div>
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
								class="panel-fill panel-auto panel-fill-lg mt-2.5 rounded-xl border border-slate-600/60 bg-slate-900/85 px-3 py-3 text-center backdrop-blur-sm sm:mt-4 sm:rounded-2xl sm:p-6"
							>
								<div class="text-3xl sm:text-4xl">🌘</div>
								<div class="mt-1 text-xl font-bold text-slate-200 sm:text-2xl">博饼结束</div>
								<div class="mt-2 text-xs text-slate-400 sm:text-sm">
									倒在了 <span class="font-bold text-slate-200">第 {finalRound} 关</span> · 本关得分
									<span class="font-bold text-slate-100">{formatScore(finalScore)}</span> / {formatScore(
										target
									)}
									<div class="mt-1">
										本局总分 <span class="font-bold text-amber-300"
											>{formatScore(finalRunScore)}</span
										>
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
										<div class="text-base font-bold text-slate-100 sm:text-lg">
											{save.bestRound}
										</div>
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
					</div>
				</div>
			{/if}

			<div
				class="mt-auto pt-2.5 text-center text-[10px] leading-tight text-slate-500 max-[365px]:hidden sm:pt-5 sm:text-xs"
			>
				祝大家中秋快乐,阖家团圆!🌕
			</div>
		</div>
	</div>

	<!-- ================= 队友图鉴 ================= -->
	<Codex bind:show={showCodex} />

	<!-- ================= 一次性提示 ================= -->
	<!-- 不参与布局(fixed):掛卡被拒之类的一句话提示,2.6 秒后自己消失。
	     pointer-events 关掉,免得挡住下面要点的按钮 -->
	{#if toast}
		<div
			class="pointer-events-none fixed inset-x-0 bottom-14 z-[70] flex justify-center px-4 sm:bottom-16"
			role="status"
			aria-live="polite"
		>
			<div
				class="toast-pop max-w-[20rem] rounded-xl border border-amber-400/40 bg-slate-900/95 px-3.5 py-2 text-center text-xs font-semibold text-amber-100 shadow-xl backdrop-blur-sm sm:text-sm"
			>
				{toast}
			</div>
		</div>
	{/if}

	<!-- ================= 出售确认 ================= -->
	{#if sellAsk !== null && team[sellAsk] && cardOf(team[sellAsk])}
		{@const sold = cardOf(team[sellAsk])}
		{@const losses = sellLossList(sellAsk)}
		<div
			class="fixed inset-0 z-50 flex cursor-default items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
			role="presentation"
			onclick={(e) => {
				if (e.target === e.currentTarget) sellAsk = null;
			}}
		>
			<div
				class="w-full max-w-xs rounded-2xl border border-amber-500/30 bg-slate-900 p-4 text-center sm:p-5"
			>
				<div class="text-base font-bold text-amber-200">卖掉这张卡？</div>
				<div class="mt-3 flex items-center justify-center gap-2.5">
					<span class="h-11 w-11 shrink-0"
						><TeeRender name={sold?.skin ?? 'x_spec'} className="h-full w-full" /></span
					>
					<div class="min-w-0 text-left">
						<div class="text-sm font-semibold text-slate-100">{sold?.name ?? '?'}</div>
						<div class="line-clamp-2 text-[11px] leading-snug text-slate-400">{sold?.desc}</div>
					</div>
				</div>
				<!-- 身上还挂着/停靠着的加成卡:卖了一并没 —— 先列清楚再让玩家点确认 -->
				{#if losses.length > 0}
					<div class="mt-3 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-left">
						<div class="text-[11px] font-bold text-red-200">
							⚠️ 身上还有 {losses.length} 张加成卡会一起消失
						</div>
						<div class="mt-1 space-y-0.5">
							{#each losses as row}
								<div class="text-[11px] leading-snug text-slate-300">
									<b style="color: {row.color}">{row.name}</b>
									<span class="text-slate-500">· {row.note}</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
				<div class="mt-3 text-[11px] leading-snug text-slate-400">
					卖掉后这张卡永久离队，换来的月饼币可以立刻在中秋集市里花。
				</div>
				<div class="mt-3.5 flex justify-center gap-2">
					<button
						class="rounded-xl border border-slate-500 bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-600"
						onclick={() => (sellAsk = null)}
					>
						取消
					</button>
					<button
						class="rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-4 py-2 text-sm font-bold whitespace-nowrap text-amber-950 shadow transition hover:from-amber-300 hover:to-amber-500 active:scale-95"
						onclick={confirmSell}
					>
						确认出售 🥮 +{rarityOf(sold).sell}
					</button>
				</div>
			</div>
		</div>
	{/if}

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
					每次掷 6 颗骰子，按骰型得分。队伍轮流掷骰，总分达到目标即过关，掷出越高等级得分越多 🥮
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
			</div>
		</div>
	{/if}
</div>

<style>
	/* ---- 夜空 ---- */

	/* 星群:静态,不做动画 —— 上面的面板都带 backdrop-blur,星星一动模糊就得每帧重算 */
	.starfield {
		position: absolute;
	}

	.moon {
		position: absolute;
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
	.die {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: 1;
		min-height: 2.75rem;
		padding: 12%;
		border-radius: 10px;
		background: linear-gradient(145deg, #fdfbf5 0%, #ece4d0 100%);
		box-shadow:
			0 4px 10px rgba(0, 0, 0, 0.45),
			inset 0 -2px 4px rgba(0, 0, 0, 0.15);
		/* Tailwind v4 的 scale-110 写的是 `scale` 属性,不在 transform 上 ——
		   少了这一行 hover 放大就是硬切没有过渡 */
		transition:
			transform 0.15s ease,
			scale 0.15s ease,
			box-shadow 0.15s ease;
	}

	.die:disabled {
		opacity: 1;
	}

	.die.rolling {
		animation: dice-shake 0.75s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
	}

	/* 「在转」必须压过「命中高亮」:两者都是 animation 简写、特异性相同(0,2,0),
     谁写在后面谁赢 —— 而 .die.hit 在下面,于是射日仙触发自动重掷时
     (此时 hitDice 已由上一次判定写好)正在转的骰子被 hit-glow 顶掉,
     dice-shake 根本不播:class 是 rolling、动画却是 glow。
     这里把 rolling 提到 (0,3,0),顺序就不再重要。 */
	.die.rolling.hit,
	.die.rolling.moded,
	.die.rolling.voided {
		animation: dice-shake 0.75s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
	}

	@media (max-width: 639px) and (max-height: 700px) {
		.market-team {
			flex-wrap: nowrap;
			overflow-x: auto;
			padding-bottom: 2px;
		}
	}

	.die.moded .die-face circle {
		opacity: 0.28;
	}

	.die.voided .die-face circle {
		opacity: 0.6;
	}

	.die-mod.is-four {
		color: rgb(214 50 50 / 0.78);
	}

	.die-void {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 2%;
		/* 作废:整颗骰子盖一层**斜条纹** + 红叉。
		   「作废」和「视为 N 点」都是红色标记,只差一个字形,一眼分不开(用户反馈);
		   条纹让人不用看字就知道「这颗不算」,和「视为」的纯数字彻底区分开。
		   条纹要**淡而稀** —— 太密太重会把底下的点数盖掉(又反馈过一次)。 */
		background-image: repeating-linear-gradient(
			45deg,
			rgb(220 38 38 / 0.16) 0 3px,
			transparent 3px 20px
		);
		border-radius: 10px;
		font-size: 1.6rem;
		font-weight: 900;
		line-height: 1;
		color: rgb(185 28 28 / 0.95);
		text-shadow:
			0 0 2px rgb(255 255 255 / 0.9),
			0 0 6px rgb(255 255 255 / 0.55);
		pointer-events: none;
		user-select: none;
	}

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

	/* 选重掷时骰子区整块吃掉触摸手势:免得「从骰子上起手」被浏览器当成滚页面 */
	.die.selecting {
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

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

	.mini-die.mini-any {
		color: #64748b;
		background: rgba(100, 116, 139, 0.12);
	}

	/* ---- Tee 动画(已移入 TeeCard.svelte) ---- */
	/* ---- 卡片样式已移入 TeeCard.svelte ---- */

	.panel-fill {
		display: flex;
		flex: 1 1 0%;
		flex-direction: column;
		justify-content: safe center;
	}

	.panel-auto {
		flex: 0 1 auto;
		margin-block: auto;
	}

	/* 宽屏(lg+)下阶段面板一律铺满:panel-auto 的「贴着内容、上下留白」只留给单列 ——
	   窄屏上留白是刻意的卡片感,宽屏上却是「右边一小块、下面一大片空」,和
	   掷骰 / 集市 / 回合结算那几屏(panel-fill)对不上。这里只把 auto 那两个
	   声明撤掉;上半的 mt-* 要留着,好和左列队伍面板的顶沿齐平。 */
	@media (min-width: 1024px) {
		.panel-fill-lg {
			flex: 1 1 0%;
			/* panel-auto 的 margin-block:auto 会盖掉 mt-* 工具类(它俩同优先级、但
			   它在后面),这里手动补回和左列队伍面板一样的上间距;下间距清零,
			   好让面板底沿贴到容器底沿。lg 一定过了 sm,所以就是 sm:mt-4 的 1rem */
			margin-top: 1rem;
			margin-bottom: 0;
		}
	}

	/* ---- 结果横幅 ---- */
	/* 结算框:不要滚动条(用户也不该滚它,滚动由动画驱动) */
	.no-scrollbar {
		scrollbar-width: none;
	}
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}

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

	/* ---- 一次性提示(toast) ---- */
	.toast-pop {
		animation: toast-pop 0.22s ease both;
	}

	@keyframes toast-pop {
		from {
			opacity: 0;
			transform: translateY(10px) scale(0.96);
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
