<script lang="ts">
	/**
	 * DDNet 地图预览:直接在我们自己的页面里跑 patiga 的 twgpu 渲染器(wasm),不再套 iframe。
	 *
	 * - wasm / 贴图 / mapres 由 scripts/build-mappreview.ts 从 vendor/twgpu 编译产出,
	 *   放在 static/ddnet/mappreview/ 下,走同源静态服务
	 * - 地图文件走 /ddnet/mappreview/map/<名字>.map(服务端代理 ddnet.org/mappreview)
	 * - 关闭预览(或离开页面)时把 wasm 实例、canvas、wgpu device 全部放掉:
	 *   twgpu 的全局初始化(日志/panic hook)没法重置,同一个 wasm 实例上第二次 TwGpu::init 会 panic,
	 *   所以每次打开都带一个递增的 ?n= 拿全新的 instance(wasm 本体走浏览器缓存,不会重复下载)
	 */

	import { onMount } from 'svelte';
	import Fa from 'svelte-fa';
	import {
		faArrowsRotate,
		faCaretDown,
		faExpand,
		faLayerGroup,
		faTriangleExclamation
	} from '@fortawesome/free-solid-svg-icons';

	const { map = null }: { map?: string | null } = $props();

	// 渲染器启动、产物版本号、wasm 实例、贴图加载全部复用 /ddnet/engine/engine.js,
	// 和 demo 播放器只有一份实现(QQ/X5 那些坑只在那边修一次)
	import {
		ENTITIES,
		acquireRenderer,
		fetchBytes,
		loadMap as uploadMap,
		readEntitiesStyle,
		writeEntitiesStyle
	} from '../../../../static/ddnet/engine/engine.js';
	import { uaIsStrict } from '$lib/helpers';

	// 地图文件仍然走 mappreview 代理(和引擎产物无关,是服务端转发 ddnet.org/mappreview)
	const MAP_BASE = '/ddnet/mappreview/map';

	/** 相机 zoom:值越小放大越多,越大视野越广,给个上下限防止缩放到底后找不着北 */
	const MIN_ZOOM = 0.05;
	const MAX_ZOOM = 20;
	/** 单帧最多推进多少秒(切标签页回来时当暂停,别让按 tick 步进的世界跳帧) */
	const MAX_FRAME_STEP = 0.1;

	const BTN = 'flex cursor-pointer items-center gap-1 rounded px-2 py-1 transition-colors';
	/** 分段按钮里的两块:圆角交给外层容器,自己不要圆角 */
	const BTN_FLAT = 'flex cursor-pointer items-center gap-1 px-2 py-1 transition-colors';
	const BTN_IDLE = 'text-slate-300 hover:bg-slate-700/70 hover:text-white';
	const BTN_ACTIVE = 'bg-blue-500 text-white';

	interface MpCamera {
		x: number;
		y: number;
		zoom: number;
		aspect_ratio: number;
		move_zoom(prevX: number, prevY: number, x: number, y: number, factor: number): void;
		free(): void;
	}

	interface MpSurface {
		resize(width: number, height: number): void;
		free(): void;
	}

	interface MpMap {
		set_time(time: number): void;
		spawn_location(): Float32Array;
		free(): void;
	}

	interface MpIntermediate {
		version(): string;
		external_mapres(): string[];
	}

	interface MpGpu {
		surface(): MpSurface | undefined;
		create_surface(canvas: HTMLCanvasElement): MpSurface;
		add_texture(name: string, bytes: Uint8Array): void;
		add_font(bytes: Uint8Array): void;
		add_external_06(name: string, bytes: Uint8Array): void;
		add_external_07(name: string, bytes: Uint8Array): void;
		upload_map(intermediate: MpIntermediate): MpMap;
		map_to_entities(map: MpMap): MpMap;
		map_to_entities_with_style(map: MpMap, style: string): MpMap;
		render_map(surface: MpSurface, camera: MpCamera, map: MpMap): void;
		free(): void;
	}

	interface MpModule {
		default: (input?: string) => Promise<void>;
		TwGpu: new (
			backend?: string | null,
			canvas?: HTMLCanvasElement | null,
			mipmaps?: boolean | null,
			tilemapMips?: boolean | null
		) => Promise<MpGpu>;
		TwMapIntermediate: new (data: Uint8Array) => MpIntermediate;
		TwCamera: new (aspectRatio: number) => MpCamera;
	}

	let host = $state<HTMLDivElement>();

	let ready = $state(false);
	let statusText = $state('加载渲染引擎…');
	let errorText = $state('');

	let entitiesLayer = $state(false);
	/** 实体层图集风格,demo 播放器那边共用同一个偏好(localStorage 里同一个 key) */
	let entitiesStyle = $state<string>(ENTITIES[0].id);
	let styleMenuOpen = $state(false);
	let fullscreen = $state(false);
	/** QQ / 微信内置浏览器(X5)里没有 requestFullscreen,按钮直接禁用 */
	let inApp = $state(false);

	const describeError = (e: unknown) => {
		const message = e instanceof Error ? e.message : String(e);
		// 带「系统浏览器」的是我们自己写的引导文案,原样显示
		if (message.includes('系统浏览器')) return message;
		if (/adapter|webgl|webgpu|graphics|surface|图形/i.test(message)) {
			return '这个浏览器没法创建 WebGL2 / WebGPU 设备(QQ、微信等内置浏览器常见),用系统浏览器打开就能看';
		}
		return message || '地图预览加载失败';
	};

	const clampZoom = (camera: MpCamera) => {
		const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom));
		if (zoom !== camera.zoom) camera.zoom = zoom;
	};

	// ---- 预览复用一份持久渲染器:关闭只停渲染,再次打开直接挂回同一块 canvas ----
	let module: MpModule | null = null;
	let gpu: MpGpu | null = null;
	let surface: MpSurface | null = null;
	let camera: MpCamera | null = null;
	let canvasEl: HTMLCanvasElement | null = null;
	let bootPromise: Promise<void> | null = null;
	let aspect = 1;
	/** 组件被卸载后异步 boot 还在跑:回来时不要再往已经没了的 host 上挂东西 */
	let disposed = false;
	/** 当前绑了事件监听的那块 canvas(跨组件实例复用的 canvas,必须按挂载解绑) */
	let boundCanvas: HTMLCanvasElement | null = null;

	let mapView: MpMap | null = null;
	let entitiesView: MpMap | null = null;
	let rendering = false;
	let raf = 0;
	let entitiesNow = false;
	let time = 0;
	let lastTimestamp: number | null = null;
	let loadToken = 0;
	/** 已经上传好的地图名;关掉预览再打开同一张图时不用重新上传 */
	let loadedName: string | null = null;
	/** 预览是否处于打开状态(关掉时只暂停渲染,引擎和地图都留着) */
	let previewing = false;

	const pointers = new Map<number, [number, number]>();

	const resize = () => {
		if (!host || !surface || !camera) return;
		const rect = host.getBoundingClientRect();
		const dpr = dprScale();
		const width = Math.max(1, Math.round(rect.width * dpr));
		const height = Math.max(1, Math.round(rect.height * dpr));
		if (!width || !height) return;
		surface.resize(width, height);
		aspect = width / height;
		camera.aspect_ratio = aspect;
	};

	const draw = (timestamp: number) => {
		if (!rendering) return;
		raf = requestAnimationFrame(draw);

		// 切走标签页再回来时 rAF 的间隔能有几十秒。世界是按 50 tick/s 一步一步模拟的,
		// 一次性加进去等于跳帧(子弹会不受碰撞地直飞),所以按「暂停」处理
		if (lastTimestamp !== null) {
			time += Math.min((timestamp - lastTimestamp) / 1000, MAX_FRAME_STEP);
		}
		lastTimestamp = timestamp;

		const target = entitiesNow ? (entitiesView ?? mapView) : mapView;
		if (!gpu || !surface || !camera || !target) return;
		// 标签页不可见就不画,省点电
		if (document.hidden) return;

		try {
			target.set_time(time);
			gpu.render_map(surface, camera, target);
		} catch (e) {
			// 出一次错就一直失败,别每帧刷日志
			console.error(e);
			stopRendering();
		}
	};

	const startRendering = () => {
		if (rendering || document.hidden) return;
		rendering = true;
		lastTimestamp = null;
		raf = requestAnimationFrame(draw);
	};

	const stopRendering = () => {
		rendering = false;
		cancelAnimationFrame(raf);
	};

	const normalize = (event: PointerEvent | WheelEvent): [number, number] => {
		const rect = host!.getBoundingClientRect();
		return [
			rect.width ? (event.clientX - rect.left) / rect.width : 0.5,
			rect.height ? (event.clientY - rect.top) / rect.height : 0.5
		];
	};

	// ---- 交互 ----
	const onPointerDown = (event: PointerEvent) => {
		canvasEl?.setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, normalize(event));
		// 三指同时按下 = 切换实体层(和 ddnet 官网的预览一致,手机上不用点按钮)
		if (pointers.size === 3) setEntitiesLayer(!entitiesNow);
	};

	const onPointerMove = (event: PointerEvent) => {
		if (!pointers.has(event.pointerId) || !camera) return;
		const previous = pointers.get(event.pointerId)!;
		const current = normalize(event);
		pointers.set(event.pointerId, current);

		if (pointers.size === 1) {
			camera.move_zoom(previous[0], previous[1], current[0], current[1], 1);
		} else if (pointers.size === 2) {
			const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
			if (!other) return;
			const previousDistance = Math.hypot(previous[0] - other[0], previous[1] - other[1]);
			const currentDistance = Math.hypot(current[0] - other[0], current[1] - other[1]);
			if (!previousDistance || !currentDistance) return;
			camera.move_zoom(
				(previous[0] + other[0]) / 2,
				(previous[1] + other[1]) / 2,
				(current[0] + other[0]) / 2,
				(current[1] + other[1]) / 2,
				previousDistance / currentDistance
			);
		} else {
			return;
		}
		clampZoom(camera);
	};

	const onPointerUp = (event: PointerEvent) => {
		pointers.delete(event.pointerId);
		if (canvasEl?.hasPointerCapture(event.pointerId)) {
			canvasEl.releasePointerCapture(event.pointerId);
		}
	};

	const onWheel = (event: WheelEvent) => {
		event.preventDefault();
		if (!camera) return;
		const [x, y] = normalize(event);
		// 向上滚放大、向下滚缩小
		camera.move_zoom(x, y, x, y, Math.exp(event.deltaY * 0.0015));
		clampZoom(camera);
	};

	const onKeyDown = (event: KeyboardEvent) => {
		if (!camera) return;
		switch (event.key) {
			case '+':
			case '=':
				camera.move_zoom(0.5, 0.5, 0.5, 0.5, 1 / 1.3);
				clampZoom(camera);
				break;
			case '-':
			case '_':
				camera.move_zoom(0.5, 0.5, 0.5, 0.5, 1.3);
				clampZoom(camera);
				break;
			case 'r':
			case 'R':
				resetView();
				break;
			case 'g':
			case 'G':
				setEntitiesLayer(!entitiesNow);
				break;
			case 'f':
			case 'F':
				toggleFullscreen();
				break;
		}
	};

	const onFullscreenChange = () => {
		fullscreen = document.fullscreenElement === host;
		requestAnimationFrame(resize);
	};

	/**
	 * 开预览前先探一下能不能建 WebGL2 / WebGPU。
	 * QQ、微信这类内置浏览器(X5/TBS)经常只有 WebGL1,wgpu 在里面会直接 panic,
	 * 而且 panic 后 wasm 那边的 Promise 不会 reject,界面就一直卡在初始化。
	 */

	/** 调试用:?backend=webgl / webgpu 指定图形后端,?dpr=1 关掉高分屏渲染 */
	const debugParam = (name: string) => {
		try {
			return new URLSearchParams(window.location.search).get(name);
		} catch {
			return null;
		}
	};

	/** 渲染分辨率倍数(可用 `?dpr=` 覆盖,上限 2) */
	const dprScale = () => {
		const requested = Number(debugParam('dpr'));
		if (Number.isFinite(requested) && requested > 0) return Math.min(requested, 2);
		return Math.min(window.devicePixelRatio || 1, 2);
	};

	/**
	 * canvas 是 engine.js 里持久缓存的那一块(WebGL 的 device 和 canvas 绑定),
	 * 每次打开预览只是把它挂进当前 host、重新绑一遍交互事件。
	 */
	const bindCanvas = () => {
		if (!canvasEl || boundCanvas === canvasEl) return;
		unbindCanvas();
		boundCanvas = canvasEl;
		canvasEl.addEventListener('pointerdown', onPointerDown);
		canvasEl.addEventListener('pointermove', onPointerMove);
		canvasEl.addEventListener('pointerup', onPointerUp);
		canvasEl.addEventListener('pointercancel', onPointerUp);
		canvasEl.addEventListener('wheel', onWheel, { passive: false });
		canvasEl.addEventListener('keydown', onKeyDown);
		canvasEl.addEventListener('dblclick', resetView);
		canvasEl.focus({ preventScroll: true });
	};

	const unbindCanvas = () => {
		const canvas = boundCanvas;
		if (!canvas) return;
		boundCanvas = null;
		canvas.removeEventListener('pointerdown', onPointerDown);
		canvas.removeEventListener('pointermove', onPointerMove);
		canvas.removeEventListener('pointerup', onPointerUp);
		canvas.removeEventListener('pointercancel', onPointerUp);
		canvas.removeEventListener('wheel', onWheel);
		canvas.removeEventListener('keydown', onKeyDown);
		canvas.removeEventListener('dblclick', resetView);
	};

	/** 首帧时 <dialog> 可能还没真正显示出来,等容器有尺寸再建 surface */
	const waitForSize = async () => {
		for (let i = 0; i < 60; i++) {
			const rect = host?.getBoundingClientRect();
			if (rect && rect.width > 1 && rect.height > 1) return rect;
			await new Promise(requestAnimationFrame);
		}
		throw new Error('预览区域尺寸为 0,无法初始化渲染');
	};

	const boot = () => {
		if (bootPromise) return bootPromise;
		bootPromise = (async () => {
			const rect = await waitForSize();
			aspect = rect.width / rect.height;

			// 后端探测、X5 的 WebGPU 回退、wasm 实例、贴图加载全部在 acquireRenderer 里,
			// 和 demo 播放器共用同一份启动实现;第二次打开预览时这里只是把 canvas 挪回来
			const renderer = await acquireRenderer('mappreview', {
				host,
				canvasClass: 'block h-full w-full outline-none',
				canvasFocus: true,
				rememberKey: 'ddnet:mappreview:backend',
				onStatus: (text) => (statusText = text)
			});
			if (disposed) return;

			module = renderer.module as unknown as MpModule;
			gpu = renderer.gpu as unknown as MpGpu;
			surface = renderer.surface as MpSurface;
			canvasEl = renderer.canvas;
			bindCanvas();
			if (!camera) camera = new module.TwCamera(aspect);
			canvasEl.width = canvasEl.clientWidth || 1;
			resize();
		})().catch((e) => {
			bootPromise = null;
			throw e;
		});
		return bootPromise;
	};

	/**
	 * 组件卸载 / 页面跳走:把这次挂载的东西收掉。
	 * 渲染器(wasm/device/贴图/surface/canvas)和已经上传的地图留在 engine.js 的
	 * 缓存里,下次打开地图预览几乎不用等。
	 */
	const disposeView = () => {
		disposed = true;
		loadToken++;
		stopRendering();
		unbindCanvas();
		try {
			entitiesView?.free();
		} catch {
			// 已经释放过了
		}
		entitiesView = null;
		// mapView 归 engine.js 的地图缓存管,这里只把引用放下
		mapView = null;
		try {
			camera?.free();
		} catch {
			// 已经释放过了
		}
		camera = null;
		// canvas / surface 是长期资源,只从 DOM 里摘下来
		canvasEl?.remove();
		canvasEl = null;
		surface = null;
		gpu = null;
		module = null;
		entitiesNow = false;
		entitiesLayer = false;
		ready = false;
		loadedName = null;
		previewing = false;
		bootPromise = null;
		time = 0;
		pointers.clear();
	};

	const loadMap = async (name: string) => {
		const token = ++loadToken;
		ready = false;
		errorText = '';

		try {
			await boot();
			if (token !== loadToken || disposed) return;

			statusText = '下载地图…';
			const bytes = await fetchBytes(`${MAP_BASE}/${encodeURIComponent(name)}.map`);
			if (token !== loadToken) return;

			statusText = '上传地图…';
			// engine.js 按 map key 缓存已经上传过的 TwMap:同一张图关了再开、或者
			// demo 播放器刚看过同一张图(不同 slot,各自一份 device)不用重新解析/上传。
			const loaded = await uploadMap(module!, gpu!, bytes, `preview:${name}`);
			if (token !== loadToken) return;

			if (loaded.missing.length) {
				throw new Error(`这张地图用到了我们没收录的外部贴图:${loaded.missing.join('、')}`);
			}

			// 新图已经上去了,再把旧的实体层放掉(普通地图归缓存管,不 free)
			entitiesView?.free();
			entitiesView = null;
			const view = loaded.map as MpMap;
			mapView = view;
			entitiesNow = false;
			entitiesLayer = false;

			const spawn = view.spawn_location();
			camera!.x = spawn[0] ?? 0;
			camera!.y = spawn[1] ?? 0;
			camera!.zoom = 1;
			time = 0;

			loadedName = name;
			ready = true;
			statusText = '';
			if (previewing) {
				canvasEl?.focus({ preventScroll: true });
				startRendering();
			}
		} catch (e) {
			if (token !== loadToken) return;
			console.error(e);
			errorText = describeError(e);
			statusText = '';
		}
	};

	// ---- 控件 ----
	const setEntitiesLayer = (value: boolean) => {
		if (entitiesNow === value) return;
		entitiesNow = value;
		entitiesLayer = value;
		if (value && !entitiesView && mapView && gpu) {
			try {
				entitiesView = gpu.map_to_entities_with_style(mapView, entitiesStyle);
			} catch (e) {
				console.error(e);
				entitiesNow = false;
				entitiesLayer = false;
			}
		}
	};

	/** 换实体层风格:把已经转好的那份丢掉,开着的话立刻用新图集重建 */
	const setEntitiesStyle = (style: string) => {
		styleMenuOpen = false;
		if (style === entitiesStyle) return;
		entitiesStyle = style;
		writeEntitiesStyle(style);
		entitiesView?.free();
		entitiesView = null;
		if (!entitiesNow || !mapView || !gpu) return;
		try {
			entitiesView = gpu.map_to_entities_with_style(mapView, style);
		} catch (e) {
			console.error(e);
			entitiesNow = false;
			entitiesLayer = false;
		}
	};

	/** 风格按钮上显示的名字 */
	const styleLabel = $derived(
		ENTITIES.find((entry) => entry.id === entitiesStyle)?.label ?? ENTITIES[0].label
	);

	/** 点菜单外面关掉 */
	$effect(() => {
		if (!styleMenuOpen) return;
		const close = (event: PointerEvent) => {
			if (!(event.target instanceof Element)) return;
			if (event.target.closest('[data-mp-style-menu]')) return;
			styleMenuOpen = false;
		};
		document.addEventListener('pointerdown', close, true);
		return () => document.removeEventListener('pointerdown', close, true);
	});

	const resetView = () => {
		if (!camera || !mapView) return;
		const spawn = mapView.spawn_location();
		camera.x = spawn[0] ?? 0;
		camera.y = spawn[1] ?? 0;
		camera.zoom = 1;
	};

	const toggleFullscreen = () => {
		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			host?.requestFullscreen?.().catch(() => {});
		}
	};

	let observer: ResizeObserver | null = null;

	/** 标签页不可见时彻底停掉 rAF,回来再开;引擎不重建 */
	const onVisibilityChange = () => {
		if (document.visibilityState === 'hidden') {
			stopRendering();
		} else if (previewing && mapView) {
			startRendering();
		}
	};

	onMount(() => {
		inApp = uaIsStrict(navigator.userAgent);
		entitiesStyle = readEntitiesStyle();
		if (!host) return;
		observer = new ResizeObserver(() => resize());
		observer.observe(host);
		document.addEventListener('fullscreenchange', onFullscreenChange);
		document.addEventListener('visibilitychange', onVisibilityChange);

		return () => {
			observer?.disconnect();
			document.removeEventListener('fullscreenchange', onFullscreenChange);
			document.removeEventListener('visibilitychange', onVisibilityChange);
			disposeView();
		};
	});

	// 打开预览(拿到地图名)就加载;关掉(变回 null)时只暂停渲染。
	// 同一张图重新打开时 mapView 还在缓存里,直接 resize + 恢复循环,
	// 连"下载地图 / 上传 GPU"都省掉。
	$effect(() => {
		const name = map ?? null;
		if (!name) {
			previewing = false;
			stopRendering();
			// 关掉预览后 canvas 还在(挂在隐藏的 dialog 里),但别再抢键盘 / 处理拖拽
			unbindCanvas();
			return;
		}

		previewing = true;
		// 已经加载过的 canvas 先绑回事件(第一次打开时 boot() 里会绑)
		bindCanvas();
		if (name === loadedName && mapView) {
			void (async () => {
				await waitForSize().catch(() => {});
				if (!previewing) return;
				resize();
				canvasEl?.focus({ preventScroll: true });
				startRendering();
			})();
			return;
		}
		void loadMap(name);
	});
