// 中秋博饼 · Boss 战月影氛围乐(Web Audio 实时合成,每场随机生成,零素材)
//
// 口径:**隐秘的月影 ambient**,不是有节拍的 Boss 曲 —— 没有鼓、没有律动;
// 悬停的五度持续音 + 五声月光铃 + 缓慢漂移的开放和声 + 合成混响的夜空。
// 唯一的「节奏」来自游戏:掷骰 stinger 落在投掷那一瞬 —— 骰子就是打击乐。
// 和 sfx.ts 共用一张音频图(out → bus → master):静音开关/总线压缩天然生效。
//
// ── 做过功课之后定的音乐设计(参考见下)────────────────────────────────────
// 月影色彩 = Eno《Apollo: Atmospheres》(登月纪录片配乐,月球感 ambient 的正典)
//   ×《春江花月夜》《平湖秋月》的中国月夜语法:
//   · **五声音阶**(宫商角徵羽)—— 开阔、流、纯,不诡异(诡异感来自小二度簇和 ♭9,
//     那是《惊魂记》《湮灭》的恐怖语法,只在高紧张时以「事件」出现,不做持续音);
//   · **开放和声**(根 + 五 + 九,不放三度)= 和声模糊,什么来了都不打架;
//   · **泛音/刮奏**音色:古筝泛音式的纯铃 + 骰子抛出的五声刮奏(大珠小珠落玉盘);
//   · **留白**:事件稀疏、长静默,底噪只做夜的「底」。
// Pad 三要素(Northern Valley Audio:shimmer / warmth / movement):
//   · shimmer:八度上纯音微光层 + 铃音穿长混响(「光落在水面上」,感到而听不到);
//   · warmth:根音区三角波双振子微失谐(±3 音分的「胖」,不是拍频),慢起音 blooming;
//   · movement:0.03/0.05/0.1Hz 三个不同速率的 LFO 叠着走,耳朵不会听腻。
// 混响 = 这片月色的「身体」(MusicTech:Eno/Lanois 用混响当音色本体):
//   合成 IR 的 ConvolverNode(3.6s 指数衰减、低通去金属感、双声道去相关)+ 小预延迟
//   —— 干音只占三成,声音有了夜空的体积,单薄/诡异感随之消失。
// 每场随机:调根(5 选)/ 铃音音池 / 密度 / LFO 速度;和声是**加权随机游走**(无循环),
//   持续音每 9~16s 随机漂 ±3~25 音分,铃音随机声像/成簇/长静默 —— 两轮不会听到同一片。
//
// 紧张(电影声音设计共识:「动态对比才是紧张,恒响只是噪音」):
//   · 每只 Tee 递进(bossBgmTension):微光层渐亮、铃音更密更亮、五声里偶尔混一记
//     「变徵」(♭7 外的偏音,低概率)= 影子渐深;
//   · tremolo 颤音(tension≥2):高频对音 5~7Hz 颤抖 ——《惊魂记》的「抖」,但音高协和;
//   · 持续音随紧张**缓爬**音高(+0~14 音分)+ 底层音量渐起;
//   · 不协和簇只作**事件**(tension≥3 偶发的小二度 swell,慢起慢落、不解决);
//   · stinger 前的 micro-duck(击打前 90ms 的一点静默,让落点更响)。
// 掷骰 stinger(工艺:SonalSystem/Berklee —— 1 秒内、快起快收、和声模糊、频谱铺满、
//   **同一触发点多变体**免得听腻):
//   'throw' 三变体随机:①五声刮奏(5~7 颗铃珠滚落,大珠小珠落玉盘)②sub 一沉 + 八度
//   双 glint ③glint 三连 + 气声;均含 sub/中频/高频三层;末尾还带**落定一击**
//   (骰子定格那一刻的闷响 + 轻铃),tension≥3 再怼一记变徵边音。
//   'reroll' = 一颗高 glint(快收)。
// 迎战 jingle = 「揭示涌动」:sub 爬起 + 柔光 riser 上扫 → 峰值深钟 + 五声刮奏进主题。
// 回合结束(胜)= 动态收束:五声下行(do→la→sol)三记 + 开放五度收拢 + 深钟长尾,
//   高紧张的局先「挣一下」再沉;败 = 1.2s 淡出。
//
// 参考:Apollo: Atmospheres and Soundtracks(Eno/Lanois)· 春江花月夜/平湖秋月(五声、
//   留白、泛音、刮奏)· Northern Valley Audio「shimmer/warmth/movement」·
//   SonalSystem/Berklee stinger 工艺 · Duende/Bluezone 的 tension 分层(drone/riser/
//   impact/dynamics)· phys.org 关于恐怖配乐语法(小二度簇/tremolo/突响)的综述。

