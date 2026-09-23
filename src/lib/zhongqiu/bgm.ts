// 中秋博饼 · Boss 战事件音乐(Web Audio 实时合成,零素材)
//
// 口径:事件是主角 —— stingers 一律**音效级**(和骰子声同级、一听就有);
// Boss 回合另垫一层**很轻的神秘 BGM**(空五度 drone + 风噪 + 慢心跳 + 稀疏暗铃),
// 永远压在事件句下面,迎战/收束时闪避或淡出。
//
// 调性:全模块共用一把钥匙 —— 小调五声 BOSS_SCALE(见下)。
//
// ── 事件 ─────────────────────────────────────────────────────────────
// ① 出场 sting(进准备阶段,约 1s):耳语上扫 → 定音鼓 + 深钟 + 小三和弦低音簇
//    —— 「月下有什么东西醒了」;随即 BGM 慢慢浮起来。
// ② 迎战开场曲(点「迎战」,约 1.2s):定音鼓 ×2(渐重)→ 五声刮奏下行 →
//    深钟落板 + 低频一沉 —— 有仪式感的「月下对决,开局」。
// ③ 掷骰 stinger:**级进上行的 glint(小调五声)→ 落定重击** 两拍式
//    (落定 = 骰子定格那一帧)。
// ④ 回合收束句(胜):do→te→sol 快速三记下行(小调五声)+ 深钟落板(「缩回暗处」);
//    败 = 一记深沉落幕钟(sfxLose 的滑落照旧)。两句都快收,不拖尾。
//
// ── 紧张感 = stinger 随 Tee 升级(bossBgmTension,0..5)────────────────────
// 这是能**听见**的 escalation,不是微差:
//   lv0(Tee 1):2 颗轻 glint,轻落定 —— 轻快
//   lv1:glint ×3,落定带闷响
//   lv2:glint ×4,小句起点往上挪一段(音区随级爬,不再抬八度 —— 抬了会撞 A4 封顶)
//   lv3:+ 影子高音(音阶内的 m3/m7)、落定更重
//   lv4:+ 落定前 300ms mini-riser(骰子还在滚就开始爬)
//   lv5(Tee 6):glint ×7 + 影子音 + riser + **双落定** —— 最狠的一掷
//
// ── 其它设计约束 ─────────────────────────────────────────────────────────
// · 每场随机抽一个调根 —— 开场曲/stinger/收束句同调,听感是一个整体;
// · 所有旋律(开场/掷骰/BGM/收束)同一把小调五声 BOSS_SCALE —— 同调、没有半音内讧;
// · 音量 = **音效级**(0.12~0.35,和 sfxRoll 同量级),不求底噪式的「氛围」;
// · 混响只做「尺寸」(轻量,240Hz 低切),不糊骰子声;
// · 铃声基音封顶 A4(440Hz)—— 再高的泛音飘、刺耳(MAX_BELL_SEMI);
// · 音频缓冲统一开大(sfx.ts 的 LATENCY_HINT):手机欠载爆音靠缓冲解决,不做设备分档。
// · 黑月 = mode 'off',一个音都不出(按钮也是普通「开始」,见页面 bossFight)。
//
// 参考:事件式配乐的 stinger 工艺(SonalSystem/Berklee:快起快收、和声模糊、
// 频谱铺满、多变体)+ 垂直分层式 escalation 的「可听性」原则(杀戮尖塔那族):
// 玩家要能在**每一次投掷**里听出级别差,所以升级写在 stinger 本体上。
//
// 对外:bossBgmPrep(本场武装:抽调根)/ bossBgmIntro(准备阶段「现身」sting)/
//      bossBgmBattle(迎战开场曲)/ bossBgmTension / bossBgmSting / bossBgmEnd / bossBgmStop。

import { sfxGraph, sfxEnabled } from './sfx';
import { getSave, setSaveBossSfx } from './game';

type Mode = 'off' | 'prep' | 'jingle' | 'battle' | 'ending';

// ---- 本场参数 ----
let mode: Mode = 'off';
/** 本场调根(相对 55Hz 的半音数):开场曲/stinger/收束句同调 */
let root = 0;
let tension = 0; // 0..5,按 Tee 递进
let out: GainNode | null = null;
let fanfareTimer: ReturnType<typeof setTimeout> | null = null;

