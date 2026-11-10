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
 * @typedef {{ host?: HTMLElement | null, canvasClass?: string, canvasFocus?: boolean,
 *   rememberKey?: string | null, backend?: 'webgpu' | 'webgl' | null, font?: boolean,
 *   nameplateCpuSdf?: boolean, onStatus?: (text: string) => void }} AcquireOptions
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
 * 页面里一般用 `acquireRenderer`,它在这个基础上把后端探测、回退和**持久缓存**都包了。
 *
 * @param {WasmModule} module
 * @param {HTMLCanvasElement | null} [canvas]
 * @param {{ plan?: GraphicsPlan | null, backend?: 'webgpu' | 'webgl', mipmaps?: boolean,
 *   tilemapMips?: boolean, nameplateCpuSdf?: boolean, font?: boolean }} [options]
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
		options.tilemapMips ?? plan.tilemapMips,
		// 名字牌的 SDF 改在 wasm 里用 CPU 算(只有 X5 需要)
		options.nameplateCpuSdf ?? false
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
 * 一个已经建好的持久渲染器:
 * wasm 实例 + GPU device + 贴图 + 一块长期 canvas + 绑定在这块 canvas 上的 surface。
 *
 * WebGL 后端的一个 device 只能往它初始化时绑定的那块 canvas 上呈现(见 wgpu-hal 的
 * web.rs),所以 canvas 必须跟 device 一起缓存,不能每次挂载新建一块。
 *
 * @typedef {object} Renderer
 * @property {WasmModule} module
 * @property {any} gpu
 * @property {HTMLCanvasElement} canvas
 * @property {any} surface
 * @property {'webgpu' | 'webgl'} backend
 */

/** @type {Map<string, Promise<Renderer>>} */
const rendererBoots = new Map();
/** @type {Map<string, Renderer>} */
const renderers = new Map();

/**
 * 已经建好、可以直接用的渲染器(没建过就是 null)
 * @param {string} slot
 */
export const loadedRenderer = (slot) => renderers.get(slot) ?? null;

/**
 * 取一个按 slot 持久化的渲染器。
 *
 * 第一次调用会很慢(描后端、载 wasm、建 device、传贴图),之后同一个 slot 只是把长期
 * canvas 挂进新的容器 —— 显示/隐藏、切 demo、开关地图预览都不需要重建 GPU。
 * 不用的时候调用方只要停掉自己的 rAF(或者整个组件卸掉),引擎本身什么都不做,
 * 内存留着,没有后台循环。
 *
 * demo 播放器和地图预览用不同的 slot,各自一块长期 canvas;同一个 slot 内(反复切 demo、
 * 反复开关预览)则一直复用同一份 device / 贴图 / canvas。
 *
 * @param {string} slot 缓存槽位(比如 'demo' / 'mappreview')
 * @param {object} [options]
 * @param {HTMLElement|null} [options.host] 把 canvas 挂到这里
 * @param {string} [options.canvasClass] canvas 的 class(只在第一次创建时设置)
 * @param {boolean} [options.canvasFocus] 是否让 canvas 可以接收键盘焦点(地图预览需要)
 * @param {string|null} [options.rememberKey] 记录/读取后端选择的 localStorage key
 * @param {'webgpu' | 'webgl' | null} [options.backend] 强制后端(内置浏览器传 'webgl')
 * @param {boolean} [options.font] 是否下载 TTF 字体(demo 播放器用 DOM 名字牌,不需要)
 * @param {boolean} [options.nameplateCpuSdf] 名字牌的 SDF 在 wasm 里用 CPU 算(X5 专用)
 * @param {(text: string) => void} [options.onStatus] 进度文本
 * @returns {Promise<Renderer>}
 */
