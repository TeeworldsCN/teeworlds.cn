<script lang="ts">
	import TeeRender from '$lib/components/TeeRender.svelte';
	import { EMOTE } from '$lib/stores/skins';
	import { onDestroy } from 'svelte';

	const emotes = [
		{ value: EMOTE.normal, label: '正常' },
		{ value: EMOTE.angry, label: '生气' },
		{ value: EMOTE.hurt, label: '受伤' },
		{ value: EMOTE.smile, label: '微笑' },
		{ value: EMOTE.surprised, label: '惊讶' }
	];
	const previewSizes = [
		{ value: 64, label: '小' },
		{ value: 96, label: '中' },
		{ value: 128, label: '大' }
	];

	let fileInput = $state<HTMLInputElement | null>(null);
	let previewUrl = $state('');
	let errorMessage = $state('');
	let warningMessage = $state('');
	let dragging = $state(false);
	let selectedEmote = $state(EMOTE.normal);
	let previewSize = $state(96);
	let loadSequence = 0;

	function readImageSize(url: string) {
		return new Promise<{ width: number; height: number }>((resolve, reject) => {
			const image = new Image();
			image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
			image.onerror = () => reject(new Error('图片无法解析'));
			image.src = url;
		});
	}

	async function selectFile(file?: File) {
		if (!file) return;

		errorMessage = '';
		warningMessage = '';

		const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
		if (!isPng) {
			errorMessage = '请选择 PNG 格式的 DDNet 皮肤图片。';
			return;
		}

		const sequence = ++loadSequence;
		const nextUrl = URL.createObjectURL(file);

		try {
			const { width, height } = await readImageSize(nextUrl);
			// 仅采用最后一次选择的文件，避免较慢的旧文件覆盖当前预览。
			if (sequence !== loadSequence) {
				URL.revokeObjectURL(nextUrl);
				return;
			}

			if (previewUrl) URL.revokeObjectURL(previewUrl);
			previewUrl = nextUrl;
			selectedEmote = EMOTE.normal;

			// 非标准比例仍可预览，但需要提醒玩家可能出现的显示问题。
			if (width !== height * 2) {
				warningMessage = '图片不是标准的 2:1 比例，游戏中的皮肤部件可能出现拉伸或错位。';
			}
		} catch {
			URL.revokeObjectURL(nextUrl);
			errorMessage = '图片读取失败，请确认文件没有损坏。';
		}
	}

	function clearPreview() {
		loadSequence += 1;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = '';
		errorMessage = '';
		warningMessage = '';
		selectedEmote = EMOTE.normal;
		previewSize = 96;
		if (fileInput) fileInput.value = '';
	}

	function pickFile() {
		fileInput?.click();
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		selectFile(event.dataTransfer?.files[0]);
	}

	function onDragOver(event: DragEvent) {
		event.preventDefault();
		dragging = true;
	}

	function onDragLeave(event: DragEvent) {
		// 仅在真正离开容器时取消高亮，避免子元素触发误判。
		if (event.currentTarget instanceof Node && event.relatedTarget instanceof Node) {
			if (!event.currentTarget.contains(event.relatedTarget)) {
				dragging = false;
			}
		} else {
			dragging = false;
		}
	}

	onDestroy(() => {
		// 释放本地文件创建的临时 URL，避免页面切换后继续占用内存。
		loadSequence += 1;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
	});
</script>

<section
	class="rounded-lg bg-slate-700 p-4 shadow-lg sm:p-6"
	aria-labelledby="skin-preview-title"