// ---- Boss BGM(底噪层)状态 ----
let bgmGain: GainNode | null = null;
let bgmSources: AudioScheduledSourceNode[] = [];
let bgmTimer: ReturnType<typeof setInterval> | null = null;
/** 下一小节的 Web Audio 时刻 + 小节计数(暗铃/耳语按小节变化) */
let bgmNext = 0;
let bgmBar = 0;
/** 小节长度(秒):慢,给心跳、暗铃和呼吸留空间 */
const BGM_BAR = 3.2;
/** BGM 总推子工作电平:压在 stingers 下面(≈ 它们的一半) */
const BGM_LEVEL = 0.75;

/**
 * Boss 场唯一的一把钥匙:小调五声(两个八度)。
 * BGM 旋律 / 掷骰 stinger / 开场刮奏 / 收束句全用它 —— 同调,不掺变徵;
 * 音阶内最小音距 2 个半音,任意两音同时响都不会出半音内讧。
 */
const BOSS_SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
/** 「影子」高音(音阶内的 m3/m7,跨八度):紧张点缀,不出调 */
const SHADOW = [3, 10, 15, 22];
/** 铃声基音封顶(半音,基准 110Hz):24 = A4/440Hz —— 再高的泛音飘、刺耳 */
const MAX_BELL_SEMI = 24;

const hz = (semi: number) => 55 * Math.pow(2, semi / 12);
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ---- Boss 音效开关(独立于主音效;localStorage + 元存档**双写双读**)----
// 层级:**sfxOn 是总控**(关了谁都别想出声 —— 合成原语里门禁,连主静音一起管),
// 本开关只决定「启用不启用 Boss 音效」(开场曲/stinger/收束句)。
// 关本开关 = 本模块一个音都不出;页面会顺手 bossBgmStop() 把在途乐句也收了。
const KEY = 'midautumn:bossSfx';
let enabled = true;
export const bossSfxEnabled = () => enabled;
export const setBossSfxEnabled = (on: boolean) => {
	enabled = on;
	try {
		localStorage.setItem(KEY, on ? '1' : '0');
	} catch {
		// ignore
	}
	setSaveBossSfx(on); // 也入元存档(支持存档)
};
export const loadBossSfxPref = () => {
	try {
		const raw = localStorage.getItem(KEY);
		// 专门的开关键优先(更新鲜),没有就看元存档,都没有 → 默认开
		if (raw !== null) enabled = raw !== '0';
		else enabled = getSave().bossSfx !== false;
	} catch {
		enabled = true;
	}
	return enabled;
};

// ---- 合成 IR 的轻混响(只做尺寸)----

const makeImpulse = (ctx: AudioContext, seconds = 2.4): AudioBuffer => {
	const len = Math.floor(ctx.sampleRate * seconds);
	const buf = ctx.createBuffer(2, len, ctx.sampleRate);
	for (let ch = 0; ch < 2; ch++) {
		const d = buf.getChannelData(ch);
		let lp = 0;
		for (let i = 0; i < len; i++) {
			const env = Math.pow(1 - i / len, 2.8);
			lp += 0.22 * (Math.random() * 2 - 1 - lp);
			d[i] = lp * env * 1.8;
		}
	}
	return buf;
};

const ensureOut = () => {
	const g = sfxGraph();
	if (!g) return null;
	if (!out) {
		const ctx = g.ctx;
		out = ctx.createGain();
		// 干为主、湿只做尺寸:hp 240Hz 低切,尾巴不糊骰子声
		const hp = ctx.createBiquadFilter();
		hp.type = 'highpass';
		hp.frequency.value = 240;
		hp.Q.value = 0.7;
		const conv = ctx.createConvolver();
		conv.buffer = makeImpulse(ctx);
		const revOut = ctx.createGain();
		revOut.gain.value = 0.5;
		out.connect(g.bus);
		out.connect(hp);
		hp.connect(conv);
		conv.connect(revOut);
		revOut.connect(g.bus);
	}
	// bossBgmStop 会把 out 拉到底;回来演出时先扶正
	out.gain.cancelScheduledValues(g.ctx.currentTime);
	out.gain.setValueAtTime(1, g.ctx.currentTime);
	return g;
};