import { sfxGraph } from './sfx';

type Mode = 'off' | 'prep' | 'jingle' | 'battle' | 'ending';

// ---- 和声素材(相对调根;开放 shell = 根 + 五 + 九,不放三度 → 和声模糊)----
const VOICE: Record<string, number[]> = {
	i: [0, 7, 14],
	IV: [5, 12, 17],
	ii: [2, 9, 16],
	vi: [9, 16, 21],
	V: [7, 14, 17] // 挂四的属 —— 悬而不决
};
const CHORD_KEYS = Object.keys(VOICE);
/** 随机游走权重:索引顺序 = CHORD_KEYS。低紧张偏宫,高紧张偏属 */
const WALK_EASY = [3, 2, 1.5, 2, 0.8];
const WALK_TENSE = [1.5, 1, 1.5, 1, 2.5];

/** 五声音阶池(宫商角徵羽 + 两轮八度):0 2 4 7 9 */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
/** 「影子」偏音(高紧张低概率):清角/变徵那一类 */
const EDGE_NOTES = [5, 11, 23];

interface Track {
	/** 调根相对 55Hz(A1)的半音数 */
	root: number;
	/** 铃音音池(从五声池抽 6 个,两轮八度内) */
	chimes: number[];
	density: number;
	driftRate: number;
}

// ---- 运行状态 ----
let mode: Mode = 'off';
let track: Track | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let out: GainNode | null = null; // bgm 总控(音量/淡入淡出)
let bed: GainNode | null = null; // 底噪层(stinger 前 micro-duck 这层)
let revIn: GainNode | null = null;
let living: { stop: (at: number) => void }[] = [];
let breathLfos: { osc: OscillatorNode; base: number }[] = [];
let droneOscs: { osc: OscillatorNode; base: number; cents: number }[] = [];
let shimmerGain: GainNode | null = null;
let tremGain: GainNode | null = null; // 颤音(shiver)声部
let airFilter: BiquadFilterNode | null = null;
let tension = 0; // 0..5(按 Tee 递进)
let chordKey = 'i';
let nextEventAt = 0;
let nextChordAt = 0;
let nextWanderAt = 0;
let jingleEndsAt = 0;

const LOOKAHEAD = 0.8;

const generateTrack = (): Track => {
	const roots = [-3, 0, 3, 5, 8];
	const pick = (n: number) => Math.floor(Math.random() * n);
	const pool = [...PENTA];
	const chimes: number[] = [];
	for (let i = 0; i < 6; i++) chimes.push(pool.splice(pick(pool.length), 1)[0]);
	return {
		root: roots[pick(roots.length)],
		chimes,
		density: 0.55 + Math.random() * 0.5,
		driftRate: 0.7 + Math.random() * 0.7
	};
};

const hz = (semi: number) => 55 * Math.pow(2, semi / 12);
const t01 = () => Math.min(1, tension / 5);

// ---- 合成 IR 的长混响(月色的「身体」)----

const makeImpulse = (ctx: AudioContext, seconds = 3.6): AudioBuffer => {
	const len = Math.floor(ctx.sampleRate * seconds);
	const buf = ctx.createBuffer(2, len, ctx.sampleRate);
	for (let ch = 0; ch < 2; ch++) {
		const d = buf.getChannelData(ch);
		// 指数衰减的去相关噪声 + 一节低通(去金属感)—— 比裸噪声尾柔和得多
		let lp = 0;
		for (let i = 0; i < len; i++) {
			const env = Math.pow(1 - i / len, 2.6);
			lp += 0.22 * (Math.random() * 2 - 1 - lp);
			d[i] = lp * env * 1.8;
		}
	}
	return buf;
};

