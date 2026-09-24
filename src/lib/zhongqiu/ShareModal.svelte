<script lang="ts">
	/**
	 * 结算屏的「分享战绩」弹窗:复制文本 / 下载海报。
	 *
	 * 海报是打开弹窗时**现场画**的(canvas),顺便拿它当预览图 —— 预览和下载共用同一张
	 * blob,不用画两遍;关掉弹窗就 revoke,别让 1080×1080 的 object URL 常驻。
	 */
	import { onDestroy } from 'svelte';
	import Fa from 'svelte-fa';
	import {
		faCheck,
		faClipboard,
		faDownload,
		faSpinner,
		faXmark
	} from '@fortawesome/free-solid-svg-icons';
	import { copyToClipboard, downloadBlob } from './share';
	import { posterFilename, renderPoster, type PosterData } from './poster';

	let {
		show = $bindable(),
		data,
		/** 「复制文本」的内容:正文 + 链接(由页面按当局成绩拼好) */
		text,
		/** 预览里显示的那段:只有正文,省掉链接(标点也收在正文里,不留悬空的「：」) */
		preview
	}: { show: boolean; data: PosterData; text: string; preview: string } = $props();

	/** 海报文件(预览 / 下载共用) */
	let poster = $state<Blob | null>(null);
	let previewUrl = $state('');
	let rendering = $state(false);
	let failed = $state(false);
	/** 复制成功:按钮上闪一下「已复制」 */
	let copied = $state(false);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;
	/** 生成代次:关掉弹窗 / 数据变了之后,迟到的生成结果直接丢掉 */
	let gen = 0;

	const stopCopiedTimer = () => {
		if (copiedTimer) clearTimeout(copiedTimer);
		copiedTimer = undefined;
	};

	const revoke = () => {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = '';
	};

	const generate = async (d: PosterData) => {
		const myGen = ++gen;
		rendering = true;
		failed = false;
		try {
			const canvas = await renderPoster(d);
			const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
			if (myGen !== gen) return;
			poster = blob;
			revoke();
			previewUrl = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
		} catch {
			if (myGen !== gen) return;
			failed = true;
		} finally {
			if (myGen === gen) rendering = false;
		}
	};

	// 打开就画(已经画好、数据没变就不再画);data 是被 $state 包着的对象,换代次比对
	let lastKey = '';
	$effect(() => {
		if (!show) return;
		const key = [
			data.score,
			data.round,
			data.roundScore,
			data.duration,
			data.scoredFaces.join(','),
			data.team.map((t) => `${t.name}:${t.skin}`).join(','),
			data.buffs.map((b) => `${b.name}:${b.count}`).join(',')
		].join('|');
		if (key === lastKey && (poster || rendering)) return;
		lastKey = key;
		void generate(data);
	});

	const doCopy = async () => {
		const ok = await copyToClipboard(text);
		copied = ok;
		stopCopiedTimer();
		if (ok) copiedTimer = setTimeout(() => (copied = false), 1800);
	};

	const doDownload = () => {
		if (!poster) return;
		downloadBlob(poster, posterFilename(data));
	};

	onDestroy(() => {
		gen += 1;
		stopCopiedTimer();
		revoke();
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<!-- Esc 关窗(和其它弹窗一个习惯;svelte:window 只能放顶层,所以守卫写在回调里) -->
<svelte:window
	onkeydown={(e) => {
		if (show && e.key === 'Escape') show = false;
	}}
/>

{#if show}
	<div
		class="fixed inset-0 z-[85] flex cursor-default items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-4"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) show = false;
		}}
	>
		<div
			class="flex max-h-[94svh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-slate-900 shadow-2xl sm:max-w-lg"
			role="dialog"
			aria-modal="true"
			aria-label="分享战绩"
		>
			<!-- 头部 -->
			<div class="flex items-center justify-between px-4 pt-3.5">
				<div class="flex items-center gap-2">
					<span class="text-xl">🥮</span>
					<span class="text-lg font-bold text-amber-200">分享我的战绩</span>
				</div>
				<button
					class="rounded-lg bg-slate-700/60 px-2.5 py-1 text-sm font-bold text-slate-300 transition hover:bg-slate-600"
					aria-label="关闭"
					onclick={() => (show = false)}
				>
					<Fa icon={faXmark} />
				</button>
			</div>

			<!-- 海报预览:海报是 2:3 的长图,所以按**高度**适配(宽度跟着比例走,别拿 aspect-square 硬裁) -->
			<div class="mt-2.5 min-h-0 flex-1 overflow-y-auto px-4">
				<div
					class="relative mx-auto h-[44svh] max-h-[32rem] min-h-[12rem] w-full overflow-hidden rounded-xl border border-slate-600/50 bg-slate-950/60 sm:h-[52svh]"
				>
					{#if previewUrl}
						<img
							src={previewUrl}
							alt="战绩海报预览"
							class="absolute inset-0 m-auto max-h-full max-w-full object-contain"
						/>
					{:else if failed}
						<div class="flex h-full items-center justify-center px-6 text-center text-slate-400">
							海报没画出来（这个浏览器不支持 canvas 导出？）—— 上面的文本照样可以复制分享。
						</div>
					{:else}
						<div class="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
							<Fa icon={faSpinner} class="animate-spin text-xl" />
							<span>正在生成海报…</span>
						</div>
					{/if}
				</div>

				<!-- 复制文本预览:让人先看清要发出去的是什么。
				     链接**不在这里铺开**(太长会占掉两行),也不额外加提示语 ——
				     底部那行小字本来就写着网址,再加一句「会带上链接」反而啰嗦。
				     真要发出去的是 text(正文 + 链接),不是这段预览 -->
				<div
					class="mt-2.5 rounded-xl border border-slate-700/60 bg-slate-800/50 px-3 py-2 text-left leading-snug break-all text-slate-300"
					aria-label="分享文案预览"
				>
					{preview}
				</div>
			</div>

			<!-- 两个动作 -->
			<div class="flex items-center justify-center gap-2 px-4 pt-3 pb-4">
				<button
					class="flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 font-semibold transition active:scale-95 {copied
						? 'border-emerald-400/70 bg-emerald-500/15 text-emerald-300'
						: 'border-slate-500 bg-slate-700 text-slate-100 hover:bg-slate-600'}"
					onclick={doCopy}
				>
					<Fa icon={copied ? faCheck : faClipboard} />
					<span>{copied ? '已复制' : '复制文本'}</span>
				</button>
				<button
					class="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-3 py-2.5 font-bold whitespace-nowrap text-amber-950 shadow transition hover:from-amber-300 hover:to-amber-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
					disabled={!poster}
					onclick={doDownload}
				>
					<Fa icon={faDownload} />
					<span>下载战绩</span>
				</button>
			</div>
		</div>
	</div>
{/if}
