// 中秋博饼 · Boss 战氛围乐(Web Audio 实时合成,每场随机生成,零素材)
//
// 口径:**隐秘的 ambient**,不是有节拍的 Boss 曲 —— 没有鼓、没有律动、没有旋律句;
// 悬停的持续低音 + 随机漂移的 sus 和声 + 零星的远处铃音 + 气流噪底。
// 唯一的「节奏」来自游戏本身:掷骰的 stinger 落在投掷那一瞬 —— 骰子就是打击乐。
// 和 sfx.ts 共用一张音频图(out → bus → master → destination):静音开关、
// 总线压缩(-18dB / 8:1)天然生效。整体音量压得很低 —— 它是**夜里的底**,不是主角。
//
// ── 音乐设计(music-craft:先写约束,再写音符)──────────────────────────────
// 色彩:sus2/add9 这类**不解决**的开放排列(悬置 = 「藏在暗处」),铃音里偶尔一个
//   ♭9(「不是完全安全」)。紧张度上来时加入根音上方**小二度的拍频**——
//   不加速、不加鼓,用不协和与密度把弦绷紧(ambient 的紧张语法)。
// 每场随机抽:调根(5 选)/ 铃音音池(8 选 5)/ 密度 / LFO 速度 —— 场场不同。
// **尽量避免 loop**(实时生成的优势就该用在这):
//   · 和声是**加权随机游走**(低紧张偏 i/♭VI/iv,高紧张偏 V/♭VII),没有循环序列;
//   · 持续低音每 9~16s 随机漂移 ±3~25 音分(走音感 = 活的);
//   · 铃音随机声像 ±0.6、随机八度、时而成簇(2~3 连)、时而长静默;
//   · 垫声部每段 5~15s 随机时值、随机转位 —— 两轮听到的不会是同一片声音。
// 紧张弧(每个 Tee 一只,越掷越紧):bossBgmTension(n) 随 Tee 递进 ——
//   小二度拍频声部渐入、铃音更密更亮更尖(♭9 概率升)、呼吸 LFO 加快、
//   气流噪底变亮、低频涌更频。回合末(结算)正好是最紧的一刻 → 收束句落下。
// 掷骰 stinger:bossBgmSting('throw') = 低频一沉 + 铃音双音(高紧张带小二度簇);
//   bossBgmSting('reroll') = 一记轻铃。音都取自当下和弦 → 和底噪同呼吸。
// 迎战 jingle = **揭示涌动**:sub 从底爬起 + 噪声 riser 上扫 2 秒 → 峰值一记深钟;
//   持续音全程不断 —— 峰值那记钟的尾音直接铺进「战斗层」,是「暗处的东西被惊动了」。
// 回合结束(胜):动态编的收束 —— 三记下行铃音(八度 → ♭7 → 五度)逐个落下,
//   垫声部收成开放五度,最后一记深钟 + 长尾散尽(约 5s),「缩回暗处」;
//   败 / 放弃走 1.2s 淡出(ambient 的淡出像雾散,不算将就)。
//
// 对外:bossBgmPrep / bossBgmBattle / bossBgmTension / bossBgmSting /
//      bossBgmEnd / bossBgmStop。

import { sfxGraph } from './sfx';

type Mode = 'off' | 'prep' | 'jingle' | 'battle' | 'ending';

// ---- 和声素材(相对调根的半音;sus/add9 = 不解决的开放排列)----
const VOICE: Record<string, number[]> = {
	i: [0, 2, 7], // sus2:根 + 九 + 五 —— 空、悬
	bVI: [8, 10, 15], // ♭VI add9
	bVII: [10, 15, 17], // ♭VII(根 + 五 + ♭7)
	iv: [5, 7, 12], // iv add9
	V: [7, 11, 14] // 和声小调的 V(导音 —— 紧张时的常客)
};
const CHORD_KEYS = Object.keys(VOICE);
/** 随机游走权重:索引顺序 = CHORD_KEYS。低紧张偏稳定位,高紧张偏张力位 */
const WALK_EASY = [3, 2, 1.5, 1.5, 0.6];
const WALK_TENSE = [1.5, 1, 2, 1, 2.5];

