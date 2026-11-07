/**
 * twengine 的公共引导:地图预览和 demo 播放两个前端共用这**同一个 wasm**。
 *
 * 产物由 `bun run engine`(scripts/build-engine.ts)生成在 /ddnet/engine/:
 *   pkg/twengine.js + pkg/twengine_bg.wasm   引擎本体
 *   assets/*.png, assets/DejaVuSans.ttf      渲染贴图与字体
 *   assets/mapres_06|07/*.png                地图里没内嵌的图
 *   sounds/sounds.json, sounds/*.opus        音效
 *
 * 这里只放“谁都要用”的东西:拿新 wasm 实例、装贴图、按地图头找地图。
 */

/**
 * wasm 导出的 module 对象。类型故意放宽成 any:绑定是 wasm-bindgen 生成的,
 * 在这里逐字段复述一遍只会变成第二个需要手工同步的地方。
 *
 * @typedef {any} WasmModule
 * @typedef {{ backend: 'webgpu' | 'webgl', mipmaps: boolean, tilemapMips: boolean }} GraphicsPlan
 * @typedef {{ canvas?: HTMLCanvasElement, createCanvas?: () => HTMLCanvasElement,
 *   rememberKey?: string, backend?: 'webgpu' | 'webgl' | null, font?: boolean,
 *   onStatus?: (text: string) => void }} BootOptions
 * @typedef {{ module: WasmModule, gpu: any, canvas: HTMLCanvasElement, backend: 'webgpu' | 'webgl' }} Booted
 */

export const BASE = '/ddnet/engine';

/** 和 wasm 里 add_texture 认的名字一一对应 */
export const TEXTURES = ['game', 'particles', 'emoticons', 'extras', 'default', 'x_ninja'];

/**
 * 实体层图集(和 wasm 里 `add_entities` 认的 id 一一对应)。
 *
 * 对应客户端 `cl_assets_entities` 的两套:comfort 是官方那套扁平风格,
 * classic 是 `editor/entities_clear` 里的 DDNet 版(客户端默认用的那套)。
 * 都是 1024x1024 / 16x16 个 64px tile,渲染逻辑完全一样。
 * `id` 会被存进用户偏好,改 id 等于让老用户的偏好失效,别随便改。
 */
export const ENTITIES = [
	{ id: 'comfort', label: '舒适' },
	{ id: 'classic', label: '经典' }
];

/** 实体层风格偏好的 key:地图预览和 demo 播放器共用一个,用户在哪儿改都算数 */
const ENTITIES_STYLE_KEY = 'tw-entities-style';

/** @returns {string} 存过的风格 id,认不出来就退回第一套 */
export const readEntitiesStyle = () => {
	try {
		const stored = localStorage.getItem(ENTITIES_STYLE_KEY);
		if (stored && ENTITIES.some((entry) => entry.id === stored)) return stored;
	} catch {
		// 无痕模式 / 禁用了存储
	}
	return ENTITIES[0].id;
};

/** @param {string} id */
export const writeEntitiesStyle = (id) => {
	try {
		localStorage.setItem(ENTITIES_STYLE_KEY, id);
	} catch {
		// 存不了就算了
	}
};
export const FONT = 'DejaVuSans.ttf';

/** 地图预览用的地图代理(同源,见 src/routes/ddnet/mappreview/map/[file]/+server.ts) */
export const MAP_PROXY = '/ddnet/mappreview/map';

let versionPromise = null;
/** SSR 直接给过来的版本号(省掉一次 version.json 请求) @type {string | null} */
let injectedVersion = null;

/** @param {string} version */
export const setEngineVersion = (version) => {
	if (!version) return;
	injectedVersion = version;
	versionPromise = Promise.resolve(version);
};

/**
 * 重新编译过 wasm / 换过贴图就换 key,免得吃到缓存里的旧文件。
 *
 * 这个文件本身是"指针":它被缓存住的话,产物全换了前端还是拿旧 version。
 * 光靠 `cache: 'no-cache'` 不够 —— 前面的 CDN(腾讯 EdgeOne)是按完整 URL 缓存的,
 * 只认 origin 的 Cache-Control,而我们这边给不出(静态文件由 Caddy 直接发)。
 * 所以**每次带一个唯一查询串**:CDN 那里必然是 MISS,一定回源拿新的。
 * 文件才 200 多字节,这点开销换来"每次部署都立刻生效"。
 */
export const getVersion = () => {
	if (injectedVersion) return Promise.resolve(injectedVersion);
	versionPromise ??= fetch(`${BASE}/version.json?t=${Date.now()}`, { cache: 'no-store' })
		.then((r) => (r.ok ? r.json() : null))
		.then((data) => data?.version ?? 'dev')
		.catch(() => 'dev');
	return versionPromise;
};