// ---- 合成原语 ----

/** 慢起慢落的持续音(pad / drone 单声) */
function swellTone(
	freq: number,
	at: number,
	dur: number,
	gain: number,
	type: OscillatorType = 'sine',
	attack = 1.2
) {
	const g = sfxGraph();
	if (!g || !bed) return;
	const o = g.ctx.createOscillator();
	const v = g.ctx.createGain();
	o.type = type;
	o.frequency.setValueAtTime(freq, at);
	v.gain.setValueAtTime(0, at);
	v.gain.linearRampToValueAtTime(gain, at + attack);
	v.gain.setValueAtTime(gain, at + Math.max(attack, dur * 0.55));
	v.gain.exponentialRampToValueAtTime(0.0006, at + dur);
	o.connect(v).connect(bed);
	o.start(at);
	o.stop(at + dur + 0.05);
}

/** 月光铃:基音 + 两个**整数**泛音(泛音式纯铃,不诡异)+ 长尾走混响 */
function bellAt(at: number, semi: number, gain = 0.1, dur = 2.2) {
	const g = sfxGraph();
	if (!g || !out) return;
	const f0 = hz(semi + 12);
	const pan = g.ctx.createStereoPanner();
	pan.pan.value = Math.random() * 1.2 - 0.6;
	pan.connect(out);
	const partials: [number, number, number][] = [
		[1, gain, dur],
		[2, gain * 0.3, dur * 0.55],
		[3, gain * 0.12, dur * 0.35]
	];
	for (const [mult, gv, dec] of partials) {
		const o = g.ctx.createOscillator();
		const v = g.ctx.createGain();
		o.type = 'sine';
		o.frequency.setValueAtTime(f0 * mult, at);
		v.gain.setValueAtTime(0, at);
		v.gain.linearRampToValueAtTime(gv, at + 0.006);
		v.gain.exponentialRampToValueAtTime(0.0004, at + dec);
		o.connect(v).connect(pan);
		o.start(at);
		o.stop(at + dec + 0.05);
	}
}

/** 变徵边音(高紧张的影子):小二度对音,慢起慢落、不解决 */
function edgeSwell(at: number, dur = 3.5) {
	const g = sfxGraph();
	if (!g || !bed || !track) return;
	const r = track.root;
	for (const semi of [r + 11, r + 12]) swellTone(hz(semi), at, dur, 0.016, 'triangle', 1.4);
}

/** 低频涌:从底爬起来又沉回去 */
function subSwell(at: number, dur: number, gain = 0.12) {
	const g = sfxGraph();
	if (!g || !out) return;
	const o = g.ctx.createOscillator();
	const v = g.ctx.createGain();
	o.type = 'sine';
	o.frequency.setValueAtTime(38, at);
	o.frequency.exponentialRampToValueAtTime(58, at + dur * 0.7);
	o.frequency.exponentialRampToValueAtTime(40, at + dur);
	v.gain.setValueAtTime(0.0001, at);
	v.gain.linearRampToValueAtTime(gain, at + dur * 0.7);
	v.gain.exponentialRampToValueAtTime(0.0004, at + dur);
	o.connect(v).connect(out);
	o.start(at);
	o.stop(at + dur + 0.05);
}

/** 五声刮奏(古筝刮奏的骰子版:一串铃珠滚落) */
function glissAt(at: number, up: boolean, gain = 0.06) {
	if (!track) return;
	const notes = [...track.chimes].sort((a, b) => a - b);
	if (up) notes.reverse();
	const n = 5 + Math.floor(Math.random() * 3);
	for (let i = 0; i < n; i++)
		bellAt(at + i * (0.045 + Math.random() * 0.035), notes[i % notes.length], gain, 0.9);
}

