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
		faPause,
		faPlay,
		faTriangleExclamation
	} from '@fortawesome/free-solid-svg-icons';

	const { map = null }: { map?: string | null } = $props();

	const BASE = '/ddnet/mappreview';

	/** 和 wasm 里 add_texture 认的名字一一对应 */
	const TEXTURES = ['game', 'particles', 'emoticons', 'extras', 'entities', 'default', 'x_ninja'];
	const FONT = 'DejaVuSans.ttf';

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
			mipmaps?: boolean | null
		) => Promise<MpGpu>;
		TwMapIntermediate: new (data: Uint8Array) => MpIntermediate;
		TwCamera: new (aspectRatio: number) => MpCamera;
	}

	let host = $state<HTMLDivElement>();

	let ready = $state(false);
	let statusText = $state('加载渲染引擎…');
	let errorText = $state('');

	let paused = $state(false);
	let entitiesLayer = $state(false);
	let fullscreen = $state(false);

	// ---- 静态产物的版本号:重新编译过 wasm 就换 key,免得拿到缓存里的旧文件 ----
	let versionPromise: Promise<string> | null = null;
	const getVersion = () => {
		versionPromise ??= fetch(`${BASE}/version.json`)
			.then((response) => (response.ok ? response.json() : null))
			.then((data: { version?: string } | null) => data?.version ?? 'dev')
			.catch(() => 'dev');
		return versionPromise;
	};

	const assetUrl = async (file: string) => `${BASE}/${file}?v=${await getVersion()}`;

	const fetchBytes = async (url: string) => {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`${decodeURIComponent(url)} (${response.status})`);
		}
		return new Uint8Array(await response.arrayBuffer());
	};

	/** wasm 里的 panic 不会 reject promise,只能自己守着,否则界面就一直转圈 */
	const withTimeout = <T,>(promise: Promise<T>, ms: number, message: string) =>
		Promise.race([
			promise,
			new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms))
		]);

	const describeError = (e: unknown) => {
		const message = e instanceof Error ? e.message : String(e);
		if (/adapter|webgl|webgpu|graphics|surface|图形/i.test(message)) {
			return '浏览器没能创建 WebGL2 / WebGPU 设备,换新版 Chrome / Firefox 再试试';
		}
		return message || '地图预览加载失败';
	};

	const clampZoom = (camera: MpCamera) => {
		const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom));
		if (zoom !== camera.zoom) camera.zoom = zoom;
	};

	// ---- 一次预览 = 一份 wasm 实例 + canvas + wgpu device,关掉就全放掉 ----
	let gluePromise: Promise<string> | null = null;
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
	let pausedNow = false;
	let entitiesNow = false;
	let time = 0;
	let lastTimestamp: number | null = null;
	let dirty = false;
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
		dirty = true;
	};

	const draw = (timestamp: number) => {
		if (!rendering) return;
		raf = requestAnimationFrame(draw);

		if (lastTimestamp !== null && !pausedNow) time += (timestamp - lastTimestamp) / 1000;
		lastTimestamp = timestamp;

		const target = entitiesNow ? (entitiesView ?? mapView) : mapView;
		if (!gpu || !surface || !camera || !target) return;
		// 标签页不可见 / 暂停且画面没变化时不用重绘,省点电
		if (document.hidden || (pausedNow && !dirty)) return;
		dirty = false;

		try {
			target.set_time(time);
			gpu.render_map(surface, camera, target);
		} catch (e) {
			console.error(e);
			pausedNow = true;
		}
	};

	const startRendering = () => {
		if (rendering) return;
		rendering = true;
		lastTimestamp = null;
		dirty = true;
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
		dirty = true;
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
		dirty = true;
	};

	const onKeyDown = (event: KeyboardEvent) => {
		if (!camera) return;
		switch (event.key) {
			case '+':
			case '=':
				camera.move_zoom(0.5, 0.5, 0.5, 0.5, 1 / 1.3);
				clampZoom(camera);
				dirty = true;
				break;
			case '-':
			case '_':
				camera.move_zoom(0.5, 0.5, 0.5, 0.5, 1.3);
				clampZoom(camera);
				dirty = true;
				break;
			case 'r':
			case 'R':
				resetView();
				break;
			case 'g':
			case 'G':
				setEntitiesLayer(!entitiesNow);
				break;
			case ' ':
				event.preventDefault();
				setPaused(!pausedNow);
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

	/** 调试用:?backend=webgl / webgpu 指定图形后端,?dpr=1 关掉高分屏渲染 */
	const debugParam = (name: string) => {
		try {
			return new URLSearchParams(window.location.search).get(name);
		} catch {
			return null;
		}
	};

	/**
	 * mip 采样开关。
	 * 部分设备(实测 Android Chrome + WebGL2)上,采样 mip level > 0 会直接取不到颜色,
	 * 表现为缩小后整片贴图消失;钳到 mip 0 就正常。WebGPU 路径没这个问题。
	 * 默认:有 WebGPU 用 mip,纯 WebGL 关掉;?mips=1 / ?mips=0 可强制。
	 */
	const mipmapsEnabled = () => {
		const forced = debugParam('mips');
		if (forced === '1') return true;
		if (forced === '0') return false;
		// 只有可能是 WebGPU 的浏览器才用 mip;纯 WebGL 上部分设备采样 mip>0 会全空
		return 'gpu' in navigator;
	};

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

	// glue 只下载一次(浏览器缓存),每次打开用 blob URL 重新求值,拿到全新的 module 实例
	const getGlueText = () => {
		gluePromise ??= (async () => {
			const response = await fetch(`${BASE}/pkg/twgpu_web.js?v=${await getVersion()}`);
			if (!response.ok) {
				throw new Error(`渲染器加载失败 (${response.status})`);
			}
			return response.text();
		})().catch((e) => {
			gluePromise = null;
			throw e;
		});
		return gluePromise;
	};

	/**
	 * 每次都拿一份全新的 wasm 实例。
	 * twgpu 的全局初始化(日志、panic hook)在同一个实例上没法重置,而「关掉即释放」需要
	 * 每次重建,所以这里把 glue 源码包成 blob URL 重新 import —— 新的 module 作用域 =
	 * 新的 wasm 实例,旧实例 free 完之后就只剩垃圾等着回收。
	 */
	const loadFreshModule = async (): Promise<MpModule> => {
		const source = await getGlueText();
		const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
		try {
			const loaded = (await import(/* @vite-ignore */ url)) as unknown as MpModule;
			// wasm 本体走 ?v= 的稳定地址,浏览器会缓存并复用编译结果
			await loaded.default(await assetUrl('pkg/twgpu_web_bg.wasm'));
			return loaded;
		} finally {
			URL.revokeObjectURL(url);
		}
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
			statusText = '加载渲染引擎…';
			const loaded = await loadFreshModule();
			module = loaded;

			statusText = '初始化图形设备…';
			const rect = await waitForSize();
			aspect = rect.width / rect.height;
			const canvas = createCanvas();
			canvasEl = canvas;
			// canvas 必须在 init 时就有尺寸:WebGL 后端要靠它建 context 才能找到 adapter
			gpu = await withTimeout(
				new loaded.TwGpu(debugParam('backend'), canvas, mipmapsEnabled()),
				30000,
				'初始化图形设备超时(可能是浏览器不支持 WebGL2 / WebGPU)'
			);
			surface = gpu.surface() ?? gpu.create_surface(canvas);
			camera = new loaded.TwCamera(aspect);
			canvas.width = canvas.clientWidth || 1;
			resize();

			statusText = '加载贴图…';
			await Promise.all(
				TEXTURES.map(async (name) => {
					gpu!.add_texture(name, await fetchBytes(await assetUrl(`assets/${name}.png`)));
				})
			);
			gpu.add_font(await fetchBytes(await assetUrl(`assets/${FONT}`)));
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
		paused = false;
		pausedNow = false;
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
			const bytes = await fetchBytes(`${BASE}/map/${encodeURIComponent(name)}.map`);
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
	const setPaused = (value: boolean) => {
		paused = value;
		pausedNow = value;
		dirty = true;
	};

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
		dirty = true;
	};

	const resetView = () => {
		if (!camera || !mapView) return;
		const spawn = mapView.spawn_location();
		camera.x = spawn[0] ?? 0;
		camera.y = spawn[1] ?? 0;
		camera.zoom = 1;
		dirty = true;
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
					title={paused ? '继续播放地图动画 (空格)' : '暂停地图动画 (空格)'}
					onclick={() => setPaused(!paused)}
				>
					<Fa icon={paused ? faPlay : faPause} />
					{paused ? '继续' : '暂停'}
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
				<button
					type="button"
					class="{BTN} {BTN_IDLE}"
					title="全屏查看 (F)"
					onclick={toggleFullscreen}
				>
					<Fa icon={faExpand} />
					{fullscreen ? '退出全屏' : '全屏'}
				</button>
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