/** @param {string} file */
export const assetUrl = async (file) => `${BASE}/${file}?v=${await getVersion()}`;

/** @param {string} url @returns {Promise<Uint8Array>} */
export const fetchBytes = async (url) => {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`${decodeURIComponent(url)} (${response.status})`);
	}
	return new Uint8Array(await response.arrayBuffer());
};

/** ddnet.org 的 demo 是 gzip 过的(.demo.gz),浏览器自带解压 */
/** @param {Uint8Array} bytes @returns {Promise<Uint8Array>} */
export const gunzip = async (bytes) => {
	if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
	if (typeof DecompressionStream !== 'function') {
		throw new Error('这个浏览器不支持 DecompressionStream,解不开 .demo.gz');
	}
	const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream('gzip'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
};

/**
 * 拿一份全新的 wasm 实例。
 *
 * twgpu 的全局初始化(日志、panic hook)没法在同一个实例上重置,而“关掉即释放”需要每次重建,
 * 所以把 glue 源码包成 blob URL 重新 import —— 新的 module 作用域 = 新的 wasm 实例,
 * wasm 本体仍走带 ?v= 的稳定地址,浏览器会缓存并复用编译结果。
 */
export const freshEngine = async () => {
	const version = await getVersion();
	const response = await fetch(`${BASE}/pkg/twengine.js?v=${version}`);
	if (!response.ok) throw new Error(`引擎加载失败 (${response.status})`);
	const source = await response.text();
	const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
	try {
		const module = await import(/* @vite-ignore */ url);
		await module.default(`${BASE}/pkg/twengine_bg.wasm?v=${version}`);
		return module;
	} finally {
		URL.revokeObjectURL(url);
	}
};

/**
 * 记住「这台机器上 WebGPU 明明能探测、但真用起来会炸」,下次直接走 WebGL。
 * key 由调用方给(demo 播放器不记忆,地图预览页记 `ddnet:mappreview:backend`)。
 */
/** @param {string | null | undefined} key @param {'webgl'} backend */
export const rememberBackend = (key, backend) => {
	if (typeof key !== 'string') return;
	try {
		window.localStorage.setItem(key, backend);
	} catch {
		// 隐私模式就算了
	}
};

/** @param {string | null | undefined} key @returns {string | null} */
export const rememberedBackend = (key) => {
	if (typeof key !== 'string') return null;
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
};

/**
 * 选后端和 mipmaps。
 *
 * mipmap 默认**两个后端都开**。以前 WebGL 默认关掉,是因为 tilemap 的 array texture
 * mip 链在部分 mobile GLES 驱动上拿不到内容(拉远时地形整片消失)。现在 tilemap 的
 * mip 改成在 CPU 上生成后就没这个问题了,`?mips=0` 仍然是全局兜底开关。
 *
 * `rememberKey`:如果传了,之前记录过 `webgl` 就直接跳过 WebGPU 探测。
 * `backend`:调用方直接点名(内置浏览器就传 `'webgl'`,别去碰 WebGPU)。
 *
 * @param {{ rememberKey?: string | null, backend?: 'webgpu' | 'webgl' | null }} [options]
 * @returns {Promise<GraphicsPlan | null>}
 */
export const planGraphics = async ({ rememberKey = null, backend = null } = {}) => {
	const params = new URLSearchParams(location.search);
	const forcedBackend = params.get('backend');
	const forcedMips = params.get('mips');
	// tilemap 采的是 array texture。部分 mobile GLES 驱动上它的 mip 链拿不到内容,
	// 拉远(lod>0)时地形会整片消失。`?tilemip=0` 让 tilemap 只采 level 0。
	const forcedTilemip = params.get('tilemip');
	/**
	 * @param {'webgpu' | 'webgl'} backend
	 * @returns {GraphicsPlan}
	 */
	const plan = (backend) => ({
		backend,
		mipmaps: forcedMips !== '0',
		tilemapMips: forcedTilemip !== '0'
	});
	if (!forcedBackend && rememberedBackend(rememberKey) === 'webgl') return plan('webgl');
	if (forcedBackend !== 'webgl') {
		/** @type {{ requestAdapter: () => Promise<any> } | undefined} */
		const gpu = /** @type {any} */ (navigator).gpu;
		if (gpu) {
			// 1.5 秒内拿不到 adapter + device 就当这个 WebGPU 不可用(桩实现会一直挂着)
			/** @param {null} fallback */
			const timeout = (fallback) =>
				new Promise((resolve) => setTimeout(() => resolve(fallback), 1500));
			try {
				const adapter = await Promise.race([gpu.requestAdapter(), timeout(null)]);
				if (adapter) {
					const device = await Promise.race([adapter.requestDevice(), timeout(null)]);
					if (device) return plan('webgpu');
				}
			} catch {
				// 探测失败就当没有 WebGPU
			}
		}
		if (forcedBackend === 'webgpu') return plan('webgpu');
	}
	try {
		if (document.createElement('canvas').getContext('webgl2')) return plan('webgl');
	} catch {
		// 建不了 canvas 就当不支持
	}
	return null;
};

/**
 * 贴图 + 字体,一份 TwGpu 只需要装一次。
 *
 * `font: false` 就不下载 DejaVuSans.ttf(757 KB):demo 播放器的名字牌已经改成
 * DOM 渲染(直接吃系统字体,中文才画得出来),wasm 里的 SDF 文字暂时用不上。
 * 地图预览页还留着,它将来要画地图里的文字。
 *
 * @param {any} gpu
 * @param {{ font?: boolean }} [options]
 */
export const loadTextures = async (gpu, { font = true } = {}) => {
	await Promise.all([
		...TEXTURES.map(async (name) => {
			gpu.add_texture(name, await fetchBytes(await assetUrl(`assets/${name}.png`)));
		}),
		...ENTITIES.map(async ({ id }) => {
			gpu.add_entities(id, await fetchBytes(await assetUrl(`assets/entities-${id}.png`)));
		}),
		font ? fetchBytes(await assetUrl(`assets/${FONT}`)).then((bytes) => gpu.add_font(bytes)) : null
	]);
};

/**
 * 一份 TwGpu(device + 贴图 + 字体)。canvas 可以不传,之后用 create_surface。
 *
 * 多数场景直接用 `bootRenderer`,它把后端探测和回退也包了。
 *
 * @param {WasmModule} module
 * @param {HTMLCanvasElement | null} [canvas]
 * @param {{ plan?: GraphicsPlan | null, backend?: 'webgpu' | 'webgl', mipmaps?: boolean,
 *   tilemapMips?: boolean, font?: boolean }} [options]
 */
export const createGpu = async (module, canvas = null, options = {}) => {
	const plan = options.plan ?? (await planGraphics());
	if (!plan) {
		throw new Error(
			'当前浏览器没有可用的 WebGL2 / WebGPU(QQ、微信等内置浏览器常见),用系统浏览器打开就能看'
		);
	}
	// TwGpu::init 是 async constructor:wasm-bindgen 导出的类要用 new,返回 Promise
	const gpu = await new module.TwGpu(
		options.backend ?? plan.backend,
		canvas,
		options.mipmaps ?? plan.mipmaps,
		options.tilemapMips ?? plan.tilemapMips
	);
	await loadTextures(gpu, { font: options.font !== false });
	return gpu;
};

/** 给一个 promise 加超时,避免某些浏览器在创建图形设备时永远挂着 */
/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} message
 * @returns {Promise<T>}
 */
