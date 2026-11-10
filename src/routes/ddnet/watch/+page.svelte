<script lang="ts">
	/**
	 * demo 回放页:和 ddnet.org/watch 一样的链接形状,但用我们自己的引擎(rust/twengine)播。
	 *
	 *   /ddnet/watch?uuid=<游戏 uuid>            从 runs/<uuid>.jsonl 里找这一档
	 *   /ddnet/watch?uuid=<uuid>&time=372.98     同一场回放里有多个名次时用来选
	 *   ...&kind=solo&player=<玩家名>             同一场完赛有多条视角时挑人(个人记录默认关团队视角)
	 *
	 * 注意 `time` 是这一档成绩的完赛时间(官方页面也只用它画终点标记和标题),不是播放起点。
	 *   /ddnet/watch?demo=<runs 里的相对路径>   直接给 demo(相对 /ddnet/watch/api/)
	 *
	 * 和官方页面的区别:官方页面是整套 DDNet 客户端编译成 wasm(要 cross-origin isolated,
	 * QQ/微信内置浏览器直接挂);这边是 twgpu 渲染 + Web Audio,单线程 wasm,不需要 SAB。
	 */
	import { page } from '$app/state';
	import { uaIsStrict } from '$lib/helpers';
	// 全站共用的皮肤缓存(单例,只拉一次 /api/skins);播放器只按名字查 URL,不自己拼
	import { getSkinUrl } from '$lib/stores/skins';

	/** SSR 传过来的数据(目前只有引擎产物版本号,见 +page.server.ts) */
	let { data } = $props();

	/** 播放器是 static 下的独立模块(和地图预览共用同一个 wasm),运行时按 URL 加载,不打进 bundle */
	type DemoModule = {
		mountDemoPlayer: (
			host: HTMLElement,
			options: {
				demoUrl: string;
				title?: string;
				focus?: number;
				finishers?: number[];
				/** 是否默认开启团队视角(个人记录传 false) */
				team?: boolean;
				/** 皮肤名 → 图片 URL(null = 皮肤库里没有,用 default 渲染) */
				resolveSkin?: (name: string) => Promise<string | null>;
				/** QQ / 微信内置浏览器:下载和全屏按钮直接禁用 */
				inApp?: boolean;
				/** 强制图形后端(内置浏览器里直接 webgl) */
				backend?: 'webgpu' | 'webgl';
				/** 这次部署的版本号,给静态 JS / 贴图 URL 用 */
				version?: string;
			}
		) => Promise<{ destroy(): void } | null>;
	};

	type Entry = {
		uuid: string;
		status: string;
		map: string;
		time: string;
		names?: string[];
		finishers?: number[];
		/** 'team' | 'solo' —— 同一次完赛 team 一条 + 每个完成者各一条 solo */
		kind?: string;
		demo?: string;
		rev?: string;
		cid?: number;
		/** 名次已经不存在、被上游保留下来的历史回放(只出现在 watchables.invalid) */
		kept?: boolean;
	};

	/** 引擎产物的版本号(SSR 时从 version.json 读出来,见 +page.server.ts) */
	const engineVersion = $derived(data.engineVersion ?? '');

	let host: HTMLDivElement;
	let message = $state('');

	const API = '/ddnet/watch/api';

	const formatTime = (value: number) => {
		const minutes = Math.floor(value / 60);
		return `${String(minutes).padStart(2, '0')}:${(value - minutes * 60).toFixed(2).padStart(5, '0')}`;
	};

	const titleOf = (entry: Entry) => {
		const names = entry.names ?? [];
		const who =
			names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : (names[0] ?? '');
		return `${entry.map} [${formatTime(parseFloat(entry.time))}]${who ? ` - ${who}` : ''}`;
	};

	/**
	 * 播放器跟着 URL 走,而不是 onMount 只跑一次。
	 *
	 * SvelteKit 里 `/ddnet/watch?uuid=a` → `?uuid=b` 是同一个路由,组件不会重新挂载;
	 * DDNet TV 的卡片就是这种跳转,不跟 URL 的话换了 demo 画面还是旧的。
	 * 切 demo 时旧播放器 destroy、新播放器复用缓存里的引擎/canvas。
	 */
	$effect(() => {
		// 读一下 search 让 effect 跟踪 URL 变化
		const search = page.url.search;
		void host;

		let player: { destroy(): void } | null = null;
		let cancelled = false;

		const run = async () => {
			const params = new URLSearchParams(search);
			const invalid = params.get('invalid') === '1';
			let demoUrl = '';
			let title = '';
			let focus;
			let finishers;
			let team = true;

			// 同一次完赛在清单里有多条:team 一条 + 每个完成者各一条 solo。
			// 链接上的 kind / player 用来挑对视角(个人记录默认不进团队视角)。
			const wantedKind = params.get('kind');
			const wantedPlayer = params.get('player')?.toLowerCase() ?? null;
			const pickEntry = (entries: Entry[]) => {
				let candidates = entries.filter((entry) => entry.demo);
				// `runs/<uuid>.jsonl` 里正常记录和 kept 记录都有,按链接要找的那份清单优先
				const samePartition = candidates.filter((entry) => (entry.kept === true) === invalid);
				if (samePartition.length) candidates = samePartition;
				if (wantedKind) {
					const byKind = candidates.filter((entry) => entry.kind === wantedKind);
					if (byKind.length) candidates = byKind;
				}
				if (wantedPlayer) {
					const byPlayer = candidates.filter((entry) =>
						(entry.names ?? []).some((name) => name.toLowerCase() === wantedPlayer)
					);
					if (byPlayer.length) candidates = byPlayer;
				}
				return candidates[0] ?? null;
			};

			const findEntry = async (uuid: string, wanted: string | null) => {
				// 先看这一场的 runs/<uuid>.jsonl(上游为每场单独生成的,很小、最新)。
				const candidates: Entry[] = [];
				const response = await fetch(`${API}/runs/${uuid}.jsonl`);
				if (response.ok) {
					for (const line of (await response.text()).split('\n')) {
						if (!line.includes(uuid)) continue;
						try {
							const entry = JSON.parse(line) as Entry;
							if (entry.uuid !== uuid || entry.status !== 'ok' || !entry.demo) continue;
							if (
								wanted === null ||
								Math.abs(parseFloat(entry.time) - parseFloat(wanted)) < 0.005
							) {
								candidates.push(entry);
							}
						} catch {
							// 半行/坏行跳过
						}
					}
				}
				const local = pickEntry(candidates);
				if (local) return local;

				// 退路:服务端已经索引好的 watchable.jsonl,按 uuid 查一条。
				// 别在这里拉整个 watchable.jsonl —— 它现在 3 MB 多,还是每分钟级更新的。
				const lookupUrl = new URL(`${API}/lookup`, location.href);
				lookupUrl.searchParams.set('uuid', uuid);
				if (wanted !== null) lookupUrl.searchParams.set('time', wanted);
				if (invalid) lookupUrl.searchParams.set('invalid', '1');
				const lookup = await fetch(lookupUrl);
				if (!lookup.ok) return null;
				const { entries } = (await lookup.json()) as { entries?: Entry[] };
				return pickEntry(entries ?? []);
			};

			if (params.get('demo')) {
				demoUrl = `${API}/${params.get('demo')}${params.get('v') ? `?v=${params.get('v')}` : ''}`;
				title = params.get('name') ?? '';
			} else if (params.get('uuid')) {
				message = '查找过图回放…';
				const uuid = params.get('uuid')!;
				const found = await findEntry(uuid, params.get('time'));

				if (cancelled) return;
				if (!found) {
					message = '过图回放还没有预生成的 demo';
					return;
				}
				demoUrl = `${API}/demos/${found.demo}${found.rev ? `?v=${found.rev}` : ''}`;
				title = titleOf(found);
				// 相机默认跟这一档的完成者(服务端转出来的 demo 里没有“本机玩家”)
				focus = found.cid;
				// 同队伍的其他人:转换出来的 demo 里队伍号全是 0,只能用名次数据
				finishers = found.finishers;
				// 个人记录(链接上写了 solo,或这一档本身就是 solo)默认不开团队视角;
				// 播放器里的「团队视角」按钮仍然可以手动打开
				team = (wantedKind ?? found.kind) !== 'solo';
			} else {
				message = '链接里要有 ?uuid= 或 ?demo=';
				return;
			}

			if (cancelled || !host) return;
			message = '';
			document.title = title || 'demo 回放 - TeeworldsCN';
			// 带上这次部署的版本号(SSR 已经读好了):`demo.js` / `engine.js` / `sound.js`
			// 是静态文件,前面的 CDN 按 URL 缓存、又不遵守 Cache-Control ——
			// 不加 v 的话发了新版用户还在跑旧代码。
			const version = engineVersion;
			const demoModuleUrl = `/ddnet/engine/demo.js${version ? `?v=${version}` : ''}`;
			const engine = (await import(/* @vite-ignore */ demoModuleUrl)) as DemoModule;
			if (cancelled || !host) return;
			const inApp = uaIsStrict(navigator.userAgent);
			const created = await engine.mountDemoPlayer(host, {
				demoUrl,
				title,
				focus,
				finishers,
				team,
				resolveSkin: getSkinUrl,
				version,
				inApp,
				// X5(QQ / 微信)的 WebGPU 只"能探测"不能真用,直接跳过,别浪费一次失败的初始化;
				// 其它浏览器照旧自己探测、失败再回退
				backend: inApp ? 'webgl' : undefined
			});
			// 加载过程中又换了 demo:这份播放器已经没人要了,立刻放掉
			if (cancelled) created?.destroy();
			else player = created;
		};

		void run();

		return () => {
			cancelled = true;
			player?.destroy();
		};
	});
</script>

<svelte:head>
	<title>demo 回放 - TeeworldsCN</title>
</svelte:head>

<div class="watch">
	<div class="stage-wrap">
		<div class="stage" bind:this={host}></div>
		<!-- 提示浮在画面上,不占布局(也不会在加载完成后把播放器往下挤) -->
		{#if message}
			<div class="hint">{message}</div>
		{/if}
	</div>
</div>

<style>
	.watch {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		height: calc(100dvh - 4rem);
		min-height: 24rem;
		padding: 0.5rem;
	}
	.stage-wrap {
		position: relative;
		flex: 1;
		min-height: 0;
		border-radius: 0.5rem;
		overflow: hidden;
		background: #000;
	}
	.stage {
		position: absolute;
		inset: 0;
	}
	/* 和播放器自己的加载提示一样居中浮着,不参与布局 */
	.hint {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: #cbd5e1;
		font:
			13px/1.4 ui-sans-serif,
			system-ui,
			sans-serif;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
		pointer-events: none;
	}
</style>