/** 落定一击:闷响 + 轻铃(骰子定格) */
function landAt(at: number, gain = 0.12) {
	const g = sfxGraph();
	if (!g || !out || !track) return;
	const o = g.ctx.createOscillator();
	const v = g.ctx.createGain();
	o.type = 'sine';
	o.frequency.setValueAtTime(78, at);
	o.frequency.exponentialRampToValueAtTime(50, at + 0.12);
	v.gain.setValueAtTime(0.0001, at);
	v.gain.linearRampToValueAtTime(gain, at + 0.008);
	v.gain.exponentialRampToValueAtTime(0.0006, at + 0.18);
	o.connect(v).connect(out);
	o.start(at);
	o.stop(at + 0.25);
	bellAt(at, VOICE[chordKey][0] + 7, 0.05, 1.2);
}

// ---- 常驻层(进/出各一次)----

const gainSilence = (v: GainNode, at: number) => {
	v.gain.cancelScheduledValues(at);
	v.gain.setTargetAtTime(0.0001, at, 0.35);
};

const startLayers = () => {
	const g = sfxGraph();
	if (!g || !bed || !out || !track) return;
	const now = g.ctx.currentTime;
	const root = track.root;
	// 持续低音:根 + 五度,三角波双振子 ±3 音分(warmth 的「胖」,不是拍频)+ 呼吸 LFO
	const drone = (semi: number, base: number, lfoHz: number) => {
		const v = g.ctx.createGain();
		v.gain.value = 0.0001;
		v.gain.linearRampToValueAtTime(base, now + 3);
		const oscs: OscillatorNode[] = [];
		for (const cents of [-3, 3]) {
			const o = g.ctx.createOscillator();
			o.type = 'triangle';
			o.frequency.value = hz(semi) * Math.pow(2, cents / 1200);
			o.connect(v);
			o.start(now);
			oscs.push(o);
			droneOscs.push({ osc: o, base: hz(semi), cents });
		}
		const lfo = g.ctx.createOscillator();
		const lfoGain = g.ctx.createGain();
		lfo.type = 'sine';
		lfo.frequency.value = lfoHz * track!.driftRate;
		lfoGain.gain.value = base * 0.35;
		lfo.connect(lfoGain).connect(v.gain);
		lfo.start(now);
		breathLfos.push({ osc: lfo, base: lfoHz * track!.driftRate });
		v.connect(bed!);
		return {
			stop: (at: number) => {
				gainSilence(v, at);
				for (const o of oscs) o.stop(at + 1.5);
				lfo.stop(at + 1.5);
			}
		};
	};
	living.push(drone(root, 0.09, 0.05));
	living.push(drone(root + 7, 0.06, 0.03));
	// shimmer 微光层:八度上的纯音,自带更慢的明灭(「光落在水面上」)
	{
		const v = g.ctx.createGain();
		v.gain.value = 0.0001;
		v.gain.linearRampToValueAtTime(0.02, now + 5);
		shimmerGain = v;
		const oscs: OscillatorNode[] = [];
		for (const semi of [root + 12, root + 19]) {
			const o = g.ctx.createOscillator();
			o.type = 'sine';
			o.frequency.value = hz(semi);
			o.connect(v);
			o.start(now);
			oscs.push(o);
		}
		const lfo = g.ctx.createOscillator();
		const lfoGain = g.ctx.createGain();
		lfo.type = 'sine';
		lfo.frequency.value = 0.1 * track!.driftRate;
		lfoGain.gain.value = 0.014;
		lfo.connect(lfoGain).connect(v.gain);
		lfo.start(now);
		v.connect(bed!);
		living.push({
			stop: (at: number) => {
				gainSilence(v, at);
				for (const o of oscs) o.stop(at + 1.5);
				lfo.stop(at + 1.5);
				shimmerGain = null;
			}
		});
	}
	// tremolo 颤音声部(紧张时才听得到的「抖」:协和音高的 AM 颤抖,不是小二度)
	{
		const v = g.ctx.createGain();
		v.gain.value = 0.0001;
		const o = g.ctx.createOscillator();
		o.type = 'sine';
		o.frequency.value = hz(root + 21); // 五声里的高音,协和
		const trem = g.ctx.createOscillator();
		const tremGainNode = g.ctx.createGain();
		trem.type = 'sine';
		trem.frequency.value = 5.5 + Math.random() * 1.5;
		tremGainNode.gain.value = 1; // 全深度 AM,绝对音量由 v 控制
		trem.connect(tremGainNode).connect(v.gain);
		o.connect(v);
		v.connect(bed!);
		o.start(now);
		trem.start(now);
		tremGain = v;
		living.push({
			stop: (at: number) => {
				gainSilence(v, at);
				o.stop(at + 1.5);
				trem.stop(at + 1.5);
				tremGain = null;
			}
		});
	}
	// 气流噪底:带通中心慢游(紧张时变亮)—— 夜里的穿堂风
	{
		const src = g.ctx.createBufferSource();
		src.buffer = g.noise;
		src.loop = true;
		const f = g.ctx.createBiquadFilter();
		const v = g.ctx.createGain();
		const lfo = g.ctx.createOscillator();
		const lfoGain = g.ctx.createGain();
		f.type = 'bandpass';
		f.frequency.value = 800;
		f.Q.value = 0.5;
		v.gain.value = 0.0001;
		v.gain.linearRampToValueAtTime(0.014, now + 4);
		lfo.type = 'sine';
		lfo.frequency.value = 0.03 * track!.driftRate;
		lfoGain.gain.value = 400;
		lfo.connect(lfoGain).connect(f.frequency);
		src.connect(f).connect(v).connect(bed!);
		src.start(now, Math.random() * 0.3);
		lfo.start(now);
		airFilter = f;
		living.push({
			stop: (at: number) => {
				gainSilence(v, at);
				src.stop(at + 1.2);
				lfo.stop(at + 1.2);
				airFilter = null;
			}
		});
	}
	applyTension();
};

