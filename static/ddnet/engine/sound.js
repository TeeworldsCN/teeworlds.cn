/**
 * Web Audio 混音器。wasm 只负责“发生了什么声音、在哪”,这里负责出声。
 *
 * 声音打包成一个 zip(scripts/build-engine.ts 生成),里面每个音效是**独立的 opus 流**
 * 加一份 sounds.json。这样只需一个请求,但每个音效各自解码,不会出现
 * “拼接后切片、上一段的尾巴漏到下一段”的问题。
 * zip 是 STORE(不压缩)的,解包就是按偏移切字节,不需要任何解压库。
 *
 * 音量/声像照抄 DDNet 客户端的模型(src/engine/client/sound.cpp):
 *   - 世界声音是半径 1500 的圆,falloff 0(即线性衰减)
 *   - 衰减:gain = (1500 - dist) / 1500,超出半径就听不到
 *   - 声像:离听者左边远就压左声道,右边远就压右声道,系数同样是 (1500 - |dx|) / 1500
 *   - 全局声音不衰减、不声像
 *
 * 单位:DDNet 的 `m_Pos` / `m_Camera.m_Center` 是**世界单位**,1 tile = 32 单位;
 * 而 wasm 给的 `SoundEvent.x/y` 和 TwCamera 都是 tile。所以半径要换成 tile:
 *   1500 / 32 = 46.875 tile。直接拿 1500 当 tile 用的话普通地图都在半径内,
 *   听起来就像完全没有衰减和 panning。
 */

const RADIUS = 1500 / 32;
/** DDNet 的 CHN_WORLD 音量是 0.9 * snd_gamevolume;全局通道是 1.0 */
const WORLD_VOLUME = 0.9;
const DEFAULT_VOLUME = 0.7;

export class SoundMixer {
	constructor({ base = '/ddnet/engine', version = 'dev', volume = DEFAULT_VOLUME } = {}) {
		this.base = base;
		this.version = version;
		this.volume = volume;
		this.context = null;
		this.master = null;
		this.loaded = null;
		this.buffers = new Map(); // 名字 -> AudioBuffer[]
		this.lastVariant = new Map();
		this.enabled = false;
		/** 拖动进度条/跳转时临时静音,免得糊一堆声音 */
		this.suppressed = false;
		/** suspend() 的 promise:resume() 要等它落地 */
		this.suspendPromise = null;
	}

