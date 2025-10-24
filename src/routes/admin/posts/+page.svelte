<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import type { Post } from '$lib/server/db/posts';
	import { invalidateAll } from '$app/navigation';
	import Fa from 'svelte-fa';
	import { faPlus, faEdit, faTrash, faEye } from '@fortawesome/free-solid-svg-icons';

	const { data } = $props();

	let posts = $state<Post[]>(data.posts);
	let showForm = $state(false);
	let editingPost = $state<Post | null>(null);
	let loading = $state(false);
	let error = $state('');

	// Form fields
	let postKey = $state('');
	let postTitle = $state('');
	let postContent = $state('');

	const resetForm = () => {
		postKey = '';
		postTitle = '';
		postContent = '';
		editingPost = null;
		showForm = false;
		error = '';
	};

	const startNewPost = () => {
		resetForm();
		showForm = true;
	};

	const editPost = (post: Post) => {
		editingPost = post;
		postKey = post.key;
		postTitle = post.title;
		postContent = post.content;
		showForm = true;
		error = '';
	};

	const savePost = async () => {
		if (!postKey.trim() || !postTitle.trim() || !postContent.trim()) {
			error = '请填写所有必填字段';
			return;
		}

		// Validate key format
		if (!/^[a-zA-Z0-9_-]+$/.test(postKey)) {
			error = '文章标识只能包含字母、数字、下划线和连字符';
			return;
		}

		loading = true;
		error = '';

		try {
			const method = editingPost ? 'PATCH' : 'POST';
			const body = editingPost 
				? { uuid: editingPost.uuid, key: postKey, title: postTitle, content: postContent }
				: { key: postKey, title: postTitle, content: postContent };

			const response = await fetch('/admin/api/posts', {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(errorText);
			}

			await invalidateAll();
			posts = data.posts;
			resetForm();
		} catch (err) {
			console.error('Failed to save post:', err);
			error = err instanceof Error ? err.message : '保存失败';
		} finally {
			loading = false;
		}
	};

	const deletePost = async (post: Post) => {
		if (!confirm(`确定要删除文章 "${post.title}" 吗？`)) {
			return;
		}

		loading = true;
		error = '';

		try {
			const response = await fetch('/admin/api/posts', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ uuid: post.uuid })
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(errorText);
			}

			await invalidateAll();
			posts = data.posts;
		} catch (err) {
			console.error('Failed to delete post:', err);
			error = err instanceof Error ? err.message : '删除失败';
		} finally {
			loading = false;
		}
	};

	const formatDate = (timestamp: number) => {
		return new Date(timestamp).toLocaleString('zh-CN');
	};
</script>

<svelte:head>
	<title>文章管理 - TeeworldsCN Admin</title>
	<meta name="description" content="管理文章" />
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ href: '/admin', text: '管理工具', title: '管理工具' },
		{ text: '文章管理', title: '文章管理' }
	]}
/>

<div class="flex items-center justify-between">
	<h1 class="text-2xl font-bold text-slate-200">文章管理</h1>
	<button
		onclick={startNewPost}
		disabled={loading}
		class="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
	>
		<Fa icon={faPlus} />
		新建文章
	</button>
</div>

{#if error}
	<div class="mt-4 rounded-md bg-red-900/50 border border-red-700 p-4 text-red-200">
		{error}
	</div>
{/if}

{#if showForm}
	<div class="mt-6 rounded-lg bg-slate-800 p-6">
		<h2 class="mb-4 text-xl font-semibold text-slate-200">
			{editingPost ? '编辑文章' : '新建文章'}
		</h2>
		
		<div class="space-y-4">
			<div>
				<label for="post-key" class="mb-2 block text-sm font-medium text-slate-300">
					文章标识 (URL 中的 key)
				</label>
				<input
					id="post-key"
					type="text"
					bind:value={postKey}
					placeholder="例如: my-first-post"
					class="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-slate-200 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				/>
				<div class="mt-1 text-xs text-slate-400">
					只能包含字母、数字、下划线和连字符。将用于 URL: /p/{postKey}
				</div>
			</div>

			<div>
				<label for="post-title" class="mb-2 block text-sm font-medium text-slate-300">
					文章标题
				</label>
				<input
					id="post-title"
					type="text"
					bind:value={postTitle}
					placeholder="输入文章标题..."
					class="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-slate-200 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				/>
			</div>

			<div>
				<label for="post-content" class="mb-2 block text-sm font-medium text-slate-300">
					文章内容 (Markdown)
				</label>
				<textarea
					id="post-content"
					bind:value={postContent}
					placeholder="使用 Markdown 格式编写文章内容..."
					rows="15"
					class="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-slate-200 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-sm"
				></textarea>
			</div>

			<div class="flex gap-3">
				<button
					onclick={savePost}
					disabled={loading}
					class="rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
				>
					{loading ? '保存中...' : '保存'}
				</button>
				<button
					onclick={resetForm}
					disabled={loading}
					class="rounded-md bg-slate-600 px-4 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
				>
					取消
				</button>
			</div>
		</div>
	</div>
{/if}

<div class="mt-6">
	<h2 class="mb-4 text-xl font-semibold text-slate-200">现有文章</h2>
	
	{#if posts.length === 0}
		<div class="rounded-lg bg-slate-800 p-8 text-center text-slate-400">
			暂无文章，点击上方按钮创建第一篇文章
		</div>
	{:else}
		<div class="space-y-4">
			{#each posts as post (post.uuid)}
				<div class="rounded-lg bg-slate-800 p-4">
					<div class="flex items-start justify-between">
						<div class="flex-1">
							<h3 class="text-lg font-semibold text-slate-200">{post.title}</h3>
							<div class="mt-1 text-sm text-slate-400">
								标识: <code class="rounded bg-slate-700 px-1">{post.key}</code>
							</div>
							<div class="mt-1 text-sm text-slate-400">
								创建时间: {formatDate(post.created_at)}
								{#if post.updated_at !== post.created_at}
									| 更新时间: {formatDate(post.updated_at)}
								{/if}
							</div>
						</div>
						<div class="flex gap-2">
							<a
								href="/p/{post.key}"
								target="_blank"
								class="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
							>
								<Fa icon={faEye} />
								预览
							</a>
							<button
								onclick={() => editPost(post)}
								disabled={loading}
								class="flex items-center gap-1 rounded-md bg-yellow-600 px-3 py-1 text-sm text-white hover:bg-yellow-700 disabled:opacity-50"
							>
								<Fa icon={faEdit} />
								编辑
							</button>
							<button
								onclick={() => deletePost(post)}
								disabled={loading}
								class="flex items-center gap-1 rounded-md bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
							>
								<Fa icon={faTrash} />
								删除
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