const withTimeout = (promise, ms, message) =>
	Promise.race([
		promise,
		new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
	]);

/**
 * 统一渲染器启动:选后端 → 载入 wasm → 建 TwGpu → 装贴图。
 * demo 播放器和地图预览页共用这一份,不再各写一遍。
 *
 * 处理了几个只有真实浏览器才会遇到的坑:
 * - QQ / X5 的 `navigator.gpu` 是桩,`requestAdapter()` 永不 resolve → 探测带 1.5s 超时
 * - 即使探测通过,真建 device 时也可能失败 → 自动退回 WebGL 并记住(换新 wasm 实例,
 *   因为同一个实例上不能再 init 一次,全局 logger 会 panic)
 *
 * @param {object} opts
 * @param {HTMLCanvasElement|null} [opts.canvas] 已有 canvas(demo 播放器)
 * @param {() => HTMLCanvasElement} [opts.createCanvas] 每次新建 canvas(地图预览页)
 * @param {string|null} [opts.rememberKey] 记录/读取后端选择的 localStorage key
 * @param {boolean} [opts.font] 是否下载 TTF 字体(demo 播放器用 DOM 名字牌,不需要)
 * @param {(text: string) => void} [opts.onStatus] 进度文本
 * @returns {Promise<Booted>}
 */