const stopLayers = (at: number) => {
	for (const l of living) l.stop(at);
	living = [];
	breathLfos = [];
	droneOscs = [];
};

/** 紧张度落到声部上 */
const applyTension = () => {
	const g = sfxGraph();
	if (!g) return;
	const now = g.ctx.currentTime;
	const t = t01();
	shimmerGain?.gain.setTargetAtTime(0.02 + t * 0.03, now, 0.9);
	tremGain?.gain.setTargetAtTime(t < 0.4 ? 0 : 0.012 + (t - 0.4) * 0.03, now, 0.9);
	for (const { osc, base } of breathLfos)
		osc.frequency.setTargetAtTime(base * (1 + t * 0.8), now, 1);
	airFilter?.frequency.setTargetAtTime(800 + t * 1000, now, 1.5);
	out?.gain.setTargetAtTime(mode === 'battle' ? 0.8 + t * 0.08 : 0.5, now, 1.2);
};

// ---- 和声:加权随机游走(无循环序列)----

const walkChord = () => {
	const w = (tension >= 3 ? WALK_TENSE : WALK_EASY).slice();
	const i = CHORD_KEYS.indexOf(chordKey);
	w[i] *= 0.25;
	const total = w.reduce((a, b) => a + b, 0);
	let r = Math.random() * total;
	for (let k = 0; k < w.length; k++) {
		r -= w[k];
		if (r <= 0) return CHORD_KEYS[k];
	}
	return CHORD_KEYS[0];
};

// ---- 稀疏事件(无网格:随机空窗、成簇或长静默)----

const scheduleEvent = (at: number) => {
	if (!track) return;
	const battle = mode === 'battle';
	const t = t01();
	const r = Math.random();
	const ch = VOICE[chordKey];
	if (r < track.density * (battle ? 0.55 : 0.3) + t * 0.2) {
		// 月光铃:五声池为主;影子偏音(变徵)随紧张度偶尔一记
		const edge = Math.random() < t * 0.16;
		const pickNote = () =>
			edge
				? EDGE_NOTES[Math.floor(Math.random() * EDGE_NOTES.length)]
				: track!.chimes[Math.floor(Math.random() * track!.chimes.length)] +
					(Math.random() < t * 0.4 ? 12 : 0);
		bellAt(
			at,
			pickNote(),
			(battle ? 0.11 : 0.08) * (0.7 + Math.random() * 0.6),
			1.6 + Math.random()
		);
		const cluster = Math.random() < 0.22 ? 1 + Math.floor(Math.random() * 2) : 0;
		for (let i = 0; i < cluster; i++)
			bellAt(at + 0.09 + i * (0.07 + Math.random() * 0.12), pickNote(), 0.05, 1.2);
		if (Math.random() < 0.06) glissAt(at + 0.3, Math.random() < 0.5, 0.04);
	} else if (r > 0.94 - t * 0.03) {
		subSwell(at, 6 + Math.random() * 4, (battle ? 0.14 : 0.09) * (0.8 + t * 0.4));
	} else if (t >= 3 && r < 0.05 + t * 0.01) {
		edgeSwell(at, 3 + Math.random() * 2); // 影子:事件式小二度,不解决
	} else if (ch) {
		// 偶发泛音:极高、极轻的一颗(古筝泛音)
		bellAt(at, ch[1] + 24, 0.03, 2.4);
	}
};