// ---- 合成原语(全部音效级音量)----

/** 月光铃:基音 + 两个整数泛音,快起、尾巴交给混响 */
function bellAt(at: number, semi: number, gain = 0.15, dur = 1.6, pan?: number) {
	if (!sfxEnabled()) return; // 总控静音:不出声(状态机照常走,取消静音自然恢复)
	const g = sfxGraph();
	if (!g || !out) return;
	// 封顶:再高的泛音飘、刺耳(见 MAX_BELL_SEMI)
	const f0 = hz(Math.min(semi, MAX_BELL_SEMI) + 12);
	const panner = g.ctx.createStereoPanner();
	// 默认随机摆位;成句的音流会传入渐变摆位,听着更「有设计」
	panner.pan.value = pan ?? Math.random() * 0.8 - 0.4;
	panner.connect(out);
	const partials: [number, number, number][] = [
		[1, gain, dur],
		[2, gain * 0.3, dur * 0.5],
		[3, gain * 0.12, dur * 0.3]
	];
	for (const [mult, gv, dec] of partials) {
		const o = g.ctx.createOscillator();
		const v = g.ctx.createGain();
		o.type = 'sine';
		o.frequency.setValueAtTime(f0 * mult, at);
		v.gain.setValueAtTime(0, at);
		v.gain.linearRampToValueAtTime(gv, at + 0.005);
		v.gain.exponentialRampToValueAtTime(0.0004, at + dec);
		o.connect(v).connect(panner);
		o.start(at);
		o.stop(at + dec + 0.05);
	}
}

/** 定音鼓一击 */
function timpaniAt(at: number, gain = 0.3) {
	if (!sfxEnabled()) return;
	const g = sfxGraph();
	if (!g || !out) return;
	const o = g.ctx.createOscillator();
	const v = g.ctx.createGain();
	o.type = 'sine';
	o.frequency.setValueAtTime(88, at);
	o.frequency.exponentialRampToValueAtTime(50, at + 0.16);
	v.gain.setValueAtTime(0.0001, at);
	v.gain.linearRampToValueAtTime(gain, at + 0.008);
	v.gain.exponentialRampToValueAtTime(0.0006, at + 0.24);
	o.connect(v).connect(out);
	o.start(at);
	o.stop(at + 0.3);
}

/** 低频一沉(sub boom) */
function subBoom(at: number, dur = 1.2, gain = 0.2) {
	if (!sfxEnabled()) return;
	const g = sfxGraph();
	if (!g || !out) return;
	const o = g.ctx.createOscillator();
	const v = g.ctx.createGain();
	o.type = 'sine';
	o.frequency.setValueAtTime(60, at);
	o.frequency.exponentialRampToValueAtTime(38, at + dur);
	v.gain.setValueAtTime(0.0001, at);
	v.gain.linearRampToValueAtTime(gain, at + 0.02);
	v.gain.exponentialRampToValueAtTime(0.0005, at + dur);
	o.connect(v).connect(out);
	o.start(at);
	o.stop(at + dur + 0.05);
}

/** 五声刮奏(大珠小珠落玉盘) */
function glissAt(at: number, up: boolean, gain = 0.14) {
	const notes = [...BOSS_SCALE];
	if (up) notes.reverse();
	const n = 5 + Math.floor(Math.random() * 3);
	for (let i = 0; i < n; i++)
		bellAt(at + i * (0.05 + Math.random() * 0.03), notes[i % notes.length] + root, gain, 0.8);
}

/** mini-riser:短促上扫(骰子还在滚就开始爬) */
function riserAt(at: number, dur = 0.3, gain = 0.08) {
	if (!sfxEnabled()) return;
	const g = sfxGraph();
	if (!g || !out) return;
	const src = g.ctx.createBufferSource();
	src.buffer = g.noise;
	const f = g.ctx.createBiquadFilter();
	const v = g.ctx.createGain();
	f.type = 'bandpass';
	f.frequency.setValueAtTime(1800, at);
	f.frequency.exponentialRampToValueAtTime(7000, at + dur);
	f.Q.value = 1.2;
	v.gain.setValueAtTime(0.0001, at);
	v.gain.linearRampToValueAtTime(gain, at + dur * 0.9);
	v.gain.exponentialRampToValueAtTime(0.0005, at + dur + 0.05);
	src.connect(f).connect(v).connect(out);
	src.start(at, Math.random() * 0.3, dur + 0.1);
}

