<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { goto } from '$app/navigation';
	import Fa from 'svelte-fa';
	import {
		faUpload,
		faTrash,
		faImage,
		faVideo,
		faMusic,
		faNewspaper,
		faEye,
		faClipboard,
		faCheck
	} from '@fortawesome/free-solid-svg-icons';
	import { tippy } from '$lib/tippy';
	import {
		type WeChatMaterialItem,
		type WeChatMaterialNewsItem
	} from '$lib/server/bots/protocol/wechat.js';

	const { data } = $props();

	// State variables
	let error = $state('');
	let success = $state('');
	let loading = $state(false);
	let uploadType = $state<'image' | 'voice' | 'video' | 'thumb'>('image');
	let showUploadModal = $state(false);
	let mediaFile = $state<File | null>(null);
	let videoTitle = $state('');
	let videoIntroduction = $state('');
	let previewItem = $state<any | null>(null);
	let showPreviewModal = $state(false);
	let copiedMediaId = $state<string | null>(null);

	let totalCount = $derived((data.counts as any)[data.type + '_count']);

	// Handle file selection
	function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			mediaFile = input.files[0];
		}
	}

	// Upload material
	async function uploadMaterial() {
		if (!mediaFile) {
			error = '请选择文件';
			return;
		}

		loading = true;
		error = '';
		success = '';

		try {
			const formData = new FormData();
			formData.append('type', uploadType);
			formData.append('media', mediaFile);

			if (uploadType === 'video') {
				if (!videoTitle || !videoIntroduction) {
					error = '视频需要标题和描述';
					loading = false;
					return;
				}
				formData.append('title', videoTitle);
				formData.append('introduction', videoIntroduction);
			}

			const response = await fetch('/admin/wechat-materials', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || '上传素材失败');
			}

			await response.json(); // We don't need the result, just check for success
			success = '素材上传成功';
			showUploadModal = false;

			// Reset form
			mediaFile = null;
			videoTitle = '';
			videoIntroduction = '';

			// Refresh the page to show the new material
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : '上传素材失败';
		} finally {
			loading = false;
		}
	}

	// Delete material
	async function deleteMaterial(mediaId: string) {
		if (!confirm('确定要删除这个素材吗？此操作不可恢复。')) {
			return;
		}

		loading = true;
		error = '';
		success = '';

		try {
			const response = await fetch('/admin/wechat-materials', {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ media_id: mediaId })
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || '删除素材失败');
			}

			success = '素材删除成功';

			// Refresh the page
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : '删除素材失败';
		} finally {
			loading = false;
		}
	}

	// Preview material
	async function previewMaterial(mediaId: string) {
		loading = true;
		error = '';
		try {
			if (data.type === 'news') {
				const item = data.materials.item.find((m) => m.media_id === mediaId);
				if (item && item.content) {
					previewItem = {
						type: 'news',
						content: item.content
					};
				}
			} else {
				throw new Error('Unsupported material type');
			}
			showPreviewModal = true;
		} catch (err) {
			error = err instanceof Error ? err.message : '预览素材失败';
		} finally {
			loading = false;
		}
	}

	// Copy media ID to clipboard
	function copyMediaId(mediaId: string) {
		navigator.clipboard.writeText(mediaId).then(() => {
			copiedMediaId = mediaId;
			setTimeout(() => {
				copiedMediaId = null;
			}, 2000);
		});
	}

	// Change material type
	function changeType(type: 'image' | 'video' | 'voice' | 'news') {
		goto(`/admin/wechat-materials?type=${type}`);
	}

	// Pagination
	function goToPage(offset: number) {
		goto(`/admin/wechat-materials?type=${data.type}&offset=${offset}`);
	}

	// Process images in preview modal when it's shown
	$effect(() => {
		if (showPreviewModal && previewItem && previewItem.type === 'news') {
			// Use setTimeout to ensure the DOM is updated with the content
			setTimeout(() => {
				const previewContainer = document.querySelector('.preview-modal-content');
				if (previewContainer) {
					const images = previewContainer.querySelectorAll('img[data-src]');
					images.forEach((img) => {
						const dataSrc = img.getAttribute('data-src');
						if (dataSrc) {
							// Set src attribute using the proxy endpoint
							img.setAttribute(
								'src',
								`/admin/wechat-materials?target=${encodeURIComponent(dataSrc)}`
							);

							// Copy other data attributes to appropriate HTML attributes
							const dataRatio = img.getAttribute('data-ratio');
							const dataWidth = img.getAttribute('data-w');

							if (dataRatio) {
								// Set aspect ratio if available
								const ratio = parseFloat(dataRatio);
								if (!isNaN(ratio)) {
									(img as HTMLImageElement).style.aspectRatio = `1 / ${ratio}`;
								}
							}

							if (dataWidth) {
								// Set max-width if available
								const width = parseInt(dataWidth);
								if (!isNaN(width)) {
									(img as HTMLImageElement).style.width = `${width}px`;
								}
							}

							// Add loading="lazy" for better performance
							img.setAttribute('loading', 'lazy');
						}
					});
				}
			}, 100); // Small delay to ensure content is rendered
		}
	});

	// Clean up object URLs when preview modal is closed
	$effect(() => {
		if (!showPreviewModal && previewItem) {
			if ((previewItem.type === 'video' || previewItem.type === 'audio') && previewItem.url) {
				URL.revokeObjectURL(previewItem.url);
			}
			previewItem = null;
		}
	});
