// 中秋博饼 · 音效引擎(Web Audio 实时合成,不带任何音频素材)
//
// 全部声音都是现场合成的,所以:
//   - 零素材、零加载、零体积
//   - 音调/复杂度可以跟着分数动态变化(这是「越刺激」的关键)
//
// 设计:
//   sfxStep      结算逐行 —— 音高随行号递升
//   sfxWin/Lose  过关 / 结束
//
// 只在点击「开始博饼」等动作时调用。

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bus: DynamicsCompressorNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;
let rate = 1;

export const sfxSetRate = (r: number) => {
	rate = Math.max(0.25, Math.min(4, r));
};
const R = () => 1 / rate;

const KEY = 'midautumn:sfx';

export const sfxLog: string[] = [];

export const sfxEnabled = () => enabled;

export const setSfxEnabled = (on: boolean) => {
	enabled = on;
	if (master && ctx) master.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.02);
	try {
		localStorage.setItem(KEY, on ? '1' : '0');
	} catch {
		// ignore
	}
};

export const loadSfxPref = () => {
	try {
		enabled = localStorage.getItem(KEY) !== '0';
	} catch {
		// ignore
	}
	return enabled;
};

export const initSfx = () => {
	if (typeof window === 'undefined') return;
	if (!ctx) {
		type WinAudio = Window & { webkitAudioContext?: typeof AudioContext };
		const AC = window.AudioContext ?? (window as WinAudio).webkitAudioContext;
		if (!AC) return;
		ctx = new AC();
		bus = ctx.createDynamicsCompressor();
		bus.threshold.value = -18;
		bus.ratio.value = 8;
		master = ctx.createGain();
		master.gain.value = enabled ? 0.5 : 0;
		bus.connect(master);
		master.connect(ctx.destination);

		const len = Math.floor(ctx.sampleRate * 0.6);
		noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
		const d = noiseBuf.getChannelData(0);
		for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
	}
	if (ctx.state === 'suspended') void ctx.resume();
};

const note = (semi: number) => 440 * Math.pow(2, semi / 12);
const log = (name: string) => {
	if (sfxLog.length < 60) sfxLog.push(name);
};

/** 单音:可带滑音 */
function tone(
	freq: number,
	at: number,
	dur: number,
	opts: { type?: OscillatorType; gain?: number; glideTo?: number } = {}
) {
	if (!ctx || !bus) return;
	const { type = 'triangle', gain = 0.25, glideTo } = opts;
	const o = ctx.createOscillator();
	const g = ctx.createGain();
	o.type = type;
	o.frequency.setValueAtTime(freq, at);
	if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), at + dur);
	g.gain.setValueAtTime(0, at);
	g.gain.linearRampToValueAtTime(gain, at + Math.min(0.012, dur * 0.2));
	g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
	o.connect(g).connect(bus);
	o.start(at);
	o.stop(at + dur + 0.02);
}

/** 噪声脉冲:骰子撞击 / 打击乐 */
function click(at: number, opts: { freq?: number; q?: number; dur?: number; gain?: number } = {}) {
	if (!ctx || !bus || !noiseBuf) return;
	const { freq = 1800, q = 1.2, dur = 0.05, gain = 0.3 } = opts;
	const s = ctx.createBufferSource();
	s.buffer = noiseBuf;
	s.playbackRate.value = 1;
	const f = ctx.createBiquadFilter();
	f.type = 'bandpass';
	f.frequency.value = freq;
	f.Q.value = q;
	const g = ctx.createGain();
	g.gain.setValueAtTime(gain, at);
	g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
	s.connect(f).connect(g).connect(bus);
	s.start(at, Math.random() * 0.3, dur + 0.02);
}

// ---- 各音效 ----