/** 落定一击:闷响 + 轻铃(骰子定格那一帧) */
function landAt(at: number, gain = 0.2) {
	timpaniAt(at, gain);
	bellAt(at, root + 7, gain * 0.3, 1);
}

// ---- ① 迎战开场曲(约 1.2s:鼓 ×2 → 五声刮奏 → 深钟落板)----

const scheduleFanfare = (at: number) => {
	timpaniAt(at, 0.28);
	timpaniAt(at + 0.22, 0.34);
	glissAt(at + 0.35, false, 0.15);
	bellAt(at + 0.85, root - 12, 0.3, 3.5);
	bellAt(at + 0.85, root, 0.2, 3);
	subBoom(at + 0.85, 1.2, 0.22);
};

// ---- ② 掷骰 stinger:出手 glint → 落定重击,随 Tee 升级 ----

/**
 * 'throw' = 级进上行的 glint(小调五声 + 三全音)→(landIn 秒后)落定重击;
 * 'reroll' = 两记下行小问句(五度落地)。
 * tension(0..5)直接长在音上:颗数/音区/重量/变徵/riser/双落定逐级加上去。
 */
export const bossBgmSting = (kind: 'throw' | 'reroll', landIn = 0.8) => {
	// 'prep'/'jingle' 期间不出声:点「迎战」那一下 = 开场曲触发点 = 第一掷,两发打击
	// 乐句会整段撞在一起 —— 让开场曲独占,sting 从后面的重掷/第二掷再上
	if (
		!enabled ||
		mode === 'off' ||
		mode === 'ending' ||
		mode === 'prep' ||
		mode === 'jingle' ||
		!out
	)
		return;
	const g = ensureOut();
	if (!g) return;
	const at = g.ctx.currentTime + 0.015;
	const lv = Math.max(0, Math.min(5, tension));
	if (kind === 'reroll') {
		// 重掷:音阶内落下的小问句 —— 高一级起、低一级落,偶尔再压一级
		const i = 2 + Math.floor(Math.random() * 3);
		bellAt(at, root + BOSS_SCALE[i + 2], 0.1, 0.7);
		bellAt(at + 0.2, root + BOSS_SCALE[i - (Math.random() < 0.35 ? 1 : 0)], 0.08, 0.9);
		return;
	}
	// 出手 glint:一条**级进上行**的小调五声小句 —— 有序、朝上,像什么顺着月光爬上来。
	// 不抬八度(会撞 A4 封顶挤成重复音),紧张感靠颗数/起点递进。
	const count = 2 + lv;
	const topAbs = MAX_BELL_SEMI - root;
	let top = 0;
	while (top + 1 < BOSS_SCALE.length && BOSS_SCALE[top + 1] <= topAbs) top++;
	const start = Math.max(0, Math.min(1 + Math.floor(lv / 2), top - (count - 1)));
	const run = Array.from({ length: count }, (_, i) => BOSS_SCALE[Math.min(start + i, top)]);
	run.forEach((n, i) =>
		bellAt(
			at + i * 0.05,
			root + n,
			0.1 + lv * 0.01,
			0.85,
			run.length > 1 ? -0.3 + (i / (run.length - 1)) * 0.6 : 0
		)
	);
	// 句尾收住:把最高音的低八度垫回来(往下接,不往上堆)
	bellAt(at + count * 0.05 + 0.02, root + Math.max(0, run[count - 1] - 12), 0.06, 1.3, 0);
	// lv3+:影子高音(m3/m7,音阶内)—— 有什么在边上看着
	if (lv >= 3) bellAt(at + 0.06, root + pick(SHADOW), 0.07 + lv * 0.005, 0.7);
	// lv4+:落定前 300ms mini-riser
	if (lv >= 4) riserAt(at + Math.max(0.1, landIn - 0.3), 0.3, 0.06 + lv * 0.005);
	// 落定重击(重量随级);lv5 双落定
	const land = at + Math.max(0.15, landIn);
	landAt(land, 0.16 + lv * 0.04);
	// lv2+ 落定底下垫一记小三度暗影(音阶内):越到后面越沉
	if (lv >= 2) bellAt(land + 0.02, root + 3, 0.05 + lv * 0.006, 1.4);
	if (lv >= 5) {
		landAt(land + 0.12, 0.13);
		bellAt(land + 0.12, root + pick(SHADOW), 0.08, 0.8);
	}
};