/** 铃音音池候选(相对调根):♭3/♭7 的暗色 + 少量张力位 */
const CHIME_CANDIDATES = [12, 15, 19, 22, 24, 26, 27, 29];

interface Track {
	/** 调根相对 55Hz(A1)的半音数 */
	root: number;
	chimes: number[];
	/** 每秒出铃基准概率 */
	density: number;
	/** 呼吸/漂移 LFO 的速度系数 */
	driftRate: number;
}

// ---- 运行状态 ----
let mode: Mode = 'off';
let track: Track | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let out: GainNode | null = null;
/** 常驻层(持续音/气流/拍频)—— 停的时候要整组拆掉 */
let living: { stop: (at: number) => void }[] = [];
let breathLfos: { osc: OscillatorNode; base: number }[] = [];
let droneOscs: { osc: OscillatorNode; base: number }[] = [];
let dissonGain: GainNode | null = null;
let airFilter: BiquadFilterNode | null = null;
let tension = 0; // 0..5(按 Tee 递进)
let chordKey = 'i';
let nextEventAt = 0;
let nextChordAt = 0;
let nextWanderAt = 0;
let jingleEndsAt = 0;

const LOOKAHEAD = 0.8;

const generateTrack = (): Track => {
	const roots = [-3, 0, 3, 5, 8]; // 低音落在 46~87Hz 的整块里
	const pick = (n: number) => Math.floor(Math.random() * n);
	const pool = [...CHIME_CANDIDATES];
	const chimes: number[] = [];
	for (let i = 0; i < 5; i++) chimes.push(pool.splice(pick(pool.length), 1)[0]);
	return {
		root: roots[pick(roots.length)],
		chimes,
		density: 0.5 + Math.random() * 0.5,
		driftRate: 0.7 + Math.random() * 0.7
	};
};

const hz = (semi: number) => 55 * Math.pow(2, semi / 12);
const t01 = () => Math.min(1, tension / 5);

// ---- 合成原语 ----

/** 慢起慢落的持续音(pad / drone 的单声) */
function swellTone(
	freq: number,
	at: number,
	dur: number,
	gain: number,
	type: OscillatorType = 'sine',
	attack = 1.2
) {
	const g = sfxGraph();
	if (!g || !out) return;
	const o = g.ctx.createOscillator();
	const v = g.ctx.createGain();
	o.type = type;
	o.frequency.setValueAtTime(freq, at);
	v.gain.setValueAtTime(0, at);
	v.gain.linearRampToValueAtTime(gain, at + attack);
	v.gain.setValueAtTime(gain, at + Math.max(attack, dur * 0.55));
	v.gain.exponentialRampToValueAtTime(0.0006, at + dur);
	o.connect(v).connect(out);
	o.start(at);
	o.stop(at + dur + 0.05);
}

/** 铃音:基音 + 两个非整数泛音,长衰减,随机声像 —— 「远处有人碰了一下风铃」 */
function bellAt(at: number, semi: number, gain = 0.07) {
	const g = sfxGraph();
	if (!g || !out) return;
	const f0 = hz(semi + 12);
	const pan = g.ctx.createStereoPanner();
	pan.pan.value = Math.random() * 1.2 - 0.6;
	pan.connect(out);
	const partials: [number, number, number][] = [
		[1, gain, 3.2],
		[2.76, gain * 0.35, 1.8],
		[5.4, gain * 0.14, 0.9]
	];
	for (const [mult, gv, dur] of partials) {
		const o = g.ctx.createOscillator();
		const v = g.ctx.createGain();
		o.type = 'sine';
		o.frequency.setValueAtTime(f0 * mult, at);
		v.gain.setValueAtTime(0, at);
		v.gain.linearRampToValueAtTime(gv, at + 0.008);
		v.gain.exponentialRampToValueAtTime(0.0004, at + dur);
		o.connect(v).connect(pan);
		o.start(at);
		o.stop(at + dur + 0.05);
	}
}

