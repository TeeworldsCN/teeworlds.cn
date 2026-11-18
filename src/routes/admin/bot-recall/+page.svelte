<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import type { RecallKeyword } from '$lib/server/db/recall';

	const { data } = $props();

	let newKeyword = $state('');
	let editingKeyword: RecallKeyword | null = $state(null);
	let editKeyword = $state('');
	let loading = $state(false);
	let error = $state('');

	const sendOp = async (body: any) => {
		loading = true;
		error = '';
		try {
			const response = await fetch('/admin/api/bot-recall', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				throw new Error((await response.text()) || 'Request failed');
			}

			return await response.json();
		} catch (err) {
			error = err instanceof Error ? err.message : '未知错误';
			throw err;
		} finally {
			loading = false;
		}
	};

	const toggleAutoRecall = async (enabled: boolean) => {
		try {
			await sendOp({ op: 'toggle', enabled });
			await invalidateAll();
		} catch {
			// error is set in sendOp
		}
	};

	const addKeyword = async () => {
		if (!newKeyword.trim()) {
			error = '关键词不能为空';
			return;
		}

		try {
			await sendOp({ op: 'create', keyword: newKeyword.trim() });
			newKeyword = '';
			await invalidateAll();
		} catch {
			// error is set in sendOp
		}
	};

	const startEdit = (keyword: RecallKeyword) => {
		editingKeyword = keyword;
		editKeyword = keyword.keyword;
		error = '';
	};

	const cancelEdit = () => {
		editingKeyword = null;
		editKeyword = '';
	};

	const saveEdit = async () => {
		if (!editingKeyword) return;
		if (!editKeyword.trim()) {
			error = '关键词不能为空';
			return;
		}

		try {
			await sendOp({ op: 'update', uuid: editingKeyword.uuid, keyword: editKeyword.trim() });
			cancelEdit();
			await invalidateAll();
		} catch {
			// error is set in sendOp
		}
	};

	const toggleKeyword = async (keyword: RecallKeyword) => {
		try {
			await sendOp({ op: 'update', uuid: keyword.uuid, enabled: keyword.enabled === 0 });
			await invalidateAll();
		} catch {
			// error is set in sendOp
		}
	};

	const deleteKeyword = async (keyword: RecallKeyword) => {
		if (!confirm(`确定删除关键词「${keyword.keyword}」？`)) return;

		try {
			await sendOp({ op: 'delete', uuid: keyword.uuid });
			await invalidateAll();
		} catch {
			// error is set in sendOp
		}
	};

	const clearLogs = async () => {
		if (!confirm('确定清空撤回记录？')) return;

		try {
			await sendOp({ op: 'clear-logs' });
			await invalidateAll();
		} catch {
			// error is set in sendOp
		}
	};

	const shortOpenid = (openid: string) => (openid.length > 10 ? openid.slice(0, 8) + '…' : openid);
	const formatTime = (time: number) => new Date(time).toLocaleString('zh-CN');
</script>

<svelte:head>
	<title>QQ 群自动撤回 - TeeworldsCN Admin</title>
	<meta name="description" content="QQ 群关键词自动撤回管理" />
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ href: '/admin', text: '管理工具', title: '管理工具' },
		{ text: 'QQ 群自动撤回', title: 'QQ 群自动撤回管理' }
	]}
/>