	/** 建音频上下文(不碰声音包),没有就建,有就复用 */
	#ensureContext() {
		if (this.context) return this.context;
		const Ctor = window.AudioContext ?? window.webkitAudioContext;
		if (!Ctor) return null;
		this.context = new Ctor();
		this.master = this.context.createGain();
		this.master.gain.value = this.volume;
		this.master.connect(this.context.destination);
		return this.context;
	}

	/**
	 * 只建上下文、不解声音包,并回答"浏览器现在允许这个页面出声吗"。
	 *
	 * 自动播放被拦的时候,新建的 AudioContext 会是 `suspended`,一直到有用户手势;
	 * 已经拿到权限(用户在这个站上互动过 / Media Engagement 够高)就直接 `running`。
	 * 探测用上下文和真正播声音的是同一个,不额外建一个来试。
	 * @returns {boolean}
	 */
	prepare() {
		const context = this.#ensureContext();
		return context?.state === 'running';
	}

	/** 必须在用户手势里调一次:浏览器不给自动播放 */
	async resume() {
		if (!this.#ensureContext()) return false;
		// 可能刚好有一次 suspend 还在路上(切 demo 时 destroy → 立刻 mount)。
		// 先等它落地,否则 resume 会被那次 suspend 反向覆盖,结果一直是挂起的。
		await this.suspendPromise;
		this.suspendPromise = null;
		if (this.context.state === 'suspended') {
			await this.context.resume();
		}
		try {
			await this.load();
		} catch (error) {
			console.warn(`[sound] ${error.message ?? error}`);
			return false;
		}
		return true;
	}

	/**
	 * 音频上下文是不是真的在跑。
	 *
	 * `resume()` 返回 true 只代表"谱子加载好了",不代表浏览器真的给了播放权限:
	 * 自动播放被拦时 context 会停在 `suspended`,声音一声都出不来。
	 */
	isRunning() {
		return this.context?.state === 'running';
	}

	setVolume(volume) {
		this.volume = Math.min(1, Math.max(0, volume));
		if (this.master) this.master.gain.value = this.volume;
	}

	setEnabled(enabled) {
		this.enabled = enabled;
	}

	/** 跳转/拖进度条期间调用,期间所有声音都丢掉 */
	setSuppressed(suppressed) {
		this.suppressed = suppressed;
	}

	/** 播放器隐藏/切 demo 时挂起音频上下文:不占音频线程,也不会有尾音继续播 */
	suspend() {
		if (this.context?.state !== 'running') return;
		this.suspendPromise = this.context.suspend().catch(() => {});
	}

	/** 一个请求拿到 sounds.zip,解包后逐个解码 */
	async load() {
		if (this.loaded) return this.loaded;
		this.loaded = (async () => {
			const response = await fetch(`${this.base}/sounds/sounds.zip?v=${this.version}`);
			if (!response.ok) throw new Error(`声音包加载失败 (${response.status})`);
			const entries = readStoredZip(await response.arrayBuffer());
			const manifestEntry = entries.get('sounds.json');
			if (!manifestEntry) throw new Error('声音包里没有 sounds.json');
			const manifest = JSON.parse(new TextDecoder().decode(manifestEntry));

			// 每个音效单独 decodeAudioData:各是独立的 opus 流,切片不会互相串
			const names = Object.keys(manifest.sets);
			const pending = [];
			for (const name of names) {
				for (const file of manifest.sets[name]) {
					const data = entries.get(file);
					if (!data) throw new Error(`声音包里缺少 ${file}`);
					// decodeAudioData 会 detach buffer,所以每次都复制一份
					pending.push({ name, data: data.slice().buffer });
				}
			}
			let cursor = 0;
			const worker = async () => {
				while (cursor < pending.length) {
					const job = pending[cursor++];
					const buffer = await this.context.decodeAudioData(job.data);
					const list = this.buffers.get(job.name) ?? [];
					list.push(buffer);
					this.buffers.set(job.name, list);
				}
			};
			await Promise.all(Array.from({ length: 6 }, worker));
			return manifest;
		})().catch((error) => {
			this.loaded = null;
			throw error;
		});
		return this.loaded;
	}

	/** 客户端的 GetSampleId:随机换变体,但不会连着播同一个 */
	pick(name, buffers) {
		if (!buffers.length) return null;
		if (buffers.length === 1) return buffers[0];
		let index = Math.floor(Math.random() * buffers.length);
		if (index === this.lastVariant.get(name)) index = (index + 1) % buffers.length;
		this.lastVariant.set(name, index);
		return buffers[index];
	}

	/**
	 * events:wasm 里 drain_sounds() 的数组
	 * listener:{ x, y } —— 相机中心(听者位置)
	 */
	play(events, listener) {
		if (!this.enabled || this.suppressed) return;
		if (!this.context || !this.master) return;
		if (!Array.isArray(events) || events.length === 0) return;
		const context = this.context;
		const now = context.currentTime;
		for (const event of events) {
			const buffers = this.buffers.get(event.n);
			if (!buffers) continue;
			const buffer = this.pick(event.n, buffers);
			if (!buffer) continue;

			let gain = 1;
			let panLeft = 1;
			let panRight = 1;
			if (!event.g) {
				// 和 DDNet 的 `CSound::Play()` 一样:世界声音默认 CIRCLE,半径 1500、
				// falloff 0,超出半径直接不拨声
				const dx = event.x - listener.x;
				const dy = event.y - listener.y;
				const dist = Math.hypot(dx, dy);
				gain = (RADIUS - dist) / RADIUS;
				if (gain <= 0) continue;
				gain *= WORLD_VOLUME;
				// 声像:左/右声道只衰减离听者远的那一边(线性,不取常数功率)
				if (dx > 0) panLeft = (RADIUS - Math.abs(dx)) / RADIUS;
				else panRight = (RADIUS - Math.abs(dx)) / RADIUS;
			}

			const source = context.createBufferSource();
			source.buffer = buffer;
			if (buffer.numberOfChannels === 1) {
				// 单声道:左右两个增益 + 合并器,严格照客户端的线性声像
				const left = context.createGain();
				const right = context.createGain();
				const merger = context.createChannelMerger(2);
				left.gain.value = gain * panLeft;
				right.gain.value = gain * panRight;
				source.connect(left).connect(merger, 0, 0);
				source.connect(right).connect(merger, 0, 1);
				merger.connect(this.master);
			} else {
				const node = context.createGain();
				node.gain.value = gain;
				source.connect(node).connect(this.master);
			}
			source.start(now);
		}
	}

	close() {
		this.context?.close();
		this.context = null;
		this.master = null;
		this.buffers.clear();
		this.loaded = null;
		this.suspendPromise = null;
	}
}

/**
 * 解 STORE(不压缩)的 zip:只读中央目录 + 本地头的长度字段,数据直接切片。
 * 我们自己的构建产物里不会有压缩项,遇到就直接报错。
 */
function readStoredZip(arrayBuffer) {
	const view = new DataView(arrayBuffer);
	const bytes = new Uint8Array(arrayBuffer);
	let eocd = -1;
	for (
		let i = arrayBuffer.byteLength - 22;
		i >= 0 && i >= arrayBuffer.byteLength - 0xffff - 22;
		i--
	) {
		if (view.getUint32(i, true) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) throw new Error('声音包不是 zip');
	const count = view.getUint16(eocd + 10, true);
	let pointer = view.getUint32(eocd + 16, true);
	const entries = new Map();
	const decoder = new TextDecoder();
	for (let i = 0; i < count; i++) {
		if (view.getUint32(pointer, true) !== 0x02014b50) throw new Error('zip 目录损坏');
		const method = view.getUint16(pointer + 10, true);
		const size = view.getUint32(pointer + 20, true);
		const nameLength = view.getUint16(pointer + 28, true);
		const extraLength = view.getUint16(pointer + 30, true);
		const commentLength = view.getUint16(pointer + 32, true);
		const localOffset = view.getUint32(pointer + 42, true);
		const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
		if (method !== 0) throw new Error(`声音包里 ${name} 是压缩的,只支持 store`);
		const localNameLength = view.getUint16(localOffset + 26, true);
		const localExtraLength = view.getUint16(localOffset + 28, true);
		const start = localOffset + 30 + localNameLength + localExtraLength;
		entries.set(name, bytes.subarray(start, start + size));
		pointer += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
}
