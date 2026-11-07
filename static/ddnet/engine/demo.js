/**
 * demo 播放器:一个 canvas + 一条控制栏,数据来自 twengine 的 TwDemo。
 *
 * 用法(页面里):
 *   import { mountDemoPlayer } from '/ddnet/engine/demo.js';
 *   const player = await mountDemoPlayer(host, { demoUrl, title });
 *
 * 和地图预览共用 /ddnet/engine/pkg/twengine.js 这一份 wasm,只是入口不同。
 */

/**
 * 当前部署的版本号,来自这个模块自己的 URL(`demo.js?v=…`)。
 *
 * 为什么用动态 import:`demo.js` / `engine.js` / `sound.js` 是手写的静态文件,
 * 前面的 CDN(腾讯 EdgeOne)会按 URL 缓存它们,而静态文件给不出 Cache-Control ——
 * 结果就是**发了新版用户还在跑旧代码**(X5 那个修复就是这么被吞掉的)。
 * 页面按版本号 import `demo.js?v=…`,这里再把同一个 `v` 传给两个依赖,
 * 于是每次部署这三个文件的 URL 都变,CDN 必然回源。
 */
const VERSION = new URL(import.meta.url).searchParams.get('v') ?? '';
const withVersion = (file) => (VERSION ? `${file}?v=${VERSION}` : file);

const { SoundMixer } = await import(/* @vite-ignore */ withVersion('./sound.js'));
const {
	BASE,
	bootRenderer,
	ENTITIES,
	fetchBytes,
	fetchMapByName,
	getVersion,
	gunzip,
	loadMap,
	readEntitiesStyle,
	writeEntitiesStyle
} = await import(/* @vite-ignore */ withVersion('./engine.js'));

/** 自由视角的缩放范围,和地图预览页(mappreview)保持一致 */
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 20;
/** 队伍视角(multiview)用的参数,全部照抄 DDNet 客户端 */
const MV = {
	/** cl_multiview_zoom_smoothness(默认 1300ms)换算成指数平滑的时间常数。
	 *  客户端的贝塞尔曲线用 1.3 秒,这里压到 0.28 秒,不然队伍一散开镜头要等半天 */
	zoomTau: 0.28,
	/** 镜头跟人的时间常数:近处 50ms 左右,拉得越远越慢,最多 200ms */
	followTauMin: 0.05,
	followTauPerTile: 0.0008,
	followTauMax: 0.2,
	/** cl_default_zoom = 10 -> ZoomStepsToValue(0) = 1.0 */
	defaultZoom: Math.pow(0.866025, 0),
	/** 死了/切走之后还留多久的位置(客户端是 freeze+3s 才隐藏,这里简化) */
	keepPosition: 2,
	/**
	 * 单人跟随 ↔ 团队视角 切换时,镜头位置的过渡时间常数(秒)。
	 * 换模式时目标会从"玩家身上"跳到"包围盒中点"(或反过来),直接 move_to 就是啪一下。
	 */
	modeBlendTau: 0.12,
	/**
	 * 过渡的上限时长。正常情况下靠"离目标足够近"提前收尾,这里只是兜底:
	 * 距离再远(比如两个人在图的两头)也不至于过渡不完就硬切。
	 */
	modeBlendTime: 1.2
};
/**
 * 动态镜头,参数锁死成 DDNet 客户端**旁观**用的那一套。
 *
 * 客户端 `CCamera::UpdateCamera()` 里,只要能拿到相机信息(录 demo 回放时跟随模式
 * 一定拿得到,团队视角除外),就直接写死:
 *   Smoothness = 50, Stabilizing = 50, IsDyncam = true
 * 注释原话是 "use hardcoded smooth camera for spectating unless player explicitly
 * turn it off" —— 我们这里永远是旁观,所以把那组常数搬过来,不用配置项。
 *
 * 死区/跟随比例客户端走的是服务器发来的相机信息(m_SpecInfo),转出来的 demo 里没有,
 * 就用 cl_dyncam 的默认值(300 / 60),不然 0 的话动态镜头等于没开。
 */
const DYN = {
	smoothness: 50,
	stabilizing: 50,
	deadzone: 300,
	followFactor: 60,
	/** OffsetAmount 的上限是 350 * zoom(客户端那行) */
	maxOffset: 350,
	/**
	 * 偏移最多把被跟随的 tee 推到屏幕内这个比例的位置。
	 * 客户端的 350*zoom 在 16:9 默认视野下约是半屏的 87%,再往外主视角 tee 就快出屏了;
	 * 这里按实际视野再收一刀,保证 tee 始终留在画面里。
	 */
	safeScreenRatio: 0.6
};
/** (1 - smoothness/100) * 9.5 + 0.5 */
const DYN_CAMERA_SPEED = (1 - DYN.smoothness / 100) * 9.5 + 0.5;
/** 1 + stabilizing/100 */
const DYN_STABILIZING = 1 + DYN.stabilizing / 100;
const DYN_LOG_STABILIZING = Math.log10(DYN_STABILIZING);
/**
 * 准星的时间常数。客户端是拿历史采样做多项式插值(INTERP_DELAY = 4.25 tick ≈ 85ms),
 * 这里用一个同量级的一阶平滑近似:瞄准点本来就会跳,不平滑的话准星一抖一抖的。
 */
const CURSOR_TAU = 0.085;

/** DDNet 的 CCamera::ZoomStepsToValue */
const zoomStepsToValue = (steps) => Math.pow(0.866025, steps);
/** 没有音量滑杆了,就一个固定的舒适音量 */
const DEFAULT_VOLUME = 0.7;
const SPEEDS = [0.25, 0.5, 1, 2];
/** 速滑条的范围:0.1× 用来看慢动作,3× 够快了 */
const SPEED_MIN = 0.1;
const SPEED_MAX = 3;
const formatSpeed = (value) => `${Number(value.toFixed(2))}×`;
const TICKS_PER_SECOND = 50;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * 播放器的显示偏好。名字 / 准星以前是两个独立按钮,现在和动态镜头、实体层一起
 * 收进了「显示选项」上拉菜单,并写到 localStorage 里记住用户的选择。
 *
 * 读的时候对每个键都做类型校验(只收 boolean):用户手改 / 别的版本写过垃圾值
 * 都不会把播放器搞坏。localStorage 本身在无痕模式 / 存满时可能直接抛异常,兜住。
 */
const PREFS_KEY = 'tw-demo-prefs';
const DEFAULT_PREFS = { dyncam: true, entities: false, names: true, cursor: true };

const readPrefs = () => {
	const prefs = { ...DEFAULT_PREFS };
	try {
		const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
		if (stored && typeof stored === 'object') {
			for (const [key, fallback] of Object.entries(DEFAULT_PREFS)) {
				const value = stored[key];
				// 布尔开关和字符串(实体层风格)分开校验,脏值一律忽略
				if (typeof fallback === 'boolean' && typeof value === 'boolean') {
					prefs[key] = value;
				} else if (typeof fallback === 'string' && typeof value === 'string' && value.length < 32) {
					prefs[key] = value;
				}
			}
		}
	} catch {
		// 隐私模式禁用存储 / 存了坏 JSON:用默认值就行,不该因此起不来
	}
	return prefs;
};

const writePrefs = (prefs) => {
	try {
		localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
	} catch {
		// 同上,存不了就算了
	}
};

const formatTime = (seconds) => {
	const total = Math.max(0, seconds);
	const minutes = Math.floor(total / 60);
	return `${String(minutes).padStart(2, '0')}:${(total - minutes * 60).toFixed(2).padStart(5, '0')}`;
};

/** 内联 SVG 图标(24x24,currentColor) */
const ICONS = {
	play: '<path d="M8 5.14v13.72L19 12z"/>',
	pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>',
	volumeOn:
		'<path d="M4 9v6h3.5L12 19V5L7.5 9z"/><path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
	volumeOff:
		'<path d="M4 9v6h3.5L12 19V5L7.5 9z"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
	download:
		'<path d="M12 4v10m0 0l-4-4m4 4l4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 18h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
	fullscreen:
		'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
	zoomIn:
		'<circle cx="11" cy="11" r="6.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M11 8.4v5.2M8.4 11h5.2M15.6 15.6L20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
	zoomOut:
		'<circle cx="11" cy="11" r="6.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.4 11h5.2M15.6 15.6L20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
	names:
		'<rect x="3.2" y="5.6" width="17.6" height="12.8" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 10.2h3.6M7 13.9h9.4M13.4 10.2h3.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
	cursor:
		'<path d="M12 3v4.2M12 16.8V21M3 12h4.2M16.8 12H21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="12" r="1.7"/>',
	team: '<path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15.5 11a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 19c0-2.8 2.5-4.6 5.5-4.6S14 16.2 14 19M14.5 14.8c2.6.2 4.5 1.8 4.5 4.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
	/* 「显示选项」上拉菜单:三条带旋钮的滑杆 */
	sliders:
		'<path d="M4 7h6.5M15.5 7H20M4 12h3.5M12.5 12H20M4 17h8.5M17.5 17H20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="13" cy="7" r="2.1"/><circle cx="10" cy="12" r="2.1"/><circle cx="15" cy="17" r="2.1"/>',
	/* 动态镜头 */
	camera:
		'<path d="M3.4 8.3h3.2l1.4-2.3h8l1.4 2.3h3.2v9.4H3.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12.7" r="3.1" fill="none" stroke="currentColor" stroke-width="1.6"/>',
	/* 实体层 */
	layers:
		'<path d="M12 3.8l8.2 4.3-8.2 4.3-8.2-4.3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M3.8 12.2l8.2 4.3 8.2-4.3M3.8 16.1l8.2 4.3 8.2-4.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
	/* 播放速度:半圆表盘 + 指针 */
	speed:
		'<path d="M4.6 17.4a8.4 8.4 0 1 1 14.8 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M12 13.6l3.6-3.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="14.6" r="1.5"/>',
	/* 下拉箭頭 */
	caret:
		'<path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
	/* 二级菜单:进入 / 返回 */
	next: '<path d="M10 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
	back: '<path d="M14 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
};

const icon = (name) =>
	`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">${ICONS[name]}</svg>`;

const iconButton = (name, title, className = '') => {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = `tw-btn ${className}`.trim();
	button.title = title;
	button.setAttribute('aria-label', title);
	button.innerHTML = icon(name);
	return button;
};

/** 上拉菜单里的一行:图标 + 文字 + 开关,整行就是个 role=menuitemcheckbox 按钮 */
const menuRow = (iconName, label, hint, { submenu = false } = {}) => {
	const row = element('div', 'tw-menu-row');
	const main = element('button', 'tw-menu-main');
	main.type = 'button';
	main.title = hint;
	const glyph = element('span', 'tw-menu-glyph');
	glyph.innerHTML = icon(iconName);
	main.append(glyph, element('span', 'tw-menu-label', label));
	if (submenu) {
		const chevron = element('span', 'tw-menu-chevron');
		chevron.innerHTML = icon('next');
		main.append(chevron);
	}
	const switchButton = element('button', 'tw-menu-switch');
	switchButton.type = 'button';
	switchButton.setAttribute('role', 'switch');
	const switchTrack = element('span', 'tw-switch');
	switchTrack.append(element('span', 'tw-switch-knob'));
	switchButton.append(switchTrack);
	row.append(main, switchButton);
	return { row, main, switch: switchButton };
};

const element = (tag, className, text) => {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
};

/**
 * 问浏览器:这个页面现在能不能自动出声。
 *
 * 自动播放策略不是"能不能播",而是"这次访问给不给权限":用户在这个站上互动过、
 * 或者 Media Engagement 够高,就直接放行。所以不能写死静音 —— 放行时默认就该有声。
 *
 * 有 `navigator.getAutoplayPolicy`(Chrome 110+)就直接问,它查 'audiocontext'
 * 正好对着我们真正在用的那条路。没有这个 API 的浏览器(Firefox / Safari)
 * 返回 null,由调用方去看 AudioContext 的初始状态。
 *
 * @returns {boolean | null} null = 这个浏览器不告诉我,得自己试
 */
function autoplayPolicy() {
	try {
		const policy = navigator.getAutoplayPolicy?.('audiocontext');
		return policy ? policy === 'allowed' : null;
	} catch {
		return null;
	}
}

