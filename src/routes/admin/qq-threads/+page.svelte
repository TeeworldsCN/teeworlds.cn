<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import QQRichTextEditor from '$lib/components/QQRichTextEditor.svelte';
	import type { QQChannel, QQRichText } from '$lib/types/qq';
	import { QQRichTextType, QQRichTextAlignment } from '$lib/types/qq';

	const { data } = $props();

	let selectedGuildId = $state('');
	let selectedChannelId = $state('');
	let threadTitle = $state('');
	let threadContent = $state<QQRichText>({
		paragraphs: [
			{
				elems: [
					{
						type: QQRichTextType.Text,
						text: { text: '' }
					}
				],
				props: { alignment: QQRichTextAlignment.Left }
			}
		]
	});
	let isPublishing = $state(false);
	let publishResult = $state<{ success: boolean; message: string } | null>(null);

	const selectedGuild = $derived(() =>
		data.guilds.find((guild: any) => guild.id === selectedGuildId)
	);

	const availableChannels = $derived((): QQChannel[] => selectedGuild()?.channels || []);

	const hasContent = $derived(() => {
		return threadContent.paragraphs.some((paragraph) =>
			paragraph.elems.some((elem) => {
				if (elem.type === QQRichTextType.Text) {
					return elem.text.text.trim().length > 0;
				}
				return true; // Images, videos, and URLs count as content
			})
		);
	});

	const canPublish = $derived(
		() => selectedChannelId && threadTitle.trim() && hasContent() && !isPublishing
	);

	async function publishThread() {
		if (!canPublish) return;

		isPublishing = true;
		publishResult = null;

		try {
			const response = await fetch('/admin/qq-threads', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					channelId: selectedChannelId,
					title: threadTitle.trim(),
					richText: threadContent
				})
			});

			if (response.ok) {
				const result = await response.json();
				publishResult = { success: true, message: result.message || '帖子发布成功！' };
				// Clear form after successful publish
				threadTitle = '';
				threadContent = {
					paragraphs: [
						{
							elems: [
								{
									type: QQRichTextType.Text,
									text: { text: '' }
								}
							],
							props: { alignment: QQRichTextAlignment.Left }
						}
					]
				};
			} else {
				const error = await response.text();
				publishResult = { success: false, message: `发布失败: ${error}` };
			}
		} catch (err) {
			publishResult = { success: false, message: `发布失败: ${err}` };
		} finally {
			isPublishing = false;
		}
	}

	function resetForm() {
		selectedGuildId = '';
		selectedChannelId = '';
		threadTitle = '';
		threadContent = {
			paragraphs: [
				{
					elems: [
						{
							type: QQRichTextType.Text,
							text: { text: '' }
						}
					],
					props: { alignment: QQRichTextAlignment.Left }
				}
			]
		};
		publishResult = null;
	}
</script>

<svelte:head>
	<title>QQ 机器人发帖 - TeeworldsCN Admin</title>
	<meta name="description" content="使用机器人在 QQ 频道发布帖子" />
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ href: '/admin', text: '管理工具', title: '管理工具' },
		{ text: 'QQ 机器人发帖', title: 'QQ 机器人发帖' }
	]}
/>

<div class="space-y-6">
	<div class="rounded-lg bg-slate-800 p-6">
		<h2 class="mb-4 text-lg font-semibold text-slate-200">QQ 机器人发帖</h2>

		{#if publishResult}
			<div
				class="mb-4 rounded-md p-4 {publishResult.success
					? 'bg-green-900/50 text-green-200'
					: 'bg-red-900/50 text-red-200'}"
			>
				{publishResult.message}
			</div>
		{/if}

		<div class="space-y-4">
			<!-- Guild Selection -->
			<div>
				<label for="guild-select" class="mb-2 block text-sm font-medium text-slate-300">
					选择服务器
				</label>
				<select
					id="guild-select"
					bind:value={selectedGuildId}
					onchange={() => {
						selectedChannelId = '';
					}}
					class="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				>
					<option value="">请选择服务器</option>
					{#each data.guilds as guild}
						<option value={guild.id}>{guild.name}</option>
					{/each}
				</select>
			</div>

			<!-- Channel Selection -->
			<div>
				<label for="channel-select" class="mb-2 block text-sm font-medium text-slate-300">
					选择频道
				</label>
				<select
					id="channel-select"
					bind:value={selectedChannelId}
					disabled={!selectedGuildId}
					class="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
				>
					<option value="">请选择频道</option>
					{#each availableChannels() as channel}
						<option value={channel.id}>{channel.name}</option>
					{/each}
				</select>
			</div>

			<!-- Thread Title -->
			<div>
				<label for="thread-title" class="mb-2 block text-sm font-medium text-slate-300">
					帖子标题
				</label>
				<input
					id="thread-title"
					type="text"
					bind:value={threadTitle}
					placeholder="输入帖子标题..."
					maxlength="100"
					class="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-slate-200 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				/>
				<div class="mt-1 text-xs text-slate-400">
					{threadTitle.length}/100 字符
				</div>
			</div>

			<!-- Thread Content -->
			<div>
				<QQRichTextEditor
					value={threadContent}
					onchange={(newValue: QQRichText) => (threadContent = newValue)}
					maxLength={5000}
				/>
			</div>

			<!-- Action Buttons -->
			<div class="flex gap-3">
				<button
					onclick={publishThread}
					disabled={!canPublish}
					class="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{isPublishing ? '发布中...' : '发布帖子'}
				</button>

				<button
					onclick={resetForm}
					class="rounded-md border border-slate-600 px-4 py-2 text-slate-300 hover:bg-slate-700"
				>
					重置表单
				</button>
			</div>
		</div>
	</div>

	<!-- Preview Section -->
	{#if threadTitle.trim() || hasContent()}
		<div class="rounded-lg bg-slate-800 p-6">
			<h3 class="mb-4 text-lg font-semibold text-slate-200">预览</h3>
			<div class="rounded-md bg-slate-900 p-4">
				{#if threadTitle.trim()}
					<h4 class="mb-2 text-lg font-medium text-slate-200">{threadTitle}</h4>
				{/if}
				{#if hasContent()}
					<div class="space-y-3">
						{#each threadContent.paragraphs as paragraph}
							<div
								class="paragraph {paragraph.props?.alignment === 1
									? 'text-center'
									: paragraph.props?.alignment === 2
										? 'text-right'
										: 'text-left'}"
							>
								{#each paragraph.elems as elem}
									{#if elem.type === QQRichTextType.Text}
										<span
											class="text-slate-300"
											style="font-weight: {elem.text.props?.font_bold
												? 'bold'
												: 'normal'}; font-style: {elem.text.props?.italic
												? 'italic'
												: 'normal'}; text-decoration: {elem.text.props?.underline
												? 'underline'
												: 'none'};"
										>
											{elem.text.text}
										</span>
									{:else if elem.type === QQRichTextType.Image}
										<div class="my-2">
											<img
												src={elem.image.third_url}
												alt="图片"
												class="max-w-full rounded"
												style="width: {elem.image.width_percent}%;"
											/>
										</div>
									{:else if elem.type === QQRichTextType.Video}
										<div class="my-2">
											<video src={elem.video.third_url} controls class="max-w-full rounded">
												<track kind="captions" />
												您的浏览器不支持视频播放
											</video>
										</div>
									{:else if elem.type === QQRichTextType.Url}
										<a
											href={elem.url.url}
											target="_blank"
											rel="noopener noreferrer"
											class="text-blue-400 underline hover:text-blue-300"
										>
											{elem.url.desc}
										</a>
									{/if}
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