/** 每只 Tee 开掷时递进(0..5):越掷越狠,狠在 stinger 本体上 */
export const bossBgmTension = (level: number) => {
	if (mode === 'off') return;
	tension = Math.max(0, Math.min(5, level));
};

// ---- ③ 回合收束句 ----

const scheduleEnding = (at: number) => {
	// do→te→sol 快速三记下行(小调五声)+ 深钟落板(「缩回暗处」)—— 短句快收,不拖尾
	bellAt(at, root + 12, 0.2, 1.2);
	bellAt(at + 0.3, root + 10, 0.18, 1.2);
	bellAt(at + 0.6, root + 7, 0.18, 1.3);
	bellAt(at + 1.0, root, 0.26, 2.2);
	bellAt(at + 1.0, root - 12, 0.16, 2.4);
	subBoom(at + 1.0, 1.2, 0.2);
};

// ---- 窗口不可见 = 冻住在途乐句(连时钟一起停,回来原处接续)----
let paused = false;
if (typeof document !== 'undefined') {
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) {
			// 没在演 Boss 乐句就不冻(否则只是切个标签,连骰子声一起卡住)
			if (!out || mode === 'off' || paused) return;
			const g = sfxGraph();
			if (!g) return;
			paused = true;
			void g.ctx.suspend();
		} else if (paused) {
			// 回来**一律解冻**:隐藏期间 mode 可能已经走到 'off'(收束计时器照跑),
			// 这里若再拦一道(旧写法 `mode === 'off' → return`),ctx 会一直冻到下次交互,
			// 整页先静音一阵子(踩过)。
			paused = false;
			// ctx 一定已经建好(paused=true 就是拿它冻的);sfxGraph 只是把它取回来
			const g = sfxGraph();
			if (g) void g.ctx.resume();
		}
	});
}

// ---- ④ Boss BGM:神秘底噪 ----
//
// 不是旋律曲子,是「月下有什么东西醒着」的床:三全音 drone 悬着和声、风噪透气、
// 慢心跳压拍、暗铃偶尔探一下。音量永远低于 stingers,事件一来先让路(duck)。

const ensureBgmGain = (g: { ctx: AudioContext }, dst: GainNode): GainNode => {
	if (bgmGain) return bgmGain;
	const gain = g.ctx.createGain();
	gain.gain.value = 0.0001;
	gain.connect(dst);
	bgmGain = gain;
	return gain;
};

/** 每小节:慢心跳 ×2 + 暗铃(每两小节)+ 影子耳语(每四小节) */
const scheduleBgmBar = (at: number, bar: number) => {
	timpaniAt(at, 0.11);
	timpaniAt(at + 0.46, 0.07);
	// 暗铃只取音阶中低段(0..17):和 stinger 小句同一把钥匙
	if (bar % 2 === 0)
		bellAt(at + 1.1 + Math.random() * 0.5, root + pick(BOSS_SCALE.slice(0, 8)), 0.1, 2.6);
	if (bar % 4 === 2) bellAt(at + 2.1, root + pick(SHADOW), 0.06, 1.8);
};

const bgmTick = () => {
	if (paused) return; // 窗口隐藏:ctx 已冻住,别再碰 sfxGraph(它不会解冻,但也没必要干活)
	const g = sfxGraph();
	if (!g || !bgmGain) return;
	const now = g.ctx.currentTime;
	// 标签页冻过时钟 / 掉帧后重新对齐,别把欠的拍子一次全砸出来
	if (bgmNext < now) bgmNext = now + 0.12;
	while (bgmNext < now + 1.2) {
		scheduleBgmBar(bgmNext, bgmBar++);
		bgmNext += BGM_BAR;
	}
};