export const sfxRoll = (dur = 0.75, diceCount = 6) => {
	log('roll');
	initSfx();
	if (!ctx || !enabled) return;
	const t0 = ctx.currentTime + 0.01;
	const hits = Math.max(8, Math.round(dur * 26) + diceCount);
	for (let i = 0; i < hits; i++) {
		const p = i / hits;
		// 越接近落定越密、越响、越尖(像骰子慢慢停下来)
		const t = t0 + p * dur * 0.95 + Math.random() * 0.012;
		click(t, {
			freq: 900 + Math.random() * 1500 + p * 900,
			q: 1 + Math.random(),
			dur: 0.035 + Math.random() * 0.03,
			gain: (0.06 + p * 0.16) * (0.7 + Math.random() * 0.5)
		});
	}
	// 低频隆隆(桌面震动感)
	if (bus) {
		const o = ctx.createOscillator();
		const g = ctx.createGain();
		o.type = 'sine';
		o.frequency.setValueAtTime(90, t0);
		o.frequency.exponentialRampToValueAtTime(55, t0 + dur);
		g.gain.setValueAtTime(0.0001, t0);
		g.gain.linearRampToValueAtTime(0.16, t0 + 0.05);
		g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
		o.connect(g).connect(bus);
		o.start(t0);
		o.stop(t0 + dur + 0.02);
	}
};

export const sfxLevel = (score: number) => {
	log('level:' + score);
	initSfx();
	if (!ctx || !enabled) return;
	const t0 = ctx.currentTime + 0.01;
	// 分数 → 音区 / 音符数(0 分是下行闷响)
	const tier =
		score >= 2560
			? 8
			: score >= 1280
				? 7
				: score >= 960
					? 6
					: score >= 640
						? 5
						: score >= 480
							? 4
							: score >= 320
								? 3
								: score >= 160
									? 3
									: score >= 80
										? 2
										: score >= 40
											? 2
											: score >= 20
												? 1
												: score >= 10
													? 1
													: 0;
	if (tier === 0) {
		// 没中:下行小二度 + 闷响
		tone(note(-5), t0, 0.22 * R(), { type: 'sine', gain: 0.18, glideTo: note(-8) });
		click(t0, { freq: 300, q: 0.7, dur: 0.12 * R(), gain: 0.12 });
		return;
	}
	const root = note(-2 + tier * 1.6); // 档位越高整体越亮
	const scale = [0, 4, 7, 12, 16, 19, 24, 28, 31];
	const n = Math.min(scale.length, 1 + tier);
	for (let i = 0; i < n; i++) {
		const at = t0 + i * Math.max(0.028, (0.085 - tier * 0.005) * R());
		tone(root * Math.pow(2, scale[i] / 12), at, (0.16 + tier * 0.02) * R(), {
			type: tier >= 5 ? 'sawtooth' : 'triangle',
			gain: (tier >= 6 ? 0.2 : 0.16) * (1 - i * 0.06)
		});
	}
	// 高档位加闪光颗粒 + 低频冲击
	if (tier >= 5) {
		for (let i = 0; i < 6; i++)
			tone(root * 4 * Math.pow(2, (i * 3 + tier) / 12), t0 + (0.12 + i * 0.03) * R(), 0.1 * R(), {
				type: 'sine',
				gain: 0.07
			});
		tone(note(-24), t0, 0.3 * R(), { type: 'sine', gain: 0.22, glideTo: note(-30) });
	}
	if (tier >= 7) {
		// 顶级:再来一遍高八度
		for (let i = 0; i < 4; i++)
			tone(root * 2 * Math.pow(2, scale[i] / 12), t0 + (0.4 + i * 0.07) * R(), 0.3 * R(), {
				type: 'triangle',
				gain: 0.12
			});
	}
};