export async function mountDemoPlayer(host, options) {
	const {
		demoUrl,
		demoBytes,
		title = '',
		subtitle = '',
		name = '',
		time: startTime = 0,
		// 皮肤名 → 图片 URL。由调用方注入(页面里传全局皮肤缓存的 getSkinUrl),
		// 这个模块是浏览器直接加载的静态脚本,拿不到 Svelte 的 $lib。
		// 返回 null 表示皮肤库里没有,就按 default 渲染。
		resolveSkin = null,
		// QQ / 微信内置浏览器(X5):下载和全屏都不工作,按钮直接禁用
		inApp = false,
		// 强制图形后端。X5 的 WebGPU 只是"能探测",真用就炸,页面会在内置浏览器里传 'webgl'
		backend = null,
		// 部署版本号(SSR 读的 version.json),传给 engine.js 就不再自己 fetch 一次
		version = ''
	} = options;

	host.replaceChildren();
	const style = element('style');
	style.textContent = CSS;
	const root = element('div', 'tw-player');
	let canvas = element('canvas', 'tw-canvas');
	// 名字牌用 DOM 渲染(浏览器自带字体,不用为 CJK 单独塞一份 Source Han Sans)
	const nameLayer = element('div', 'tw-names');
	const overlay = element('div', 'tw-overlay');
	const status = element('div', 'tw-status', '加载引擎…');
	overlay.append(status);

	// 顶部标题 + 底部控制条都是浮在画面上的 overlay,播放时 2.5 秒不动就自动隐藏
	const top = element('div', 'tw-top');
	const titleLabel = element('div', 'tw-title', title);
	top.append(titleLabel);

	const bar = element('div', 'tw-bar');
	// 三行:跟随/队伍一行、进度条独占一行、其余按钮一行
	const whoRow = element('div', 'tw-row tw-row-who');
	const seekRow = element('div', 'tw-row tw-row-seek');
	const mainRow = element('div', 'tw-row tw-row-main');
	const playButton = iconButton('play', '播放 / 暂停(空格)', 'tw-play');
	const timeLabel = element('span', 'tw-time', '00:00.00');
	// 进度条:native slider 只负责交互(透明),视觉用自己的 div 画,省得跟各家浏览器
	// 的 ::-webkit-slider-runnable-track 较劲
	const seekWrap = element('div', 'tw-seekwrap');
	const seekTrack = element('div', 'tw-seektrack');
	const seekFill = element('div', 'tw-seekfill');
	const seekKnob = element('div', 'tw-seekknob');
	seekTrack.append(seekFill, seekKnob);
	const seek = element('input', 'tw-seek');
	seek.type = 'range';
	seek.min = '0';
	seek.max = '1000';
	seek.value = '0';
	seek.step = '1';
	seek.setAttribute('aria-label', '进度');
	seekWrap.append(seekTrack, seek);
	const duration = element('span', 'tw-time tw-dur', '00:00.00');
	const muteButton = iconButton('volumeOff', '取消静音 / 静音', 'tw-mute tw-off');

	// 播放速度:按钮 + 上弹框(滑条 + 预设)。原生 select 各端样式不统一,
	// 也没办法细调速度(慢动作看路线的时候很需要)。
	const speedButton = iconButton('speed', '播放速度', 'tw-speed-btn');
	speedButton.setAttribute('aria-haspopup', 'true');
	speedButton.setAttribute('aria-expanded', 'false');
	const speedValue = element('span', 'tw-speed-value', formatSpeed(1));
	speedButton.append(speedValue);
	const speedMenu = element('div', 'tw-menu tw-speed-menu');
	speedMenu.hidden = true;
	speedMenu.setAttribute('role', 'group');
	speedMenu.setAttribute('aria-label', '播放速度');
	const speedHead = element('div', 'tw-speed-head');
	const speedReadout = element('span', 'tw-speed-readout', formatSpeed(1));
	speedHead.append(element('span', null, '播放速度'), speedReadout);
	const speedRange = element('input', 'tw-speed-range');
	speedRange.type = 'range';
	speedRange.min = String(SPEED_MIN);
	speedRange.max = String(SPEED_MAX);
	speedRange.step = '0.05';
	speedRange.value = '1';
	speedRange.setAttribute('aria-label', '播放速度');
	const speedPresets = element('div', 'tw-speed-presets');
	const speedChips = SPEEDS.map((value) => {
		const chip = element('button', 'tw-speed-preset', formatSpeed(value));
		chip.type = 'button';
		chip.dataset.speed = String(value);
		speedPresets.append(chip);
		return chip;
	});
	speedMenu.append(speedHead, speedRange, speedPresets);
	const speedAnchor = element('div', 'tw-anchor');
	speedAnchor.append(speedButton, speedMenu);

	// 跟随谁:自己画的 dropdown。原生 select 的选项样式改不动,而且我们要把「死亡」
	// 弄成次级颜色、还能跟主题对齐(频道/移动端上的 select 长得全不一样)。
	const followButton = element('button', 'tw-btn tw-follow-btn');
	followButton.type = 'button';
	followButton.title = '跟随谁';
	followButton.setAttribute('aria-haspopup', 'listbox');
	followButton.setAttribute('aria-expanded', 'false');
	const followValue = element('span', 'tw-follow-value', '自由视角');
	const caret = element('span', 'tw-caret');
	caret.innerHTML = icon('caret');
	followButton.append(followValue, caret);
	const followMenu = element('div', 'tw-menu tw-follow-menu');
	followMenu.hidden = true;
	followMenu.setAttribute('role', 'listbox');
	followMenu.setAttribute('aria-label', '跟随谁');
	const followList = element('div', 'tw-follow-list');
	followMenu.append(followList);
	const followAnchor = element('div', 'tw-anchor');
	followAnchor.append(followButton, followMenu);

	const teamButton = iconButton(
		'team',
		'队伍视角:同队伍的玩家自动框进一个画面(DDNet 的 multiview)',
		'tw-team'
	);
	teamButton.append(element('span', null, '团队视角'));
	const zoomOut = iconButton('zoomOut', '缩小', 'tw-zoom');
	const zoomIn = iconButton('zoomIn', '放大', 'tw-zoom');
	const download = element('a', 'tw-btn', '');
	download.title = '下载 demo';
	download.setAttribute('aria-label', '下载 demo');
	download.innerHTML = icon('download');
	download.download = `${(title || name || 'demo').replace(/[\\/:*?"<>|]/g, '_')}.demo`;
	const fullscreenButton = iconButton('fullscreen', '全屏');

	// 显示选项(动态镜头 / 实体层 / 名字 / 准星):一个按钮 + 一个上拉的浮层。
	// 以前名字和准星是两个常驻按钮,按钮数量随功能增长会卷到底,所以收进菜单。
	const settingsButton = iconButton(
		'sliders',
		'显示选项:动态镜头 / 实体层 / 名字 / 准星',
		'tw-settings'
	);
	settingsButton.setAttribute('aria-haspopup', 'true');
	settingsButton.setAttribute('aria-expanded', 'false');
	const menu = element('div', 'tw-menu');
	menu.hidden = true;
	menu.setAttribute('role', 'menu');
	menu.setAttribute('aria-label', '显示选项');
	// 两页:主列表 + 「实体层样式」二级菜单。
	// 窄屏上并排浮层放不下,所以做成整块替换(带返回键)。
	const menuMain = element('div', 'tw-menu-page');
	const menuStyle = element('div', 'tw-menu-page');
	menuStyle.hidden = true;

	const dyncamRow = menuRow('camera', '动态镜头', '镜头跟着瞄准点轻微偏移(DDNet 旁观动态镜头)');
	const namesRow = menuRow('names', '玩家名字', '显示 / 隐藏玩家名字');
	const cursorRow = menuRow('cursor', '准星', '显示被跟随玩家的瞄准点');
	// 实体层这行左边带箭头:点名字 = 进二级菜单挑样式(顺手打开实体层),点右边开关 = 单纯开关
	const entitiesRow = menuRow('layers', '实体层', '实体层:点名字选图集风格', { submenu: true });

	const styleBack = element('button', 'tw-menu-back');
	styleBack.type = 'button';
	styleBack.innerHTML = `${icon('back')}<span>实体层样式</span>`;
	const styleRows = ENTITIES.map(({ id, label }) => {
		const row = element('button', 'tw-menu-item tw-menu-style');
		row.type = 'button';
		row.dataset.style = id;
		row.setAttribute('role', 'menuitemradio');
		row.title = `实体层图集:${label}`;
		row.append(element('span', 'tw-menu-label', label), element('span', 'tw-menu-check'));
		return row;
	});
	menuStyle.append(styleBack, ...styleRows);
	menuMain.append(dyncamRow.row, entitiesRow.row, namesRow.row, cursorRow.row);
	menu.append(menuMain, menuStyle);

	const whoLabel = element('span', 'tw-who-label', '跟随');
	// 团队视角放在名字选择框**左侧**:它宽度固定,右边的 dropdown 换名字时
	// 变宽变窄都不会把它顶得跑来跑去。
	whoRow.append(whoLabel, teamButton, followAnchor);
	const spacer = element('span', 'tw-spacer');
	seekRow.append(timeLabel, seekWrap, duration);
	mainRow.append(
		playButton,
		muteButton,
		speedAnchor,
		spacer,
		settingsButton,
		zoomOut,
		zoomIn,
		download,
		fullscreenButton,
		menu
	);
	// QQ / 微信的内置浏览器(X5):`download` 属性不生效、`requestFullscreen` 也没有,
	// 留着也只是点了没反应 —— 干脆不显示这两个按钮(要在 append 之后删,不然白删)。
	if (inApp) {
		download.remove();
		fullscreenButton.remove();
	}
	bar.append(whoRow, seekRow, mainRow);
	root.append(canvas, nameLayer, overlay);
	if (title) root.append(top);
	root.append(bar);
	host.append(style, root);

	const setStatus = (text) => {
		status.textContent = text;
		status.hidden = !text;
	};

	let destroyed = false;
	const mixer = new SoundMixer({ base: BASE, version: await getVersion() });
	// 先按"不给出声"算,下面拿到权限再决定(见文件末尾的 initMuted)
	let muted = true;

	try {
		// 后端探测 / X5 的 WebGPU 回退 / wasm 实例 / 贴图加载都在 bootRenderer 里,
		// 和地图预览页共用同一份实现(那些坑只在 engine.js 修一次)。
		// 名字牌走 DOM(系统字体),wasm 里的 SDF 字体用不上,别白下 757 KB 的 ttf。
		const {
			module,
			gpu,
			canvas: activeCanvas
		} = await bootRenderer({
			canvas,
			font: false,
			onStatus: setStatus,
			...options.gpu
		});
		// 后端回退时 bootRenderer 可能换了一块新 canvas(旧的那块已经绑过上下文),
		// 后面的 surface / 事件 / 尺寸计算都得用它的
		if (activeCanvas && activeCanvas !== canvas) canvas = activeCanvas;
		if (destroyed) return null;

		setStatus('读取 demo…');
		const raw = demoBytes ?? (await fetchBytes(demoUrl));
		const bytes = await gunzip(raw);
		if (!inApp) {
			download.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
		}

		const intermediate = new module.TwDemoIntermediate(bytes);
		const length = Number(intermediate.length);
		seek.max = String(Math.max(1, Math.round(length * 1000)));

		setStatus(`加载地图 ${intermediate.map_name}…`);
		// demo 里内嵌了地图就用内嵌的(自己录的 demo 都有),否则按名字去代理取
		const embedded = intermediate.contained_map_data();
		let map;
		try {
			map = (await loadMap(module, gpu, embedded ?? (await fetchMapByName(intermediate.map_name))))
				.map;
		} catch (error) {
			if (!embedded) throw error;
			// 内嵌的那份地图偶尔比 twmap 的校验更"脏":比如 Sunny Side Up 的 SoundSource
			// 指向 envelope 3,而地图只有 2 个 envelope —— DDNet 客户端直接忽略,twmap 会拒绝解析。
			// 退回用站内代理取的**当前版本**同一张图(可能和录像当时的版本略有出入,但能看)。
			console.warn('[map] 内嵌地图加载失败,改用当前版本:', error);
			setStatus(`内嵌地图有问题,改用当前版本…`);
			map = (await loadMap(module, gpu, await fetchMapByName(intermediate.map_name))).map;
		}

		const demo = intermediate.build(map);
		const camera = new module.TwCamera(1);
		const surface = gpu.create_surface(canvas);

		let aspect = 1;
		/** 渲染用的设备像素比(封顶 2,性能取舍):决定 canvas 后备缓冲的大小 */
		let renderDpr = 1;
		/**
		 * 屏幕真实的设备像素比。DOM 里的东西(名字牌)由浏览器按**真实** dpr 光栅化,
		 * 不受 canvas 那个 2x 上限影响,所以对齐网格要用这个值。
		 */
		let pixelDpr = 1;
		/** 名字牌的 DOM 节点(id -> span),`resize` 里要清字号缓存,所以得先声明 */
		const nameLabels = new Map();
		const resize = () => {
			const rect = root.getBoundingClientRect();
			const realDpr = window.devicePixelRatio || 1;
			const nextRender = Math.min(2, realDpr);
			const width = Math.max(1, Math.round((rect.width || canvas.clientWidth) * nextRender));
			const height = Math.max(1, Math.round((rect.height || canvas.clientHeight) * nextRender));
			surface.resize(width, height);
			aspect = width / height;
			camera.aspect_ratio = aspect;
			// 换了 dpr,名字牌的字号和定位网格都要按新的重排
			if (nextRender !== renderDpr || realDpr !== pixelDpr) {
				renderDpr = nextRender;
				pixelDpr = realDpr;
				for (const label of nameLabels.values()) label.dataset.size = '';
			}
		};
		resize();
		const observer = new ResizeObserver(resize);
		observer.observe(root);
		// 把窗口拖到另一块不同 DPI 的屏幕上时 CSS 尺寸不变,ResizeObserver 不会触发,
		// 得单独听一下 dpr 的变化
		const dprQuery = window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`);
		const onDprChange = () => {
			resize();
			dprQuery?.removeEventListener?.('change', onDprChange);
		};
		dprQuery?.addEventListener?.('change', onDprChange);

		// ---- 播放状态 ----
		let playing = false;
		let speed = 1;
		let time = clamp(startTime, 0, Math.max(0, length - 0.05));
		const playerNames = () => {
			try {
				return JSON.parse(demo.players_json());
			} catch {
				return [];
			}
		};
		const pickDefaultFollow = () => {
			if (typeof options.focus === 'number') return options.focus;
			const local = demo.focused_player();
			if (local !== null) return local;
			const firstAlive = playerNames().find((p) => p.alive);
			return firstAlive ? firstAlive.id : null;
		};
		let follow = pickDefaultFollow();
		// 队伍视角:跟随目标在同一队(team > 0)时,自动把整队框进画面
		// 用户是否想要队伍视角(偏好);实际是否生效还要求当前是跟随模式
		let teamWanted = options.team !== false;
		/** 各 tee 最后出现的位置,死亡后短暂保留,免得镜头乱跳 */
		const lastSeen = new Map();
		/** 队伍视角的平滑状态(客户端 HandleMultiView 里的那几个成员) */
		const mv = { zoom: 0, oldPos: null, oldDist: 0, teleported: false, personal: 0, active: false };
		let playersCache = [];
		/** 每 0.25 秒刷一次(队伍/生死变化不快,位置是每帧单独取的) */
		const refreshPlayers = () => {
			playersCache = playerNames();
		};
		let dragging = false;
		let frame = 0;
		let lastFrameTime = 0;
		let seekbarHold = 0;
		let snapCamera = true;
		const skins = new Set();
		const recentSounds = [];
		/** 上次重建跟随列表时的玩家签名(数量 + 生死 + 名字),变了才重建 */
		let followOptionsAt = '';

		/** 跟随按钮上的文字 + 列表里选中的那一行(名字/生死会变,要跟着刷) */
		const syncFollowButton = () => {
			const current = follow === null ? null : playersCache.find((p) => p.id === follow);
			followValue.textContent =
				follow === null ? '自由视角' : current ? current.name : `#${follow}`;
			followButton.classList.toggle('tw-off', current != null && !current.alive);
			for (const rowElement of followList.children) {
				const selected = rowElement.dataset.id === (follow === null ? 'free' : String(follow));
				rowElement.classList.toggle('tw-on', selected);
				rowElement.setAttribute('aria-selected', String(selected));
			}
		};

		camera.zoom = 1;
		const initial = follow !== null ? demo.player_position(follow) : null;
		if (initial) camera.move_to(initial[0], initial[1]);

		/** 队伍视角是否真的在用:要“用户想开”且“在跟随某个玩家” */
		const teamActive = () => teamWanted && follow !== null;
		const syncTeamButton = () => {
			const available = follow !== null;
			teamButton.disabled = !available;
			teamButton.classList.toggle('tw-on', available && teamWanted);
			teamButton.title = available
				? teamWanted
					? '队伍视角:同队伍的玩家自动框进一个画面(点击关闭)'
					: '队伍视角已关闭(点击开启)'
				: '自由视角下没有队伍视角,先选一个玩家';
		};

		const updateFollowOptions = () => {
			const players = playerNames();
			// 数量/生死/名字都没变就不用重建(每 10 帧调一次,不能每次都换 DOM)
			const signature = players.map((p) => `${p.id}:${p.alive ? 1 : 0}:${p.name}`).join('|');
			if (signature === followOptionsAt) {
				syncFollowButton();
				return;
			}
			followOptionsAt = signature;
			followList.replaceChildren();
			const row = (id, label, alive) => {
				const option = element('button', 'tw-follow-option');
				option.type = 'button';
				option.setAttribute('role', 'option');
				option.dataset.id = id;
				option.append(element('span', 'tw-follow-name', label));
				if (!alive) option.append(element('span', 'tw-follow-tag', '死亡'));
				option.addEventListener('click', () => {
					setFollow(id === 'free' ? null : Number(id));
					setFollowOpen(false);
				});
				followList.append(option);
			};
			row('free', '自由视角', true);
			for (const player of players) row(String(player.id), player.name, player.alive);
			syncFollowButton();
		};
		refreshPlayers();
		updateFollowOptions();

		/** 名字牌开关 */
		/**
		 * 单人跟随时的 zoom。团队视角会自己算 zoom(要框下整队),退出后要回到用户
		 * 用滚轮/按钮调的这个值 —— 不然会停在团队视角那个拉得很远的缩放上。
		 */
		let followZoom = 1;
		/** 镜头模式:'free' | 'single' | 'team',用来发现切换 */
		let camMode = 'free';
		/** 切换模式后还剩多少秒的位置过渡 */
		let camBlendLeft = 0;

		/**
		 * 平滑地把镜头位置挪到目标。用在两处:进出团队视角、换观察对象。
		 *
		 * 结束条件不能只看时间 —— 距离远的时候到点还没走到位,交还给各模式自己的逻辑
		 * (单人跟上直接用 move_to)就会补上一脚,jump 一下。所以"离目标足够近"才收尾,
		 * 时间只作为兜底。
		 */
		const blendCamera = (x, y, dt, snap) => {
			if (snap) {
				camBlendLeft = 0;
				return false;
			}
			if (camBlendLeft <= 0) return false;
			const alpha = dt > 0 ? 1 - Math.exp(-dt / MV.modeBlendTau) : 1;
			camera.move_to(camera.x + (x - camera.x) * alpha, camera.y + (y - camera.y) * alpha);
			camBlendLeft = Math.max(0, camBlendLeft - dt);
			// 到位了(或兜底超时)就收尾
			if (Math.hypot(x - camera.x, y - camera.y) < 0.05) camBlendLeft = 0;
			return true;
		};

		/** zoom 一律指数平滑到目标(客户端 cl_multiview_zoom_smoothness 的量级) */
		const easeZoom = (zoom, dt, snap) => {
			if (snap || dt <= 0) camera.zoom = zoom;
			else camera.zoom += (zoom - camera.zoom) * (1 - Math.exp(-dt / MV.zoomTau));
		};

		// ---- 显示偏好(动态镜头 / 实体层 / 名字 / 准星),存 localStorage ----
		const prefs = readPrefs();
		/** 三个上拉浮层是否展开(显示选项 / 播放速度 / 跟随谁) */
		let menuOpen = false;
		let speedOpen = false;
		let followOpen = false;
		// 四个开关的当前值先按偏好初始化,各自的 setter 才会去动 DOM
		let showDyncam = prefs.dyncam;
		let showEntities = prefs.entities;
		let showNames = prefs.names;
		let showCursor = prefs.cursor;
		/** 实体层用哪套图集(偏好存在 engine.js 那个共享 key 里,和地图预览页共用) */
		let entitiesStyle = readEntitiesStyle();

		/** 把菜单每一行的开关状态对齐到实际状态(所有改状态的地方最后都调它) */
		const syncMenu = () => {
			for (const [item, value] of [
				[dyncamRow, showDyncam],
				[entitiesRow, showEntities],
				[namesRow, showNames],
				[cursorRow, showCursor]
			]) {
				item.switch.setAttribute('aria-checked', String(value));
				item.switch.classList.toggle('tw-on', value);
				item.row.classList.toggle('tw-on', value);
			}
			for (const row of styleRows) {
				const selected = row.dataset.style === entitiesStyle;
				row.classList.toggle('tw-on', selected);
				row.setAttribute('aria-checked', String(selected));
			}
			settingsButton.classList.toggle('tw-on', menuOpen);
		};
		/** 用户改了哪个开关就落盘一次(四个字段一起写,不用管先后) */
		const savePrefs = () =>
			writePrefs({
				dyncam: showDyncam,
				entities: showEntities,
				names: showNames,
				cursor: showCursor
			});

		/**
		 * 实体层:和地图预览页一个做法 —— 让 wasm 把地图转成「只有实体层」的那一份
		 * (`map_to_entities`,传送点/刷子/贴图实体),渲染时用它替掉普通地图。
		 * 第一次打开才转,之后缓存着一直用。
		 */
		let entitiesView = null;
		const renderMap = () => {
			if (!showEntities) return map;
			if (!entitiesView) {
				try {
					entitiesView = gpu.map_to_entities_with_style(map, entitiesStyle);
				} catch (error) {
					// 贴图没装 / wasm 报错:退回普通地图,别每帧都抛
					console.warn('[entities]', error);
					showEntities = false;
					syncMenu();
					savePrefs();
				}
			}
			return entitiesView ?? map;
		};
		const setEntitiesVisible = (value) => {
			showEntities = value;
			syncMenu();
			savePrefs();
		};
		/** 换实体层风格:要换一张图集,已经转好的那份得丢掉重建(下次渲染时懒加载) */
		const setEntitiesStyle = (style) => {
			if (!ENTITIES.some((entry) => entry.id === style) || style === entitiesStyle) return;
			entitiesStyle = style;
			try {
				entitiesView?.free();
			} catch {
				// 已经释放过了
			}
			entitiesView = null;
			writeEntitiesStyle(style);
			syncMenu();
		};

		/**
		 * 动态镜头开关(cl_dyncam 的旁观版)。关掉就是纯粹的平滑跟随,不带瞄准点偏移。
		 */
		const setDyncamEnabled = (value) => {
			showDyncam = value;
			if (!value) resetDyncam();
			syncMenu();
			savePrefs();
		};

		const setNameplatesVisible = (value) => {
			showNames = value;
			nameLayer.hidden = !value;
			syncMenu();
			savePrefs();
			if (value) {
				// 打开就立刻摆好位置,别等下一帧(低帧率机器上会明显晚一拍)
				updateNameplates();
				return;
			}
			// 关掉就把节点收掉,别留一堆看不见的 span 在 DOM 里
			for (const label of nameLabels.values()) label.remove();
			nameLabels.clear();
		};

		/** 准星开关(客户端 cl_spec_cursor 默认开着) */
		const setCursorVisible = (value) => {
			showCursor = value;
			syncMenu();
			savePrefs();
		};
		/** 准星只跟随时才可用(自由视角下没有"跟谁"可跟) */
		const syncCursorButton = () => {
			const disabled = follow === null;
			for (const button of [cursorRow.main, cursorRow.switch]) {
				button.disabled = disabled;
				button.classList.toggle('tw-disabled', disabled);
			}
		};

		const setMuted = (value) => {
			muted = value;
			mixer.setEnabled(!muted);
			muteButton.innerHTML = icon(muted ? 'volumeOff' : 'volumeOn');
			muteButton.classList.toggle('tw-off', muted);
			// 静音时标红:不然"没声音"这件事很容易被忽略,以为是播放器坏了
			muteButton.classList.toggle('tw-alert', muted);
			muteButton.title = muted ? '取消静音(当前静音)' : '静音';
			if (!muted) {
				void mixer.resume().then((ok) => {
					// 有些浏览器解不开 Ogg/Opus,那就老老实实退回静音,别骗用户
					if (!ok) {
						setMuted(true);
						muteButton.title = '这个浏览器解不开声音';
						return;
					}
					// 自动播放权限的事:resume() 只是把声音包解好,
					// 真到不了 running 就说明浏览器还不让出声,照样退回静音
					if (!mixer.isRunning()) {
						setMuted(true);
						muteButton.title = '浏览器还不让出声,点一下喇叭再开';
						return;
					}
					mixer.setVolume(DEFAULT_VOLUME);
				});
			}
		};
		setMuted(true);
		// 已经拿到出声权限的话就别默认静音了(用户在这个站上互动过就属于这种情况)。
		// 没有 `getAutoplayPolicy` 的浏览器就看音频上下文建起来是不是直接 running ——
		// 被拦的时候它会停在 suspended,那就是要静音加标红。
		if (autoplayPolicy() ?? mixer.prepare()) setMuted(false);

		const setPlaying = (value) => {
			playing = value;
			playButton.innerHTML = icon(playing ? 'pause' : 'play');
			// 暂停时控制条常驻;一开始播放就重新计时
			if (!playing) root.classList.remove('idle');
			wakeControls();
			if (playing) void acquireWakeLock();
			else void releaseWakeLock();
		};

		// ---- 屏幕常亮 ----
		// 播放时别让手机/笔记本熄屏。用标准的 Screen Wake Lock API,暂停就放掉;
		// 浏览器不支持(或省电模式拒绝)就什么都不做 —— 不搞“空视频/静音音频循环”那种 workaround。
		let wakeLock = null;
		const releaseWakeLock = async () => {
			const lock = wakeLock;
			wakeLock = null;
			if (!lock) return;
			try {
				await lock.release();
			} catch {
				// 切后台时系统已经替你放了
			}
		};
		const acquireWakeLock = async () => {
			if (wakeLock || !playing || document.visibilityState !== 'visible') return;
			if (!navigator.wakeLock?.request) return;
			try {
				const lock = await navigator.wakeLock.request('screen');
				// 系统可能随时收回去(切后台/低电量),之后回到前台再要一次
				lock.addEventListener('release', () => {
					if (wakeLock === lock) wakeLock = null;
				});
				wakeLock = lock;
			} catch {
				// 非安全上下文 / 被拒绝 / 设备不支持:静默放弃
			}
		};
		const onVisibilityChange = () => {
			if (document.visibilityState === 'visible') void acquireWakeLock();
		};
		document.addEventListener('visibilitychange', onVisibilityChange);

		// 跳转/拖进度条期间临时静音:seek 前后那几帧的事件全是位置跳变产生的噪音
		let resumeSoundTimer = 0;
		// 每次 input/change 都重新计时,于是“一直拖”就一直静音;哪怕丢了 pointerup,
		// 最后一次事件之后 220ms 也会自己恢复
		const suppressSound = (ms = 220) => {
			mixer.setSuppressed(true);
			clearTimeout(resumeSoundTimer);
			resumeSoundTimer = setTimeout(() => mixer.setSuppressed(false), ms);
		};

		const seekTo = (seconds) => {
			suppressSound();
			time = clamp(seconds, 0, Math.max(0, length - 0.02));
			demo.seek_to_tick(time * TICKS_PER_SECOND);
			refreshPlayers();
			snapCamera = true;
			mv.oldPos = null;
			mv.oldDist = 0;
			mv.teleported = false;
			lastSeen.clear();
		};

		/** 记录每个 tee 的位置;返回这帧在场的队伍成员 */
		/** 每帧记录所有 tee 的位置。**必须**在队伍视角之外也调用,否则单人跟随时没有位置可用 */
		/** 这一帧所有 tee 的位置(id -> [x, y]),跟随和名字牌共用,每个 tee 每帧只问 wasm 一次 */
		const framePositions = new Map();
		const trackPositions = (now) => {
			framePositions.clear();
			for (const player of playersCache) {
				const position = demo.player_position(player.id);
				if (!position) continue;
				framePositions.set(player.id, position);
				lastSeen.set(player.id, { x: position[0], y: position[1], at: now });
			}
		};

		const teamMembers = () => {
			if (follow === null || playersCache.length === 0) return [];
			const main = playersCache.find((p) => p.id === follow);
			if (!main) return [];
			// 1) 快照里有队伍号(客户端自己录的 demo):同队伍
			if (main.team > 0) return playersCache.filter((p) => p.team === main.team);
			// 2) 服务端从 teehistorian 转出来的 demo 队伍号全是 0,用网页链接里那一档的
			//    完赛者名单当队伍(名次数据是服务端算的,比快照准)
			const rankTeam = (options.finishers ?? []).filter((id) => Number.isInteger(id));
			if (rankTeam.length > 1) {
				const members = rankTeam.map((id) => playersCache.find((p) => p.id === id)).filter(Boolean);
				if (members.length > 1) return members;
			}
			// 3) 兜底:和客户端 InitMultiView(0) 一样,取当前画面里的玩家
			const [viewWidth, viewHeight] = visibleTiles();
			const inView = playersCache.filter((p) => {
				const entry = lastSeen.get(p.id);
				if (!entry) return false;
				return (
					Math.abs(entry.x - camera.x) < viewWidth / 2 &&
					Math.abs(entry.y - camera.y) < viewHeight / 2
				);
			});
			return inView.length > 1 ? inView : [{ id: main.id }];
		};

		/** zoom = 1 时画面里有多少 tile(口径同 twgpu 的 Camera) */
		const baseView = () => {
			let width = Math.sqrt(1_150_000 * aspect) / 32;
			let height = width / aspect;
			if (width > 1500 / 32) {
				width = 1500 / 32;
				height = width / aspect;
			}
			if (height > 1150 / 32) {
				height = 1150 / 32;
				width = height * aspect;
			}
			return [width, height];
		};

		const mapValue = (maxValue, minValue, maxRange, minRange, value) =>
			((maxRange - minRange) / (maxValue - minValue)) * (value - minValue) + minRange;

		/** DDNet CGameClient::CalculateMultiViewZoom:把整队的包围盒换算成 zoom */
		const multiViewZoom = (minX, maxX, minY, maxY, avgVelocity) => {
			let zoomX = 0;
			if (aspect !== 1) {
				zoomX = (0.001309 - 0.000328 * aspect) * (maxX - minX) + (0.741413 - 0.032959 * aspect);
			}
			const zoomY = 0.001309 * (maxY - minY) + 0.741413;
			let zoom = Math.max(zoomX, zoomY);
			// 全队跑得越快,视野再放宽一点(最多再放 10%)
			const diff = Math.min(Math.max(mapValue(70, 15, zoom * 0.1, 0, avgVelocity), 0), zoom * 0.1);
			// 除了客户端那套按包围盒算的 zoom,再兜一个“一定能框下整队”的下限:
			// 客户端公式的系数只在大范围时才拉开,2~3 人小队常常框不下
			const [baseWidth, baseHeight] = baseView();
			const fitZoom = Math.max(
				((maxX - minX) * 1.15) / baseWidth,
				((maxY - minY) * 1.15) / baseHeight
			);
			zoom = Math.min(20, Math.max(1.1, Math.max(zoom + diff, fitZoom)));
			// 不低于默认视野
			zoom = Math.max(MV.defaultZoom, zoom);
			// 用户自己缩的那几格
			zoom -= zoom * 0.1 * mv.personal;
			return Math.max(0.2, zoom);
		};

		/**
		 * 动态镜头(cl_dyncam 的旁观版)。
		 *
		 * 逐行照 `CCamera::UpdateCamera()` 的 `CanUseCameraInfo` 分支:
		 *   1. 速度偏置 speed bias 平时按 CameraSpeed 往上涨,瞄准点一动就往回减
		 *      (减多少 = 移动距离 * log10(1.5) * 0.02),再夹在 [0.5, CameraSpeed]
		 *   2. 目标偏移 = 归一化的瞄准向量 * max(|瞄准| - 死区, 0) * 跟随比例,长度有上限
		 *   3. 当前偏移按 min(dt * bias, 1) 追目标偏移
		 * 所以甩鼠标的时候镜头会"迟钝"一点,停下来又稳稳贴住 —— 客户端的手感。
		 */
		const dyncam = {
			bias: 0.5,
			offset: { x: 0, y: 0 },
			lastAim: { x: 0, y: 0 }
		};

		/** @returns {{x:number,y:number}} 这一帧的镜头位移(DDNet 单位) */
		const updateDyncam = (aim, dt, snap) => {
			if (dt > 0) dyncam.bias += DYN_CAMERA_SPEED * dt;
			dyncam.bias -=
				Math.hypot(aim.x - dyncam.lastAim.x, aim.y - dyncam.lastAim.y) * DYN_LOG_STABILIZING * 0.02;
			dyncam.bias = clamp(dyncam.bias, 0.5, DYN_CAMERA_SPEED);
			dyncam.lastAim = { x: aim.x, y: aim.y };

			const length = Math.hypot(aim.x, aim.y);
			let target = { x: 0, y: 0 };
			if (length > 0.0001) {
				let amount = Math.max(length - DYN.deadzone, 0) * (DYN.followFactor / 100);
				// 客户端:OffsetAmount = min(OffsetAmount, 350 * zoom)
				amount = Math.min(amount, DYN.maxOffset * camera.zoom);
				// 再按实际视野收一刀:偏移越大 tee 离屏幕中心越远,取半屏高度(DDNet 单位)
				// 的 safeScreenRatio 封顶,避免主视角 tee 被推出画面。
				const [viewWidth, viewHeight] = visibleTiles();
				const halfViewUnits = (Math.min(viewWidth, viewHeight) / 2) * 32;
				amount = Math.min(amount, halfViewUnits * DYN.safeScreenRatio);
				target = { x: (aim.x / length) * amount, y: (aim.y / length) * amount };
			}

			if (snap) {
				dyncam.offset = target;
				return dyncam.offset;
			}
			const step = Math.min(dt * dyncam.bias, 1);
			dyncam.offset.x += (target.x - dyncam.offset.x) * step;
			dyncam.offset.y += (target.y - dyncam.offset.y) * step;
			return dyncam.offset;
		};

		/** 关掉动态镜头时把状态清干净,下次打开不会从旧的位置慢慢飘回来 */
		const resetDyncam = () => {
			dyncam.bias = 0.5;
			dyncam.offset = { x: 0, y: 0 };
			dyncam.lastAim = { x: 0, y: 0 };
		};

		/** 跟随目标的瞄准点 [x, y, weapon](DDNet 单位),死了/查不到就是 null */
		const playerAim = (id) => {
			let aim = null;
			try {
				aim = demo.player_aim(id);
			} catch {
				return null;
			}
			if (!aim || aim.length < 3) return null;
			return { x: aim[0], y: aim[1], weapon: aim[2] | 0 };
		};

		/**
		 * 准星:瞄准点做一阶平滑(近似客户端的插值延迟),然后交给 Rust 画。
		 *
		 * 位置/贴边/大小都在 Rust 里算(和别的精灵同一条管线),这里只负责
		 * "这一帧该瞄哪儿"和"动态镜头把镜头推开了多少"。
		 */
		const cursorSmooth = { x: 0, y: 0, valid: false };
		/** 准星挂在哪(被跟随玩家的位置,tile),调试和测试要看 */
		let cursorAnchor = null;
		const updateSpecCursor = (dt, snap) => {
			// 团队视角照画:准星挂在被跟随的玩家身上,跟着他自己走。
			// 死了的人没有瞄准点(player_aim 拿不到 tee 就返回 null)。
			// 被跟随的玩家自己按了暂停(Esc)时也不画,和 DDNet 的 UpdateSpectatorCursor 一致。
			const owner = playersCache.find((p) => p.id === follow);
			if (!showCursor || follow === null || owner?.paused) {
				cursorSmooth.valid = false;
				demo.hide_cursor();
				return;
			}
			const aim = playerAim(follow);
			const anchor = lastSeen.get(follow);
			if (!aim || !anchor) {
				cursorSmooth.valid = false;
				demo.hide_cursor();
				return;
			}
			if (snap || !cursorSmooth.valid) {
				cursorSmooth.x = aim.x;
				cursorSmooth.y = aim.y;
				cursorSmooth.valid = true;
			} else if (dt > 0) {
				const alpha = 1 - Math.exp(-dt / CURSOR_TAU);
				cursorSmooth.x += (aim.x - cursorSmooth.x) * alpha;
				cursorSmooth.y += (aim.y - cursorSmooth.y) * alpha;
			}
			cursorAnchor = anchor;
			demo.set_cursor(anchor.x, anchor.y, cursorSmooth.x, cursorSmooth.y, aim.weapon);
		};

		/**
		 * 模式切换检测:单人跟随和团队视角的目标位置差得远(玩家 ↔ 包围盒中点),
		 * 一换模式就开一段过渡,进出都不会硬切。
		 */
		const trackCamMode = (mode) => {
			if (mode === camMode) return;
			const switching =
				(mode === 'team' && camMode === 'single') || (mode === 'single' && camMode === 'team');
			if (switching) camBlendLeft = MV.modeBlendTime;
			camMode = mode;
		};

		const updateCamera = (dt) => {
			if (follow === null) {
				mv.active = false;
				snapCamera = false;
				// 自由视角:用户自己控制 zoom,回来跟随时接着用这个值
				followZoom = camera.zoom;
				camBlendLeft = 0;
				trackCamMode('free');
				// 自由视角没有跟随目标,动态镜头归零(下次跟随从干净的状态开始)
				resetDyncam();
				return;
			}
			// 位置每帧都已经在 tick() 里采好了(自由视角也要采,名字牌要用)
			const members = teamActive() ? teamMembers() : [];
			const seen = (member) => {
				const entry = lastSeen.get(member.id);
				if (!entry) return null;
				// 死了就别再跟太久
				if (!member.alive && performance.now() - entry.at > MV.keepPosition * 1000) return null;
				return entry;
			};
			const live = members.filter((m) => seen(m));

			if (live.length <= 1) {
				// 单人:平滑跟随
				mv.active = false;
				trackCamMode('single');
				const target = live.length === 1 ? seen(live[0]) : lastSeen.get(follow);
				// 团队视角那边算出来的 zoom 不用了,回到用户自己的
				easeZoom(followZoom, dt, snapCamera);
				if (target) {
					const aim = playerAim(follow);
					if (aim) {
						// 动态镜头(不跟随团队视角且开关打开时):镜头 = 玩家位置 + 偏移。
						// 位置本身不再额外平滑(客户端也是这样,只有偏移是平滑的),
						// snap 时两边一起贴上去。关掉开关就只做普通跟随。
						if (!showDyncam) resetDyncam();
						const offset = showDyncam ? updateDyncam(aim, dt, snapCamera) : { x: 0, y: 0 };
						const wantX = target.x + offset.x / 32;
						const wantY = target.y + offset.y / 32;
						// 刚退出团队视角:先平滑地从当前镜头位置滑过去,别直接蹦到玩家身上
						if (!blendCamera(wantX, wantY, dt, snapCamera)) {
							camera.move_to(wantX, wantY);
						}
						snapCamera = false;
					} else {
						// 死了 / 没有瞄准点:动态镜头归零,退回普通的平滑跟随
						resetDyncam();
						if (!blendCamera(target.x, target.y, dt, snapCamera)) {
							camera.follow(target.x, target.y, dt, snapCamera);
						}
						snapCamera = false;
					}
				} else {
					camBlendLeft = 0;
				}
				return;
			}

			// 队伍视角
			mv.active = true;
			trackCamMode('team');
			resetDyncam();
			let minX = Infinity;
			let maxX = -Infinity;
			let minY = Infinity;
			let maxY = -Infinity;
			let speedSum = 0;
			let speedCount = 0;
			for (const member of live) {
				const entry = seen(member);
				minX = Math.min(minX, entry.x);
				maxX = Math.max(maxX, entry.x);
				minY = Math.min(minY, entry.y);
				maxY = Math.max(maxY, entry.y);
				const previous = lastSeen.get(`speed:${member.id}`);
				if (previous && dt > 0) {
					speedSum += Math.hypot(entry.x - previous.x, entry.y - previous.y) / dt;
					speedCount++;
				}
				lastSeen.set(`speed:${member.id}`, { x: entry.x, y: entry.y, at: performance.now() });
			}
			const avgVelocity = speedCount > 0 ? speedSum / speedCount : 0;

			// zoom:目标值做指数平滑(客户端的 cl_multiview_zoom_smoothness)。
			// 注意这里平滑的是 camera.zoom 本身,所以从单人 zoom 切进来也是渐变的。
			const targetZoom = multiViewZoom(minX, maxX, minY, maxY, avgVelocity);
			easeZoom(targetZoom, dt, snapCamera);
			// 只是给调试状态留一份(camera.zoom 才是真正生效的那个)
			mv.zoom = camera.zoom;

			// 镜头中心:包围盒中点
			const target = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
			if (snapCamera) {
				mv.oldPos = { ...target };
				mv.oldDist = 0;
				mv.teleported = false;
				camBlendLeft = 0;
				camera.move_to(target.x, target.y);
				snapCamera = false;
				return;
			}
			// 刚进入团队视角:从当前镜头位置平滑滑到包围盒中点,别一帧跳过去。
			// (过渡结束时把 mv.oldPos 对齐到当前镜头位置,后面接着用它那套平滑)
			if (blendCamera(target.x, target.y, dt, false)) {
				mv.oldPos = { x: camera.x, y: camera.y };
				mv.oldDist = 0;
				mv.teleported = false;
				return;
			}
			if (mv.oldPos === null) {
				mv.oldPos = { ...target };
				mv.oldDist = 0;
				mv.teleported = false;
				camera.move_to(target.x, target.y);
				return;
			}
			// 客户端那套“按距离给每帧的插值系数”在 60fps 下只有 0.04/帧,跟人跟得太磨。
			// 这里改成与帧率无关的指数平滑:近距离快,远距离(传送/散开)慢,上限 0.2 秒。
			const distance = Math.hypot(target.x - mv.oldPos.x, target.y - mv.oldPos.y);
			// 传送保护:距离突然拉开一大截(比如有人被传走),别一帧把镜头甩过去
			if (mv.oldDist !== 0 && distance - mv.oldDist > 100) mv.teleported = true;
			if (mv.teleported && distance <= 100) mv.teleported = false;
			const tau = clamp(
				MV.followTauMin + distance * MV.followTauPerTile,
				MV.followTauMin,
				MV.followTauMax
			);
			const step = dt > 0 ? Math.min(mv.teleported ? 0.1 : 1, 1 - Math.exp(-dt / tau)) : 1;
			mv.oldDist = distance;
			mv.oldPos.x += (target.x - mv.oldPos.x) * step;
			mv.oldPos.y += (target.y - mv.oldPos.y) * step;
			camera.move_to(mv.oldPos.x, mv.oldPos.y);
		};

		/**
		 * 名字牌:每个 tee 头顶一个 `<span>`,世界坐标投影到屏幕。
		 *
		 * 之前是 wasm 里的 SDF 字体(twgpu 的 Scribble)画的,它只有 DejaVuSans ——
		 * 那份 TTF 里没有一个汉字,所以「坤坤」直接画不出来(不是数据没解出来:
		 * `players_json()` 里名字是完整的)。改用 DOM 就白拿系统字体:
		 * 中文/日文/emoji 全都按用户自己的字体渲染,还省掉 757 KB 的字体文件。
		 */
		// 调试用:每帧 nameplates 花多少毫秒、字号改写过几次(改字号最贵,别每帧都改)
		const nameStats = { ms: 0, frames: 0, sizeWrites: 0, labels: 0 };
		const updateNameplates = () => {
			if (!showNames) return;
			const startedAt = performance.now();
			const cssWidth = canvas.clientWidth;
			const cssHeight = canvas.clientHeight;
			if (!cssWidth || !cssHeight) return;
			const [viewWidth, viewHeight] = visibleTiles();
			// DDNet nameplates.cpp 用 tile_scaled(0.85) —— 字号跟着 zoom 一起缩放。
			// 量化到整像素:缩放平滑时字号每帧都在变,不量化的话浏览器每帧都要重新
			// 光栅化一遍文字(那才是 DOM 方案真正贵的地方)。整像素变化一秒也就几次。
			const pascal = clamp((0.85 * cssHeight) / viewHeight, 7, 160);
			// 字号量化到**设备像素**的整数倍:18px 在 dpr=2 上是 36 个设备像素,
			// 字形刚好整数对齐;量化到 CSS 整像素则在 1.5x 屏上会落到 27.5 这种半格上。
			// 用真实 dpr 而不是封顶 2,不然 3x 屏上字号会落在 1/3 像素上被重采样。
			const size = Math.max(1, Math.round(pascal * pixelDpr)) / pixelDpr;
			const sizeText = `${size}px`;
			// 描边宽度抄客户端的 AdjustOutlineThicknessToFontSize():
			// <18px 一像素,18~48px 两像素,>48px 四像素。
			// -webkit-text-stroke 是沿字形轮廓**居中**画的,配合 paint-order: stroke fill
			// 之后内半边会被填充盖住,所以这里写两倍才是“往外扩 thickness 像素”。
			const outline = size > 48 ? 4 : size >= 18 ? 2 : 1;
			const strokeText = `${outline * 2}px`;
			const alive = new Set();
			for (const player of playersCache) {
				const position = framePositions.get(player.id);
				if (!position) continue;
				alive.add(player.id);
				let label = nameLabels.get(player.id);
				if (!label) {
					label = element('span', 'tw-name');
					label.dataset.name = '';
					nameLayer.append(label);
					nameLabels.set(player.id, label);
				}
				const text = player.name || `#${player.id}`;
				if (label.dataset.name !== text) {
					label.textContent = text;
					label.dataset.name = text;
				}
				// 定位对齐到设备像素网格,不然文字会落在半像素上被合成器重采样,糊
				const snap = (value) => Math.round(value * pixelDpr) / pixelDpr;
				const screenX = snap(((position[0] - camera.x) / viewWidth + 0.5) * cssWidth);
				const screenY = snap(((position[1] - 1.1 - camera.y) / viewHeight + 0.5) * cssHeight);
				const outside =
					screenX < -cssWidth * 0.2 ||
					screenX > cssWidth * 1.2 ||
					screenY < -cssHeight * 0.2 ||
					screenY > cssHeight * 1.2;
				if (label.hidden !== outside) label.hidden = outside;
				if (outside) continue;
				label.style.transform = `translate(${screenX.toFixed(3)}px, ${screenY.toFixed(3)}px) translate(-50%, -50%)`;
				if (label.dataset.size !== sizeText) {
					label.style.fontSize = sizeText;
					label.style.webkitTextStrokeWidth = strokeText;
					label.dataset.size = sizeText;
					nameStats.sizeWrites++;
				}
			}
			for (const [id, label] of nameLabels) {
				if (alive.has(id)) continue;
				label.remove();
				nameLabels.delete(id);
			}
			nameStats.ms += performance.now() - startedAt;
			nameStats.frames++;
			nameStats.labels = nameLabels.size;
		};

		/**
		 * 加载一个玩家皮肤。
		 *
		 * URL 由 `resolveSkin` 给(页面传全局皮肤缓存的 `getSkinUrl`,它查的是上游
		 * skins.json 里的 `name → url`),不在这里拼路径 —— 皮肤分 normal / community
		 * 两类,路径规则不一样,拼出来的地址一换皮肤包就错了。
		 * 查不到(皮肤库里没有,或已被 blocklist 过滤)就跳过,tee 用 default 渲染。
		 */
		const loadSkin = async (skinName) => {
			if (!resolveSkin) return;
			let url = null;
			try {
				url = await resolveSkin(skinName);
			} catch {
				return;
			}
			if (!url) return;
			try {
				gpu.add_skin(skinName, await fetchBytes(url));
			} catch {
				// 404 / 网络问题时保持 default 皮肤
			}
		};

		const tick = (now) => {
			if (destroyed) return;
			frame = requestAnimationFrame(tick);
			// 上限放宽一点:软件渲染(GPU 不给力)时帧率可能只有个位数,
			// 掐太狠会让回放比真实时间慢
			const dt = lastFrameTime ? Math.min(0.5, (now - lastFrameTime) / 1000) : 0;
			lastFrameTime = now;
			if (document.hidden) return;

			if (playing) {
				time += dt * speed;
				if (time >= length) {
					time = length;
					setPlaying(false);
				}
			}

			const tickNow = time * TICKS_PER_SECOND;
			let alive = true;
			try {
				alive = demo.continue_to_tick(tickNow);
			} catch (error) {
				console.error(error);
				setStatus(`播放失败:${error.message ?? error}`);
				setPlaying(false);
				return;
			}
			if (!alive && playing) setPlaying(false);

			// 声音:wasm 攒的事件在这一帧取走,交给 Web Audio
			const sounds = demo.drain_sounds();
			if (sounds && sounds !== '[]') {
				try {
					const events = JSON.parse(sounds);
					// 调试用:最近响过的声音名字(控制台里 __twPlayer.state.recentSounds 能看)
					for (const event of events) {
						recentSounds.push(event.n);
						if (recentSounds.length > 60) recentSounds.shift();
					}
					options.onSounds?.(events);
					mixer.play(events, camera);
				} catch (error) {
					console.warn('[sound]', error);
				}
			}

			// 位置采集和跟随/队伍视角都无关:自由视角下名字牌也要跟着 tee 跑
			trackPositions(performance.now());
			// 相机:单人跟随 或 队伍视角(multiview)。
			// snapCamera 会被 updateCamera 消费掉,准星也要用同一个标志,先存一份
			const snapNow = snapCamera;
			updateCamera(dt);
			updateSpecCursor(dt, snapNow);
			updateNameplates();

			// 新皮肤 / 玩家列表:每 10 帧刷一次(低帧率的机器上也能及时跟上队伍变化)
			if (frame % 10 === 0) {
				refreshPlayers();
				let missing = [];
				try {
					missing = demo.new_player_skins();
				} catch {
					missing = [];
				}
				for (const skin of missing) {
					if (skins.has(skin)) continue;
					skins.add(skin);
					void loadSkin(skin);
				}
				updateFollowOptions();
			}

			try {
				gpu.render_demo(surface, camera, renderMap(), demo);
			} catch (error) {
				console.error(error);
				setStatus(`渲染失败:${error.message ?? error}`);
				setPlaying(false);
				return;
			}

			setStatus('');
			if (now - seekbarHold > 120 && document.activeElement !== seek) {
				seek.value = String(Math.round(time * 1000));
			}
			const percent = length > 0 ? clamp((time / length) * 100, 0, 100) : 0;
			seekFill.style.width = `${percent}%`;
			seekKnob.style.left = `${percent}%`;
			timeLabel.textContent = formatTime(time);
			duration.textContent = formatTime(length);
		};

		// ---- 交互 ----
		// 播放时鼠标不动 2.5 秒就把控制条淡出(鼠标移到控制条上时不隐藏)
		let idleTimer = 0;
		let hoveringControls = false;
		const wakeControls = () => {
			root.classList.remove('idle');
			clearTimeout(idleTimer);
			idleTimer = setTimeout(() => {
				// 菜单/浮层开着的时候不能把控制条隐起来(否则连浮层一起消失了)
				if (playing && !hoveringControls && !menuOpen && !speedOpen && !followOpen) {
					root.classList.add('idle');
				}
			}, 2500);
		};
		root.addEventListener('pointermove', wakeControls);
		root.addEventListener('pointerdown', wakeControls);
		window.addEventListener('keydown', wakeControls);
		bar.addEventListener('pointerenter', () => {
			hoveringControls = true;
			wakeControls();
		});
		bar.addEventListener('pointerleave', () => {
			hoveringControls = false;
			wakeControls();
		});
		top.addEventListener('pointerenter', () => {
			hoveringControls = true;
			wakeControls();
		});
		top.addEventListener('pointerleave', () => {
			hoveringControls = false;
			wakeControls();
		});
		wakeControls();

		playButton.addEventListener('click', () => setPlaying(!playing));
		seek.addEventListener('pointerdown', () => {
			dragging = true;
			// 一开始拖就闭嘴,松手之后再放 200ms 才恢复
			mixer.setSuppressed(true);
			clearTimeout(resumeSoundTimer);
		});
		seek.addEventListener('pointerup', () => {
			dragging = false;
			suppressSound();
		});
		seek.addEventListener('pointercancel', () => {
			dragging = false;
			suppressSound();
		});
		seek.addEventListener('input', () => {
			if (dragging) {
				suppressSound();
				seekbarHold = performance.now();
				time = Number(seek.value) / 1000;
				timeLabel.textContent = formatTime(time);
				const percent = Number(seek.value) / 10;
				seekFill.style.width = `${percent}%`;
				seekKnob.style.left = `${percent}%`;
			}
		});
		seek.addEventListener('change', () => seekTo(Number(seek.value) / 1000));

		// ---- 跟随谁(自己画的 dropdown) ----
		const setFollow = (id) => {
			follow = id;
			// 自由视角 = 没有可跟随的人,队伍视角自然失效(按钮置灰)
			syncTeamButton();
			syncCursorButton();
			syncFollowButton();
			// 换人也是平滑过去(客户端 cl_smooth_spectating_time),不是瞬移;
			// 但进/出自由视角要瞬移,那里本来就该直接落位
			if (follow !== null) camBlendLeft = MV.modeBlendTime;
			else snapCamera = true;
			pointers.clear();
			updateCursor();
			mv.oldPos = null;
			lastSeen.clear();
		};

		// ---- 播放速度(滑条 + 预设) ----
		const setSpeed = (value) => {
			const next = clamp(Number(value) || 1, SPEED_MIN, SPEED_MAX);
			speed = next;
			speedValue.textContent = formatSpeed(next);
			speedReadout.textContent = formatSpeed(next);
			speedRange.value = String(next);
			// 原生 range 没有「已播放部分」这个概念,用 CSS 变量把进度传给轨道渐变
			const percent = ((next - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100;
			speedRange.style.setProperty('--fill', `${percent}%`);
			for (const chip of speedChips) {
				chip.classList.toggle('tw-on', Math.abs(Number(chip.dataset.speed) - next) < 1e-9);
			}
		};
		speedRange.addEventListener('input', () => setSpeed(Number(speedRange.value)));
		for (const chip of speedChips) {
			chip.addEventListener('click', () => setSpeed(Number(chip.dataset.speed)));
		}
		setSpeed(1);

		teamButton.addEventListener('click', () => {
			if (follow === null) return; // 自由视角下按钮是禁用的
			teamWanted = !teamWanted;
			syncTeamButton();
			// 不 snap:进出团队视角的目标位置差很远(玩家 ↔ 包围盒中点),
			// 交给 updateCamera 里的 camBlend 平滑过渡,硬切会"啪"一下。
			resetDyncam();
		});
		syncTeamButton();
		syncCursorButton();

		// ---- 上拉浮层:显示选项 / 播放速度 / 跟随谁 ----
		// 同一时间只开一个;开着的时候控制条不自动淡出(否则浮层跟着一起消失)。
		/** 显示选项菜单当前停在哪一页(关了菜单就回到主列表) */
		let menuPage = 'main';
		const showMenuPage = (page) => {
			menuPage = page;
			menuMain.hidden = page !== 'main';
			menuStyle.hidden = page !== 'style';
		};
		const setMenuOpen = (open) => {
			if (menuOpen === open) return;
			menuOpen = open;
			showMenuPage('main');
			if (open) {
				setSpeedOpen(false);
				setFollowOpen(false);
			}
			menu.hidden = !open;
			settingsButton.setAttribute('aria-expanded', String(open));
			syncMenu();
			if (open) wakeControls();
		};
		const setSpeedOpen = (open) => {
			if (speedOpen === open) return;
			speedOpen = open;
			if (open) {
				setMenuOpen(false);
				setFollowOpen(false);
			}
			speedMenu.hidden = !open;
			speedButton.setAttribute('aria-expanded', String(open));
			speedButton.classList.toggle('tw-on', open);
			if (open) wakeControls();
		};
		const setFollowOpen = (open) => {
			if (followOpen === open) return;
			followOpen = open;
			if (open) {
				setMenuOpen(false);
				setSpeedOpen(false);
				syncFollowButton();
			}
			followMenu.hidden = !open;
			followButton.setAttribute('aria-expanded', String(open));
			followButton.classList.toggle('tw-on', open);
			if (open) wakeControls();
		};
		settingsButton.addEventListener('click', () => setMenuOpen(!menuOpen));
		speedButton.addEventListener('click', () => setSpeedOpen(!speedOpen));
		followButton.addEventListener('click', () => setFollowOpen(!followOpen));
		for (const [item, value] of [
			[dyncamRow, () => setDyncamEnabled(!showDyncam)],
			[namesRow, () => setNameplatesVisible(!showNames)]
		]) {
			// 普通行:点名字和点开关都是开关
			item.main.addEventListener('click', value);
			item.switch.addEventListener('click', value);
		}
		entitiesRow.main.addEventListener('click', () => {
			// 点名字 = 「点进去」:先把实体层打开,再切到样式列表
			if (!showEntities) setEntitiesVisible(true);
			showMenuPage('style');
		});
		entitiesRow.switch.addEventListener('click', () => setEntitiesVisible(!showEntities));
		for (const row of styleRows) {
			row.addEventListener('click', () => setEntitiesStyle(row.dataset.style));
		}
		styleBack.addEventListener('click', () => showMenuPage('main'));
		const toggleCursorRow = () => {
			if (follow === null) return; // 自由视角下没有可跟的人,和以前的置灰按钮一致
			setCursorVisible(!showCursor);
		};
		cursorRow.main.addEventListener('click', toggleCursorRow);
		cursorRow.switch.addEventListener('click', toggleCursorRow);
		// 点别处关浮层。用 capture 阶段:先把浮层关了,点击本身的语义(开始播放/拖进度条)照旧
		const onDocumentPointerDown = (event) => {
			const outside = (button, panel) =>
				!panel.contains(event.target) && !button.contains(event.target);
			if (menuOpen && outside(settingsButton, menu)) setMenuOpen(false);
			if (speedOpen && outside(speedButton, speedMenu)) setSpeedOpen(false);
			if (followOpen && outside(followButton, followMenu)) setFollowOpen(false);
		};
		document.addEventListener('pointerdown', onDocumentPointerDown, true);

		muteButton.addEventListener('click', () => setMuted(!muted));
		mixer.setVolume(DEFAULT_VOLUME);
		fullscreenButton.addEventListener('click', () => {
			if (document.fullscreenElement) void document.exitFullscreen();
			else void root.requestFullscreen?.().catch(() => {});
		});
		document.addEventListener('fullscreenchange', () => {
			fullscreenButton.classList.toggle('tw-on', document.fullscreenElement === root);
		});
		// ---- 缩放 ----
		// factor 是“视野倍数”:小于 1 = 拉近(放大),大于 1 = 拉远。
		// 锁视角(跟随某人/某队)时只改 zoom,绝不动相机位置;
		// 队伍视角改的是客户端的 m_MultiViewPersonalZoom(每格 10%),单人是直接改相机 zoom。
		const zoomLocked = (factor) => {
			if (mv.active) {
				mv.personal = clamp(mv.personal - Math.log(factor) / Math.log(1.25), -6, 6);
				return;
			}
			// 单人跟随时改的是"用户自己的 zoom",camera.zoom 每帧平滑追上去
			followZoom = clamp(followZoom * factor, ZOOM_MIN, ZOOM_MAX);
		};
		/** 自由视角下相机位置和 zoom 都由用户控制,这里只兜住上下限(mappreview 的 clampZoom) */
		const clampZoom = () => {
			const zoom = clamp(camera.zoom, ZOOM_MIN, ZOOM_MAX);
			if (zoom !== camera.zoom) camera.zoom = zoom;
		};
		/**
		 * 自由视角:和 mappreview 完全一样的做法 —— 一次 move_zoom 同时完成
		 * 「锚点位置保持不动」的缩放和平移,不再分 pan / zoom 两套逻辑。
		 */
		const moveZoom = (prevX, prevY, x, y, factor) => {
			if (mv.active || follow !== null) {
				zoomLocked(factor);
				return;
			}
			camera.move_zoom(prevX, prevY, x, y, factor);
			clampZoom();
		};
		/** 按钮:一格 25%,和客户端 zoom+/zoom- 一样按步进走 */
		const zoomStep = (factor) => {
			if (mv.active) {
				mv.personal = clamp(mv.personal + (factor < 1 ? 1 : -1), -6, 6);
				return;
			}
			if (follow !== null) {
				followZoom = clamp(followZoom * factor, ZOOM_MIN, ZOOM_MAX);
				return;
			}
			// 自由视角:对着画面中心缩放(预览页的 +/- 键就是这么做的)
			moveZoom(0.5, 0.5, 0.5, 0.5, factor);
		};
		zoomIn.addEventListener('click', () => zoomStep(1 / 1.25));
		zoomOut.addEventListener('click', () => zoomStep(1.25));
		canvas.addEventListener(
			'wheel',
			(event) => {
				event.preventDefault();
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) / rect.width;
				const y = (event.clientY - rect.top) / rect.height;
				moveZoom(x, y, x, y, Math.exp(event.deltaY * 0.0015));
			},
			{ passive: false }
		);

		// ---- 拖动 / 双指 ----
		// 自由视角:和 mappreview 完全一致 —— 一根手指 = move_zoom(factor 1) 平移,
		// 两根手指 = 以两指中点锚定、按距离比缩放(缩放+平移一步到位);
		// 锁定视角(跟随某人/某队)时只允许缩放,镜头位置不许动。
		const pointers = new Map();

		const visibleTiles = () => {
			const [width, height] = baseView();
			return [width * camera.zoom, height * camera.zoom];
		};
		const normalize = (event) => {
			const rect = canvas.getBoundingClientRect();
			return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
		};
		const updateCursor = () => {
			canvas.style.cursor = follow === null ? 'grab' : 'default';
		};

		canvas.addEventListener('pointerdown', (event) => {
			pointers.set(event.pointerId, normalize(event));
			try {
				canvas.setPointerCapture(event.pointerId);
			} catch {
				// 合成事件/某些浏览器没有活跃指针,拿不到捕获就算了
			}
			if (pointers.size === 1 && follow === null) canvas.style.cursor = 'grabbing';
			updateCursor();
		});

		canvas.addEventListener('pointermove', (event) => {
			if (!pointers.has(event.pointerId)) return;
			const previous = pointers.get(event.pointerId);
			const current = normalize(event);
			pointers.set(event.pointerId, current);

			if (pointers.size >= 2) {
				// 两根手指:另一根当作锚点,按距离比缩放,同时跟着中点平移
				const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
				if (!other) return;
				// factor 是“视野倍数”:两指张开 = 距离变大 = 要拉近,所以取距离的反比
				const step = (x, y) => Math.hypot(x - other[0], y - other[1]);
				const previousDistance = step(previous[0], previous[1]);
				const currentDistance = step(current[0], current[1]);
				if (!previousDistance || !currentDistance) return;
				moveZoom(
					(previous[0] + other[0]) / 2,
					(previous[1] + other[1]) / 2,
					(current[0] + other[0]) / 2,
					(current[1] + other[1]) / 2,
					previousDistance / currentDistance
				);
				return;
			}

			if (follow !== null) return; // 锁定视角:单指拖动不生效
			moveZoom(previous[0], previous[1], current[0], current[1], 1);
		});

		const endPointer = (event) => {
			pointers.delete(event.pointerId);
			try {
				if (canvas.hasPointerCapture(event.pointerId))
					canvas.releasePointerCapture(event.pointerId);
			} catch {
				// 同上
			}
			updateCursor();
		};
		canvas.addEventListener('pointerup', endPointer);
		canvas.addEventListener('pointercancel', endPointer);
		updateCursor();

		// 任何点击都算用户手势,让声音能起来
		root.addEventListener('pointerdown', () => void mixer.resume(), { once: false });
		const onKey = (event) => {
			if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
				return;
			if (event.code === 'Escape' && (menuOpen || speedOpen || followOpen)) {
				// 浮层开着时 Esc 只关浮层(不要顺手把播放也暂停了)
				event.preventDefault();
				setMenuOpen(false);
				setSpeedOpen(false);
				setFollowOpen(false);
				return;
			}
			if (event.code === 'Space') {
				event.preventDefault();
				setPlaying(!playing);
			} else if (event.code === 'ArrowLeft') {
				seekTo(time - (event.shiftKey ? 30 : 5));
			} else if (event.code === 'ArrowRight') {
				seekTo(time + (event.shiftKey ? 30 : 5));
			}
		};
		window.addEventListener('keydown', onKey);

		// 恢复上次的显示偏好。放在这里而不是控件初始化那里:名字牌 / 相机 / 地图这些
		// 依赖的状态都是后面才建好的(`updateNameplates` 里要用 `visibleTiles`)。
		setDyncamEnabled(prefs.dyncam);
		setEntitiesVisible(prefs.entities);
		setNameplatesVisible(prefs.names);
		setCursorVisible(prefs.cursor);

		seekTo(time);
		timeLabel.textContent = formatTime(time);
		duration.textContent = formatTime(length);
		setPlaying(Number.isFinite(length) && length > 0);
		frame = requestAnimationFrame(tick);

		const api = {
			get time() {
				return time;
			},
			get length() {
				return length;
			},
			play: () => setPlaying(true),
			pause: () => setPlaying(false),
			seek: seekTo,
			/** 调试用:当前相机/队伍状态(测试和手点控制台看) */
			get state() {
				return {
					follow,
					team: teamActive() && mv.active,
					teamWanted,
					zoom: camera.zoom,
					followZoom,
					camMode,
					camBlendLeft,
					camera: { x: camera.x, y: camera.y },
					personalZoom: mv.personal,
					members: teamActive() ? teamMembers().map((m) => m.id) : [],
					nameplates: {
						...nameStats,
						avgMs: nameStats.frames ? nameStats.ms / nameStats.frames : 0
					},
					/** 四个显示开关(名字/准星/动态镜头/实体层)的当前值 */
					prefs: {
						dyncam: showDyncam,
						entities: showEntities,
						entitiesStyle,
						names: showNames,
						cursor: showCursor,
						menuOpen,
						menuPage,
						speedOpen,
						followOpen,
						speed
					},
					recentSounds: [...recentSounds],
					suppressed: mixer.suppressed,
					muted,
					cursor: {
						enabled: showCursor,
						visible: cursorSmooth.valid,
						aim: { x: cursorSmooth.x, y: cursorSmooth.y },
						anchor: cursorAnchor,
						offset: { x: dyncam.offset.x, y: dyncam.offset.y },
						bias: dyncam.bias
					},
					spread: [...lastSeen.entries()]
						.filter(([key]) => typeof key === 'number')
						.map(([key, value]) => ({ id: key, x: value.x, y: value.y, at: value.at }))
				};
			},
			destroy() {
				destroyed = true;
				cancelAnimationFrame(frame);
				observer.disconnect();
				window.removeEventListener('keydown', onKey);
				document.removeEventListener('pointerdown', onDocumentPointerDown, true);
				document.removeEventListener('visibilitychange', onVisibilityChange);
				dprQuery?.removeEventListener?.('change', onDprChange);
				void releaseWakeLock();
				mixer.close();
				// 实体层那份地图是额外上传的一份 wasm 资源,不释放就跟着页面泄露
				try {
					entitiesView?.free();
				} catch {
					// 已经释放过了
				}
				entitiesView = null;
				root.remove();
				style.remove();
			}
		};
		window.__twPlayer = api;
		return api;
	} catch (error) {
		console.error(error);
		setStatus(`加载失败:${error.message ?? error}`);
		return null;
	}
}

