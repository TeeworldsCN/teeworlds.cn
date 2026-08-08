<script lang="ts">
	import TeeRender, { type TeePose } from '$lib/components/TeeRender.svelte';
	import TeeCardView from '$lib/components/TeeCard.svelte';
	import { EMOTE } from '$lib/stores/skins';
	import {
		DICE_PIPS,
		ROLL_LEVELS,
		getRollLevel,
		hitIndices,
		judgeRoll,
		rollDice,
		showPip
	} from '$lib/midautumn';
	import { RARITY_INFO, drawCards, type TeeCard, CARDS } from '$lib/teecards';
	import {
		TEAM_LIMIT,
		applyGrowth,
		calcTeeScore,
		calcTeamTotal,
		cardById,
		economyReward,
		getBoss,
		getSave,
		getInteractEffects,
		hasRerollAllOnNone,
		isBossRound,
		overflowReward,
		roundReward,
		roundTarget,
		saveResult,
		shuffle,
		type Boss,
		type GrowthMap,
		type TeamTee
	} from '$lib/game';
	import { onMount } from 'svelte';
	import { setLayoutTheme } from '$lib/layoutTheme.svelte';
	import Fa from 'svelte-fa';
	import { faBolt, faRotate, faStore, faTrophy } from '@fortawesome/free-solid-svg-icons';

	// ---- 自定义 layout 背景(夜空渐变铺满、去掉默认内边距) ----

	onMount(() => {
		setLayoutTheme({
			bg: 'linear-gradient(180deg, #070b1f 0%, #101a3f 45%, #1d2a5c 75%, #2c2a55 100%)',
			pad: false
		});
		return () => setLayoutTheme({});
	});

	// ---- 皮肤(主 Tee) ----

	let skin = $state('');
	const loadSkin = () => {
		try {
			skin = localStorage.getItem('midautumn:skin') || '';
		} catch {
			// ignore
		}
	};
	const onSkinInput = (value: string) => {
		skin = value;
		try {
			localStorage.setItem('midautumn:skin', value.trim());
		} catch {
			// ignore
		}
	};

	// ---- 存档 ----

	let save = $state(getSave());
	let mooncakes = $state(0);

	// ---- 游戏状态 ----

	type Phase = 'idle' | 'intro' | 'rolling' | 'round_end' | 'reward' | 'shop' | 'game_over';
	let phase = $state<Phase>('idle');

	let round = $state(1);
	let boss = $state<Boss | null>(null);
	let target = $state(0);
	let currentScore = $state(0);
	let team = $state<TeamTee[]>([]);
	let growth = $state<GrowthMap>({});

	let dice = $state<number[]>([1, 1, 1, 1, 1, 1]);
	let rolling = $state(false);
	let currentTee = $state(0);
	let rerollAllUsed = $state(false);
	let lastLevel = $state(getRollLevel('none'));
	let lastBreakdown = $state({ base: 0, chips: 0, mult: 1, teamMult: 1, total: 0 });

	// 结算信息
	let roundTotal = $state(0);
	let roundRewardGained = $state(0);
	let overflowGained = $state(0);
	let economyGained = $state(0);
	let finalScore = $state(0);
	let finalRound = $state(0);
	let isNewBest = $state(false);

	// 集市
	let rewardChoices = $state<TeeCard[]>([]);
	let shopCards = $state<TeeCard[]>([]);
	let lastRewardIdx = $state(-1);

	// 交互(改点/重掷)
	type PendingAction =
		| { kind: 'set_point'; count: number; point: number }
		| { kind: 'set_any'; count: number; pick?: number }
		| { kind: 'reroll'; count: number };
	let pendingAction = $state<PendingAction | null>(null);
	let pointPicker = $state(false); // set_any 的点数选择

	// ---- 动画速率 & 骰子高亮 & 规则 ----

	const SPEEDS = [0.5, 1, 2];
	const SPEED_LABELS = [1, 2, 3]; // 档位标签: 1x / 2x / 3x
	let speedIdx = $state(0);
	let speed = $derived(SPEEDS[speedIdx]); // 默认 0.5x(当前默认速度的一半)
	let hitDice = $state<number[]>([]); // 本次判定命中的骰子索引
	let showRules = $state(false);
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
	let resultFlash = $state(0);

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
		loadSkin();
	});

	// ---- 工具 ----

	const cardOf = (tee: TeamTee): TeeCard | null => (tee.cardId ? cardById(tee.cardId) : null);
	const allCards = (): TeeCard[] => team.map(cardOf).filter((c): c is TeeCard => c !== null);
	const rarityOf = (c: TeeCard) => RARITY_INFO[c.rarity];

	const rollSingle = () => 1 + Math.floor(Math.random() * 6);

	// ---- 游戏流程 ----

	const startGame = () => {
		// 开局: 主 Tee + 2 张随机普通卡(3 人起步,避免第一关纯看运气)
		const starters = shuffle(CARDS.filter((c) => c.rarity === 'common')).slice(0, 2);
		team = [
			{
				cardId: null,
				playerSkin: skin.trim() || 'x_spec',
				lastScore: 0,
				lastLevelId: 'none',
				lastDice: [1, 1, 1, 1, 1, 1]
			},
			...starters.map((c) => ({
				cardId: c.id,
				lastScore: 0,
				lastLevelId: 'none',
				lastDice: [1, 1, 1, 1, 1, 1]
			}))
		];
		growth = {};
		mooncakes = 0;
		round = 1;
		phase = 'intro';
		beginRound();
	};

	const beginRound = () => {
		boss = isBossRound(round) ? getBoss(round) : null;
		target = Math.round(roundTarget(round) * (boss?.targetMult ?? 1));
		currentScore = 0;
		rerollAllUsed = false;
		currentTee = 0;
		roundTotal = 0;
		for (const t of team) {
			t.lastScore = 0;
			t.lastLevelId = 'none';
			t.lastDice = [1, 1, 1, 1, 1, 1];
		}
		dice = [1, 1, 1, 1, 1, 1];
		pendingAction = null;
		pointPicker = false;
		phase = 'intro';
	};

	const startRolling = () => {
		phase = 'rolling';
		rollCurrent();
	};

	const rollCurrent = () => {
		if (rolling) return;
		rolling = true;
		hitDice = [];
		teeEmote = EMOTE.angry;
		teePose = THROW_POSE;
		teeAnim = 'throw';

		// 旋转角速度恒定(0.75s 转 540°);慢速档重复播放更多圈,总时长随之变长
		rollDur = Math.min(0.75, 0.75 / speed);
		rollIter = speed < 1 ? 1 / speed : 1;
		rollTotal = 250 + rollDur * rollIter * 1000; // 250ms = 波浪延迟预算(5×50ms)

		const timer = setInterval(() => {
			dice = rollDice();
		}, 90 / speed);

		setTimeout(() => {
			clearInterval(timer);
			dice = rollDice(); // 定格最终点数
		}, rollTotal * 0.8);

		setTimeout(() => {
			rolling = false;
			teePose = IDLE_POSE;
			afterRoll();
		}, rollTotal);
	};

	/** 掷出后: 处理交互能力(改点/重掷),否则直接判定 */
	const afterRoll = () => {
		const tee = team[currentTee];
		const card = cardOf(tee);
		const effects = getInteractEffects(card);

		if (effects.length > 0) {
			const eff = effects[0];
			if (eff.type === 'set_point')
				pendingAction = { kind: 'set_point', count: eff.count, point: eff.point };
			else if (eff.type === 'set_any') pendingAction = { kind: 'set_any', count: eff.count };
			else if (eff.type === 'reroll') pendingAction = { kind: 'reroll', count: eff.count };
			return;
		}

		finalizeTee();
	};

	const onDieClick = (i: number) => {
		if (!pendingAction) return;
		const act = pendingAction;

		if (act.kind === 'set_point') {
			dice[i] = act.point;
			act.count -= 1;
		} else if (act.kind === 'set_any') {
			act.pick = i;
			pointPicker = true;
			return;
		} else if (act.kind === 'reroll') {
			dice[i] = rollSingle();
			act.count -= 1;
		}

		if (act.count <= 0) {
			pendingAction = null;
			finalizeTee();
		}
	};

	const pickPoint = (v: number) => {
		const act = pendingAction;
		if (!act || act.kind !== 'set_any' || act.pick === undefined) return;
		dice[act.pick] = v;
		act.count -= 1;
		pointPicker = false;
		if (act.count <= 0) {
			pendingAction = null;
			finalizeTee();
		} else {
			pendingAction = { kind: 'set_any', count: act.count };
		}
	};

	const cancelAction = () => {
		pendingAction = null;
		pointPicker = false;
		finalizeTee();
	};

	/** 判定 + 计分 + 下一个 Tee */
	const finalizeTee = () => {
		const tee = team[currentTee];
		const card = cardOf(tee);

		const level = judgeRoll(dice, boss?.mods);

		// 后羿: 再接再厉时重掷全部(限一次)
		if (level.id === 'none' && hasRerollAllOnNone(card) && !rerollAllUsed) {
			rerollAllUsed = true;
			rolling = true;
			rollDur = Math.min(0.6, 0.6 / speed);
			rollIter = speed < 1 ? 1 / speed : 1;
			rollTotal = 250 + rollDur * rollIter * 1000;
			const timer = setInterval(() => {
				dice = rollDice();
			}, 90 / speed);
			setTimeout(() => {
				clearInterval(timer);
				dice = rollDice();
			}, rollTotal * 0.8);
			setTimeout(() => {
				rolling = false;
				teePose = IDLE_POSE;
				finalizeTee();
			}, rollTotal);
			return;
		}

		hitDice = hitIndices(dice, level.id, boss?.mods);
		lastLevel = level;
		lastBreakdown = calcTeeScore(level.id, card, allCards(), growth);

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
		resultFlash += 1;

		setTimeout(() => {
			teeAnim = '';
			if (currentTee + 1 < team.length) {
				currentTee += 1;
				dice = [1, 1, 1, 1, 1, 1];
				teeEmote = EMOTE.normal;
				rollCurrent();
			} else {
				finishRound();
			}
		}, 1400 / speed);
	};

	/** 全队掷完: 结算本关 */
	const finishRound = () => {
		const cards = allCards();
		const { total, teamMult } = calcTeamTotal(
			team.map((t) => t.lastScore),
			cards
		);
		roundTotal = total;

		if (total >= target) {
			// 过关
			const base = roundReward(round);
			const overflow = overflowReward(total, target);
			const eco = economyReward(cards);
			const gained = base + overflow + eco;
			roundRewardGained = base;
			overflowGained = overflow;
			economyGained = eco;
			mooncakes += gained;
			growth = applyGrowth(cards, growth);
			phase = 'round_end';
		} else {
			// 失败
			finalScore = total;
			finalRound = round;
			const prevBest = save.bestScore;
			save = saveResult(total, round);
			isNewBest = total > prevBest && total > 0;
			phase = 'game_over';
		}
	};

	const nextReward = () => {
		phase = 'reward';
		rewardChoices = drawCards(3);
		lastRewardIdx = -1;
	};

	const refreshReward = () => {
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
			{ cardId: card.id, lastScore: 0, lastLevelId: 'none', lastDice: [1, 1, 1, 1, 1, 1] }
		];
		lastRewardIdx = idx;
		// 选中后短暂展示选中效果,自动进入商店
		setTimeout(openShop, 450);
	};

	const openShop = () => {
		phase = 'shop';
		shopCards = drawCards(4);
	};

	const refreshShop = () => {
		if (mooncakes < 2) return;
		mooncakes -= 2;
		shopCards = drawCards(4);
	};

	const buyCard = (card: TeeCard) => {
		if (team.length >= TEAM_LIMIT) return;
		const price = rarityOf(card).price;
		if (mooncakes < price) return;
		mooncakes -= price;
		team = [
			...team,
			{ cardId: card.id, lastScore: 0, lastLevelId: 'none', lastDice: [1, 1, 1, 1, 1, 1] }
		];
		shopCards = shopCards.filter((c) => c.id !== card.id);
	};

	const sellTee = (idx: number) => {
		if (idx === 0) return; // 主 Tee 不可卖
		const card = cardOf(team[idx]);
		if (card) mooncakes += rarityOf(card).sell;
		team = team.filter((_, i) => i !== idx);
		if (currentTee >= team.length) currentTee = team.length - 1;
	};

	const nextRound = () => {
		round += 1;
		beginRound();
	};

	const restart = () => {
		phase = 'idle';
		save = getSave();
	};

	// ---- 展示 ----

	const moonPhase = $derived(target > 0 ? Math.min(1, currentScore / target) : 0);
	/** 月相遮罩位移(0-100%,100% 即遮罩完全移出=满月)。
	 *  幂函数 p^1.5 压缩低进度:10% 进度时位移仅 3%(细月牙),
	 *  50% 接近上弦,100% 满月 */
	const moonShiftPct = $derived(Math.min(100, Math.pow(Math.max(0, moonPhase), 1.5) * 100));
	const progressPct = $derived(Math.round(moonPhase * 100));
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
</script>