/** 低频涌:从底爬起来又沉回去(sub swell) */
function subSwell(at: number, dur: number, gain = 0.1) {
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

// ---- 常驻层(进/出各一次)----

const startLayers = () => {
	const g = sfxGraph();
	if (!g || !out || !track) return;
	const now = g.ctx.currentTime;
	const root = track.root;
	// 持续低音:根 + 五度,各自带呼吸 LFO(慢得像风;紧张时呼吸变急)
	const drone = (semi: number, base: number, lfoHz: number) => {
		const o = g.ctx.createOscillator();
		const v = g.ctx.createGain();
		const lfo = g.ctx.createOscillator();
		const lfoGain = g.ctx.createGain();
		o.type = 'sine';
		o.frequency.value = hz(semi);
		v.gain.value = 0.0001;
		v.gain.linearRampToValueAtTime(base, now + 3);
		lfo.type = 'sine';
		lfo.frequency.value = lfoHz * track!.driftRate;
		lfoGain.gain.value = base * 0.4;
		lfo.connect(lfoGain).connect(v.gain);
		o.connect(v).connect(out!);
		o.start(now);
		lfo.start(now);
		droneOscs.push({ osc: o, base: hz(semi) });
		breathLfos.push({ osc: lfo, base: lfoHz * track!.driftRate });
		return {
			stop: (at: number) => {
				v.gain.cancelScheduledValues(at);
				gainSilence(v, at);
				o.stop(at + 1.5);
				lfo.stop(at + 1.5);
			}
		};
	};
	living.push(drone(root, 0.05, 0.07));
	living.push(drone(root + 7, 0.03, 0.05));
	// 小二度拍频声部(紧张度控制音量):根音上方半音 + 4 音分差 → 不安的「嗡」
	{
		const mk = (cents: number) => {
			const o = g.ctx.createOscillator();
			o.type = 'sine';
			o.frequency.value = hz(root + 1) * Math.pow(2, cents / 1200);
			return o;
		};
		const v = g.ctx.createGain();
		const a = mk(0);
		const b = mk(4);
		v.gain.value = 0.0001;
		a.connect(v);
		b.connect(v);
		v.connect(out);
		a.start(now);
		b.start(now);
		dissonGain = v;
		living.push({
			stop: (at: number) => {
				gainSilence(v, at);
				a.stop(at + 1.5);
				b.stop(at + 1.5);
				dissonGain = null;
			}
		});
	}
	// 气流噪底:带通中心慢游(紧张时变亮)—— 「夜里有穿堂风」
	{
		const src = g.ctx.createBufferSource();
		src.buffer = g.noise;
		src.loop = true;
		const f = g.ctx.createBiquadFilter();
		const v = g.ctx.createGain();
		const lfo = g.ctx.createOscillator();
		const lfoGain = g.ctx.createGain();
		f.type = 'bandpass';
		f.frequency.value = 900;
		f.Q.value = 0.6;
		v.gain.value = 0.0001;
		v.gain.linearRampToValueAtTime(0.01, now + 4);
		lfo.type = 'sine';
		lfo.frequency.value = 0.03 * track!.driftRate;
		lfoGain.gain.value = 450;
		lfo.connect(lfoGain).connect(f.frequency);
		src.connect(f).connect(v).connect(out);
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

const gainSilence = (v: GainNode, at: number) => {
	v.gain.cancelScheduledValues(at);
	v.gain.setTargetAtTime(0.0001, at, 0.35);
};

const stopLayers = (at: number) => {
	for (const l of living) l.stop(at);
	living = [];
	breathLfos = [];
	droneOscs = [];
};

/** 紧张度落到声部上(音量/LFO 速度/噪底亮度) */
const applyTension = () => {
	const g = sfxGraph();
	if (!g) return;
	const now = g.ctx.currentTime;
	const t = t01();
	dissonGain?.gain.setTargetAtTime(0.004 + t * 0.024, now, 0.8);
	for (const { osc, base } of breathLfos)
		osc.frequency.setTargetAtTime(base * (1 + t * 0.8), now, 1);
	airFilter?.frequency.setTargetAtTime(900 + t * 900, now, 1.5);
};

// ---- 和声:加权随机游走(没有循环序列)----

const walkChord = () => {
	const w = (tension >= 3 ? WALK_TENSE : WALK_EASY).slice();
	const i = CHORD_KEYS.indexOf(chordKey);
	w[i] *= 0.25; // 不原地打转
	const total = w.reduce((a, b) => a + b, 0);
	let r = Math.random() * total;
	for (let k = 0; k < w.length; k++) {
		r -= w[k];
		if (r <= 0) return CHORD_KEYS[k];
	}
	return CHORD_KEYS[0];
};

// ---- 稀疏事件(无网格:随机空窗,成簇或长静默)----

const scheduleEvent = (at: number) => {
	if (!track) return;
	const battle = mode === 'battle';
	const t = t01();
	const r = Math.random();
	const ch = VOICE[chordKey];
	if (r < track.density * (battle ? 0.6 : 0.32) + t * 0.2) {
		// 铃音:和弦音为主、张力位(♭9 那种)随紧张度升;偶尔成簇(2~3 连)
		const tense = Math.random() < 0.08 + t * 0.22;
		const pickNote = () => {
			const semi = tense ? 26 : ch[Math.floor(Math.random() * ch.length)];
			const oct = Math.random() < t * 0.45 ? 12 : 0;
			return semi + oct;
		};
		bellAt(at, pickNote(), (battle ? 0.08 : 0.055) * (0.7 + Math.random() * 0.6));
		const cluster = Math.random() < 0.22 ? 1 + Math.floor(Math.random() * 2) : 0;
		for (let i = 0; i < cluster; i++)
			bellAt(at + 0.09 + i * (0.07 + Math.random() * 0.12), pickNote(), 0.035);
	} else if (r > 0.95 - t * 0.03) {
		subSwell(at, 6 + Math.random() * 4, (battle ? 0.11 : 0.07) * (0.8 + t * 0.4));
	}
};

// ---- 掷骰 stinger:骰子就是打击乐 ----

/** 'throw' = 投掷瞬间(低频一沉 + 铃音双音);'reroll' = 一记轻铃 */
export const bossBgmSting = (kind: 'throw' | 'reroll') => {
	if (mode === 'off' || mode === 'ending' || !track) return;
	const g = ensureOut();
	if (!g) return;
	const at = g.ctx.currentTime + 0.02;
	const ch = VOICE[chordKey];
	const t = t01();
	if (kind === 'throw') {
		subSwell(at, 1.4, 0.09 + t * 0.04);
		bellAt(at, ch[2], 0.05 + t * 0.03);
		// 紧张起来以后,第二记直接怼半音(小二度簇)
		bellAt(at + 0.05 + Math.random() * 0.06, t >= 3 ? ch[0] + 1 : ch[0], 0.04);
	} else {
		bellAt(at, ch[Math.floor(Math.random() * ch.length)], 0.03);
	}
};

/** 每只 Tee 开掷时递进(0..5):越掷越紧 */
export const bossBgmTension = (level: number) => {
	if (mode === 'off') return;
	tension = Math.max(0, Math.min(5, level));
	applyTension();
};

// ---- 迎战 jingle:「揭示涌动」(持续音不断,涌起 → 峰值一记深钟)----

const scheduleJingle = (at: number) => {
	if (!track || !out) return;
	const root = track.root;
	subSwell(at, 2.4, 0.14);
	const g = sfxGraph();
	if (g && out) {
		const src = g.ctx.createBufferSource();
		src.buffer = g.noise;
		const f = g.ctx.createBiquadFilter();
		const v = g.ctx.createGain();
		f.type = 'bandpass';
		f.frequency.setValueAtTime(300, at);
		f.frequency.exponentialRampToValueAtTime(3200 + Math.random() * 2000, at + 2.1);
		f.Q.value = 2;
		v.gain.setValueAtTime(0.0001, at);
		v.gain.linearRampToValueAtTime(0.05, at + 2.0);
		v.gain.exponentialRampToValueAtTime(0.0004, at + 2.6);
		src.connect(f).connect(v).connect(out);
		src.start(at, Math.random() * 0.3, 2.8);
	}
	bellAt(at + 2.1, root - 12, 0.13);
	bellAt(at + 2.1, root + 7, 0.05);
	jingleEndsAt = at + 2.3;
};

// ---- 动态收束:三记下行铃音 + 垫声部收成开放五度 + 深钟长尾 ----

const scheduleEnding = (at: number) => {
	if (!track || !out) return;
	const root = track.root;
	// 紧张到最后的局,收束前先「挣一下」:一记小二度簇,再沉下去
	if (tension >= 3) {
		bellAt(at, root + 1, 0.06);
		bellAt(at + 0.1, root, 0.05);
	}
	bellAt(at + 0.4, root + 12, 0.09);
	bellAt(at + 1.4, root + 10, 0.08);
	bellAt(at + 2.4, root + 7, 0.08);
	swellTone(hz(root), at + 1.6, 4.5, 0.035, 'sine', 1.4);
	swellTone(hz(root + 7), at + 1.6, 4.5, 0.025, 'sine', 1.6);
	bellAt(at + 3.6, root, 0.12);
	bellAt(at + 3.6, root - 12, 0.07);
	stopLayers(at + 3.8); // 持续音在深钟落下后散尽
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
	// 和声漂移:每 5~15s 随机游走一格(没有循环序列)
	if (now + LOOKAHEAD >= nextChordAt) {
		chordKey = walkChord();
		const t = Math.max(now + 0.05, nextChordAt);
		const ch = VOICE[chordKey];
		for (const s of ch)
			swellTone(
				hz(s + 12) * (Math.random() < 0.3 ? 0.5 : 1),
				t,
				5 + Math.random() * 10,
				0.028,
				'triangle',
				2.2
			);
		nextChordAt = t + 5 + Math.random() * 10;
	}
	// 持续低音走音漂移(活的感觉,也破掉机械循环感)
	if (now + LOOKAHEAD >= nextWanderAt) {
		for (const { osc, base } of droneOscs) {
			const cents = Math.random() * 22 - 8; // -8 ~ +14 音分的随机游走
			osc.frequency.setTargetAtTime(base * Math.pow(2, cents / 1200), now, 4);
		}
		nextWanderAt = now + 9 + Math.random() * 7;
	}
	// 稀疏事件(铃音簇 / 低频涌)
	while (nextEventAt < now + LOOKAHEAD) {
		if (mode !== 'ending') scheduleEvent(Math.max(now + 0.05, nextEventAt));
		// 空窗拉得更开:0.6~6.4s,偶尔长静默 —— 不会有可辨识的节拍型
		const gap = 0.6 + Math.pow(Math.random(), 1.6) * 5.8;
		nextEventAt = Math.max(now, nextEventAt) + gap;
	}
	// 迎战 jingle 的尾巴到了 → 加厚进「战斗层」
	if (mode === 'jingle' && now >= jingleEndsAt) {
		mode = 'battle';
		out?.gain.setTargetAtTime(0.42 + t01() * 0.06, now, 0.6);
		bellAt(now + 0.05, VOICE[chordKey][2] + 24, 0.05); // 开场一记亮铃
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

/** 准备阶段:随机生成一片 Boss 氛围并淡入(更稀、更暗) */
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
	out.gain.setTargetAtTime(0.22, now, 1.1); // 淡入
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

/**
 * 回合结束:胜 = 动态编的收束(三记下行铃音 + 深钟长尾,约 5s「缩回暗处」);
 * 败 = 1.2s 淡出(ambient 的淡出像雾散,不算将就)。
 */
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
	mode = 'ending'; // 调度器不再出铃音,收束句一次性排出去
	scheduleEnding(g.ctx.currentTime + 0.1);
	out.gain.setTargetAtTime(0.3, g.ctx.currentTime, 0.5);
	setTimeout(teardown, 6200); // 尾音散完再拆干净
	killTimer();
};

/** 立刻收掉(菜单 / 局间 / 离开页面)。收束句(ending)不拦 —— 让它落完再走 */
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
