// 中秋博饼 · Boss 战 BGM(Web Audio 实时合成,每场随机生成,零素材)
//
// 和 sfx.ts 共用一张音频图(bgmGain → bus → master → destination):
// 静音开关、总线压缩(-18dB / 8:1)对音乐天然生效,不另开一条链。
//
// ── 音乐设计(music-craft:先写约束,再写音符)──────────────────────────────
// 色彩:自然小调,收束借和声小调的 V —— 张力来自 ♭6/♭7 与导音的拉扯,是 Boss 战
//   的标准语法。每场随机抽:调根(5 选)/ 速度 128~160 / 和声走向(4 套)/
//   鼓组(3 套)/ 贝斯音型(3 套)/ 旋律动机(3 套)→ 每场听感都不同,但同一条语法。
// 随机的硬约束:
//   · 低音唱得出来 —— 根音跟着和弦走(级进/三度),半小节内固定音型;
//   · 和弦走「半小节网格」,B 段后半每半小节一动(和声节奏有变化,不平铺);
//   · 主旋律只在 B 段进(留白 > 堆料),旋律音 = 当下和弦的**和弦音**:动机按
//     「和弦音序号」写,音高随和弦换 → 什么调什么走向都不出和弦外音。
// 结构:8 小节一循环 = A 段 4 小节(鼓 + 贝斯 + 垫)/ B 段 4 小节(+ 主旋律、镲)。
// 迎战 jingle = **整 1 小节**(同调同速):定音鼓四击渐强 + 小军鼓滚奏 +
//   ♭VI → ♭VII 两记起句 → 主循环第 1 拍主和弦 + 镓落板 —— 听感是「号角拱进主题」,
//   不是两段拼接(衔接靠:同调、同速、jingle 以 ♭VII 起句落到循环的 i)。
// 回合结束(胜):抓下一条小节线**动态编一段收束**(♭VI → ♭VII → 主和弦重击 + 长尾)
//   再停;败 / 放弃按口径走 0.5s 淡出(「实在太难就淡出」的兜底,胜局用不着)。
// 音量:单层 0.03~0.2,层峰合计 ≈0.5,交给总线压缩收 —— 0 削波。
// 游戏倍速(sfxSetRate)不影响音乐:一变速,已排程的音符就错位。
//
// 对外:bossBgmPrep(生成 + 淡入,准备阶段的氛围)/ bossBgmBattle(jingle → 主循环)/
//      bossBgmEnd(收束或淡出)/ bossBgmStop(立刻收,菜单/局间用)。

import { sfxGraph } from './sfx';

type Mode = 'off' | 'prep' | 'jingle' | 'battle' | 'ending';

// ---- 和声素材(相对调根的半音;第五度放在 +12,垫声部自然成位)----
const CHORD: Record<string, number[]> = {
	i: [0, 3, 7],
	iv: [5, 8, 12],
	V: [7, 11, 14],
	bVI: [8, 12, 15],
	bVII: [10, 14, 17]
};

/** 8 小节 × 2 半小节的走向;'x' = 延续前半小节 */
const PROGS: string[][] = [
	// 史诗小调:i–i–♭VI–♭VII,尾句 ♭VI–V–i
	['i', 'x', 'i', 'x', 'bVI', 'x', 'bVII', 'x', 'i', 'x', 'i', 'x', 'bVI', 'V', 'i', 'x'],
	// 戏剧:i–iv–♭VI–V
	['i', 'x', 'iv', 'x', 'bVI', 'x', 'V', 'x', 'i', 'x', 'iv', 'x', 'bVI', 'bVII', 'i', 'x'],
	// 半音下行线(根音级进下行,最唱得出来)
	['i', 'x', 'bVII', 'x', 'bVI', 'x', 'V', 'x', 'i', 'x', 'bVII', 'x', 'bVI', 'V', 'i', 'x'],
	// 属持续收尾:后两小节 V 拉满,正好拱回循环头
	['i', 'x', 'i', 'x', 'bVI', 'x', 'bVII', 'x', 'i', 'x', 'iv', 'x', 'V', 'x', 'V', 'x']
];

// ---- 鼓组(16 分一小节)----
const KICKS = [
	[1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], // 四踩
	[1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0], // 半速
	[1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0] // 切分驱动
];
const SNARES = [
	[0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0]
];

// ---- 贝斯音型:半小节内 4 个 8 分,相对和弦根音的半音 ----
const BASS_LINES = [
	[0, 0, 7, 0],
	[0, 12, 0, 7],
	[0, 0, 12, 7]
];

