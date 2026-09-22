// 中秋博饼 · Boss 战事件音乐(Web Audio 实时合成,零素材)
//
// 口径(三振 ambient 之后的定案):**不要底噪,事件就是音乐**。
// 持续的氛围垫埋掉了所有关键时刻(stinger 听不见、紧张感是微差、迎战不像开场),
// 所以:中间完全没 BGM,三个时刻做成**音效级**的乐句 —— 和骰子声同级、一听就有。
//
// ── 三个时刻 ─────────────────────────────────────────────────────────────
// ① 迎战开场曲(点「迎战」,约 1.2s):定音鼓 ×2(渐重)→ 五声刮奏下行 →
//    深钟落板 + 低频一沉 —— 有仪式感的「月下对决,开局」。
// ② 掷骰 stinger:**出手 glint → 落定重击** 两拍式(落定 = 骰子定格那一帧)。
// ③ 回合收束句(胜):do→la→sol 五声下行三记 + 深钟长尾(「缩回暗处」);
//    败 = 一记深沉落幕钟(sfxLose 的滑落照旧)。
//
// ── 紧张感 = stinger 随 Tee 升级(bossBgmTension,0..5)────────────────────
// 这是能**听见**的 escalation,不是微差:
//   lv0(Tee 1):2 颗轻 glint,轻落定 —— 轻快
//   lv1:glint ×3,落定带闷响
//   lv2:glint ×4 整体升八度
//   lv3:+ 变徵边音(影子来了)、落定更重
//   lv4:+ 落定前 300ms mini-riser(骰子还在滚就开始爬)
//   lv5(Tee 6):glint ×7 + 变徵 + riser + **双落定** —— 最狠的一掷
//
// ── 其它设计约束 ─────────────────────────────────────────────────────────
// · 每场随机抽一个调根 —— 开场曲/stinger/收束句同调,听感是一个整体;
// · 音符一律五声音阶(宫商角徵羽)+ 变徵只做「影子」点缀(不诡异的月夜语法);
// · 音量 = **音效级**(0.12~0.35,和 sfxRoll 同量级),不求底噪式的「氛围」;
// · 混响只做「尺寸」(轻量,240Hz 低切),不糊骰子声;
// · 黑月 = mode 'off',一个音都不出(按钮也是普通「开始」,见页面 bossFight)。
//
// 参考:事件式配乐的 stinger 工艺(SonalSystem/Berklee:快起快收、和声模糊、
// 频谱铺满、多变体)+ 垂直分层式 escalation 的「可听性」原则(杀戮尖塔那族):
// 玩家要能在**每一次投掷**里听出级别差,所以升级写在 stinger 本体上。
//
// 对外:bossBgmPrep(本场武装:抽调根,不出声)/ bossBgmBattle(开场曲)/
//      bossBgmTension / bossBgmSting / bossBgmEnd / bossBgmStop。

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

/** 五声音阶池(宫商角徵羽 + 两轮八度) */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
/** 「影子」变徵(高紧张的点缀) */
const EDGE = [5, 11, 23];

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
function bellAt(at: number, semi: number, gain = 0.15, dur = 1.6) {
	if (!sfxEnabled()) return; // 总控静音:不出声(状态机照常走,取消静音自然恢复)
	const g = sfxGraph();
	if (!g || !out) return;
	const f0 = hz(semi + 12);
	const pan = g.ctx.createStereoPanner();
	pan.pan.value = Math.random() * 0.8 - 0.4;
	pan.connect(out);
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
		o.connect(v).connect(pan);
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
	const notes = [...PENTA.slice(2, 12)].sort((a, b) => a - b);
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
 * 'throw' = 出手 glint →(landIn 秒后)落定重击;'reroll' = 一颗高 glint。
 * tension(0..5)直接长在音上:颗数/音区/重量/变徵/riser/双落定逐级加上去。
 */
export const bossBgmSting = (kind: 'throw' | 'reroll', landIn = 0.8) => {
	if (!enabled || mode === 'off' || mode === 'ending' || !out) return;
	const g = ensureOut();
	if (!g) return;
	const at = g.ctx.currentTime + 0.015;
	const lv = Math.max(0, Math.min(5, tension));
	if (kind === 'reroll') {
		bellAt(at, root + pick(PENTA.slice(0, 5)) + (lv >= 3 ? 12 : 0), 0.1, 0.6);
		return;
	}
	// 出手 glint:颗数 2→7 随级递进,lv2 起整体升八度
	const notes = [...PENTA].sort(() => Math.random() - 0.5).slice(0, 2 + lv);
	notes.forEach((n, i) =>
		bellAt(at + i * 0.045, root + n + (lv >= 2 ? 12 : 0), 0.13 + lv * 0.012, 0.8)
	);
	// lv3+:变徵边音 —— 影子来了
	if (lv >= 3) bellAt(at + 0.06, root + pick(EDGE), 0.07 + lv * 0.005, 0.7);
	// lv4+:落定前 300ms mini-riser
	if (lv >= 4) riserAt(at + Math.max(0.1, landIn - 0.3), 0.3, 0.06 + lv * 0.005);
	// 落定重击(重量随级);lv5 双落定
	const land = at + Math.max(0.15, landIn);
	landAt(land, 0.16 + lv * 0.04);
	if (lv >= 5) {
		landAt(land + 0.12, 0.13);
		bellAt(land + 0.12, root + pick(EDGE), 0.08, 0.8);
	}
};

/** 每只 Tee 开掷时递进(0..5):越掷越狠,狠在 stinger 本体上 */
export const bossBgmTension = (level: number) => {
	if (mode === 'off') return;
	tension = Math.max(0, Math.min(5, level));
};

// ---- ③ 回合收束句 ----

const scheduleEnding = (at: number) => {
	// do→la→sol 五声下行,深钟长尾(「缩回暗处」)
	bellAt(at, root + 12, 0.22, 2.6);
	bellAt(at + 0.9, root + 9, 0.2, 2.6);
	bellAt(at + 1.8, root + 7, 0.2, 2.6);
	bellAt(at + 2.8, root, 0.28, 4);
	bellAt(at + 2.8, root - 12, 0.18, 4);
	subBoom(at + 2.8, 1.6, 0.2);
};

// ---- 窗口不可见 = 冻住在途乐句(连时钟一起停,回来原处接续)----
let paused = false;
if (typeof document !== 'undefined') {
	document.addEventListener('visibilitychange', () => {
		if (!out || mode === 'off') return;
		const g = sfxGraph();
		if (!g) return;
		if (document.hidden && !paused) {
			paused = true;
			void g.ctx.suspend();
		} else if (!document.hidden && paused) {
			paused = false;
			void g.ctx.resume();
		}
	});
}

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
	if (win) {
		scheduleEnding(g.ctx.currentTime + 0.1);
	} else {
		const at = g.ctx.currentTime + 0.1;
		bellAt(at, root - 12, 0.24, 3.5);
		subBoom(at, 1.4, 0.18);
	}
	if (fanfareTimer !== null) clearTimeout(fanfareTimer);
	fanfareTimer = setTimeout(
		() => {
			mode = 'off';
		},
		win ? 5200 : 2000
	);
};

/** 收掉(菜单 / 局间 / 离开页面;在途乐句一并静音)。收束句不拦 —— 让它落完 */
export const bossBgmStop = () => {
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
