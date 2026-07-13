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

	onDestroy(() => {
		// 释放本地文件创建的临时 URL，避免页面切换后继续占用内存。
		loadSequence += 1;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
	});
</script>

<section class="rounded-lg bg-slate-700 p-4 shadow-lg sm:p-6" aria-labelledby="skin-preview-title">
	<div class="mb-4">
		<h2 id="skin-preview-title" class="text-xl font-bold text-slate-100">自定义皮肤预览</h2>
		<p class="mt-1 text-sm text-slate-300">
			上传本地 PNG 图片预览游戏内效果。图片仅在本地处理，不会上传到服务器。
		</p>
	</div>

	<div class="grid gap-4 lg:grid-cols-2">
		<div class="flex flex-col">
			<label
				for="skin-preview-file"
				class="flex min-h-40 flex-1 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors {dragging
					? 'border-blue-400 bg-blue-500/10'
					: 'border-slate-500 bg-slate-600/50 hover:border-blue-400 hover:bg-slate-600'}"
				ondragover={(event) => {
					event.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={(event) => {
					event.preventDefault();
					dragging = false;
					selectFile(event.dataTransfer?.files[0]);
				}}
			>
				<span class="font-medium text-slate-200">点击选择或拖入皮肤图片</span>
				<span class="mt-1 text-sm text-slate-400">支持标准 2:1 比例的 PNG 图片，如 256 × 128</span>
				<input
					bind:this={fileInput}
					id="skin-preview-file"
					type="file"
					accept="image/png,.png"
					class="sr-only"
					onchange={(event) => selectFile(event.currentTarget.files?.[0])}
				/>
			</label>

			{#if errorMessage}
				<p class="mt-3 rounded-md bg-red-950/50 px-3 py-2 text-sm text-red-300" role="alert">
					{errorMessage}
				</p>
			{/if}

			{#if warningMessage}
				<p class="mt-3 rounded-md bg-amber-950/50 px-3 py-2 text-sm text-amber-300" role="status">
					{warningMessage}
				</p>
			{/if}
		</div>

		<div class="flex min-h-64 flex-col rounded-lg bg-slate-600 p-4">
			{#if previewUrl}
				<div class="flex items-start justify-between gap-3">
					<h3 class="font-medium text-slate-200">效果预览</h3>
					<button
						type="button"
						class="shrink-0 rounded-md bg-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
						onclick={clearPreview}
					>
						清除
					</button>
				</div>

				<div class="flex min-h-40 flex-1 items-center justify-center py-3">
					<div style={`width: ${previewSize}px; height: ${previewSize}px;`}>
						<TeeRender url={previewUrl} emote={selectedEmote} className="h-full w-full" />
					</div>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<fieldset>
						<legend class="mb-2 text-sm font-medium text-slate-300">预览尺寸</legend>
						<div class="flex flex-wrap gap-2">
							{#each previewSizes as size}
								<button
									type="button"
									class="rounded-md px-3 py-2 text-sm transition-colors {previewSize === size.value
										? 'bg-blue-600 text-white'
										: 'bg-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'}"
									onclick={() => (previewSize = size.value)}
									aria-pressed={previewSize === size.value}
								>
									{size.label} · {size.value}px
								</button>
							{/each}
						</div>
					</fieldset>

					<fieldset>
						<legend class="mb-2 text-sm font-medium text-slate-300">表情</legend>
						<div class="flex flex-wrap gap-2">
							{#each emotes as emote}
								<button
									type="button"
									class="rounded-md px-3 py-2 text-sm transition-colors {selectedEmote ===
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
					</fieldset>
				</div>
			{:else}
				<div class="flex flex-1 flex-col items-center justify-center text-center text-slate-400">
					<div class="mb-3 h-16 w-16 rounded-full border-2 border-dashed border-slate-500"></div>
					<p class="text-sm">选择皮肤图片后在此预览</p>
				</div>
			{/if}
		</div>
	</div>
</section>