// ---- 旋律动机(按和弦音序号:0=根 1=三 2=五 3=高八度根)----
type MotifNote = [number, number, number]; // [进拍(16 分), 和弦音序号, 时值(16 分)]
const MOTIFS: MotifNote[][] = [
	// 号角上行
	[
		[0, 0, 2],
		[2, 1, 2],
		[4, 2, 4],
		[8, 2, 2],
		[10, 3, 6]
	],
	// 下压
	[
		[0, 3, 2],
		[2, 2, 2],
		[4, 0, 4],
		[8, 1, 2],
		[10, 0, 6]
	],
	// 缠绕
	[
		[0, 1, 2],
		[2, 2, 2],
		[4, 1, 2],
		[6, 0, 2],
		[8, 2, 4],
		[12, 3, 4]
	]
];

interface Track {
	/** 调根相对 55Hz(A1)的半音数 */
	root: number;
	tempo: number;
	prog: string[];
	drums: number;
	bassLine: number;
	motif: number;
}

// ---- 运行状态 ----
let mode: Mode = 'off';
let track: Track | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let step = 0;
let nextAt = 0;
let out: GainNode | null = null;

const LOOP_STEPS = 128; // 8 小节 × 16 分
const LOOKAHEAD = 0.15;

const generateTrack = (): Track => {
	const roots = [-3, 0, 3, 5, 8]; // 保证低音落在 46~87Hz 的整块里
	const pick = (n: number) => Math.floor(Math.random() * n);
	return {
		root: roots[pick(roots.length)],
		tempo: 128 + pick(33),
		prog: PROGS[pick(PROGS.length)],
		drums: pick(3),
		bassLine: pick(3),
		motif: pick(3)
	};
};

const hz = (semi: number) => 55 * Math.pow(2, semi / 12);

/** 第 s 个 16 分(循环内)落在哪个和弦上('x' 延续已在这里解掉) */
const chordAt = (s: number): number[] => {
	const prog = track!.prog;
	let i = Math.floor(s / 8) % 16;
	while (prog[i] === 'x') i--;
	return CHORD[prog[i]];
};

// ---- 合成原语(和 sfx.ts 同材质,只是音乐向的排布)----

function toneAt(freq: number, at: number, dur: number, type: OscillatorType, gain: number) {
	const g = sfxGraph();
	if (!g || !out) return;
	const o = g.ctx.createOscillator();
	const v = g.ctx.createGain();
	o.type = type;
	o.frequency.setValueAtTime(freq, at);
	v.gain.setValueAtTime(0, at);
	v.gain.linearRampToValueAtTime(gain, at + Math.min(0.015, dur * 0.25));
	v.gain.exponentialRampToValueAtTime(0.0008, at + dur);
	o.connect(v).connect(out);
	o.start(at);
	o.stop(at + dur + 0.02);
}

function noiseAt(at: number, dur: number, freq: number, q: number, gain: number) {
	const g = sfxGraph();
	if (!g || !out) return;
	const s = g.ctx.createBufferSource();
	s.buffer = g.noise;
	const f = g.ctx.createBiquadFilter();
	f.type = 'bandpass';
	f.frequency.value = freq;
	f.Q.value = q;
	const v = g.ctx.createGain();
	v.gain.setValueAtTime(gain, at);
	v.gain.exponentialRampToValueAtTime(0.0008, at + dur);
	s.connect(f).connect(v).connect(out);
	s.start(at, Math.random() * 0.3, dur + 0.02);
}

/** 定音鼓式低频一击(掷骰那套隆隆的近亲) */
function thump(at: number, gain: number) {
	const g = sfxGraph();
	if (!g || !out) return;
	const o = g.ctx.createOscillator();
	const v = g.ctx.createGain();
	o.type = 'sine';
	o.frequency.setValueAtTime(88, at);
	o.frequency.exponentialRampToValueAtTime(52, at + 0.14);
	v.gain.setValueAtTime(0.0001, at);
	v.gain.linearRampToValueAtTime(gain, at + 0.01);
	v.gain.exponentialRampToValueAtTime(0.0008, at + 0.16);
	o.connect(v).connect(out);
	o.start(at);
	o.stop(at + 0.2);
}

const bassAt = (at: number, semi: number, dur: number, gain = 0.1) => {
	const g = sfxGraph();
	if (!g || !out) return;
	const o = g.ctx.createOscillator();
	const f = g.ctx.createBiquadFilter();
	const v = g.ctx.createGain();
	o.type = 'sawtooth';
	o.frequency.setValueAtTime(hz(semi), at);
	f.type = 'lowpass';
	f.frequency.value = 320;
	f.Q.value = 0.7;
	v.gain.setValueAtTime(0, at);
	v.gain.linearRampToValueAtTime(gain, at + 0.01);
	v.gain.exponentialRampToValueAtTime(0.0008, at + dur);
	o.connect(f).connect(v).connect(out);
	o.start(at);
	o.stop(at + dur + 0.02);
};