</script>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ href: '/admin', text: '管理工具', title: '管理工具' },
		{ text: '微信素材管理', title: '微信素材管理' }
	]}
/>

<div class="mx-auto mt-5 max-w-6xl">
	<h1 class="text-center text-2xl font-bold text-slate-300">微信素材管理</h1>

	{#if error}
		<div class="mt-4 rounded-md bg-red-900 p-3 text-white">
			<p>{error}</p>
		</div>
	{/if}

	{#if success}
		<div class="mt-4 rounded-md bg-green-900 p-3 text-white">
			<p>{success}</p>
		</div>
	{/if}

	<!-- Material counts -->
	<div class="mt-6 grid grid-cols-4 gap-4">
		<button
			class={`cursor-pointer rounded-md p-4 text-center ${data.type === 'image' ? 'bg-sky-800 text-white' : 'bg-zinc-800 text-slate-300 hover:bg-zinc-700'}`}
			onclick={() => changeType('image')}
			type="button"
		>
			<div class="flex items-center justify-center">
				<Fa icon={faImage} class="mr-2" />
				<span>图片</span>
			</div>
			<div class="mt-2 text-2xl font-bold">{data.counts.image_count}</div>
		</button>
		<button
			class={`cursor-pointer rounded-md p-4 text-center ${data.type === 'video' ? 'bg-sky-800 text-white' : 'bg-zinc-800 text-slate-300 hover:bg-zinc-700'}`}
			onclick={() => changeType('video')}
			type="button"
		>
			<div class="flex items-center justify-center">
				<Fa icon={faVideo} class="mr-2" />
				<span>视频</span>
			</div>
			<div class="mt-2 text-2xl font-bold">{data.counts.video_count}</div>
		</button>
		<button
			class={`cursor-pointer rounded-md p-4 text-center ${data.type === 'voice' ? 'bg-sky-800 text-white' : 'bg-zinc-800 text-slate-300 hover:bg-zinc-700'}`}
			onclick={() => changeType('voice')}
			type="button"
		>
			<div class="flex items-center justify-center">
				<Fa icon={faMusic} class="mr-2" />
				<span>语音</span>
			</div>
			<div class="mt-2 text-2xl font-bold">{data.counts.voice_count}</div>
		</button>
		<button
			class={`cursor-pointer rounded-md p-4 text-center ${data.type === 'news' ? 'bg-sky-800 text-white' : 'bg-zinc-800 text-slate-300 hover:bg-zinc-700'}`}
			onclick={() => changeType('news')}
			type="button"
		>
			<div class="flex items-center justify-center">
				<Fa icon={faNewspaper} class="mr-2" />
				<span>图文</span>
			</div>
			<div class="mt-2 text-2xl font-bold">{data.counts.news_count}</div>
		</button>
	</div>

	<!-- Upload button -->
	<div class="mt-6 flex justify-between">
		<div>
			<button
				class="rounded bg-green-800 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
				onclick={() => {
					showUploadModal = true;
				}}
				disabled={loading}
			>
				<Fa icon={faUpload} class="mr-2 inline-block" />
				上传素材
			</button>
		</div>

		<!-- Pagination -->
		<div class="flex items-center space-x-2">
			{#if data.offset > 0}
				<button
					class="rounded bg-zinc-800 px-3 py-1 text-white hover:bg-zinc-700"
					onclick={() => goToPage(Math.max(0, data.offset - 20))}
					disabled={loading}
				>
					上一页
				</button>
			{/if}

			<span class="text-slate-300">
				{data.offset + 1}-{Math.min(data.offset + 20, totalCount)} / {totalCount}
			</span>

			{#if data.offset + 20 < totalCount}
				<button
					class="rounded bg-zinc-800 px-3 py-1 text-white hover:bg-zinc-700"
					onclick={() => goToPage(data.offset + 20)}
					disabled={loading}
				>
					下一页
				</button>
			{/if}
		</div>
	</div>

	<!-- Materials list -->
	<div class="mt-6">
		{#if data.materials.item.length === 0}
			<div class="rounded-md bg-zinc-800 p-6 text-center text-slate-300">没有找到素材</div>
		{:else}
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each data.materials.item as item}
					<div class="rounded-md bg-zinc-800 p-4">
						<!-- Image preview -->
						{#if data.type === 'image'}
							{@const data = item as WeChatMaterialItem}
							<div class="mb-3 aspect-video overflow-hidden rounded bg-zinc-900">
								<img
									src={`/admin/wechat-materials?target=${encodeURIComponent(data.url)}`}
									alt={data.name || '图片'}
									class="h-full w-full object-contain"
									loading="lazy"
								/>
							</div>
							<div class="mb-2 text-sm text-slate-400">
								<div class="truncate">{data.name}</div>
							</div>
						{:else if data.type === 'video'}
							{@const data = item as WeChatMaterialItem}
							<div
								class="mb-3 flex aspect-video items-center justify-center rounded bg-zinc-900 text-slate-500"
							>
								<Fa icon={faVideo} size="3x" />
							</div>
							<div class="mb-2 text-sm text-slate-400">
								<div class="truncate">{data.name}</div>
							</div>
						{:else if data.type === 'voice'}
							{@const data = item as WeChatMaterialItem}
							<div
								class="mb-3 flex aspect-video items-center justify-center rounded bg-zinc-900 text-slate-500"
							>
								<Fa icon={faMusic} size="3x" />
							</div>
							<div class="mb-2 text-sm text-slate-400">
								<div class="truncate">{data.name}</div>
							</div>
						{:else if data.type === 'news'}
							{@const data = item as WeChatMaterialNewsItem}
							<div
								class="mb-3 flex aspect-video items-center justify-center rounded bg-white text-gray-500"
							>
								{#if data.content.news_item[0]}
									<div class="h-full w-full overflow-hidden">
										<div class="p-3">
											<h3 class="text-lg font-bold text-gray-800">
												{data.content.news_item[0].title}
											</h3>
											{#if data.content.news_item[0].digest}
												<p class="mt-1 text-sm text-gray-600">
													{data.content.news_item[0].digest}
												</p>
											{/if}
										</div>
									</div>
								{:else}
									<Fa icon={faNewspaper} size="3x" />
								{/if}
							</div>
						{/if}

						<!-- Material info -->
						<div class="mb-2 text-sm text-slate-400">
							<div class="mt-1">
								更新时间: {new Date(item.update_time * 1000).toLocaleString()}
							</div>
						</div>

						<!-- Actions -->
						<div class="mt-3 flex justify-between">
							<div>
								{#if data.type === 'news'}
									<button
										use:tippy={{ content: '预览' }}
										class="mr-2 rounded bg-sky-800 p-2 text-white hover:bg-sky-700"
										onclick={() => previewMaterial(item.media_id)}
										disabled={loading}
									>
										<Fa icon={faEye} />
									</button>
								{/if}
								<button
									use:tippy={{
										content: copiedMediaId === item.media_id ? '已复制' : '复制 media_id'
									}}
									class="rounded bg-zinc-700 p-2 text-white hover:bg-zinc-600"
									onclick={() => copyMediaId(item.media_id)}
								>
									<Fa icon={copiedMediaId === item.media_id ? faCheck : faClipboard} />
								</button>
							</div>
							<button
								use:tippy={{ content: '删除' }}
								class="rounded bg-red-800 p-2 text-white hover:bg-red-700"
								onclick={() => deleteMaterial(item.media_id)}
								disabled={loading}
							>
								<Fa icon={faTrash} />
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Upload Modal -->
<Modal
	bind:show={showUploadModal}
	header={() => {
		return `<div class="rounded-t-lg bg-zinc-800 p-4">
			<h2 class="text-xl font-bold text-white">上传素材</h2>
		</div>`;
	}}
>
	<div class="w-[500px] rounded-b-lg bg-zinc-800 p-4">
		<div class="mb-4">
			<label for="material-type" class="mb-2 block text-sm font-medium text-slate-300"
				>素材类型</label
			>
			<select
				id="material-type"
				bind:value={uploadType}
				class="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
			>
				<option value="image">图片</option>
				<option value="voice">语音</option>
				<option value="video">视频</option>
				<option value="thumb">缩略图</option>
			</select>
			<p class="mt-1 text-xs text-slate-400">
				{#if uploadType === 'image'}
					图片: 10M以内，支持bmp/png/jpeg/jpg/gif格式
				{:else if uploadType === 'voice'}
					语音: 2M以内，播放长度不超过60s，mp3/wma/wav/amr格式
				{:else if uploadType === 'video'}
					视频: 10M以内，支持MP4格式
				{:else if uploadType === 'thumb'}
					缩略图: 64KB以内，支持JPG格式
				{/if}
			</p>
		</div>

		<div class="mb-4">
			<label for="file-upload" class="mb-2 block text-sm font-medium text-slate-300">选择文件</label
			>
			<input
				id="file-upload"
				type="file"
				class="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
				onchange={handleFileChange}
				accept={uploadType === 'image'
					? 'image/jpeg,image/png,image/gif,image/bmp'
					: uploadType === 'voice'
						? 'audio/mp3,audio/wma,audio/wav,audio/amr'
						: uploadType === 'video'
							? 'video/mp4'
							: uploadType === 'thumb'
								? 'image/jpeg'
								: ''}
			/>
		</div>

		{#if uploadType === 'video'}
			<div class="mb-4">
				<label for="video-title" class="mb-2 block text-sm font-medium text-slate-300"
					>视频标题</label
				>
				<input
					id="video-title"
					type="text"
					bind:value={videoTitle}
					class="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
					placeholder="请输入视频标题"
				/>
			</div>

			<div class="mb-4">
				<label for="video-description" class="mb-2 block text-sm font-medium text-slate-300"
					>视频描述</label
				>
				<textarea
					id="video-description"
					bind:value={videoIntroduction}
					class="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
					placeholder="请输入视频描述"
					rows="3"
				></textarea>
			</div>
		{/if}

		<div class="mt-6 flex justify-end space-x-3">
			<button
				class="rounded bg-green-800 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
				onclick={uploadMaterial}
				disabled={loading || !mediaFile}
			>
				{loading ? '上传中...' : '上传'}
			</button>
		</div>
	</div>
</Modal>

<!-- Preview Modal -->
<Modal
	bind:show={showPreviewModal}
	header={() => {
		return `<div class="rounded-t-lg bg-zinc-800 p-4">
			<h2 class="text-xl font-bold text-white">素材预览</h2>
		</div>`;
	}}
>
	<div class="w-[800px] max-w-full rounded-b-lg bg-zinc-800 p-4">
		{#if previewItem}
			{#if previewItem.type === 'news' && previewItem.content?.news_item}
				<div class="preview-modal-content max-h-[calc(100svh-20rem)] overflow-y-auto rounded-md bg-white">
					{#each previewItem.content.news_item as article}
						<div class="mb-6 border-b border-gray-200 px-6 pb-6 pt-6 last:border-0 last:pb-0">
							<h3 class="mb-2 text-xl font-bold text-gray-800">{article.title}</h3>
							{#if article.author}
								<div class="mb-2 text-sm text-gray-500">作者: {article.author}</div>
							{/if}
							{#if article.digest}
								<div class="mb-4 text-gray-600">{article.digest}</div>
							{/if}
							<div class="prose max-w-none">
								{@html article.content}
							</div>
							{#if article.content_source_url}
								<div class="mt-4">
									<a
										href={article.content_source_url}
										target="_blank"
										rel="noopener noreferrer"
										class="text-blue-600 hover:underline"
									>
										阅读原文
									</a>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		{:else}
			<div class="p-8 text-center text-slate-300">加载中...</div>
		{/if}

		<div class="mt-6 flex justify-end">
			<button
				class="rounded bg-zinc-700 px-4 py-2 text-white hover:bg-zinc-600"
				onclick={() => {
					showPreviewModal = false;
				}}
			>
				关闭
			</button>
		</div>
	</div>
</Modal>