const CSS = `
.tw-player {
	position: relative;
	overflow: hidden;
	height: 100%;
	background: #000;
	color: #e8edf3;
	font: 13px/1.4 ui-sans-serif, system-ui, "Segoe UI", sans-serif;
	--accent: #3b82f6;
	--bar: rgba(10, 15, 22, 0.72);
}
.tw-canvas {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	display: block;
	touch-action: none;
	cursor: grab;
}
/* 名字牌:一层不挡鼠标的透明 div,里面每个名字一个 span */
.tw-names {
	position: absolute;
	inset: 0;
	overflow: hidden;
	pointer-events: none;
}
.tw-name {
	position: absolute;
	left: 0;
	top: 0;
	white-space: nowrap;
	line-height: 1;
	/* 系统 UI 字体 + 明确的无衬线兜底:中文走用户自己的字体,不用额外下载 */
	font-family:
		ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Noto Sans", "Noto Sans SC",
		"PingFang SC", "Microsoft YaHei", "Hiragino Sans", sans-serif;
	font-weight: 400;
	color: #fff;
	/* 和客户端 nameplates.cpp 一样:轮廓 alpha 0.5 的黑描边、没有阴影、没有发光 */
	-webkit-text-stroke: 2px rgba(0, 0, 0, 0.5);
	paint-order: stroke fill;
}
.tw-name[hidden] { display: none; }

.tw-overlay {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	pointer-events: none;
}
.tw-status {
	background: rgba(8, 12, 18, 0.78);
	border: 1px solid rgba(255, 255, 255, 0.08);
	padding: 0.55rem 1rem;
	border-radius: 999px;
	font-size: 12.5px;
	backdrop-filter: blur(8px);
}
.tw-status[hidden] { display: none; }

/* ---- 顶部标题 ---- */
.tw-top {
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	padding: 0.7rem 1rem 2.6rem;
	background: linear-gradient(to bottom, rgba(8, 12, 18, 0.78), rgba(8, 12, 18, 0.35) 55%, transparent);
	transition: opacity 0.25s ease;
	pointer-events: none;
}
.tw-title {
	font-size: 13.5px;
	font-weight: 500;
	letter-spacing: 0.01em;
	text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

/* ---- 底部控制条 ---- */
.tw-bar {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	padding: 2.4rem 0.75rem 0.5rem;
	background: linear-gradient(to top, rgba(8, 12, 18, 0.9), rgba(8, 12, 18, 0.45) 60%, transparent);
	transition: opacity 0.25s ease;
}
.tw-bar {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 0.3rem;
}
.tw-row {
	display: flex;
	align-items: center;
	gap: 0.35rem;
	flex-wrap: nowrap;
}
/* 跟随/队伍:单独一行,不跟播放按钮抢宽度 */
.tw-row-who {
	padding: 0 0.3rem;
}
.tw-row-who .tw-btn {
	background: rgba(12, 18, 26, 0.62);
	backdrop-filter: blur(8px);
}
.tw-row-who .tw-btn:not(:disabled):not(.tw-on):hover {
	background: rgba(30, 41, 55, 0.85);
}
/* 进度条:独占整行 */
.tw-row-seek {
	padding: 0 0.45rem;
}
.tw-row-seek .tw-time {
	text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
}
/* 把“选项类”按钮推到右边,和播放/跟随分开 */
.tw-spacer {
	flex: 1 1 0;
	min-width: 0.25rem;
}
.tw-who-label {
	font-size: 12px;
	color: #9fb0c4;
	padding: 0 0.1rem 0 0.35rem;
	text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
.tw-row-main {
	padding: 0.3rem 0.45rem;
	border-radius: 12px;
	background: var(--bar);
	border: 1px solid rgba(255, 255, 255, 0.07);
	backdrop-filter: blur(10px) saturate(1.1);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
	/* 显示选项菜单是它的绝对定位子元素,从这一行往上弹 */
	position: relative;
}
.tw-player.idle .tw-bar,
.tw-player.idle .tw-top {
	opacity: 0;
	pointer-events: none;
}
.tw-player.idle .tw-canvas { cursor: none; }

/* ---- 按钮 ---- */
.tw-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.3rem;
	min-width: 2rem;
	height: 2rem;
	padding: 0 0.4rem;
	border: 0;
	border-radius: 8px;
	background: transparent;
	color: #e8edf3;
	cursor: pointer;
	text-decoration: none;
	transition: background 0.15s ease, color 0.15s ease;
}
.tw-btn:hover { background: rgba(255, 255, 255, 0.12); }
.tw-btn:active { background: rgba(255, 255, 255, 0.2); }
.tw-btn svg { display: block; }
.tw-btn:disabled,
.tw-btn.tw-disabled {
	opacity: 0.4;
	cursor: not-allowed;
}
.tw-btn.tw-disabled {
	pointer-events: none;
}
.tw-btn.tw-on {
	background: var(--accent);
	color: #fff;
	box-shadow: 0 0 0 1px rgba(147, 197, 253, 0.45) inset;
}
/* 已启用的按钮再加 hover:要更亮,不能反而变暗(否则看着像被关掉了) */
.tw-btn.tw-on:hover {
	background: #60a5fa;
	color: #fff;
}
.tw-btn.tw-on:active { background: #93c5fd; }
.tw-btn.tw-off:hover { color: #cfdae7; background: rgba(255, 255, 255, 0.12); }
.tw-btn.tw-off { color: #93a3b5; }
/* 静音状态:标红。没声音这件事得一眼看到,不然容易被当成播放器坏了 */
.tw-btn.tw-alert {
	color: #f87171;
	background: rgba(248, 113, 113, 0.16);
	box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.35) inset;
}
.tw-btn.tw-alert:hover {
	color: #fca5a5;
	background: rgba(248, 113, 113, 0.28);
}
.tw-btn.tw-alert:active { background: rgba(248, 113, 113, 0.4); }
.tw-team span { font-size: 12px; }
.tw-play { min-width: 2.2rem; }

/* ---- 时间 ---- */
.tw-time {
	font-variant-numeric: tabular-nums;
	font-size: 12.5px;
	color: #cfdae7;
	padding: 0 0.25rem;
	white-space: nowrap;
}
.tw-dur { color: #93a3b5; }

/* ---- 进度条 ---- */
.tw-seekwrap {
	position: relative;
	flex: 1;
	min-width: 5rem;
	height: 1.75rem;
	margin: 0 0.2rem;
}
.tw-seektrack {
	position: absolute;
	left: 0;
	right: 0;
	top: 50%;
	height: 4px;
	margin-top: -2px;
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.22);
	overflow: hidden;
	pointer-events: none;
}
.tw-seekfill {
	height: 100%;
	width: 0;
	border-radius: 999px;
	background: var(--accent);
}
.tw-seekknob {
	position: absolute;
	top: 50%;
	left: 0;
	width: 11px;
	height: 11px;
	margin: -5.5px 0 0 -5.5px;
	border-radius: 50%;
	background: #fff;
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.55);
	transition: transform 0.12s ease;
	pointer-events: none;
}
.tw-seekwrap:hover .tw-seekknob { transform: scale(1.2); }
/* 透明 input 盖在上面:拖动/点击/键盘都是它的 */
.tw-seek {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	margin: 0;
	opacity: 0;
	cursor: pointer;
	-webkit-appearance: none;
	appearance: none;
}
.tw-seek:focus-visible + .tw-seektrack {
	box-shadow: 0 0 0 2px var(--accent);
}

/* ---- 浮层锚点 / 跟随 dropdown / 播放速度 ---- */
/* 浮层是锚点的绝对定位子元素,这样能贴着各自的按钮往上弹 */
.tw-anchor {
	position: relative;
	display: inline-flex;
	align-items: center;
}
.tw-follow-btn {
	max-width: 9rem;
	gap: 0.3rem;
}
.tw-follow-value {
	font-size: 12.5px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
/* 跟的人死了:按钮文字变灰(和列表里的「死亡」标记一个意思) */
.tw-follow-btn.tw-off .tw-follow-value { color: #93a3b5; }
.tw-caret {
	display: inline-flex;
	opacity: 0.65;
}
.tw-caret svg { width: 14px; height: 14px; }
.tw-follow-menu {
	left: 0;
	right: auto;
	width: 12.5rem;
	padding: 0.3rem;
}
.tw-follow-list {
	display: flex;
	flex-direction: column;
	gap: 0.05rem;
	max-height: min(45vh, 17rem);
	overflow-y: auto;
}
.tw-follow-option {
	display: flex;
	align-items: center;
	gap: 0.35rem;
	width: 100%;
	padding: 0.35rem 0.5rem;
	border: 0;
	border-radius: 7px;
	background: transparent;
	color: #dfe7f0;
	font: inherit;
	text-align: left;
	cursor: pointer;
}
.tw-follow-option:hover { background: rgba(255, 255, 255, 0.1); }
.tw-follow-option.tw-on { background: var(--accent); color: #fff; }
.tw-follow-name {
	flex: 1 1 auto;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.tw-follow-tag {
	flex: 0 0 auto;
	font-size: 11px;
	opacity: 0.6;
}
.tw-speed-btn {
	/* 固定宽度:拖动滑条时标签在「1×」和「0.35×」之间变长变短,
	   不定宽的话旁边的按钮会跟着左右抖 */
	width: 4.7rem;
	min-width: 4.7rem;
	padding: 0 0.3rem;
	justify-content: center;
	gap: 0.25rem;
}
.tw-speed-value {
	/* 数值本身也定宽,里面那 18px 的图标就不会随数字长度左右微调 */
	flex: 0 0 auto;
	width: 2.4rem;
	font-size: 12px;
	font-variant-numeric: tabular-nums;
	text-align: center;
}
.tw-speed-menu {
	left: 0;
	right: auto;
	width: 13.5rem;
	gap: 0.45rem;
	padding: 0.55rem 0.6rem 0.5rem;
}
.tw-speed-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	font-size: 12px;
	color: #9fb0c4;
}
.tw-speed-readout {
	color: #e8edf3;
	font-weight: 500;
	font-variant-numeric: tabular-nums;
}
.tw-speed-range {
	/* 和进度条同一套长相:4px 半透明轨道 + accent 进度 + 白色小圆点 */
	--fill: 33%;
	width: 100%;
	height: 1.35rem;
	margin: 0;
	background: transparent;
	cursor: pointer;
	-webkit-appearance: none;
	appearance: none;
}
/* WebKit/Blink 没有 range-progress,用横向渐变把进度画在轨道上 */
.tw-speed-range::-webkit-slider-runnable-track {
	height: 4px;
	border-radius: 999px;
	background: linear-gradient(
		to right,
		var(--accent) var(--fill),
		rgba(255, 255, 255, 0.22) var(--fill)
	);
}
.tw-speed-range::-webkit-slider-thumb {
	-webkit-appearance: none;
	appearance: none;
	width: 13px;
	height: 13px;
	/* (轨道 4px - 拇指 13px) / 2,让圆点落在轨道中线上 */
	margin-top: -4.5px;
	border: 0;
	border-radius: 50%;
	background: #fff;
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.55);
	transition: transform 0.12s ease;
}
.tw-speed-range:hover::-webkit-slider-thumb { transform: scale(1.2); }
.tw-speed-range:active::-webkit-slider-thumb { transform: scale(1.3); }
.tw-speed-range:focus-visible { outline: none; }
.tw-speed-range:focus-visible::-webkit-slider-thumb {
	box-shadow:
		0 0 0 3px rgba(59, 130, 246, 0.45),
		0 1px 4px rgba(0, 0, 0, 0.55);
}
/* Firefox */
.tw-speed-range::-moz-range-track {
	height: 4px;
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.22);
}
.tw-speed-range::-moz-range-progress {
	height: 4px;
	border-radius: 999px;
	background: var(--accent);
}
.tw-speed-range::-moz-range-thumb {
	width: 13px;
	height: 13px;
	border: 0;
	border-radius: 50%;
	background: #fff;
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.55);
}
.tw-speed-range:focus-visible::-moz-range-thumb {
	box-shadow:
		0 0 0 3px rgba(59, 130, 246, 0.45),
		0 1px 4px rgba(0, 0, 0, 0.55);
}
.tw-speed-presets {
	display: flex;
	gap: 0.3rem;
}
.tw-speed-preset {
	flex: 1 1 0;
	padding: 0.3rem 0;
	border: 0;
	border-radius: 7px;
	background: rgba(255, 255, 255, 0.08);
	color: #dfe7f0;
	font: inherit;
	font-size: 12px;
	font-variant-numeric: tabular-nums;
	cursor: pointer;
}
.tw-speed-preset:hover { background: rgba(255, 255, 255, 0.16); }
.tw-speed-preset.tw-on { background: var(--accent); color: #fff; }

/* ---- 显示选项上拉菜单 ---- */
.tw-menu {
	position: absolute;
	right: 0;
	bottom: calc(100% + 0.4rem);
	width: min(16rem, calc(100vw - 1.4rem));
	display: flex;
	flex-direction: column;
	gap: 0.1rem;
	padding: 0.35rem;
	border-radius: 12px;
	background: rgba(12, 18, 26, 0.94);
	border: 1px solid rgba(255, 255, 255, 0.09);
	box-shadow: 0 14px 32px rgba(0, 0, 0, 0.5);
	backdrop-filter: blur(10px) saturate(1.1);
	z-index: 5;
}
.tw-menu[hidden] { display: none; }
.tw-menu-item {
	display: flex;
	align-items: center;
	gap: 0.55rem;
	width: 100%;
	padding: 0.4rem 0.5rem;
	border: 0;
	border-radius: 8px;
	background: transparent;
	color: #dfe7f0;
	font: inherit;
	text-align: left;
	cursor: pointer;
}
.tw-menu-item:hover { background: rgba(255, 255, 255, 0.1); }
.tw-menu-item:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.tw-menu-item.tw-disabled { opacity: 0.45; cursor: not-allowed; }
.tw-menu-glyph { display: inline-flex; color: #93a3b5; }
.tw-menu-item.tw-on .tw-menu-glyph { color: #93c5fd; }
.tw-menu-label { flex: 1 1 auto; white-space: nowrap; }
/* 开关:轨道 + 滑块 */
.tw-switch {
	position: relative;
	flex: 0 0 auto;
	width: 30px;
	height: 17px;
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.18);
	transition: background 0.15s ease;
}
.tw-switch-knob {
	position: absolute;
	top: 2px;
	left: 2px;
	width: 13px;
	height: 13px;
	border-radius: 50%;
	background: #e8edf3;
	transition: transform 0.15s ease;
}
.tw-menu-item.tw-on .tw-switch { background: var(--accent); }
.tw-menu-item.tw-on .tw-switch-knob { transform: translateX(13px); }
/* 二级菜单:整页替换(窄屏并排放不下),带一行返回 */
.tw-menu-page {
	display: flex;
	flex-direction: column;
	gap: 0.1rem;
}
.tw-menu-page[hidden] { display: none; }
/* 带子菜单的那一行:开关本体 + 右侧箭头,两个独立的点击区域 */
/* 一行 = 左侧「图标 + 文字(+ 箭头)」 + 右侧开关。两边各自是按钮,
   但视觉上要像一整行:背景高亮放在行上,子按钮全透明。 */
.tw-menu-row {
	display: flex;
	align-items: center;
	border-radius: 8px;
}
.tw-menu-row:hover { background: rgba(255, 255, 255, 0.1); }
.tw-menu-main {
	display: flex;
	align-items: center;
	gap: 0.55rem;
	flex: 1 1 auto;
	min-width: 0;
	padding: 0.4rem 0.2rem 0.4rem 0.5rem;
	border: 0;
	border-radius: 8px 0 0 8px;
	background: transparent;
	color: #dfe7f0;
	font: inherit;
	text-align: left;
	cursor: pointer;
}
.tw-menu-switch {
	display: inline-flex;
	align-items: center;
	flex: 0 0 auto;
	/* 右内边距和下面各行的文字区对齐(0.5rem),这样开关在所有行里位置一致 */
	padding: 0.4rem 0.5rem;
	border: 0;
	border-radius: 0 8px 8px 0;
	background: transparent;
	cursor: pointer;
}
.tw-menu-main:focus-visible,
.tw-menu-switch:focus-visible {
	outline: 2px solid var(--accent);
	outline-offset: -2px;
}
.tw-menu-row.tw-on .tw-menu-glyph { color: #93c5fd; }
/* 行尾的小箭头:表示点进去还有一层 */
.tw-menu-chevron {
	display: inline-flex;
	margin-left: auto;
	color: #93a3b5;
	opacity: 0.85;
}
.tw-menu-chevron svg { width: 14px; height: 14px; }
.tw-menu-switch.tw-on .tw-switch { background: var(--accent); }
.tw-menu-switch.tw-on .tw-switch-knob { transform: translateX(13px); }
/* 禁用(自由视角下的准星行) */
.tw-menu-main:disabled,
.tw-menu-switch:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}
.tw-menu-back {
	display: flex;
	align-items: center;
	gap: 0.3rem;
	width: 100%;
	padding: 0.35rem 0.4rem;
	border: 0;
	border-radius: 8px;
	background: transparent;
	color: #9fb0c4;
	font: inherit;
	font-size: 12px;
	text-align: left;
	cursor: pointer;
}
.tw-menu-back:hover { background: rgba(255, 255, 255, 0.1); color: #dfe7f0; }
.tw-menu-check {
	width: 1rem;
	text-align: center;
	color: var(--accent);
	opacity: 0;
}
.tw-menu-style.tw-on .tw-menu-check { opacity: 1; }
.tw-menu-style.tw-on .tw-menu-check::after { content: '✓'; }

/* ---- 窄屏 ---- */
/* 按钮现在各占一行(跟随/队伍、进度条、其余控件),窄屏不需要靠隐藏按钮来腾地方,
   只把尺寸和间距收紧一点,所有功能都留着 */
@media (max-width: 720px) {
	.tw-bar { padding: 1.8rem 0.4rem 0.35rem; }
	.tw-row { gap: 0.2rem; }
	.tw-row-main { padding: 0.25rem; }
	.tw-row-who { padding: 0 0.25rem; }
	.tw-row-seek { padding: 0 0.3rem; }
	.tw-time { font-size: 11.5px; }
	/* 窄屏里团队视角只留图标:去掉文字后的内边距/间隙,图标才是真正居中的 */
	.tw-team { padding: 0; gap: 0; }
	.tw-team span { display: none; }
	.tw-speed-btn { width: 4.1rem; min-width: 4.1rem; }
	.tw-speed-value { width: 2.1rem; }
	.tw-seekwrap { min-width: 3rem; }
}
@media (max-width: 420px) {
	.tw-btn { min-width: 1.75rem; height: 1.75rem; padding: 0 0.2rem; }
	.tw-time { font-size: 11px; padding: 0 0.15rem; }
	.tw-seekwrap { min-width: 2rem; margin: 0 0.1rem; }
	.tw-row { gap: 0.12rem; }
	.tw-spacer { min-width: 0; }
}
`;
