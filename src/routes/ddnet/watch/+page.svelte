<script lang="ts">
	/**
	 * demo 回放页:和 ddnet.org/watch 一样的链接形状,但用我们自己的引擎(rust/twengine)播。
	 *
	 *   /ddnet/watch?uuid=<游戏 uuid>            从 runs/<uuid>.jsonl 里找这一档
	 *   /ddnet/watch?uuid=<uuid>&time=372.98     同一场回放里有多个名次时用来选
	 *
	 * 注意 `time` 是这一档成绩的完赛时间(官方页面也只用它画终点标记和标题),不是播放起点。
	 *   /ddnet/watch?demo=<runs 里的相对路径>   直接给 demo(相对 /ddnet/watch/api/)
	 *
	 * 和官方页面的区别:官方页面是整套 DDNet 客户端编译成 wasm(要 cross-origin isolated,
	 * QQ/微信内置浏览器直接挂);这边是 twgpu 渲染 + Web Audio,单线程 wasm,不需要 SAB。
	 */
	import { onMount } from 'svelte';
	// 全站共用的皮肤缓存(单例,只拉一次 /api/skins);播放器只按名字查 URL,不自己拼
	import { getSkinUrl } from '$lib/stores/skins';

	/** 播放器是 static 下的独立模块(和地图预览共用同一个 wasm),运行时按 URL 加载,不打进 bundle */
	type DemoModule = {
		mountDemoPlayer: (
			host: HTMLElement,
			options: {
				demoUrl: string;
				title?: string;
				focus?: number;
				finishers?: number[];
				/** 皮肤名 → 图片 URL(null = 皮肤库里没有,用 default 渲染) */
				resolveSkin?: (name: string) => Promise<string | null>;
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
		demo?: string;
		rev?: string;
		cid?: number;
	};

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

	onMount(() => {
		let player: { destroy(): void } | null = null;
		let cancelled = false;

		const run = async () => {
			const params = new URLSearchParams(location.search);
			let demoUrl = '';
			let title = '';
			let focus;
			let finishers;

			if (params.get('demo')) {
				demoUrl = `${API}/${params.get('demo')}${params.get('v') ? `?v=${params.get('v')}` : ''}`;
				title = params.get('name') ?? '';
			} else if (params.get('uuid')) {
				message = '查找过图回放…';
				const uuid = params.get('uuid')!;
				const wanted = params.get('time');
				let found: Entry | null = null;

				// 先看这一场的 runs/<uuid>.jsonl(上游为每场单独生成的,很小、最新)。
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
								found = entry;
								break;
							}
						} catch {
							// 半行/坏行跳过
						}
					}
				}

				// 退路:服务端已经索引好的 watchable.jsonl,按 uuid 查一条。
				// 别在这里拉整个 watchable.jsonl —— 它现在 3 MB 多,还是每分钟级更新的。
				if (!found) {
					const lookupUrl = new URL(`${API}/lookup`, location.href);
					lookupUrl.searchParams.set('uuid', uuid);
					if (wanted !== null) lookupUrl.searchParams.set('time', wanted);
					const lookup = await fetch(lookupUrl);
					if (lookup.ok) {
						const { entries } = (await lookup.json()) as { entries?: Entry[] };
						found = entries?.find((entry) => entry.demo) ?? null;
					}
				}

				if (!found) {
					message = '过图回放还没有预生成的 demo';
					return;
				}
				const entry = found as Entry;
				demoUrl = `${API}/demos/${entry.demo}${entry.rev ? `?v=${entry.rev}` : ''}`;
				title = titleOf(entry);
				// 相机默认跟这一档的完成者(服务端转出来的 demo 里没有“本机玩家”)
				focus = entry.cid;
				// 同队伍的其他人:转换出来的 demo 里队伍号全是 0,只能用名次数据
				finishers = entry.finishers;
			} else {
				message = '链接里要有 ?uuid= 或 ?demo=';
				return;
			}

			if (cancelled || !host) return;
			message = '';
			document.title = title || 'demo 回放 - TeeworldsCN';
			// 变量形式的 URL:TS 不去解析,运行时由 dev server / CDN 提供
			const demoModuleUrl = '/ddnet/engine/demo.js';
			const engine = (await import(/* @vite-ignore */ demoModuleUrl)) as DemoModule;
			if (cancelled || !host) return;
			player = await engine.mountDemoPlayer(host, {
				demoUrl,
				title,
				focus,
				finishers,
				resolveSkin: getSkinUrl
			});
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