/** 起 BGM:三全音 drone(同音失谐做出缓慢拍频)+ 风噪,慢淡入 */
const startBgm = () => {
	const g = ensureOut();
	if (!g || !out || !enabled || bgmTimer) return;
	const bgm = ensureBgmGain(g, out);
	const t = g.ctx.currentTime + 0.08;
	bgm.gain.cancelScheduledValues(t);
	bgm.gain.setValueAtTime(0.0001, t);
	bgm.gain.exponentialRampToValueAtTime(BGM_LEVEL, t + 2.2);
	// drone:根 + 五度 + 八度(悬着的空五度,大小调交给旋律);两个根音失谐 15 音分,慢慢打拍
	const drones: [number, number, number][] = [
		[root, -7, 0.06],
		[root, 8, 0.06],
		[root + 7, -4, 0.045],
		[root + 12, 4, 0.03]
	];
	for (const [semi, cents, gain] of drones) {
		const o = g.ctx.createOscillator();
		o.type = 'triangle';
		o.frequency.value = hz(semi);
		o.detune.value = cents;
		const v = g.ctx.createGain();
		v.gain.value = gain;
		const lp = g.ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 320;
		o.connect(v).connect(lp).connect(bgm);
		o.start(t);
		bgmSources.push(o);
	}
	// 风噪:bandpass 被极慢 LFO 推着漂,填「空场」的空气
	const src = g.ctx.createBufferSource();
	src.buffer = g.noise;
	src.loop = true;
	const bp = g.ctx.createBiquadFilter();
	bp.type = 'bandpass';
	bp.frequency.value = 620;
	bp.Q.value = 0.7;
	const nv = g.ctx.createGain();
	nv.gain.value = 0.016;
	const lfo = g.ctx.createOscillator();
	lfo.frequency.value = 0.06;
	const lfoGain = g.ctx.createGain();
	lfoGain.gain.value = 260;
	lfo.connect(lfoGain).connect(bp.frequency);
	src.connect(bp).connect(nv).connect(bgm);
	src.start(t);
	lfo.start(t);
	bgmSources.push(src, lfo);
	bgmNext = g.ctx.currentTime + 1;
	bgmBar = 0;
	bgmTimer = setInterval(bgmTick, 260);
};

/** 收 BGM:淡出后停源;源停掉不能复用,下次 start 重建 */
const stopBgm = (sec = 0.7) => {
	if (bgmTimer) {
		clearInterval(bgmTimer);
		bgmTimer = null;
	}
	const g = sfxGraph();
	const gain = bgmGain;
	bgmGain = null;
	if (gain && g) {
		const t = g.ctx.currentTime;
		gain.gain.cancelScheduledValues(t);
		gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + sec);
	}
	const stopAt = (g?.ctx.currentTime ?? 0) + sec + 0.15;
	for (const s of bgmSources) {
		try {
			s.stop(stopAt);
		} catch {
			// 已停/无效 —— 无所谓
		}
	}
	bgmSources = [];
	if (gain) setTimeout(() => gain.disconnect(), (sec + 0.4) * 1000);
};

/** 事件句来了先让路:压低 BGM,过一阵自己回来 */
const duckBgm = (mult = 0.4, hold = 1.2) => {
	if (!bgmGain) return;
	const g = sfxGraph();
	if (!g) return;
	const t = g.ctx.currentTime;
	const target = Math.max(0.0001, BGM_LEVEL * mult);
	bgmGain.gain.cancelScheduledValues(t);
	bgmGain.gain.setValueAtTime(Math.max(0.0001, bgmGain.gain.value), t);
	bgmGain.gain.linearRampToValueAtTime(target, t + 0.1);
	bgmGain.gain.setValueAtTime(target, t + hold);
	bgmGain.gain.linearRampToValueAtTime(BGM_LEVEL, t + hold + 1.1);
};

// ---- 对外 ----