/** 和弦垫:三和弦三个三角波一齐进,30ms 起音 */
const padAt = (at: number, semis: number[], dur: number, gain = 0.05) => {
	for (const s of semis) toneAt(hz(s + 12), at, dur, 'triangle', gain);
};

const leadAt = (at: number, semi: number, dur: number) => {
	toneAt(hz(semi + 12), at, dur, 'square', 0.055);
	toneAt(hz(semi), at, dur, 'triangle', 0.04);
};

const hatAt = (at: number, gain: number) => noiseAt(at, 0.03, 6400, 1.4, gain);
const snareAt = (at: number, gain: number) => {
	noiseAt(at, 0.07, 1900, 0.9, gain);
	thump(at, gain * 0.5);
};
const crashAt = (at: number, gain: number) => noiseAt(at, 0.45, 4200, 0.5, gain);

// ---- 逐 16 分:主循环的三层 + 旋律 ----

const scheduleStep = (at: number, s: number) => {
	if (!track || !out) return;
	const inBar = s % 16;
	const bar = Math.floor(s / 16);
	const battle = mode === 'battle';
	// 鼓(准备阶段只有稀疏的鼓皮,气氛而已)
	if (KICKS[track.drums][inBar]) thump(at, battle ? 0.18 : 0.09);
	if (battle && SNARES[track.drums][inBar]) snareAt(at, 0.07);
	if (inBar % 2 === 0) hatAt(at, (inBar % 4 === 0 ? 0.05 : 0.035) * (battle ? 1 : 0.7));
	// 贝斯:半小节内 4 个 8 分
	const half = s % 8;
	if (half % 2 === 0) {
		const r = chordAt(s)[0] + BASS_LINES[track.bassLine][half / 2];
		bassAt(at, r, 0.16, battle ? 0.1 : 0.07);
	}
	// 垫:每半小节一铺
	if (half === 0) padAt(at, chordAt(s), 0.34, battle ? 0.05 : 0.035);
	// 主旋律:只在 B 段(4~7 小节),末小节留半句白
	if (battle && bar >= 4) {
		for (const [n, toneIdx, dur] of MOTIFS[track.motif]) {
			if (inBar !== n) continue;
			if (bar === 7 && n >= 8) continue;
			const ch = chordAt(bar * 16 + n);
			const semi = toneIdx === 3 ? ch[0] + 12 : ch[toneIdx];
			leadAt(at, semi, (dur / 16) * (240 / track.tempo));
		}
	}
	// B 段起句加一记镲
	if (battle && inBar === 0 && (bar === 0 || bar === 4)) crashAt(at, 0.08);
};

// ---- 迎战 jingle:整 1 小节,同调同速,末尾 ♭VI→♭VII 起句拱进主题 ----

const scheduleJingle = (at: number) => {
	if (!track || !out) return;
	const beat = 60 / track.tempo;
	const r = track.root;
	// 定音鼓四击渐强
	for (let i = 0; i < 4; i++) thump(at + i * beat, 0.14 + i * 0.035);
	// 小军鼓滚奏(第 3 拍起到小节末)
	for (let i = 0; i < 8; i++) noiseAt(at + (2 + i / 4) * beat, 0.03, 1800, 1, 0.035 + i * 0.008);
	// ♭VI → ♭VII 两记起句(jingle 的最后一个和弦就是 ♭VII —— 落到循环第 1 拍的 i)
	const power = (t: number, semi: number) => {
		toneAt(hz(semi), t, beat * 0.45, 'sawtooth', 0.1);
		toneAt(hz(semi + 7), t, beat * 0.45, 'sawtooth', 0.08);
		toneAt(hz(semi + 12), t, beat * 0.45, 'sawtooth', 0.06);
	};
	power(at + 3 * beat, r + 8);
	power(at + 3.5 * beat, r + 10);
};

// ---- 动态收束:♭VI → ♭VII → 主和弦重击 + 长尾 ----