export const acquireRenderer = async (slot, options = {}) => {
	let boot = rendererBoots.get(slot);
	if (!boot) {
		boot = bootRenderer(options)
			.then((renderer) => {
				renderers.set(slot, renderer);
				return renderer;
			})
			.catch((error) => {
				// 失败的下一次还要能重试
				rendererBoots.delete(slot);
				renderers.delete(slot);
				throw error;
			});
		rendererBoots.set(slot, boot);
	}

	const renderer = await boot;
	// 显示的时候只是把同一个 canvas 挪进新容器,不重新建 surface/device
	if (options.host && renderer.canvas.parentElement !== options.host) {
		options.host.appendChild(renderer.canvas);
	}
	return renderer;
};

/**
 * 真正建渲染器(只会在 slot 第一次使用时跑一次)。
 *
 * 处理了几个只有真实浏览器才会遇到的坑:
 * - QQ / X5 的 `navigator.gpu` 是桩,`requestAdapter()` 永不 resolve → 探测带 1.5s 超时
 * - 即使探测通过,真建 device 时也可能失败 → 自动退回 WebGL 并记住(换新 wasm 实例,
 *   因为同一个实例上不能再 init 一次,全局 logger 会 panic)
 * - canvas 一旦绑过某种上下文,回退时再要另一种会拿到 null → 换一块新 canvas
 *
 * @param {object} opts
 * @param {HTMLElement|null} [opts.host]
 * @param {string} [opts.canvasClass]
 * @param {boolean} [opts.canvasFocus]
 * @param {string|null} [opts.rememberKey]
 * @param {'webgpu' | 'webgl' | null} [opts.backend]
 * @param {boolean} [opts.font]
 * @param {boolean} [opts.nameplateCpuSdf]
 * @param {(text: string) => void} [opts.onStatus]
 * @returns {Promise<Renderer>}
 */
const bootRenderer = async ({
	host = null,
	canvasClass = '',
	canvasFocus = false,
	rememberKey = null,
	backend = null,
	font = true,
	nameplateCpuSdf = false,
	onStatus = () => {}
} = {}) => {
	/** @type {GraphicsPlan} */
	let plan = /** @type {GraphicsPlan} */ (
		await planGraphics({ rememberKey: rememberKey ?? null, backend })
	);
	if (!plan) {
		throw new Error(
			'当前浏览器没有可用的 WebGL2 / WebGPU(QQ、微信等内置浏览器常见),用系统浏览器打开就能看'
		);
	}

	/** 新建一块 canvas 并挂进 host;重试时旧的那块要拿掉 */
	const makeCanvas = () => {
		const canvas = document.createElement('canvas');
		if (canvasClass) canvas.className = canvasClass;
		if (canvasFocus) canvas.tabIndex = 0;
		canvas.style.touchAction = 'none';
		host?.appendChild(canvas);
		return canvas;
	};

	/** @type {HTMLCanvasElement} */
	let canvas = makeCanvas();

	try {
		onStatus('加载渲染引擎…');
		let module = await freshEngine();

		/** @param {'webgpu' | 'webgl'} nextBackend */
		const build = async (nextBackend) =>
			withTimeout(
				// TwGpu::init 是 async constructor:wasm-bindgen 导出的类要用 new,返回 Promise
				new module.TwGpu(nextBackend, canvas, plan.mipmaps, plan.tilemapMips, nameplateCpuSdf),
				nextBackend === 'webgpu' ? 6000 : 12000,
				'创建图形设备失败(这个浏览器可能不支持 WebGL2 / WebGPU,试试用系统浏览器打开)'
			);

		onStatus('初始化图形设备…');
		/** @type {any} */
		let gpu = null;
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
		for (const nextBackend of backends) {
			for (let attempt = 0; attempt < 2 && !gpu; attempt++) {
				try {
					gpu = await build(nextBackend);
					plan = { ...plan, backend: nextBackend };
					// 能从 webgpu 退到 webgl 说明这台机器别再试 WebGPU 了,记下来
					if (nextBackend === 'webgl' && backends.length > 1) {
						rememberBackend(rememberKey, 'webgl');
					}
				} catch (error) {
					lastError = error;
					console.warn(`初始化 ${nextBackend} 失败(第 ${attempt + 1} 次)`, error);
					if (attempt === 0) {
						// 同一个 wasm 实例上不能再 init 一次(全局 logger 会 panic),换一份新实例;
						// 被失败后端占过的 canvas 也换掉
						module = await freshEngine();
						const next = makeCanvas();
						canvas.remove();
						canvas = next;
					}
				}
			}
			if (gpu) break;
		}
		if (!gpu) throw lastError ?? new Error('创建图形设备失败');

		// TwGpu 初始化时带了一块 canvas,surface 已经建好了,这里取出来当长期 surface,
		// 不要留在 gpu 里 —— 否则下一次 gpu.surface() 会拿到这块,切换画面时容易混
		const surface = gpu.surface();
		if (!surface) throw new Error('渲染器没有创建出 surface');

		onStatus('加载贴图…');
		await loadTextures(gpu, { font });
		return { module, gpu, canvas, surface, backend: plan.backend };
	} catch (error) {
		canvas.remove();
		throw error;
	}
};

