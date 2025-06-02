<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import type { User } from '$lib/server/db/users';
	import { PERMISSIONS } from '$lib/types';

	const { data } = $props();

	let searchInput = $state(data.search);
	let platformFilter = $state(data.platform);
	let userType = $state(data.userType);
	let copyNotification = $state('');
	let showUserModal = $state(false);
	let editingUser = $state<User | null>(null);
	let editingPermissions = $state<string[]>([]);
	let savingPermissions = $state(false);
	let generatingRegisterLink = $state(false);
	let generatingResetLink = $state(false);
	let renamingUser = $state(false);
	let newUsername = $state('');

	// Static list of available platforms
	const availablePlatforms = ['qq', 'wechat', 'web'];
	const handleSearch = () => {
		const params = new URLSearchParams();
		if (searchInput.trim()) {
			// When searching, only include the search term and ignore all filters
			params.set('search', searchInput.trim());
		} else {
			// When not searching, include filters
			if (platformFilter && userType === 'without-password') {
				params.set('platform', platformFilter);
			}
			params.set('type', userType);
		}
		params.set('limit', data.limit.toString());
		params.set('offset', '0');

		const url = params.toString() ? `?${params.toString()}` : '';
		goto(url, { replaceState: true });
	};

	const handlePlatformFilter = () => {
		const params = new URLSearchParams();
		if (searchInput.trim()) {
			params.set('search', searchInput.trim());
		}
		if (platformFilter && userType === 'without-password') {
			params.set('platform', platformFilter);
		}
		params.set('type', userType);
		params.set('limit', data.limit.toString());
		params.set('offset', '0');

		const url = params.toString() ? `?${params.toString()}` : '';
		goto(url, { replaceState: true });
	};

	const handleUserTypeChange = () => {
		const params = new URLSearchParams();
		if (searchInput.trim()) {
			params.set('search', searchInput.trim());
		}
		// Only include platform filter for users without password
		if (platformFilter && userType === 'without-password') {
			params.set('platform', platformFilter);
		}
		params.set('type', userType);
		params.set('limit', data.limit.toString());
		params.set('offset', '0');

		const url = params.toString() ? `?${params.toString()}` : '';
		goto(url, { replaceState: true });
	};

	const handlePreviousPage = () => {
		const newOffset = Math.max(0, data.offset - data.limit);
		const params = new URLSearchParams();
		if (data.search) {
			// When searching, only include search term
			params.set('search', data.search);
		} else {
			// When not searching, include filters
			if (data.platform && data.userType === 'without-password')
				params.set('platform', data.platform);
			params.set('type', data.userType);
		}
		params.set('limit', data.limit.toString());
		params.set('offset', newOffset.toString());
		goto(`?${params.toString()}`, { replaceState: true });
	};

	const handleNextPage = () => {
		const newOffset = data.offset + data.limit;
		const params = new URLSearchParams();
		if (data.search) {
			// When searching, only include search term
			params.set('search', data.search);
		} else {
			// When not searching, include filters
			if (data.platform && data.userType === 'without-password')
				params.set('platform', data.platform);
			params.set('type', data.userType);
		}
		params.set('limit', data.limit.toString());
		params.set('offset', newOffset.toString());
		goto(`?${params.toString()}`, { replaceState: true });
	};

	const formatPermissions = (permissions?: string[]): string => {
		if (!permissions || permissions.length === 0) {
			return '无权限';
		}
		return permissions.join(', ');
	};

	const getPermissionColor = (permissions?: string[]): string => {
		if (!permissions || permissions.length === 0) {
			return 'text-slate-400';
		}
		if (permissions.includes('SUPER')) {
			return 'text-red-400';
		}
		return 'text-green-400';
	};

	const copyToClipboard = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			copyNotification = `已复制 UUID: ${text.slice(-8)}`;
			setTimeout(() => {
				copyNotification = '';
			}, 2000);
		} catch (err) {
			console.error('Failed to copy text: ', err);
			copyNotification = '复制失败';
			setTimeout(() => {
				copyNotification = '';
			}, 2000);
		}
	};

	const startEditingUser = (user: User) => {
		editingUser = user;
		editingPermissions = [...(user.data.permissions || [])];
		newUsername = user.username;
		showUserModal = true;
	};

	const cancelEditingUser = () => {
		editingUser = null;
		editingPermissions = [];
		newUsername = '';
		showUserModal = false;
	};

	const togglePermission = (permission: string) => {
		if (editingPermissions.includes(permission)) {
			editingPermissions = editingPermissions.filter((p) => p !== permission);
		} else {
			editingPermissions = [...editingPermissions, permission];
		}
	};

	const savePermissions = async () => {
		if (savingPermissions || !editingUser) return;

		savingPermissions = true;
		try {
			const response = await fetch(`/admin/api/users/${editingUser.uuid}/permissions`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					permissions: editingPermissions
				})
			});

			if (!response.ok) {
				const error = await response.text();
				copyNotification = `保存失败: ${error}`;
				setTimeout(() => {
					copyNotification = '';
				}, 3000);
				return;
			}

			invalidateAll();
			copyNotification = '权限已保存';
			setTimeout(() => {
				copyNotification = '';
			}, 2000);

			cancelEditingUser();
		} catch (err) {
			console.error('Failed to save permissions:', err);
			copyNotification = '保存失败';
			setTimeout(() => {
				copyNotification = '';
			}, 3000);
		} finally {
			savingPermissions = false;
		}
	};

	const generateRegisterLink = async () => {
		if (generatingRegisterLink) return;

		generatingRegisterLink = true;
		try {
			const response = await fetch('/admin/api/users/register-link', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				const error = await response.text();
				copyNotification = `生成失败: ${error}`;
				setTimeout(() => {
					copyNotification = '';
				}, 3000);
				return;
			}

			const result = await response.json();
			await navigator.clipboard.writeText(result.url);
			copyNotification = '注册链接已复制到剪贴板';
			setTimeout(() => {
				copyNotification = '';
			}, 3000);
		} catch (err) {
			console.error('Failed to generate register link:', err);
			copyNotification = '生成失败';
			setTimeout(() => {
				copyNotification = '';
			}, 3000);
		} finally {
			generatingRegisterLink = false;
		}
	};

	const generateResetPasswordLink = async () => {
		if (generatingResetLink || !editingUser) return;

		generatingResetLink = true;
		try {
			const response = await fetch(`/admin/api/users/${editingUser.uuid}/reset-password-link`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				const error = await response.text();
				copyNotification = `生成失败: ${error}`;
				setTimeout(() => {
					copyNotification = '';
				}, 3000);
				return;
			}

			const result = await response.json();
			await navigator.clipboard.writeText(result.url);
			copyNotification = '重置密码链接已复制到剪贴板';
			setTimeout(() => {
				copyNotification = '';
			}, 3000);
		} catch (err) {
			console.error('Failed to generate reset password link:', err);
			copyNotification = '生成失败';
			setTimeout(() => {
				copyNotification = '';
			}, 3000);
		} finally {
			generatingResetLink = false;
		}
	};

	const renameUserFunction = async () => {
		if (renamingUser || !editingUser) return;

		const trimmedUsername = newUsername.trim();
		if (trimmedUsername.length < 2) {
			copyNotification = '用户名长度至少为2个字符';
			setTimeout(() => {
				copyNotification = '';
			}, 3000);
			return;
		}

		if (trimmedUsername.includes(':')) {
			copyNotification = '用户名不能包含 ":"';
			setTimeout(() => {
				copyNotification = '';
			}, 3000);
			return;
		}

		if (trimmedUsername === editingUser.username) {
			copyNotification = '新用户名与当前用户名相同';
			setTimeout(() => {
				copyNotification = '';
			}, 3000);
			return;
		}

		renamingUser = true;
		try {
			const response = await fetch(`/admin/api/users/${editingUser.uuid}/rename`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					username: trimmedUsername
				})
			});

			if (!response.ok) {
				const error = await response.text();
				copyNotification = `重命名失败: ${error}`;
				setTimeout(() => {
					copyNotification = '';
				}, 3000);
				return;
			}

			const result = await response.json();
			invalidateAll();
			copyNotification = `用户已重命名: ${result.oldUsername} → ${result.newUsername}`;
			setTimeout(() => {
				copyNotification = '';
			}, 3000);

			cancelEditingUser();
		} catch (err) {
			console.error('Failed to rename user:', err);
			copyNotification = '重命名失败';
			setTimeout(() => {
				copyNotification = '';
			}, 3000);
		} finally {
			renamingUser = false;
		}
	};
