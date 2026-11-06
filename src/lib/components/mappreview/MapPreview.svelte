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
		faExpand,
		faLayerGroup,
		faTriangleExclamation
	} from '@fortawesome/free-solid-svg-icons';

	const { map = null }: { map?: string | null } = $props();

	// 渲染器启动、产物版本号、wasm 实例、贴图加载全部复用 /ddnet/engine/engine.js,
	// 和 demo 播放器只有一份实现(QQ/X5 那些坑只在那边修一次)
	import { assetUrl, bootRenderer, fetchBytes } from '../../../../static/ddnet/engine/engine.js';
	import { uaIsStrict } from '$lib/helpers';

	// 地图文件仍然走 mappreview 代理(和引擎产物无关,是服务端转发 ddnet.org/mappreview)
	const MAP_BASE = '/ddnet/mappreview/map';

	/** 相机 zoom:值越小放大越多,越大视野越广,给个上下限防止缩放到底后找不着北 */
	const MIN_ZOOM = 0.05;
	const MAX_ZOOM = 20;

	const BTN = 'flex cursor-pointer items-center gap-1 rounded px-2 py-1 transition-colors';
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

	// ---- 一次预览 = 一份 wasm 实例 + canvas + wgpu device,关掉就全放掉 ----
	let module: MpModule | null = null;
	let gpu: MpGpu | null = null;
	let surface: MpSurface | null = null;
	let camera: MpCamera | null = null;
	let canvasEl: HTMLCanvasElement | null = null;
	let bootPromise: Promise<void> | null = null;
	let aspect = 1;

	let mapView: MpMap | null = null;
	let entitiesView: MpMap | null = null;
	let rendering = false;
	let raf = 0;
	let entitiesNow = false;
	let time = 0;
	let lastTimestamp: number | null = null;
	let loadToken = 0;

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

		if (lastTimestamp !== null) time += (timestamp - lastTimestamp) / 1000;
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
		if (rendering) return;
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

	/** 每次预览都换一块新 canvas:旧 context 跟着旧 device 一起还给浏览器 */
	const createCanvas = () => {
		const canvas = document.createElement('canvas');
		canvas.tabIndex = 0;
		canvas.className = 'block h-full w-full outline-none';
		canvas.style.touchAction = 'none';
		canvas.addEventListener('pointerdown', onPointerDown);
		canvas.addEventListener('pointermove', onPointerMove);
		canvas.addEventListener('pointerup', onPointerUp);
		canvas.addEventListener('pointercancel', onPointerUp);
		canvas.addEventListener('wheel', onWheel, { passive: false });
		canvas.addEventListener('keydown', onKeyDown);
		canvas.addEventListener('dblclick', resetView);
		host?.appendChild(canvas);
		canvas.focus({ preventScroll: true });
		return canvas;
	};

	const destroyCanvas = (canvas: HTMLCanvasElement) => {
		canvas.removeEventListener('pointerdown', onPointerDown);
		canvas.removeEventListener('pointermove', onPointerMove);
		canvas.removeEventListener('pointerup', onPointerUp);
		canvas.removeEventListener('pointercancel', onPointerUp);
		canvas.removeEventListener('wheel', onWheel);
		canvas.removeEventListener('keydown', onKeyDown);
		canvas.removeEventListener('dblclick', resetView);
		canvas.remove();
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

			// 后端探测、X5 的 WebGPU 回退、新 wasm 实例、贴图加载全部在 bootRenderer 里,
			// 和 demo 播放器共用同一份实现
			const booted = await bootRenderer({
				createCanvas,
				rememberKey: 'ddnet:mappreview:backend',
				onStatus: (text) => (statusText = text)
			});
			module = booted.module as unknown as MpModule;
			gpu = booted.gpu as unknown as MpGpu;
			canvasEl = booted.canvas;

			surface = gpu.surface() ?? gpu.create_surface(canvasEl!);
			camera = new module.TwCamera(aspect);
			canvasEl!.width = canvasEl!.clientWidth || 1;
			resize();
		})().catch((e) => {
			bootPromise = null;
			throw e;
		});
		return bootPromise;
	};

	const freeMap = () => {
		stopRendering();
		entitiesView?.free();
		entitiesView = null;
		mapView?.free();
		mapView = null;
		entitiesNow = false;
		entitiesLayer = false;
		ready = false;
	};

	/** 关掉预览:地图、canvas、device、wasm 实例全部放掉 */
	const disposeEngine = () => {
		loadToken++;
		freeMap();
		surface?.free();
		surface = null;
		camera?.free();
		camera = null;
		gpu?.free();
		gpu = null;
		if (canvasEl) {
			destroyCanvas(canvasEl);
			canvasEl = null;
		}
		module = null;
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
			if (token !== loadToken) return;

			statusText = '下载地图…';
			const bytes = await fetchBytes(`${MAP_BASE}/${encodeURIComponent(name)}.map`);
			if (token !== loadToken) return;

			statusText = '解析地图…';
			const intermediate = new module!.TwMapIntermediate(bytes);

			const version = intermediate.version();
			const source = version === 'Teeworlds07' ? 'mapres_07' : 'mapres_06';
			const external = intermediate.external_mapres();
			const missing: string[] = [];

			statusText = external.length ? `加载外部贴图 (${external.length})…` : '上传地图…';
			await Promise.all(
				external.map(async (mapres) => {
					try {
						const data = await fetchBytes(
							await assetUrl(`assets/${source}/${encodeURIComponent(mapres)}.png`)
						);
						if (token !== loadToken) return;
						if (version === 'Teeworlds07') gpu!.add_external_07(mapres, data);
						else gpu!.add_external_06(mapres, data);
					} catch {
						missing.push(mapres);
					}
				})
			);
			if (token !== loadToken) return;

			if (missing.length) {
				throw new Error(`这张地图用到了我们没收录的外部贴图:${missing.join('、')}`);
			}

			statusText = '上传地图…';
			const uploaded = gpu!.upload_map(intermediate);

			// 新图已经上去了,再把旧图放掉
			entitiesView?.free();
			entitiesView = null;
			mapView?.free();
			mapView = uploaded;
			entitiesNow = false;
			entitiesLayer = false;

			const spawn = mapView.spawn_location();
			camera!.x = spawn[0] ?? 0;
			camera!.y = spawn[1] ?? 0;
			camera!.zoom = 1;
			time = 0;

			ready = true;
			statusText = '';
			startRendering();
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
				entitiesView = gpu.map_to_entities(mapView);
			} catch (e) {
				console.error(e);
				entitiesNow = false;
				entitiesLayer = false;
			}
		}
	};

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

	onMount(() => {
		inApp = uaIsStrict(navigator.userAgent);
		if (!host) return;
		observer = new ResizeObserver(() => resize());
		observer.observe(host);
		document.addEventListener('fullscreenchange', onFullscreenChange);

		return () => {
			observer?.disconnect();
			document.removeEventListener('fullscreenchange', onFullscreenChange);
			disposeEngine();
		};
	});

	// 打开预览(拿到地图名)就加载;关掉(变回 null)就把整份引擎放掉
	let showingName: string | null = null;
	$effect(() => {
		const name = map ?? null;
		if (name === showingName) return;
		showingName = name;

		if (!name) {
			disposeEngine();
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
				<button
					type="button"
					class="{BTN} {entitiesLayer ? BTN_ACTIVE : BTN_IDLE}"
					aria-pressed={entitiesLayer}
					title="显示实体层(出生点、传送门、加速带、开关等)"
					onclick={() => setEntitiesLayer(!entitiesLayer)}
				>
					<Fa icon={faLayerGroup} />
					实体层
				</button>
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