// ---- 掷骰 stinger(工艺:1 秒内、快起快收、和声模糊、频谱铺满、多变体)----

/** micro-duck:落点前 90ms 把底噪压一点 —— 「击打前的静默才是紧张」 */
const duck = (at: number) => {
	if (!bed) return;
	const g = sfxGraph();
	if (!g) return;
	bed.gain.cancelScheduledValues(at);
	bed.gain.setTargetAtTime(0.35, at - 0.09, 0.02);
	bed.gain.setTargetAtTime(1, at + 0.02, 0.12);
};

/**
 * 'throw' = 出手 glint →(landIn 秒后)落定一击;'reroll' = 一颗高 glint。
 * 三个出手变体轮着随机(骰子掷多了也不带腻的);tension≥3 追一记变徵边音。
 */
export const bossBgmSting = (kind: 'throw' | 'reroll', landIn = 0.8) => {
	if (mode === 'off' || mode === 'ending' || !track) return;
	const g = ensureOut();
	if (!g) return;
	const at = g.ctx.currentTime + 0.015;
	const t = t01();
	if (kind === 'reroll') {
		bellAt(at, track.chimes[Math.floor(Math.random() * track.chimes.length)] + 12, 0.05, 0.7);
		return;
	}
	duck(at);
	const variant = Math.floor(Math.random() * 3);
	if (variant === 0) {
		// ① 五声刮奏:大珠小珠落玉盘
		glissAt(at, Math.random() < 0.5, 0.055 + t * 0.02);
	} else if (variant === 1) {
		// ② sub 一沉 + 八度双 glint(sub/中高/高 = 频谱铺满)
		subSwell(at, 0.7, 0.11 + t * 0.04);
		bellAt(at, VOICE[chordKey][0] + 12, 0.07, 1.0);
		bellAt(at + 0.06, VOICE[chordKey][0] + 24, 0.05, 0.8);
	} else {
		// ③ glint 三连 + 气声
		const notes = [...track.chimes].sort(() => Math.random() - 0.5).slice(0, 3);
		notes.forEach((n, i) => bellAt(at + i * 0.05, n, 0.06, 0.9));
		const g2 = sfxGraph();
		if (g2 && out) {
			const src = g2.ctx.createBufferSource();
			src.buffer = g2.noise;
			const f = g2.ctx.createBiquadFilter();
			const v = g2.ctx.createGain();
			f.type = 'bandpass';
			f.frequency.setValueAtTime(2500, at);
			f.frequency.exponentialRampToValueAtTime(6000, at + 0.25);
			v.gain.setValueAtTime(0.03, at);
			v.gain.exponentialRampToValueAtTime(0.0005, at + 0.3);
			src.connect(f).connect(v).connect(out);
			src.start(at, Math.random() * 0.3, 0.35);
		}
	}
	// 影子边音:紧张到后段,骰子都带着一丝不祥
	if (t >= 0.6) bellAt(at + 0.1, EDGE_NOTES[1], 0.035, 0.8);
	// 落定一击(骰子定格那一刻)
	landAt(at + Math.max(0.15, landIn), 0.1 + t * 0.05);
};

/** 每只 Tee 开掷时递进(0..5):越掷越紧 */
export const bossBgmTension = (level: number) => {
	if (mode === 'off') return;
	tension = Math.max(0, Math.min(5, level));
	applyTension();
};

// ---- 迎战 jingle:「揭示涌动」(持续音不断,涌起 → 深钟 + 五声刮奏进主题)----