const scheduleEnding = (at: number) => {
	if (!track || !out) return;
	const beat = 60 / track.tempo;
	const r = track.root;
	const hit = (t: number, semi: number, final = false) => {
		thump(t, final ? 0.22 : 0.16);
		bassAt(t, semi, final ? 1.2 : beat * 0.8, 0.12);
		padAt(t, [semi, semi + 3, semi + 7], final ? 1.6 : beat * 0.8, 0.07);
		if (final) {
			crashAt(t, 0.12);
			// 收板长尾:低频一沉,像幕布落下来
			const g = sfxGraph();
			if (g && out) {
				const o = g.ctx.createOscillator();
				const v = g.ctx.createGain();
				o.type = 'sine';
				o.frequency.setValueAtTime(80, t);
				o.frequency.exponentialRampToValueAtTime(38, t + 0.9);
				v.gain.setValueAtTime(0.18, t);
				v.gain.exponentialRampToValueAtTime(0.0008, t + 1.1);
				o.connect(v).connect(out);
				o.start(t);
				o.stop(t + 1.15);
			}
		}
	};
	hit(at, r + 8); // ♭VI
	hit(at + beat, r + 10); // ♭VII
	hit(at + 2 * beat, r, true); // 主
};

// ---- 调度器 ----

const killTimer = () => {
	if (timer !== null) clearInterval(timer);
	timer = null;
};

const tick = () => {
	const g = sfxGraph();
	if (!g || !track) return;
	const stepDur = 15 / track.tempo; // 16 分音符
	while (nextAt < g.ctx.currentTime + LOOKAHEAD) {
		if (step % 16 === 0 && mode === 'jingle') {
			// 迎战 jingle 占满一小节;小节线切进主循环(同速 → 无缝)
			scheduleJingle(nextAt);
			step = (step + 16) % LOOP_STEPS;
			nextAt += 16 * stepDur;
			mode = 'battle';
			out?.gain.setTargetAtTime(1, g.ctx.currentTime, 0.08);
			continue;
		}
		if (step % 4 === 0 && mode === 'ending') {
			// 收束句从**拍点**起(≤1 拍的等待):♭VI–♭VII–i 三拍的落句,从哪拍进都站得住
			scheduleEnding(nextAt);
			mode = 'off';
			track = null;
			killTimer();
			return;
		}
		scheduleStep(nextAt, step);
		step = (step + 1) % LOOP_STEPS;
		nextAt += stepDur;
	}
};

const ensureOut = () => {
	const g = sfxGraph();
	if (!g) return null;
	if (!out) {
		out = g.ctx.createGain();
		out.connect(g.bus);
	}
	return g;
};

// ---- 对外 ----

/** 准备阶段:随机生成一首 Boss BGM 并淡入(低能量氛围版) */
export const bossBgmPrep = () => {
	const g = ensureOut();
	if (!g || !out) return;
	killTimer();
	track = generateTrack();
	mode = 'prep';
	step = 0;
	nextAt = g.ctx.currentTime + 0.12;
	out.gain.cancelScheduledValues(g.ctx.currentTime);
	out.gain.setValueAtTime(0.0001, g.ctx.currentTime);
	out.gain.setTargetAtTime(0.35, g.ctx.currentTime, 0.7); // 淡入
	timer = setInterval(tick, 30);
};

/** 点「迎战」:1 小节 jingle → 主循环整回合垫底 */
export const bossBgmBattle = () => {
	if (mode === 'battle' || mode === 'jingle' || mode === 'ending') return;
	const g = ensureOut();
	if (!g || !out) return;
	if (!track) track = generateTrack();
	mode = 'jingle';
	step = 0;
	nextAt = g.ctx.currentTime + 0.06;
	if (timer === null) timer = setInterval(tick, 30);
};

/**
 * 回合结束:胜 = 抓下一条小节线动态编一段收束再停;败 = 0.5s 淡出。
 * (淡出是用户认可的兜底,胜局走的是编出来的收束。)
 */
export const bossBgmEnd = (win: boolean) => {
	if (mode === 'off' || mode === 'ending') return;
	const g = sfxGraph();
	if (!win) {
		if (g && out) {
			out.gain.cancelScheduledValues(g.ctx.currentTime);
			out.gain.setTargetAtTime(0.0001, g.ctx.currentTime, 0.18);
		}
		mode = 'off';
		track = null;
		killTimer();
		return;
	}
	mode = 'ending'; // 调度器在下一条小节线把收束句编出来
	if (timer === null && track) timer = setInterval(tick, 30);
};

/** 立刻收掉(菜单 / 局间 / 离开页面)。收束句(ending)不拦 —— 让它落完再走 */
export const bossBgmStop = () => {
	if (mode === 'ending') return;
	if (mode === 'off' && !track) return;
	const g = sfxGraph();
	if (g && out) {
		out.gain.cancelScheduledValues(g.ctx.currentTime);
		out.gain.setTargetAtTime(0.0001, g.ctx.currentTime, 0.03);
	}
	mode = 'off';
	track = null;
	killTimer();
};
