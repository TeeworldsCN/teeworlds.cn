<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import type { BotReply } from '$lib/server/db/botreply';

	const { data } = $props();

	let editingReply: BotReply | null = $state(null);
	let isCreating = $state(false);
	let newKeyword = $state('');
	let newResponse = $state('');
	let editKeyword = $state('');
	let editResponse = $state('');
	let loading = $state(false);
	let error = $state('');

	const sendOp = async (body: any) => {
		loading = true;
		error = '';
		try {
			const response = await fetch('/admin/api/bot-replies', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(errorText || 'Request failed');
			}

			return await response.json();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error occurred';
			throw err;
		} finally {
			loading = false;
		}
	};

	const createReply = async () => {
		if (!newKeyword.trim() || !newResponse.trim()) {
			error = 'Both keyword and response are required';
			return;
		}

		try {
			await sendOp({
				op: 'create',
				data: {
					keyword: newKeyword.trim(),
					response: newResponse.trim()
				}
			});

			newKeyword = '';
			newResponse = '';
			isCreating = false;
			await invalidateAll();
		} catch (err) {
			// Error is already set in sendOp
		}
	};

	const updateReply = async () => {
		if (!editingReply || !editKeyword.trim() || !editResponse.trim()) {
			error = 'Both keyword and response are required';
			return;
		}

		try {
			await sendOp({
				op: 'update',
				uuid: editingReply.uuid,
				data: {
					keyword: editKeyword.trim(),
					response: editResponse.trim()
				}
			});

			editingReply = null;
			editKeyword = '';
			editResponse = '';
			await invalidateAll();
		} catch (err) {
			// Error is already set in sendOp
		}
	};

	const deleteReply = async (uuid: string) => {
		if (!confirm('Are you sure you want to delete this bot reply?')) {
			return;
		}

		try {
			await sendOp({
				op: 'delete',
				uuid
			});

			await invalidateAll();
		} catch (err) {
			// Error is already set in sendOp
		}
	};

	const startEdit = (reply: BotReply) => {
		editingReply = reply;
		editKeyword = reply.keyword;
		editResponse = reply.response;
		isCreating = false;
	};

	const cancelEdit = () => {
		editingReply = null;
		editKeyword = '';
		editResponse = '';
		isCreating = false;
		newKeyword = '';
		newResponse = '';
		error = '';
	};

	const startCreate = () => {
		isCreating = true;
		editingReply = null;
		editKeyword = '';
		editResponse = '';
		error = '';
	};
</script>

<svelte:head>
	<title>机器人关键词回复管理 - TeeworldsCN Admin</title>
	<meta name="description" content="管理机器人关键词自动回复" />
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ href: '/admin', text: '管理工具', title: '管理工具' },
		{ text: '机器人关键词回复', title: '机器人关键词回复管理' }
	]}
/>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">机器人关键词回复管理</h1>
		<button
			onclick={startCreate}
			disabled={loading || isCreating || editingReply !== null}
			class="rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
		>
			添加新回复
		</button>
	</div>

	<!-- Error Display -->
	{#if error}
		<div class="rounded-md border border-red-800 bg-red-900/20 p-4 text-red-300">
			{error}
		</div>
	{/if}

	<!-- Create Form -->
	{#if isCreating}
		<div class="rounded-lg border border-zinc-700 bg-zinc-800 p-6 shadow-sm">
			<h2 class="mb-4 text-lg font-semibold text-zinc-100">添加新的关键词回复</h2>
			<div class="space-y-4">
				<div>
					<label for="new-keyword" class="block text-sm font-medium text-zinc-300">关键词</label>
					<input
						id="new-keyword"
						type="text"
						bind:value={newKeyword}
						placeholder="输入关键词..."
						class="mt-1 block w-full rounded-md border border-zinc-600 bg-zinc-700 px-3 py-2 text-zinc-100 placeholder-zinc-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="new-response" class="block text-sm font-medium text-zinc-300">回复内容</label>
					<textarea
						id="new-response"
						bind:value={newResponse}
						placeholder="输入回复内容..."
						rows="3"
						class="mt-1 block w-full rounded-md border border-zinc-600 bg-zinc-700 px-3 py-2 text-zinc-100 placeholder-zinc-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					></textarea>
				</div>
				<div class="flex space-x-2">
					<button
						onclick={createReply}
						disabled={loading}
						class="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
					>
						{loading ? '保存中...' : '保存'}
					</button>
					<button
						onclick={cancelEdit}
						disabled={loading}
						class="rounded-md bg-zinc-600 px-4 py-2 text-white hover:bg-zinc-700 disabled:opacity-50"
					>
						取消
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Replies List -->
	<div class="space-y-4">
		{#if data.replies.length === 0}
			<div class="rounded-lg border border-zinc-700 bg-zinc-800 p-8 text-center text-zinc-400">
				暂无关键词回复配置
			</div>
		{:else}
			{#each data.replies as reply (reply.uuid)}
				<div class="rounded-lg border border-zinc-700 bg-zinc-800 p-6 shadow-sm">
					{#if editingReply?.uuid === reply.uuid}
						<!-- Edit Form -->
						<div class="space-y-4">
							<div>
								<label for="edit-keyword" class="block text-sm font-medium text-zinc-300"
									>关键词</label
								>
								<input
									id="edit-keyword"
									type="text"
									bind:value={editKeyword}
									class="mt-1 block w-full rounded-md border border-zinc-600 bg-zinc-700 px-3 py-2 text-zinc-100 placeholder-zinc-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="edit-response" class="block text-sm font-medium text-zinc-300"
									>回复内容</label
								>
								<textarea
									id="edit-response"
									bind:value={editResponse}
									rows="3"
									class="mt-1 block w-full rounded-md border border-zinc-600 bg-zinc-700 px-3 py-2 text-zinc-100 placeholder-zinc-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
								></textarea>
							</div>
							<div class="flex space-x-2">
								<button
									onclick={updateReply}
									disabled={loading}
									class="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
								>
									{loading ? '保存中...' : '保存'}
								</button>
								<button
									onclick={cancelEdit}
									disabled={loading}
									class="rounded-md bg-zinc-600 px-4 py-2 text-white hover:bg-zinc-700 disabled:opacity-50"
								>
									取消
								</button>
							</div>
						</div>
					{:else}
						<!-- Display Mode -->
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<div class="mb-2">
									<span class="text-sm font-medium text-zinc-400">关键词:</span>
									<span class="ml-2 font-mono text-blue-400">{reply.keyword}</span>
								</div>
								<div class="mb-2">
									<span class="text-sm font-medium text-zinc-400">回复:</span>
									<div
										class="ml-2 mt-1 whitespace-pre-wrap rounded bg-zinc-700 p-2 text-sm text-zinc-200"
									>
										{reply.response}
									</div>
								</div>
								<div class="text-xs text-zinc-500">
									创建时间: {new Date(reply.created_at).toLocaleString('zh-CN')}
									{#if reply.updated_at !== reply.created_at}
										| 更新时间: {new Date(reply.updated_at).toLocaleString('zh-CN')}
									{/if}
								</div>
							</div>
							<div class="ml-4 flex space-x-2">
								<button
									onclick={() => startEdit(reply)}
									disabled={loading || isCreating || editingReply !== null}
									class="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
								>
									编辑
								</button>
								<button
									onclick={() => deleteReply(reply.uuid)}
									disabled={loading || isCreating || editingReply !== null}
									class="rounded-md bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
								>
									删除
								</button>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>