const scheduleJingle = (at: number) => {
	if (!track || !out) return;
	const root = track.root;
	subSwell(at, 2.4, 0.16);
	const g = sfxGraph();
	if (g && out) {
		const src = g.ctx.createBufferSource();
		src.buffer = g.noise;
		const f = g.ctx.createBiquadFilter();
		const v = g.ctx.createGain();
		f.type = 'bandpass';
		f.frequency.setValueAtTime(400, at);
		f.frequency.exponentialRampToValueAtTime(3500 + Math.random() * 1500, at + 2.1);
		f.Q.value = 1.2;
		v.gain.setValueAtTime(0.0001, at);
		v.gain.linearRampToValueAtTime(0.04, at + 2.0);
		v.gain.exponentialRampToValueAtTime(0.0004, at + 2.6);
		src.connect(f).connect(v).connect(out);
		src.start(at, Math.random() * 0.3, 2.8);
	}
	bellAt(at + 2.1, root - 12, 0.14, 3.5);
	bellAt(at + 2.1, root + 7, 0.06, 2.5);
	glissAt(at + 2.2, false, 0.05); // 五声刮奏滚进主题
	jingleEndsAt = at + 2.4;
};

// ---- 动态收束:do→la→sol 五声下行 + 开放五度收拢 + 深钟长尾 ----

const scheduleEnding = (at: number) => {
	if (!track || !out) return;
	const root = track.root;
	if (tension >= 3) {
		// 影子到最后先「挣一下」,再归于月色
		edgeSwell(at, 2.2);
		bellAt(at + 0.1, EDGE_NOTES[1], 0.06, 1.2);
	}
	bellAt(at + 0.5, root + 12, 0.1, 2.8); // do
	bellAt(at + 1.5, root + 9, 0.09, 2.8); // la
	bellAt(at + 2.5, root + 7, 0.09, 2.8); // sol
	swellTone(hz(root), at + 1.8, 4.5, 0.05, 'sine', 1.4);
	swellTone(hz(root + 7), at + 1.8, 4.5, 0.035, 'sine', 1.6);
	bellAt(at + 3.8, root, 0.13, 4);
	bellAt(at + 3.8, root - 12, 0.08, 4);
	stopLayers(at + 4);
};

// ---- 调度器:每 120ms 看一眼,把 LOOKAHEAD 窗口里的事件排出去 ----

const killTimer = () => {
	if (timer !== null) clearInterval(timer);
	timer = null;
};

const tick = () => {
	const g = sfxGraph();
	if (!g || !track) return;
	const now = g.ctx.currentTime;
	// 和声漂移:每 5~15s 随机游走一格
	if (now + LOOKAHEAD >= nextChordAt) {
		chordKey = walkChord();
		const t = Math.max(now + 0.05, nextChordAt);
		const ch = VOICE[chordKey];
		for (const s of ch)
			swellTone(
				hz(s + 12) * (Math.random() < 0.3 ? 0.5 : 1),
				t,
				5 + Math.random() * 10,
				0.04,
				'triangle',
				2.2
			);
		nextChordAt = t + 5 + Math.random() * 10;
	}
	// 持续音漂移(紧张时**向上**爬 —— 无声的 riser)
	if (now + LOOKAHEAD >= nextWanderAt) {
		for (const { osc, base, cents } of droneOscs) {
			const drift = Math.random() * 22 - 8 + t01() * 14;
			osc.frequency.setTargetAtTime(base * Math.pow(2, (cents + drift) / 1200), now, 4);
		}
		nextWanderAt = now + 9 + Math.random() * 7;
	}
	// 稀疏事件(月光铃簇 / 低频涌 / 影子 swell)
	while (nextEventAt < now + LOOKAHEAD) {
		if (mode !== 'ending') scheduleEvent(Math.max(now + 0.05, nextEventAt));
		const gap = 0.6 + Math.pow(Math.random(), 1.6) * 5.8;
		nextEventAt = Math.max(now, nextEventAt) + gap;
	}
	// 迎战 jingle 的尾巴到了 → 加厚进「战斗层」
	if (mode === 'jingle' && now >= jingleEndsAt) {
		mode = 'battle';
		out?.gain.setTargetAtTime(0.8 + t01() * 0.08, now, 0.6);
		bellAt(now + 0.05, track.chimes[track.chimes.length - 1] + 12, 0.06, 1.5);
	}
};

