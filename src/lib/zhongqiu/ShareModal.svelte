<script lang="ts">
	/**
	 * 结算屏的「分享战绩」弹窗:复制文本 / 下载海报。
	 *
	 * 海报是打开弹窗时**现场画**的(canvas),画两遍:一遍 **JPEG dataURL**(预览图),
	 * 一遍 **PNG blob**(下载用)。
	 * 为什么预览不用 blob URL:微信 / QQ 的内置浏览器对 `blob:` 图片**长按「保存/转发」会失败**
	 * (安卓侧实测:提示保存失败、转发不弹好友列表),`data:` 才认;而且这两个内核把 JS 下载
	 * 一并禁掉了,所以那里连「下载」按钮都不给,改成教用户长按 —— 判定用项目自带的
	 * `uaIsStrict`(helpers.ts:QQ/ 或 micromessenger)。
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
	import { page } from '$app/state';
	import { uaIsStrict } from '$lib/helpers';
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

	/** 下载用的海报文件(全质量 PNG) */
	let poster = $state<Blob | null>(null);
	/** 预览图:JPEG 的 dataURL(不是 blob URL —— 微信/QQ 里只有 dataURL 能长按保存,见文件头注释) */
	let previewSrc = $state('');
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

	const generate = async (d: PosterData) => {
		const myGen = ++gen;
		rendering = true;
		failed = false;
		try {
			const canvas = await renderPoster(d);
			// 预览:JPEG 的 dataURL(1.4MB 的 PNG 转 base64 会到 1.8MB,移动端太重)
			const previewData = canvas.toDataURL('image/jpeg', 0.92);
			const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
			if (myGen !== gen) return;
			poster = blob;
			previewSrc = previewData;
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
	<!-- 每次打开重算:微信/QQ 内置浏览器里 JS 下载是禁的,只能长按保存。
	     判定用项目自带的 uaIsStrict(QQ/ 或 micromessenger),**两个来源取并集**:
	       · 服务端的 `page.data.ua` —— /link 页与 CameraCapture 走的就是这条(`+layout.server.ts` 给的),最可靠;
	       · 客户端 `navigator.userAgent` —— 兜住「布局数据是上一次请求留下的」那种情况,也方便 QA 改 UA 复验。
	     任一命中就算内置,别在页面里另写一套 UA 正则。 -->
	{@const inApp =
		uaIsStrict(page.data.ua ?? '') ||
		uaIsStrict(typeof navigator === 'undefined' ? '' : navigator.userAgent)}
	<div
		class="fixed inset-0 z-[85] flex cursor-default items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-4"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) show = false;
		}}
	>
		<div
			class="flex h-[min(94svh,46rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-slate-900 shadow-2xl sm:max-w-lg"
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

			<!-- 海报预览 + 文案预览:上下两段。
			     面板自己是**确定高度**(h-[min(94svh,46rem)])—— 不给确定高度,图片的 `max-h-full`
			     就没有参照,会按原始比例把整个弹窗顶出屏幕(矮屏实测:上沿被切掉)。
			     外面这层是 flex 列 + min-h-0:**高度是确定的**,里面图片的 `max-h-full` 才有意义。
			     海报是 2:3 长图,所以宽度由高度决定;矮屏/窄屏碰到上限就整体缩小 ——
			     永远是整张,而且「框就是图」,不再有左右黑边。 -->
			<div class="mt-2.5 flex min-h-0 flex-1 flex-col gap-2.5 px-4">
				<!-- 预览:吃掉剩余高度(矮屏先压它;min-h 兜一下,别被文案挤没) -->
				<div class="flex min-h-[7rem] flex-1 items-center justify-center">
					{#if previewSrc}
						<img
							src={previewSrc}
							alt="战绩海报预览"
							class="h-auto max-h-full w-auto max-w-full rounded-xl border border-slate-600/50 object-contain"
						/>
					{:else}
						<div
							class="flex aspect-[2/3] h-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-slate-600/50 bg-slate-950/60 px-4 text-center text-slate-400"
						>
							{#if failed}
								海报没画出来（这个浏览器不支持 canvas 导出？）—— 上面的文本照样可以复制分享。
							{:else}
								<Fa icon={faSpinner} class="animate-spin text-xl" />
								<span>正在生成海报…</span>
							{/if}
						</div>
					{/if}
				</div>

				<!-- 长按提示就贴在图片下面(文本预览之前):内置浏览器里不摆「下载」按钮,
				     直接把「怎么拿走这张图」写在图旁边 -->
				{#if inApp}
					<div
						class="mt-1 shrink-0 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-center leading-snug font-bold text-amber-200"
					>
						长按图片即可保存 / 转发
					</div>
				{/if}

				<!-- 复制文本预览:自然高度,不被压。链接不在这里铺开(太长会占两行) -->
				<div
					class="shrink-0 rounded-xl border border-slate-700/60 bg-slate-800/50 px-3 py-2 text-left leading-snug break-all text-slate-300"
					aria-label="分享文案预览"
				>
					{preview}
				</div>
			</div>

			<!-- 两个动作 -->
			<div class="flex items-center justify-center gap-2 px-4 pt-3 pb-4">
				<button
					class="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 font-semibold transition active:scale-95 {copied
						? 'border border-emerald-400/70 bg-emerald-500/15 text-emerald-300'
						: inApp
							? 'bg-gradient-to-b from-amber-400 to-amber-600 font-bold text-amber-950 shadow hover:from-amber-300 hover:to-amber-500'
							: 'border border-slate-500 bg-slate-700 text-slate-100 hover:bg-slate-600'}"
					onclick={doCopy}
				>
					<Fa icon={copied ? faCheck : faClipboard} />
					<span>{copied ? '已复制' : '复制文本'}</span>
				</button>
				{#if !inApp}
					<button
						class="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-3 py-2.5 font-bold whitespace-nowrap text-amber-950 shadow transition hover:from-amber-300 hover:to-amber-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
						disabled={!poster}
						onclick={doDownload}
					>
						<Fa icon={faDownload} />
						<span>下载战绩</span>
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