<svelte:head>
	<title>中秋博饼大会 - TeeworldsCN</title>
	<meta property="og:title" content="中秋博饼大会 - TeeworldsCN" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://teeworlds.cn/zhongqiu" />
	<meta
		property="og:description"
		content="月宫掷骰:带队 Tee 排队博饼,兑换 Tee 卡构筑队伍,冲击无限高分!"
	/>
	<meta property="og:image" content="https://teeworlds.cn/shareicon.png" />
	<meta name="description" content="月宫掷骰:带队 Tee 排队博饼,兑换 Tee 卡构筑队伍,冲击无限高分!" />
</svelte:head>

<div class="relative min-h-svh overflow-hidden text-slate-200">
	<!-- 夜空背景 -->
	<div class="sky pointer-events-none absolute inset-0">
		{#each Array.from({ length: 40 }, (_, i) => i) as i}
			<span
				class="star"
				style={`left: ${(i * 37 + 13) % 100}%; top: ${(i * 53 + 7) % 60}%; animation-delay: ${(i % 7) * 0.6}s; width: ${(i % 3) + 1}px; height: ${(i % 3) + 1}px;`}
			></span>
		{/each}
		<div class="moon"></div>
		<div class="cloud cloud-1"></div>
		<div class="cloud cloud-2"></div>
		<div class="cloud cloud-3"></div>
	</div>

	<div class="relative z-10 mx-auto max-w-5xl px-3 pt-4 pb-16 sm:px-6">
		{#if phase === 'idle'}
			<!-- ================= 主菜单 ================= -->
			<div class="mx-auto max-w-2xl pt-8 text-center">
				<div class="text-5xl motion-safe:animate-bounce">🌕</div>
				<h1
					class="mt-2 text-3xl font-bold text-amber-200 drop-shadow-[0_0_12px_rgba(251,191,36,0.35)] sm:text-4xl"
				>
					月宫掷骰
				</h1>
				<p class="mt-2 text-sm text-slate-300">中秋博饼大会 · 不限次数,无限冲分</p>

				<div class="mt-4 flex items-center justify-center gap-2 text-sm text-amber-200/90">
					<Fa icon={faTrophy} class="inline" /> 最高纪录
					<span class="font-bold">{save.bestScore > 0 ? formatScore(save.bestScore) : '暂无'}</span>
					<span class="text-slate-400"
						>({save.bestRound > 0 ? `第 ${save.bestRound} 关` : '—'})</span
					>
					<span class="ml-2 text-slate-500">共游玩 {save.plays} 局</span>
				</div>

				<button
					class="mt-6 rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-12 py-3 text-xl font-bold text-amber-950 shadow-lg shadow-amber-900/40 transition hover:from-amber-300 hover:to-amber-500 active:scale-95"
					onclick={startGame}
				>
					🎲 开始博饼
				</button>

				<!-- 我的皮肤 -->
				<div class="mt-6 flex items-center gap-2">
					<span class="text-sm whitespace-nowrap text-slate-400">我的皮肤</span>
					<input
						type="text"
						value={skin}
						placeholder="输入 DDNet 皮肤名,如 tuzi"
						class="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
						oninput={(e) => onSkinInput(e.currentTarget.value)}
					/>
				</div>

				<!-- 规则 -->
				<div
					class="mt-6 rounded-2xl border border-slate-700/60 bg-slate-900/70 p-4 text-left backdrop-blur-sm"
				>
					<div class="text-center font-bold text-amber-200">📜 玩法说明</div>
					<ul class="mt-3 space-y-2 text-sm text-slate-400">
						<li>
							① 开局赠送 2 张普通 Tee 卡,<b class="text-slate-200">3 人队伍</b
							>起步;每关目标分数,全队排队轮流博饼(每人掷 6 骰),总得分达标即过关
						</li>
						<li>② 过关后获得<b class="text-amber-300">月饼币</b>奖励(剩分溢出也有奖励)</li>
						<li>
							③ 在中秋集市<b class="text-amber-300">免费 3 选 1</b> 兑换 Tee 卡,也可花钱刷新/额外购买
						</li>
						<li>
							④ Tee 卡各有特殊能力:加分、倍率、<b class="text-cyan-300">重掷骰子</b>、<b
								class="text-cyan-300">修改点数</b
							>……构筑你的最强队伍
						</li>
						<li>
							⑤ 每 3 关出现<b class="text-red-300">月宫守卫(Boss)</b>,带来目标翻倍、点数变化等特效
						</li>
						<li>⑥ 队伍最多 {TEAM_LIMIT} 人,不限制游玩次数,冲击无限高分!</li>
					</ul>
					<div class="mt-3 border-t border-slate-700/60 pt-2 text-xs text-slate-500">
						博饼等级:一秀 10 分 → 二举 20 → 四进 40 → 三红 80 → 对堂 160 → 状元 320 → 五子登科 480 →
						五王 640 → 六博黑 960 → 六博红 1280 → 状元插金花 2560
					</div>
				</div>
			</div>
		{:else}
			<!-- ================= HUD ================= -->
			<div
				class="rounded-2xl border border-amber-500/25 bg-slate-900/70 p-3 backdrop-blur-sm sm:p-4"
			>
				<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
					<div class="font-bold text-amber-200">
						第 {round} 关
						<span class="ml-1 text-xs font-normal text-slate-400"
							>(Ante {Math.ceil(round / 3)})</span
						>
					</div>
					{#if boss}
						<div
							class="flex items-center gap-1 rounded-full border border-red-400/40 bg-red-400/10 px-2.5 py-0.5 text-red-200"
						>
							<span>{boss.emoji}</span>
							{boss.name}:{boss.desc}
						</div>
					{/if}
					<div class="ml-auto flex items-center gap-3">
						<span class="text-slate-400">
							目标 <span class="font-bold text-slate-100">{formatScore(target)}</span>
						</span>
						<span class="text-slate-400">
							当前 <span class="font-bold text-emerald-300">{formatScore(currentScore)}</span>
						</span>
						<span class="rounded-full bg-amber-400/15 px-2.5 py-0.5 font-bold text-amber-300"
							>🥮 {mooncakes}</span
						>
					</div>
				</div>

				<!-- 月饼进度(月相) -->
				<div class="mt-3 flex items-center gap-2">
					<div class="mooncake relative h-10 w-10 shrink-0">
						<div class="mooncake-mask" style={`transform: translateX(${moonShiftPct * -1}%)`}></div>
					</div>
					<div class="h-3 grow overflow-hidden rounded-full bg-slate-700/70">
						<div
							class="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-700"
							style={`width: ${progressPct}%`}
						></div>
					</div>
					<span class="shrink-0 text-right text-xs font-semibold text-slate-400"
						>{progressPct}%</span
					>
				</div>

				<!-- 工具: 动画速率 + 规则 -->
				<div class="mt-2 flex items-center justify-end gap-2">
					<button
						class="flex items-center gap-1 rounded-lg border border-slate-600/70 bg-slate-800/70 px-2.5 py-1 text-xs font-semibold text-slate-300 transition hover:bg-slate-700"
						title="切换动画速度(1x / 2x / 3x)"
						onclick={() => (speedIdx = (speedIdx + 1) % SPEEDS.length)}
					>
						<Fa icon={faBolt} class="text-amber-400" />
						<span>{SPEED_LABELS[speedIdx]}x</span>
					</button>
					<button
						class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20"
						onclick={() => (showRules = true)}
					>
						📖 规则
					</button>
				</div>
			</div>

			<!-- ================= 队伍 ================= -->
			<div class="mt-4 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-3 backdrop-blur-sm">
				<div class="flex items-center justify-between text-xs text-slate-400">
					<span>👥 博饼队伍({team.length}/{TEAM_LIMIT})</span>
					<span class="text-slate-500">轮流上前掷骰,队伍总分为总奖品</span>
				</div>
				<div class="mt-2 flex flex-wrap gap-2">
					{#each team as tee, i (i)}
						{#snippet sellBtn()}
							<button
								class="absolute -top-1.5 -right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/90 text-[10px] font-bold text-white shadow transition hover:bg-red-400"
								title="卖出 {cardOf(tee)?.name},得 {rarityOf(cardOf(tee)!).sell} 🥮"
								onclick={() => sellTee(i)}
							>
								×
							</button>
						{/snippet}
						<TeeCardView
							card={cardOf(tee)}
							skin={tee.playerSkin ?? 'x_spec'}
							name="我"
							desc={cardOf(tee)?.desc}
							tipExtra={tee.cardId ? `卖出得 ${rarityOf(cardOf(tee)!).sell} 🥮` : undefined}
							emote={i === currentTee ? teeEmote : EMOTE.normal}
							pose={i === currentTee ? teePose : IDLE_POSE}
							active={i === currentTee && phase === 'rolling'}
							animate={i === currentTee ? teeAnimClass : ''}
							sellBtn={(phase === 'reward' || phase === 'shop') && i > 0 && tee.cardId
								? sellBtn
								: undefined}
						>
							{#snippet actions()}
								{#if tee.lastScore > 0}
									<div class="text-[10px] font-bold text-amber-300">
										{formatScore(tee.lastScore)}
									</div>
									<div class="text-[9px] text-slate-500">{getRollLevel(tee.lastLevelId).name}</div>
								{:else}
									<div class="text-[10px] text-slate-600">待掷</div>
								{/if}
							{/snippet}
						</TeeCardView>
					{/each}
				</div>
			</div>

			<!-- ================= 骰子区 ================= -->
			{#if phase === 'intro' || phase === 'rolling'}
				<div
					class="mt-4 rounded-2xl border border-amber-500/25 bg-slate-900/70 p-4 backdrop-blur-sm"
				>
					{#if phase === 'intro'}
						<div class="text-center">
							<div class="text-lg font-bold text-amber-200">
								{boss ? `${boss.emoji} 月宫守卫「${boss.name}」现身!` : `第 ${round} 关`}
							</div>
							<div class="mt-1 text-sm text-slate-400">
								目标分数 <span class="font-bold text-amber-300">{formatScore(target)}</span>
								{#if boss}<span class="ml-1 text-red-300">({boss.desc})</span>{/if}
								· 队伍 {team.length} 人排队掷骰
							</div>
							<button
								class="mt-4 rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-10 py-2.5 text-lg font-bold text-amber-950 shadow-lg transition hover:from-amber-300 hover:to-amber-500 active:scale-95"
								onclick={startRolling}
							>
								🎲 开始掷骰
							</button>
						</div>
					{:else}
						<div class="flex flex-wrap items-center justify-center gap-2">
							{#each [0, 1, 2, 3, 4, 5] as i}
								<button
									class="die {rolling ? 'rolling' : ''} {hitDice.includes(i)
										? 'hit'
										: ''} {pendingAction ? 'cursor-pointer hover:scale-110' : 'cursor-default'}"
									style={`animation-duration: ${rollDur}s; animation-delay: ${i * 0.05}s; animation-iteration-count: ${rollIter}`}
									onclick={() => pendingAction && onDieClick(i)}
									disabled={!pendingAction}
								>
									{#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as pos}
										<span
											class="pip {showPip(dice[i], pos) ? 'on' : ''}"
											class:red={!rolling && dice[i] === 4 && showPip(dice[i], pos)}
										></span>
									{/each}
								</button>
							{/each}
						</div>

						<!-- 交互提示 -->
						<div class="mt-3 min-h-8 text-center text-sm">
							{#if pendingAction?.kind === 'set_point'}
								<span class="text-cyan-300">✨ 点击 1 颗骰子,将其改为 {pendingAction.point} 点</span
								>
							{:else if pendingAction?.kind === 'set_any'}
								<span class="text-cyan-300">✨ 点击 1 颗骰子,再选择点数</span>
							{:else if pendingAction?.kind === 'reroll'}
								<span class="text-cyan-300">🎲 点击 1 颗骰子重掷({pendingAction.count} 次)</span>
							{:else if rolling}
								<span class="text-slate-400">{currentTeeCard?.name ?? '我'} 正在博饼...</span>
							{:else}
								<span class="text-slate-400">{currentTeeCard?.name ?? '我'} 掷出了...</span>
							{/if}
							{#if pendingAction}
								<button class="ml-2 text-xs text-slate-500 underline" onclick={cancelAction}
									>跳过</button
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

						<!-- 最近结果 -->
						{#if resultFlash > 0}
							<div class="mt-3 flex items-center justify-center gap-3">
								<span class="text-2xl">{lastLevel.emoji}</span>
								<div class="text-center">
									<div
										class="font-bold {lastLevel.score >= 320
											? 'text-amber-300'
											: lastLevel.score > 0
												? 'text-emerald-300'
												: 'text-slate-400'}"
									>
										{lastLevel.name}
										<span class="ml-1 text-xs font-normal text-slate-400">
											({lastBreakdown.base} + {lastBreakdown.chips}) × {lastBreakdown.mult} = {formatScore(
												lastBreakdown.total
											)}
										</span>
									</div>
								</div>
							</div>
						{/if}
					{/if}
				</div>
			{/if}

			<!-- ================= 过关结算 ================= -->
			{#if phase === 'round_end'}
				<div
					class="mt-4 rounded-2xl border border-emerald-400/40 bg-slate-900/80 p-6 text-center backdrop-blur-sm"
				>
					<div class="result-banner">
						<div class="text-4xl">🌕</div>
						<div class="mt-1 text-2xl font-bold text-emerald-300">过关!月饼到手!</div>
						<div class="mt-2 text-sm text-slate-300">
							本关得分 <span class="font-bold text-amber-300">{formatScore(roundTotal)}</span> /
							目标
							{formatScore(target)}
						</div>
						<div class="mx-auto mt-3 flex max-w-md flex-col gap-1 text-sm text-slate-400">
							<div class="flex justify-between rounded bg-slate-800/60 px-3 py-1">
								<span>过关奖励</span><span class="font-bold text-amber-300"
									>+{roundRewardGained} 🥮</span
								>
							</div>
							{#if overflowGained > 0}
								<div class="flex justify-between rounded bg-slate-800/60 px-3 py-1">
									<span>溢出奖励(每超 1000 分 +1)</span><span class="font-bold text-amber-300"
										>+{overflowGained} 🥮</span
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
							class="mt-5 rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-10 py-2.5 text-lg font-bold text-amber-950 shadow-lg transition hover:from-amber-300 hover:to-amber-500 active:scale-95"
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
					class="mt-4 rounded-2xl border border-amber-500/30 bg-slate-900/80 p-4 backdrop-blur-sm sm:p-6"
				>
					<div class="text-center">
						<div class="text-xl font-bold text-amber-200">🏮 中秋集市 · 免费选 1 张 Tee 卡</div>
						<div class="mt-1 text-xs text-slate-400">
							{canPickReward ? '选卡后自动进入商店 · 刷新需 2 🥮' : '(队伍已满,先去商店卖卡)'}
							· 当前 🥮 {mooncakes}
						</div>
					</div>
					<div class="mt-4 flex flex-wrap justify-center gap-3 sm:gap-4">
						{#each rewardChoices as card, idx}
							<TeeCardView {card} desc={card.desc} selected={lastRewardIdx === idx}>
								{#snippet actions()}
									<button
										class="w-full rounded-lg border border-amber-500/40 bg-amber-500/80 py-1 text-xs font-bold text-amber-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
										onclick={() => canPickReward && pickReward(idx)}
										disabled={lastRewardIdx >= 0 || !canPickReward}
									>
										{lastRewardIdx === idx ? '已选 ✓' : '选择'}
									</button>
								{/snippet}
							</TeeCardView>
						{/each}
					</div>
					<div class="mt-4 flex justify-center gap-3">
						<button
							class="rounded-lg border border-slate-500 bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-600 disabled:opacity-40"
							onclick={refreshReward}
							disabled={mooncakes < 2 || lastRewardIdx >= 0}
						>
							<Fa icon={faRotate} class="mr-1 inline" />刷新(2 🥮)
						</button>
						<button
							class="rounded-lg border border-slate-500 bg-slate-700 px-6 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-600"
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
					class="mt-4 rounded-2xl border border-amber-500/30 bg-slate-900/80 p-4 backdrop-blur-sm sm:p-6"
				>
					<div class="flex items-center justify-between">
						<div class="text-xl font-bold text-amber-200">🛒 商店</div>
						<div class="text-sm text-amber-300">🥮 {mooncakes}</div>
					</div>
					<div class="mt-1 text-xs text-slate-400">
						花钱购买更多 Tee 卡 {team.length >= TEAM_LIMIT ? '· 队伍已满,先卖卡腾位' : ''}
					</div>

					<div class="mt-3 flex flex-wrap justify-center gap-3 sm:gap-4">
						{#each shopCards as card}
							<TeeCardView {card} desc={card.desc}>
								{#snippet actions()}
									<button
										class="w-full rounded-lg border border-amber-500/40 bg-amber-500/80 py-1 text-xs font-bold text-amber-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
										onclick={() => buyCard(card)}
										disabled={mooncakes < rarityOf(card).price || team.length >= TEAM_LIMIT}
									>
										🥮 {rarityOf(card).price}
									</button>
								{/snippet}
							</TeeCardView>
						{/each}
					</div>

					<div class="mt-4 flex justify-center gap-3">
						<button
							class="rounded-lg border border-slate-500 bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-600 disabled:opacity-40"
							onclick={refreshShop}
							disabled={mooncakes < 2}
						>
							<Fa icon={faRotate} class="mr-1 inline" />刷新(2 🥮)
						</button>
						<button
							class="rounded-lg bg-gradient-to-b from-amber-400 to-amber-600 px-8 py-2 text-sm font-bold text-amber-950 transition hover:from-amber-300 hover:to-amber-500"
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
					class="mt-4 rounded-2xl border border-slate-600/60 bg-slate-900/85 p-6 text-center backdrop-blur-sm"
				>
					<div class="text-4xl">🌘</div>
					<div class="mt-1 text-2xl font-bold text-slate-200">博饼结束</div>
					<div class="mt-3 text-sm text-slate-400">
						倒在了 <span class="font-bold text-slate-200">第 {finalRound} 关</span> · 本关得分
						<span class="font-bold text-slate-100">{formatScore(finalScore)}</span> / {formatScore(
							target
						)}
					</div>
					{#if isNewBest}
						<div
							class="result-banner mx-auto mt-3 inline-block rounded-full border border-amber-400/60 bg-amber-400/15 px-4 py-1 text-sm font-bold text-amber-300"
						>
							🏆 新纪录!
						</div>
					{/if}
					<div class="mt-3 flex justify-center gap-6 text-sm">
						<div class="rounded-lg bg-slate-800/70 px-4 py-2">
							<div class="text-lg font-bold text-amber-300">{formatScore(save.bestScore)}</div>
							<div class="text-xs text-slate-400">最高纪录</div>
						</div>
						<div class="rounded-lg bg-slate-800/70 px-4 py-2">
							<div class="text-lg font-bold text-slate-100">{save.bestRound}</div>
							<div class="text-xs text-slate-400">最高关数</div>
						</div>
						<div class="rounded-lg bg-slate-800/70 px-4 py-2">
							<div class="text-lg font-bold text-slate-100">{save.plays}</div>
							<div class="text-xs text-slate-400">总游玩局数</div>
						</div>
					</div>
					<div class="mt-5 flex justify-center gap-3">
						<button
							class="rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-10 py-2.5 text-lg font-bold text-amber-950 shadow-lg transition hover:from-amber-300 hover:to-amber-500 active:scale-95"
							onclick={startGame}
						>
							🎲 再来一局
						</button>
						<button
							class="rounded-xl border border-slate-500 bg-slate-700 px-6 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-600"
							onclick={restart}
						>
							返回菜单
						</button>
					</div>
				</div>
			{/if}
		{/if}

		<div class="mt-8 text-center text-xs text-slate-500">
			祝大家中秋快乐,阖家团圆!🌕 晒出你的纪录 →
			<a
				href="https://chat.teeworlds.cn"
				target="_blank"
				rel="noopener noreferrer"
				class="text-amber-400 hover:underline">chat.teeworlds.cn</a
			>
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
									<span class="mini-die {v === 4 ? 'mini-four' : ''}">{v}</span>
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
		top: 7%;
		right: 8%;
		width: 90px;
		height: 90px;
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
	.die {
		position: relative;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		grid-template-rows: repeat(3, 1fr);
		width: 56px;
		height: 56px;
		padding: 8px;
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

	.pip {
		display: flex;
		align-items: center;
		justify-content: center;
		visibility: hidden;
	}

	.pip::after {
		content: '';
		width: 9px;
		height: 9px;
		border-radius: 9999px;
		background: #2b2b33;
		box-shadow: inset 0 -1px 1px rgba(255, 255, 255, 0.3);
	}

	.pip.on {
		visibility: visible;
	}

	.pip.red::after {
		background: #d63232;
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

	/* ---- Tee 动画(已移入 TeeCard.svelte) ---- */
	/* ---- 卡片样式已移入 TeeCard.svelte ---- */

	/* ---- 结果横幅 ---- */
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