/** 结算逐行:音高随行号递升 */
export const sfxStep = (
	index: number,
	kind: 'level' | 'chip' | 'mult' | 'total' | 'swap',
	levelScore = 0
) => {
	if (kind === 'level') return sfxLevel(levelScore);
	log('step:' + kind);
	initSfx();
	if (!ctx || !enabled) return;
	const t0 = ctx.currentTime + 0.01;
	if (kind === 'swap') {
		// 逆向改写:先降后升的一对锯齿音 —— 和加算(三角)/乘算(方波)明显不是一个东西,
		// 听感上就是「把分数翻过来」
		tone(note(6), t0, 0.1 * R(), { type: 'sawtooth', gain: 0.07 });
		tone(note(6 + 13), t0 + 0.06, 0.18 * R(), { type: 'sawtooth', gain: 0.09 });
		return;
	}
	const base = kind === 'mult' ? 9 : 5;
	tone(note(base + index * 2.2), t0, 0.13 * R(), {
		type: kind === 'mult' ? 'square' : 'triangle',
		gain: kind === 'mult' ? 0.09 : 0.13
	});
};

export const sfxTotal = (reached: boolean) => {
	log('total:' + (reached ? 'ok' : 'no'));
	initSfx();
	if (!ctx || !enabled) return;
	const t0 = ctx.currentTime + 0.01;
	const chord = reached ? [0, 4, 7, 12] : [0, 3, 7];
	for (let i = 0; i < chord.length; i++)
		tone(note(-2 + chord[i]), t0 + i * 0.045 * R(), (reached ? 0.5 : 0.3) * R(), {
			type: reached ? 'triangle' : 'sine',
			gain: 0.16
		});
};

/** 过关:上行五声 + 收尾和弦 */
export const sfxWin = () => {
	log('win');
	initSfx();
	if (!ctx || !enabled) return;
	const t0 = ctx.currentTime + 0.01;
	[0, 4, 7, 12, 16].forEach((s, i) => tone(note(s + 3), t0 + i * 0.08, 0.22, { gain: 0.15 }));
	[0, 4, 7, 12].forEach((s) => tone(note(s + 3), t0 + 0.44, 0.7, { gain: 0.13 }));
};

/** 结束:下行长滑音 */
export const sfxLose = () => {
	log('lose');
	initSfx();
	if (!ctx || !enabled) return;
	const t0 = ctx.currentTime + 0.01;
	tone(note(3), t0, 0.9, { type: 'sawtooth', gain: 0.14, glideTo: note(-17) });
	tone(note(-9), t0 + 0.15, 0.8, { type: 'sine', gain: 0.12, glideTo: note(-24) });
};

/** 界面点击 */
export const sfxClick = () => {
	log('click');
	initSfx();
	if (!ctx || !enabled) return;
	const t0 = ctx.currentTime + 0.005;
	click(t0, { freq: 2600, q: 2, dur: 0.03, gain: 0.1 });
	tone(note(12), t0, 0.05, { type: 'sine', gain: 0.06 });
};

export const sfxCoin = () => {
	log('coin');
	initSfx();
	if (!ctx || !enabled) return;
	const t0 = ctx.currentTime + 0.005;
	click(t0, { freq: 5400, q: 3, dur: 0.02, gain: 0.05 });
	tone(note(19), t0, 0.06, { type: 'square', gain: 0.085 });
	tone(note(26), t0 + 0.055, 0.16, { type: 'square', gain: 0.095 });
};

/** 出售:收银机「ka-ching」—— 先一声柜厣弹开的「咔」,再一记亮铃「叮」 */
export const sfxSell = () => {
	log('sell');
	initSfx();
	if (!ctx || !enabled) return;
	const t0 = ctx.currentTime + 0.005;
	// 咔:中低频噪声 + 闷响(抽屉/机櫃的机械感)
	click(t0, { freq: 1300, q: 0.9, dur: 0.055, gain: 0.16 });
	tone(note(7), t0, 0.07, { type: 'triangle', gain: 0.08 });
	// 叮:亮铃(基音 + 两个泛音,衰减比 click 长得多)
	tone(note(24), t0 + 0.075, 0.5, { type: 'sine', gain: 0.13 });
	tone(note(31), t0 + 0.075, 0.4, { type: 'sine', gain: 0.05 });
	tone(note(28), t0 + 0.09, 0.45, { type: 'sine', gain: 0.07 });
};