</script>

<div class="relative h-full w-full overflow-hidden rounded bg-black" bind:this={host}>
	{#if ready}
		<div class="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap gap-2 p-2">
			<div
				class="pointer-events-auto flex flex-wrap items-center gap-1 rounded-lg bg-slate-900/80 p-1 text-xs font-semibold backdrop-blur"
			>
				<!-- 实体层开关 + 紧跟一个下箭头选图集风格(分段按钮,箭头单独可点) -->
				<div class="relative flex items-stretch" data-mp-style-menu>
					<button
						type="button"
						class="{BTN_FLAT} rounded-l {entitiesLayer ? BTN_ACTIVE : BTN_IDLE}"
						aria-pressed={entitiesLayer}
						title="显示实体层(出生点、传送门、加速带、开关等)"
						onclick={() => setEntitiesLayer(!entitiesLayer)}
					>
						<Fa icon={faLayerGroup} />
						实体层
					</button>
					<button
						type="button"
						class="{BTN_FLAT} rounded-r {entitiesLayer
							? BTN_ACTIVE
							: BTN_IDLE} border-l px-1 {entitiesLayer ? 'border-white/25' : 'border-white/15'}"
						aria-haspopup="listbox"
						aria-expanded={styleMenuOpen}
						title="实体层图集风格(当前:{styleLabel},和 demo 播放器共用)"
						onclick={() => (styleMenuOpen = !styleMenuOpen)}
					>
						<Fa icon={faCaretDown} />
					</button>
					{#if styleMenuOpen}
						<div
							class="absolute top-full left-0 z-20 mt-1 min-w-28 rounded-lg bg-slate-900/95 p-1 text-xs font-semibold text-slate-300 shadow-lg ring-1 ring-white/10 backdrop-blur"
							role="listbox"
							tabindex="-1"
						>
							{#each ENTITIES as entry (entry.id)}
								<button
									type="button"
									class="flex w-full cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-left {entry.id ===
									entitiesStyle
										? 'bg-blue-500 text-white'
										: 'hover:bg-slate-700/70 hover:text-white'}"
									role="option"
									aria-selected={entry.id === entitiesStyle}
									onclick={() => setEntitiesStyle(entry.id)}
								>
									{entry.label}
									{#if entry.id === entitiesStyle}<span aria-hidden="true">✓</span>{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
				<button
					type="button"
					class="{BTN} {BTN_IDLE}"
					title="回到出生点并恢复默认缩放 (R / 双击)"
					onclick={resetView}
				>
					<Fa icon={faArrowsRotate} />
					重置
				</button>
				{#if !inApp}
					<!-- QQ / 微信内置浏览器里没有 requestFullscreen,按钮直接不显示 -->
					<button
						type="button"
						class="{BTN} {BTN_IDLE}"
						title="全屏查看 (F)"
						onclick={toggleFullscreen}
					>
						<Fa icon={faExpand} />
						{fullscreen ? '退出全屏' : '全屏'}
					</button>
				{/if}
			</div>
		</div>
	{/if}

	{#if !ready}
		<div
			class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/90 px-6 text-slate-300"
		>
			{#if errorText}
				<Fa icon={faTriangleExclamation} class="text-3xl text-red-400" />
				<p class="max-w-md text-center text-sm text-red-300">{errorText}</p>
				<p class="text-xs text-slate-500">地图预览加载失败</p>
			{:else}
				<div
					class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-current border-t-transparent"
				></div>
				<p class="text-sm">{statusText}</p>
			{/if}
		</div>
	{/if}
</div>