</script>

<svelte:head>
	<title>用户管理 - TeeworldsCN Admin</title>
	<meta name="description" content="管理用户和权限" />
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ href: '/admin', text: '管理工具', title: '管理工具' },
		{ text: '用户管理', title: '用户管理' }
	]}
/>

<div class="space-y-4">
	<!-- Generate Register Link Button -->
	<div class="flex justify-end">
		<button
			onclick={generateRegisterLink}
			disabled={generatingRegisterLink}
			class="rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
		>
			{generatingRegisterLink ? '生成中...' : '生成注册链接'}
		</button>
	</div>

	<!-- Search and Filter Controls -->
	<div class="rounded-lg bg-slate-900 p-4">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-end">
			<div class="flex-1">
				<label for="search" class="mb-2 block text-sm font-medium text-slate-300">搜索用户名</label>
				<input
					id="search"
					type="text"
					bind:value={searchInput}
					placeholder="输入用户名进行搜索..."
					class="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-200 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							handleSearch();
						}
					}}
				/>
			</div>
			{#if userType === 'without-password' && !searchInput.trim()}
				<div class="sm:w-32">
					<label for="platform" class="mb-2 block text-sm font-medium text-slate-300"
						>平台筛选</label
					>
					<select
						id="platform"
						bind:value={platformFilter}
						onchange={handlePlatformFilter}
						class="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					>
						<option value="">全部平台</option>
						{#each availablePlatforms as platform}
							<option value={platform}>{platform}</option>
						{/each}
					</select>
				</div>
			{/if}
			{#if !searchInput.trim()}
				<div class="sm:w-32">
					<div class="mb-2 block text-sm font-medium text-slate-300">用户类型</div>
					<button
						onclick={() => {
							userType = userType === 'without-password' ? 'with-password' : 'without-password';
							handleUserTypeChange();
						}}
						class="w-full rounded-md border border-slate-700 bg-slate-800 px-4 py-2 font-medium text-slate-300 transition-colors hover:bg-slate-700"
					>
						{userType === 'without-password' ? '普通用户' : '管理员'}
					</button>
				</div>
			{/if}
			<button
				onclick={handleSearch}
				class="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
			>
				搜索
			</button>
		</div>
	</div>

	<!-- Results Info and Pagination -->
	<div class="flex items-center justify-between">
		<div class="text-sm text-slate-400">
			显示 {data.offset + 1} - {Math.min(data.offset + data.limit, data.totalCount)} 条，共 {data.totalCount}
			条
			{#if data.search}
				<span class="text-blue-400">（搜索: "{data.search}" - 所有用户）</span>
			{:else}
				<span class="text-purple-400">
					{data.userType === 'with-password' ? '管理员用户' : '普通用户'}
				</span>
				{#if data.platform && data.userType === 'without-password'}
					<span class="text-green-400">（平台: {data.platform}）</span>
				{/if}
			{/if}
		</div>

		<div class="flex space-x-2">
			<button
				onclick={handlePreviousPage}
				disabled={data.offset <= 0}
				class="rounded-md bg-slate-700 px-3 py-1 text-sm text-slate-200 hover:bg-slate-600 disabled:pointer-events-none disabled:opacity-50"
			>
				上一页
			</button>
			<button
				onclick={handleNextPage}
				disabled={data.offset + data.limit >= data.totalCount}
				class="rounded-md bg-slate-700 px-3 py-1 text-sm text-slate-200 hover:bg-slate-600 disabled:pointer-events-none disabled:opacity-50"
			>
				下一页
			</button>
		</div>
	</div>

	<!-- Users Table -->
	<div class="overflow-hidden rounded-lg bg-slate-900">
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-slate-700">
					<tr>
						<th class="px-4 py-3 text-left text-sm font-medium text-slate-200">用户名</th>
						<th class="px-4 py-3 text-left text-sm font-medium text-slate-200"
							>UUID <span class="text-xs text-slate-400">(点击复制)</span></th
						>
						<th class="px-4 py-3 text-left text-sm font-medium text-slate-200">权限</th>
						<th class="px-4 py-3 text-left text-sm font-medium text-slate-200">绑定名称</th>
						<th class="px-4 py-3 text-left text-sm font-medium text-slate-200">操作</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-600">
					{#each data.users as user}
						<tr class="hover:bg-slate-950">
							<td class="px-4 py-3 font-mono text-sm text-slate-200">
								{user.username}
							</td>
							<td class="px-4 py-3 font-mono text-sm text-slate-400">
								<button
									onclick={() => copyToClipboard(user.uuid)}
									class="flex cursor-pointer items-center gap-1 rounded border border-transparent px-2 py-1 transition-colors hover:border-slate-600 hover:bg-slate-700 hover:text-slate-200"
								>
									{user.uuid.slice(-8)}
									<svg
										class="h-3 w-3 opacity-50"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
										></path>
									</svg>
								</button>
							</td>
							<td class="px-4 py-3 text-sm">
								<span class={getPermissionColor(user.data.permissions)}>
									{formatPermissions(user.data.permissions)}
								</span>
							</td>
							<td class="px-4 py-3 text-sm text-slate-300">
								{user.bind_name || '未绑定'}
							</td>
							<td class="px-4 py-3 text-sm">
								<button
									onclick={() => startEditingUser(user)}
									class="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
								>
									操作
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if data.users.length === 0}
			<div class="py-12 text-center">
				<p class="text-slate-400">
					{#if data.search}
						没有找到匹配的用户
					{:else}
						暂无用户
					{/if}
				</p>
			</div>
		{/if}
	</div>
</div>

<!-- Copy Notification Toast -->
{#if copyNotification}
	<div class="fixed bottom-4 right-4 z-50 rounded-lg bg-green-600 px-4 py-2 text-white shadow-lg">
		{copyNotification}
	</div>
{/if}

<!-- User Management Modal -->
<Modal
	bind:show={showUserModal}
	header={() => {
		return `<div class="rounded-t-lg bg-slate-800 p-4">
			<h2 class="text-xl font-bold text-white">用户管理</h2>
			${editingUser ? `<p class="text-sm text-slate-300 mt-1">用户: ${editingUser.username}</p>` : ''}
		</div>`;
	}}
>
	<div class="w-96 max-w-[calc(100vw-3rem)] rounded-b-lg bg-slate-800 p-6">
		{#if editingUser}
			<div class="space-y-6">
				<!-- Permission Editing Section -->
				<div class="space-y-4">
					<div class="text-sm font-medium text-slate-200">权限设置</div>
					<div class="text-xs text-slate-400">选择要授予用户的权限：</div>

					<div class="space-y-3">
						{#each PERMISSIONS as permission}
							<label class="flex cursor-pointer items-center gap-3">
								<input
									type="checkbox"
									checked={editingPermissions.includes(permission)}
									onchange={() => togglePermission(permission)}
									class="rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800"
								/>
								<div class="flex-1">
									<span class="font-medium text-slate-200">{permission}</span>
									<div class="text-xs text-slate-400">
										{#if permission === 'SUPER'}
											超级管理员权限，拥有所有权限
										{:else if permission === 'TICKETS'}
											反馈和举报管理权限
										{:else if permission === 'REGISTER'}
											用户注册管理权限
										{:else if permission === 'GROUP_SETTINGS'}
											群组设置管理权限
										{:else if permission === 'CHANNEL_SETTINGS'}
											频道设置管理权限
										{:else if permission === 'POSTING'}
											QQ 机器人发帖权限
										{:else}
											{permission} 权限
										{/if}
									</div>
								</div>
							</label>
						{/each}
					</div>
				</div>

				<!-- Rename User Section -->
				<div class="space-y-4 border-t border-slate-600 pt-4">
					<div class="text-sm font-medium text-slate-200">重命名用户</div>
					<div class="text-xs text-slate-400">修改用户的用户名：</div>
					<div class="space-y-3">
						<input
							type="text"
							bind:value={newUsername}
							placeholder="输入新用户名"
							class="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-slate-200 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
						/>
						<button
							onclick={renameUserFunction}
							disabled={renamingUser || newUsername.trim() === editingUser.username}
							class="w-full rounded bg-yellow-600 px-4 py-2 text-white hover:bg-yellow-700 disabled:opacity-50"
						>
							{renamingUser ? '重命名中...' : '重命名用户'}
						</button>
					</div>
				</div>

				<!-- Reset Password Link Section -->
				{#if data.userType === 'with-password' || data.search}
					<div class="space-y-4 border-t border-slate-600 pt-4">
						<div class="text-sm font-medium text-slate-200">密码重置</div>
						<div class="text-xs text-slate-400">为该用户生成密码重置链接：</div>
						<button
							onclick={generateResetPasswordLink}
							disabled={generatingResetLink}
							class="w-full rounded bg-orange-600 px-4 py-2 text-white hover:bg-orange-700 disabled:opacity-50"
						>
							{generatingResetLink ? '生成中...' : '生成重置密码链接'}
						</button>
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="flex justify-end gap-3 border-t border-slate-600 pt-4">
					<button
						onclick={cancelEditingUser}
						disabled={savingPermissions}
						class="rounded bg-slate-600 px-4 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
					>
						取消
					</button>
					<button
						onclick={savePermissions}
						disabled={savingPermissions}
						class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
					>
						{savingPermissions ? '保存中...' : '保存权限'}
					</button>
				</div>
			</div>
		{/if}
	</div>
</Modal>