export const bootRenderer = async (
	/** @type {BootOptions} */
	{ canvas, createCanvas, rememberKey, backend = null, font = true, onStatus = () => {} } = {}
) => {
	/** @type {GraphicsPlan} */
	let plan = /** @type {GraphicsPlan} */ (
		await planGraphics({ rememberKey: rememberKey ?? null, backend })
	);
	if (!plan) {
		throw new Error(
			'当前浏览器没有可用的 WebGL2 / WebGPU(QQ、微信等内置浏览器常见),用系统浏览器打开就能看'
		);
	}

	onStatus('加载渲染引擎…');
	let module = await freshEngine();

	/**
	 * 拿一块**没被用过**的 canvas。
	 *
	 * 关键:一个 canvas 一旦绑过某种上下文,再要另一种会直接返回 null
	 * (`getContext() returned null; webgl2 not available or canvas already in use`)。
	 * WebGPU 探测成功、真建 surface 时才失败的内置浏览器(QQ/X5)就会踩到:
	 * 第一次是 webgpu 把 canvas 占了,回退到 webgl 时同一个 canvas 再也拿不到 webgl2。
	 * 所以回退必须换一块新的 —— 调用方给了 `createCanvas` 就用它的,
	 * 没给就把原来那块(它在 DOM 里)换成克隆出来的新 canvas,位置不变。
	 * @returns {HTMLCanvasElement | null}
	 */
	const nextCanvas = () => {
		if (createCanvas) return createCanvas();
		if (!canvas) return null;
		if (!reused) {
			reused = true;
			return canvas;
		}
		const fresh = /** @type {HTMLCanvasElement} */ (canvas.cloneNode(false));
		canvas.replaceWith(fresh);
		canvas = fresh;
		return fresh;
	};
	/** 第一次请求 canvas 不用克隆 */
	let reused = false;

	/**
	 * @param {'webgpu' | 'webgl'} backend
	 * @param {boolean} mipmaps
	 */
	const build = async (backend, mipmaps) => {
		const target = nextCanvas();
		if (!target) throw new Error('没有可用的 canvas');
		const gpu = await withTimeout(
			// TwGpu::init 是 async constructor:wasm-bindgen 导出的类要用 new,返回 Promise
			new module.TwGpu(backend, target, mipmaps, plan.tilemapMips),
			backend === 'webgpu' ? 6000 : 12000,
			'创建图形设备失败(这个浏览器可能不支持 WebGL2 / WebGPU,试试用系统浏览器打开)'
		);
		return { gpu, canvas: target };
	};

	onStatus('初始化图形设备…');
	/** @type {{ gpu: any; canvas: HTMLCanvasElement } | null} */
	let built = null;
	/**
	 * 每个后端最多试两次:第一次用现成的 canvas,失败就换一块新的再来一次。
	 *
	 * 内置浏览器(X5)有个很烦的行为:canvas 的 WebGL 上下文可能一次拿不到
	 * (`canvas.getContext() returned null ... already in use`),同一块 canvas 再要
	 * webgl2 永远是 null —— 但换一块新的就好了。WebGPU 失败再退 WebGL 也走同一条路。
	 */
	/** @type {('webgpu' | 'webgl')[]} */
	const backends = plan.backend === 'webgpu' ? ['webgpu', 'webgl'] : ['webgl'];
	let lastError = null;
	for (const backend of backends) {
		for (let attempt = 0; attempt < 2 && !built; attempt++) {
			try {
				built = await build(backend, plan.mipmaps);
				plan = { ...plan, backend };
				// 能从 webgpu 退到 webgl 说明这台机器别再试 WebGPU 了,记下来
				if (backend === 'webgl' && backends.length > 1) rememberBackend(rememberKey, 'webgl');
			} catch (error) {
				lastError = error;
				console.warn(`初始化 ${backend} 失败(第 ${attempt + 1} 次)`, error);
				// 同一个 wasm 实例上不能再 init 一次(全局 logger 会 panic),换一份新实例
				if (attempt === 0) module = await freshEngine();
			}
		}
		if (built) break;
	}
	if (!built) throw lastError ?? new Error('创建图形设备失败');

	onStatus('加载贴图…');
	await loadTextures(built.gpu, { font });
	return { module, gpu: built.gpu, canvas: built.canvas, backend: plan.backend };
};

/**
 * 把地图字节变成可渲染的 TwMap。
 * 地图里引用的外部 mapres 按名字去 assets/mapres_06|07 里取(和 ddnet 官网预览一致)。
 */
/**
 * @param {WasmModule} module
 * @param {any} gpu
 * @param {Uint8Array} bytes
 */
export const loadMap = async (module, gpu, bytes) => {
	const intermediate = new module.TwMapIntermediate(bytes);
	const mapres = intermediate.external_mapres();
	const version = intermediate.version() === 'Teeworlds07' ? '07' : '06';
	/** @type {string[]} */
	const missing = [];
	await Promise.all(
		mapres.map(async (/** @type {string} */ name) => {
			const url = await assetUrl(`assets/mapres_${version}/${encodeURIComponent(name)}.png`);
			try {
				const data = await fetchBytes(url);
				if (version === '07') gpu.add_external_07(name, data);
				else gpu.add_external_06(name, data);
			} catch {
				missing.push(name);
			}
		})
	);
	const map = gpu.upload_map(intermediate);
	return { map, version, missing };
};

/**
 * 地图下载:demo 头里有名字,走同源代理(国内比直连 ddnet.org 稳)
 * @param {string} name
 */
export const fetchMapByName = (name) => fetchBytes(`${MAP_PROXY}/${encodeURIComponent(name)}.map`);