<div class="mx-auto mt-6 max-w-5xl space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold">QQ 群自动撤回</h1>
			<p class="mt-1 text-sm text-zinc-400">
				群友发言命中关键词时，机器人立即调用 QQ 接口撤回该消息。
			</p>
		</div>
		<label
			class="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2"
		>
			<input
				type="checkbox"
				class="h-5 w-5 accent-green-600"
				checked={data.enabled}
				disabled={loading}
				onchange={(e) => toggleAutoRecall(e.currentTarget.checked)}
			/>
			<span class="font-medium">{data.enabled ? '已启用' : '已停用'}</span>
		</label>
	</div>

	{#if error}
		<div class="rounded-md border border-red-800 bg-red-900/20 p-4 text-red-300">
			{error}
		</div>
	{/if}

	<!-- Add keyword -->
	<div class="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
		<h2 class="mb-4 text-lg font-semibold text-zinc-100">添加关键词</h2>
		<form
			class="flex flex-wrap gap-3"
			onsubmit={(e) => {
				e.preventDefault();
				addKeyword();
			}}
		>
			<input
				type="text"
				bind:value={newKeyword}
				placeholder="输入关键词，例如：代刷广告"
				maxlength="64"
				class="min-w-0 flex-1 rounded-md border border-zinc-600 bg-zinc-700 px-3 py-2 text-zinc-100 placeholder-zinc-400 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
			/>
			<button
				type="submit"
				disabled={loading}
				class="rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
			>
				添加
			</button>
		</form>
		<p class="mt-3 text-xs text-zinc-500">
			匹配规则：忽略大小写、全角半角、空格和零宽字符，只要消息包含关键词就会被撤回。多个关键词按添加顺序匹配。
		</p>
	</div>

	<!-- Keywords -->
	<div class="space-y-4">
		<h2 class="text-lg font-semibold">关键词（{data.keywords.length}）</h2>

		{#if data.keywords.length === 0}
			<div class="rounded-lg border border-zinc-700 bg-zinc-800 p-8 text-center text-zinc-400">
				还没有关键词。添加之前不会撤回任何消息。
			</div>
		{:else}
			{#each data.keywords as keyword (keyword.uuid)}
				<div class="rounded-lg border border-zinc-700 bg-zinc-800 p-4">
					{#if editingKeyword?.uuid === keyword.uuid}
						<form
							class="flex flex-wrap items-center gap-3"
							onsubmit={(e) => {
								e.preventDefault();
								saveEdit();
							}}
						>
							<input
								type="text"
								bind:value={editKeyword}
								maxlength="64"
								class="min-w-0 flex-1 rounded-md border border-zinc-600 bg-zinc-700 px-3 py-2 text-zinc-100 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
							/>
							<button
								type="submit"
								disabled={loading}
								class="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
							>
								保存
							</button>
							<button
								type="button"
								onclick={cancelEdit}
								disabled={loading}
								class="rounded-md bg-zinc-600 px-4 py-2 text-white hover:bg-zinc-700 disabled:opacity-50"
							>
								取消
							</button>
						</form>
					{:else}
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div class="flex items-center gap-3">
								<input
									type="checkbox"
									class="h-4 w-4 accent-green-600"
									checked={keyword.enabled !== 0}
									disabled={loading}
									onchange={() => toggleKeyword(keyword)}
									title="启用 / 停用该关键词"
								/>
								<span
									class="font-mono text-lg"
									class:text-blue-400={keyword.enabled !== 0}
									class:text-zinc-500={keyword.enabled === 0}
								>
									{keyword.keyword}
								</span>
								{#if keyword.enabled === 0}
									<span class="rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-400">已停用</span>
								{/if}
							</div>
							<div class="flex gap-2">
								<button
									onclick={() => startEdit(keyword)}
									disabled={loading}
									class="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
								>
									编辑
								</button>
								<button
									onclick={() => deleteKeyword(keyword)}
									disabled={loading}
									class="rounded-md bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
								>
									删除
								</button>
							</div>
						</div>
						<div class="mt-2 text-xs text-zinc-500">
							添加时间: {formatTime(keyword.created_at)}
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>

	<!-- Recent recalls -->
	<div class="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-semibold text-zinc-100">最近撤回记录</h2>
			<button
				onclick={clearLogs}
				disabled={loading || data.logs.length === 0}
				class="rounded-md bg-zinc-600 px-3 py-1 text-sm text-white hover:bg-zinc-700 disabled:opacity-50"
			>
				清空记录
			</button>
		</div>

		{#if data.logs.length === 0}
			<div class="py-6 text-center text-zinc-400">暂无撤回记录</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead class="border-b border-zinc-700 text-xs text-zinc-400">
						<tr>
							<th class="py-2 pr-4 font-medium">时间</th>
							<th class="py-2 pr-4 font-medium">结果</th>
							<th class="py-2 pr-4 font-medium">关键词</th>
							<th class="py-2 pr-4 font-medium">消息内容</th>
							<th class="py-2 pr-4 font-medium">群</th>
							<th class="py-2 font-medium">用户</th>
						</tr>
					</thead>
					<tbody>
						{#each data.logs as log (log.id)}
							<tr class="border-b border-zinc-700/50 align-top">
								<td class="py-2 pr-4 whitespace-nowrap text-zinc-400"
									>{formatTime(log.created_at)}</td
								>
								<td class="py-2 pr-4 whitespace-nowrap">
									{#if log.success !== 0}
										<span class="rounded bg-green-900/40 px-2 py-0.5 text-green-300">已撤回</span>
									{:else}
										<span
											class="rounded bg-red-900/40 px-2 py-0.5 text-red-300"
											title={log.error ?? ''}>失败</span
										>
									{/if}
								</td>
								<td class="py-2 pr-4 font-mono text-blue-400">{log.keyword}</td>
								<td class="max-w-xs py-2 pr-4 break-all text-zinc-300">
									{log.content || '（无文本内容）'}
									{#if log.success === 0 && log.error}
										<div class="mt-1 text-xs text-red-400">{log.error}</div>
									{/if}
								</td>
								<td class="py-2 pr-4 font-mono text-xs text-zinc-500" title={log.group_openid}>
									{shortOpenid(log.group_openid)}
								</td>
								<td class="py-2 text-xs text-zinc-500" title={log.user_openid}>
									{#if log.user_name}
										<div class="text-zinc-300">{log.user_name}</div>
										<div class="font-mono">{shortOpenid(log.user_openid)}</div>
									{:else}
										<span class="font-mono">{shortOpenid(log.user_openid)}</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<!-- Notes -->
	<div class="rounded-lg border border-amber-800/60 bg-amber-900/10 p-6 text-sm text-amber-200">
		<h2 class="mb-2 font-semibold">使用前提</h2>
		<ul class="list-inside list-disc space-y-1">
			<li>
				机器人必须是群管理员，否则只能撤回机器人自己发送的消息（QQ 会返回 40062003 无操作权限）。
			</li>
			<li>消息发出超过 2 分钟后无法撤回，命中后会尽量立刻调用撤回接口。</li>
			<li>群管理员需要在机器人资料页开启「接收所有消息」，否则机器人只能看到 @ 它的消息。</li>
			<li>
				撤回接口频率限制为 10 QPS，短时间大量刷屏时可能部分撤回失败，失败原因会显示在上面的记录里。
			</li>
		</ul>
	</div>
</div>