>
	<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 id="skin-preview-title" class="text-xl font-bold text-slate-100">自定义皮肤预览</h2>
			<p class="mt-1 text-sm text-slate-300">
				上传本地 PNG 图片预览游戏内效果。图片仅在本地处理，不会上传到服务器。
			</p>
		</div>

		<!--
			移动端没有拖拽体验，所以额外提供一个紧凑的"选择文件"按钮。
			桌面端整个框都是热区，这里按钮隐藏，避免重复入口。
		-->
		<button
			type="button"
			class="rounded-md bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-500 sm:hidden"
			onclick={pickFile}
		>
			选择文件
		</button>
	</div>

	<!--
		整个 section 都是拖入热区：拖到预览图上也能换图。
		空状态时占满宽度，加载后尺寸收缩到刚好容纳预览 + 工具栏。
	-->
	<button
		type="button"
		class="relative flex w-full cursor-pointer flex-col rounded-lg border-2 border-dashed text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 {dragging
			? 'border-blue-400 bg-blue-500/10'
			: 'border-slate-500 bg-slate-600/50 hover:border-blue-400 hover:bg-slate-600'}"
		class:min-h-64={!previewUrl}
		class:py-8={!previewUrl}
		class:p-4={previewUrl}
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
		onclick={pickFile}
		aria-label="点击、拖入或选择皮肤图片"
	>
		<input
			bind:this={fileInput}
			type="file"
			accept="image/png,.png"
			class="sr-only"
			onchange={(event) => selectFile(event.currentTarget.files?.[0])}
		/>

		{#if !previewUrl}
			<div class="flex flex-1 flex-col items-center justify-center text-center">
				<svg
					class="mb-3 h-10 w-10 text-slate-400"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 7.5m0 0L7.5 12M12 7.5v9"
					/>
				</svg>
				<span class="font-medium text-slate-200">点击选择或拖入皮肤图片</span>
				<span class="mt-1 text-sm text-slate-400">支持标准 2:1 比例的 PNG，如 256 × 128</span>
			</div>
		{:else}
			<div class="flex flex-1 items-center justify-center py-4 sm:py-2">
				<div style={`width: ${previewSize}px; height: ${previewSize * 2}px;`}>
					<TeeRender url={previewUrl} emote={selectedEmote} className="h-full w-full" />
				</div>
			</div>
		{/if}

		{#if errorMessage}
			<p
				class="mt-3 rounded-md bg-red-950/50 px-3 py-2 text-sm text-red-300"
				role="alert"
				onclick={(event) => event.stopPropagation()}
			>
				{errorMessage}
			</p>
		{/if}

		{#if warningMessage}
			<p
				class="mt-3 rounded-md bg-amber-950/50 px-3 py-2 text-sm text-amber-300"
				role="status"
				onclick={(event) => event.stopPropagation()}
			>
				{warningMessage}
			</p>
		{/if}

		{#if previewUrl}
			<!--
				工具栏：阻止冒泡，避免点按钮触发整框的 pickFile。
				桌面端额外显示"更换图片"，移动端依赖标题旁的"选择文件"按钮。
			-->
			<div
				class="mt-4 flex flex-col gap-4 border-t border-slate-500/50 pt-4 sm:flex-row sm:items-center sm:justify-between"
				onclick={(event) => event.stopPropagation()}
				role="group"
				aria-label="预览设置"
			>
				<div class="flex flex-wrap items-center gap-2">
					<span class="mr-1 text-sm font-medium text-slate-300">尺寸</span>
					{#each previewSizes as size}
						<button
							type="button"
							class="rounded-md px-3 py-1.5 text-sm transition-colors {previewSize === size.value
								? 'bg-blue-600 text-white'
								: 'bg-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'}"
							onclick={() => (previewSize = size.value)}
							aria-pressed={previewSize === size.value}
						>
							{size.label}
						</button>
					{/each}
				</div>

				<div class="flex flex-wrap items-center gap-2">
					<span class="mr-1 text-sm font-medium text-slate-300">表情</span>
					{#each emotes as emote}
						<button
							type="button"
							class="rounded-md px-3 py-1.5 text-sm transition-colors {selectedEmote ===
							emote.value
								? 'bg-blue-600 text-white'
								: 'bg-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'}"
							onclick={() => (selectedEmote = emote.value)}
							aria-pressed={selectedEmote === emote.value}
						>
							{emote.label}
						</button>
					{/each}
				</div>

				<div class="flex flex-wrap items-center gap-2 sm:justify-end">
					<button
						type="button"
						class="hidden rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-500 sm:inline-flex"
						onclick={pickFile}
					>
						更换图片
					</button>
					<button
						type="button"
						class="rounded-md bg-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
						onclick={clearPreview}
					>
						清除
					</button>
				</div>
			</div>
		{/if}
	</button>
</section>