/** 进准备阶段(见 Boss 条件):武装本场 —— 抽调根,**不出声**(没有底噪) */
export const bossBgmPrep = () => {
	if (!enabled) return;
	const g = ensureOut();
	if (!g) return;
	if (fanfareTimer !== null) clearTimeout(fanfareTimer);
	root = [-3, 0, 3, 5, 8][Math.floor(Math.random() * 5)];
	tension = 0;
	mode = 'prep';
};

/**
 * 进 Boss 准备阶段:一记「现身」stinger(约 1s)—— 耳语上扫 → 定音鼓 + 深钟 +
 * 小三和弦(根/小三/五度),上面飘一层薄薄的三全音,随后把神秘 BGM 慢慢垫起来。
 * 和迎战开场曲分开 —— 那一下留给 rolling;这里只是宣告「这关有 Boss」。
 * 调根要用 bossBgmPrep 抽好的,所以调用方先 prep 再 intro。
 */
export const bossBgmIntro = () => {
	if (!enabled) return;
	const g = ensureOut();
	if (!g || !out) return;
	const at = g.ctx.currentTime + 0.03;
	// 耳语上扫 → 一记落地:深钟 + 小三和弦(根/小三/五度),上面飘一层薄薄的 m7 影子
	riserAt(at, 0.9, 0.045);
	timpaniAt(at + 0.4, 0.26);
	bellAt(at + 0.42, root - 12, 0.24, 3.2);
	bellAt(at + 0.5, root + 3, 0.1, 2.6);
	bellAt(at + 0.54, root + 7, 0.075, 2.4);
	bellAt(at + 0.62, root + 22, 0.04, 2); // 高一层薄薄的 m7 影子(音阶内)
	// 影子掠过
	bellAt(at + 0.85, root + pick(SHADOW), 0.05, 1.6);
	subBoom(at + 0.4, 1.6, 0.2);
	startBgm(); // 底噪从这一记之后慢慢浮起来
};

/** 点「迎战」:开场曲(约 1.2s)。整局只来一次 */
export const bossBgmBattle = () => {
	if (!enabled) return;
	if (mode === 'battle' || mode === 'jingle' || mode === 'ending') return;
	const g = ensureOut();
	if (!g || !out) return;
	if (mode === 'off') {
		root = [-3, 0, 3, 5, 8][Math.floor(Math.random() * 5)];
		tension = 0;
	}
	mode = 'jingle';
	duckBgm(0.45, 1.1); // 开场曲期间 BGM 退半步
	scheduleFanfare(g.ctx.currentTime + 0.05);
	fanfareTimer = setTimeout(() => {
		mode = 'battle';
	}, 1300);
};

/** 回合结束:胜 = 五声下行的收束句;败 = 一记深沉落幕钟 */
export const bossBgmEnd = (win: boolean) => {
	if (!enabled) return;
	if (mode === 'off' || mode === 'ending') return;
	const g = ensureOut();
	if (!g) return;
	mode = 'ending';
	stopBgm(win ? 1.6 : 0.8); // BGM 跟着收束句落下
	if (win) {
		scheduleEnding(g.ctx.currentTime + 0.1);
	} else {
		const at = g.ctx.currentTime + 0.1;
		bellAt(at, root - 12, 0.24, 2.4);
		subBoom(at, 1.1, 0.18);
	}
	if (fanfareTimer !== null) clearTimeout(fanfareTimer);
	fanfareTimer = setTimeout(
		() => {
			mode = 'off';
		},
		win ? 3200 : 1600
	);
};

/** 收掉(菜单 / 局间 / 离开页面;在途乐句一并静音)。收束句不拦 —— 让它落完 */
export const bossBgmStop = () => {
	stopBgm(0.6); // BGM 一律收掉(ending 时它已经在淡出,重复调用无害)
	if (mode === 'off' || mode === 'ending') return;
	const g = sfxGraph();
	if (g && out) {
		out.gain.cancelScheduledValues(g.ctx.currentTime);
		out.gain.setTargetAtTime(0.0001, g.ctx.currentTime, 0.03);
	}
	if (fanfareTimer !== null) clearTimeout(fanfareTimer);
	fanfareTimer = null;
	mode = 'off';
	tension = 0;
};