const ensureOut = () => {
	const g = sfxGraph();
	if (!g) return null;
	if (!out) {
		const ctx = g.ctx;
		out = ctx.createGain();
		bed = ctx.createGain();
		// 混响链:revIn → Convolver(合成 IR)→ 和干声一起进 out 的下游(bus)
		revIn = ctx.createGain();
		const conv = ctx.createConvolver();
		conv.buffer = makeImpulse(ctx);
		const revOut = ctx.createGain();
		revOut.gain.value = 1.1;
		// 干/湿三七开 —— 混响是这片月色的「身体」
		bed.connect(out);
		bed.connect(revIn);
		revIn.connect(conv);
		conv.connect(revOut);
		revOut.connect(g.bus);
		out.connect(g.bus);
		out.connect(revIn); // 事件也走混响(铃音的长尾就来自这里)
	}
	return g;
};

const teardown = () => {
	const g = sfxGraph();
	const at = g ? g.ctx.currentTime : 0;
	stopLayers(at);
	mode = 'off';
	track = null;
	tension = 0;
	killTimer();
};

// ---- 对外 ----

/** 准备阶段:随机生成一片月影氛围并淡入 */
export const bossBgmPrep = () => {
	const g = ensureOut();
	if (!g || !out) return;
	teardown();
	track = generateTrack();
	mode = 'prep';
	tension = 0;
	chordKey = 'i';
	const now = g.ctx.currentTime;
	out.gain.cancelScheduledValues(now);
	out.gain.setValueAtTime(0.0001, now);
	out.gain.setTargetAtTime(0.5, now, 1.0); // 淡入
	startLayers();
	nextEventAt = now + 1.5 + Math.random() * 2;
	nextChordAt = now + 3 + Math.random() * 3;
	nextWanderAt = now + 9 + Math.random() * 7;
	timer = setInterval(tick, 120);
};

/** 点「迎战」:揭示涌动(持续音不断)→ 峰值起加厚 */
export const bossBgmBattle = () => {
	if (mode === 'battle' || mode === 'jingle' || mode === 'ending') return;
	const g = ensureOut();
	if (!g || !out) return;
	if (!track) {
		track = generateTrack();
		tension = 0;
		chordKey = 'i';
		startLayers();
		nextEventAt = g.ctx.currentTime + 2;
		nextChordAt = g.ctx.currentTime + 4;
		nextWanderAt = g.ctx.currentTime + 10;
	}
	mode = 'jingle';
	scheduleJingle(g.ctx.currentTime + 0.05);
	if (timer === null) timer = setInterval(tick, 120);
};

/** 回合结束:胜 = 五声下行的动态收束;败 = 1.2s 淡出 */
export const bossBgmEnd = (win: boolean) => {
	if (mode === 'off' || mode === 'ending') return;
	const g = sfxGraph();
	if (!g || !out) return;
	if (!win) {
		const now = g.ctx.currentTime;
		out.gain.cancelScheduledValues(now);
		out.gain.setTargetAtTime(0.0001, now, 0.4);
		stopLayers(now + 0.2);
		mode = 'off';
		track = null;
		tension = 0;
		killTimer();
		return;
	}
	mode = 'ending';
	scheduleEnding(g.ctx.currentTime + 0.1);
	out.gain.setTargetAtTime(0.6, g.ctx.currentTime, 0.5);
	setTimeout(teardown, 6400);
	killTimer();
};

/** 立刻收掉(菜单 / 局间 / 离开页面)。收束句不拦 —— 让它落完再走 */
export const bossBgmStop = () => {
	if (mode === 'ending') return;
	if (mode === 'off' && !track) return;
	const g = sfxGraph();
	if (g && out) {
		out.gain.cancelScheduledValues(g.ctx.currentTime);
		out.gain.setTargetAtTime(0.0001, g.ctx.currentTime, 0.05);
	}
	teardown();
};