/**
 * 地图缓存:按 gpu 分(一张地图的 GPU 资源是挂在某块 device 的 map_static 上的)。
 * 一个 gpu 同时只有一个使用方(demo 或地图预览),所以淘汰最久没用的那份是安全的。
 *
 * @type {WeakMap<any, Map<string, { map: any, version: string, missing: string[], usedAt: number }>>}
 */
const mapCaches = new WeakMap();
const MAP_CACHE_LIMIT = 12;

/**
 * 把地图字节变成可渲染的 TwMap。
 * 地图里引用的外部 mapres 按名字去 assets/mapres_06|07 里取(和 ddnet 官网预览一致)。
 *
 * `key` 是跨挂载复用的缓存键(同一块 device 上同一张图只上传一次):
 * demo 用 header 里的 map sha256,地图预览用地图名。
 * 地图对象可能同时被别处引用,淘汰时只丢最久没用的那份;上限 12 张,
 * 正常翻 demo / 换预览图不会攒到爆。
 *
 * @param {WasmModule} module
 * @param {any} gpu
 * @param {Uint8Array} bytes
 * @param {string|null} [key]
 */
export const loadMap = async (module, gpu, bytes, key = null) => {
	/** @type {Map<string, { map: any, version: string, missing: string[], usedAt: number }> | undefined} */
	let cache = mapCaches.get(gpu);
	if (!cache) {
		cache = new Map();
		mapCaches.set(gpu, cache);
	}
	if (key) {
		const hit = cache.get(key);
		if (hit) {
			hit.usedAt = Date.now();
			return hit;
		}
	}

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
	if (missing.length) {
		// 图片不全时 upload_map 会在 wasm 里报一个看不懂的 "Not all images in map are embedded",
		// 这里先给一句人话(地图预览页会把错误直接显示出来)
		throw new Error(`这张地图用到了我们没收录的外部贴图:${missing.join('、')}`);
	}
	const map = gpu.upload_map(intermediate);

	/** @type {{ map: any, version: string, missing: string[], usedAt: number }} */
	const entry = { map, version, missing, usedAt: Date.now() };
	if (key) {
		cache.set(key, entry);
		if (cache.size > MAP_CACHE_LIMIT) {
			let oldestKey = null;
			let oldestAt = Infinity;
			for (const [candidate, value] of cache) {
				if (candidate !== key && value.usedAt < oldestAt) {
					oldestAt = value.usedAt;
					oldestKey = candidate;
				}
			}
			if (oldestKey !== null) {
				const evicted = cache.get(oldestKey);
				cache.delete(oldestKey);
				try {
					// 只放在缓存里的旧图,没人在画了才能释放
					evicted?.map?.free();
				} catch {
					// 已经释放过
				}
			}
		}
	}
	return entry;
};

/**
 * 地图下载:demo 头里有名字,走同源代理(国内比直连 ddnet.org 稳)
 * @param {string} name
 */
export const fetchMapByName = (name) => fetchBytes(`${MAP_PROXY}/${encodeURIComponent(name)}.map`);
