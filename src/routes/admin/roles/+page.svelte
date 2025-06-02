<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { onMount } from 'svelte';

	const { data } = $props();

	// Convert color number to hex string for input
	// Color is in ARGB format (AARRGGBB), convert to hex #RRGGBBAA
	const colorToHex = (color: number) => {
		// Extract components from ARGB
		const a = (color >> 24) & 0xFF;
		const r = (color >> 16) & 0xFF;
		const g = (color >> 8) & 0xFF;
		const b = color & 0xFF;

		// Format as hex string #RRGGBBAA
		return '#' +
			r.toString(16).padStart(2, '0') +
			g.toString(16).padStart(2, '0') +
			b.toString(16).padStart(2, '0') +
			a.toString(16).padStart(2, '0');
	};

	// Convert hex string #RRGGBBAA to ARGB color number (AARRGGBB)
	const hexToColor = (hex: string): number => {
		// Remove # if present
		hex = hex.replace(/^#/, '');

		// Ensure we have at least 8 characters (RRGGBBAA)
		if (hex.length === 6) {
			// If only 6 characters (RRGGBB), assume full opacity
			hex = hex + 'FF';
		}

		// Parse the hex values
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);
		const a = parseInt(hex.substring(6, 8), 16);

		// Use Number() to avoid signed integer issues with bit operations
		// This ensures we get a proper unsigned 32-bit integer
		return Number((a * 0x1000000) + (r * 0x10000) + (g * 0x100) + b);
	};

	let selectedGuildId = $state('');
	let roles = $state<any[]>([]);
	let loading = $state(false);
	let error = $state('');

	// Role form
	let editingRole = $state<any | null>(null);
	let newRoleName = $state('');
	let newRoleColorHex = $state('');
	let newRoleColor = $derived(newRoleColorHex ? hexToColor(newRoleColorHex).toString() : '');
	let newRoleHoist = $state(0);
	let showRoleForm = $state(false);

	// Default color for new roles - #79798CFF (ARGB: 0xFF79798C)
	const DEFAULT_ROLE_COLOR = "#79798CFF";

	const fetchRoles = async () => {
		if (!selectedGuildId) {
			roles = [];
			return;
		}

		loading = true;
		error = '';

		try {
			const response = await fetch(`/admin/api/roles?guild_id=${selectedGuildId}`);
			if (!response.ok) {
				throw new Error(`Error: ${response.status}`);
			}
			const data = await response.json();
			roles = data.roles;
		} catch (err) {
			console.error('Failed to fetch roles:', err);
			error = err instanceof Error ? err.message : String(err);
			roles = [];
		} finally {
			loading = false;
		}
	};

	const createNewRole = async () => {
		if (!selectedGuildId) return;

		loading = true;
		error = '';

		try {
			const response = await fetch('/admin/api/roles', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					guild_id: selectedGuildId,
					name: newRoleName,
					color: newRoleColor ? parseInt(newRoleColor) : undefined,
					hoist: newRoleHoist
				})
			});

			if (!response.ok) {
				throw new Error(`Error: ${response.status}`);
			}

			// Reset form
			newRoleName = '';
			newRoleColorHex = '';
			newRoleHoist = 0;
			showRoleForm = false;

			// Refresh roles
			await fetchRoles();
		} catch (err) {
			console.error('Failed to create role:', err);
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	};

	const updateRole = async () => {
		if (!selectedGuildId || !editingRole) return;

		loading = true;
		error = '';

		try {
			const response = await fetch('/admin/api/roles', {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					guild_id: selectedGuildId,
					role_id: editingRole.id,
					name: newRoleName,
					color: newRoleColor ? parseInt(newRoleColor) : undefined,
					hoist: newRoleHoist
				})
			});

			if (!response.ok) {
				throw new Error(`Error: ${response.status}`);
			}

			// Reset form
			editingRole = null;
			newRoleName = '';
			newRoleColorHex = '';
			newRoleHoist = 0;
			showRoleForm = false;

			// Refresh roles
			await fetchRoles();
		} catch (err) {
			console.error('Failed to update role:', err);
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	};

	const deleteRole = async (roleId: string) => {
		if (!selectedGuildId || !roleId) return;

		if (!confirm('确定要删除这个角色吗？此操作不可撤销。')) {
			return;
		}

		loading = true;
		error = '';

		try {
			const response = await fetch('/admin/api/roles', {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					guild_id: selectedGuildId,
					role_id: roleId
				})
			});

			// If the response is not OK and not 204, throw an error
			if (!response.ok && response.status !== 204) {
				throw new Error(`Error: ${response.status}`);
			}

			// Refresh roles
			await fetchRoles();
		} catch (err) {
			console.error('Failed to delete role:', err);
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	};

	const editRole = (role: any) => {
		editingRole = role;
		newRoleName = role.name;
		newRoleColorHex = colorToHex(role.color);
		newRoleHoist = role.hoist;
		showRoleForm = true;
	};

	const cancelEdit = () => {
		editingRole = null;
		newRoleName = '';
		newRoleColorHex = '';
		newRoleHoist = 0;
		showRoleForm = false;
	};

	const startNewRole = () => {
		editingRole = null;
		newRoleName = '';
		newRoleColorHex = DEFAULT_ROLE_COLOR;
		newRoleHoist = 0;
		showRoleForm = true;
	};

	const submitForm = () => {
		if (editingRole) {
			updateRole();
		} else {
			createNewRole();
		}
	};



	// Watch for guild selection changes
	$effect(() => {
		if (selectedGuildId) {
			fetchRoles();
		}
	});
</script>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ href: '/admin', text: '管理工具', title: '管理工具' },
		{ text: '角色管理', title: '角色管理' }
	]}
/>

<div class="mx-auto mt-5 max-w-4xl">
	<div class="text-center text-slate-300">
		<h1 class="text-2xl font-bold">频道角色管理</h1>

		<!-- Guild Selection -->
		<div class="mt-4">
			<label for="guild-select" class="block text-left mb-2">选择频道:</label>
			<select
				id="guild-select"
				class="w-full rounded border border-slate-600 bg-slate-700 px-2 py-2 text-slate-300"
				bind:value={selectedGuildId}
			>
				<option value="">-- 选择频道 --</option>
				{#each data.guilds as guild}
					<option value={guild.id}>{guild.name}</option>
				{/each}
			</select>
		</div>

		<!-- Error Display -->
		{#if error}
			<div class="mt-4 p-3 bg-red-800 text-white rounded">
				{error}
			</div>
		{/if}

		<!-- Role Form -->
		{#if showRoleForm}
			<div class="mt-6 p-4 rounded-lg" style="background-color: #101010;">
				<h2 class="text-xl font-bold mb-4">{editingRole ? '编辑角色' : '创建新角色'}</h2>
				<form onsubmit={(e) => { e.preventDefault(); submitForm(); }} class="text-left">
					<div class="mb-4">
						<label for="role-name" class="block mb-1">角色名称:</label>
						<input
							id="role-name"
							type="text"
							class="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-2 text-zinc-300"
							bind:value={newRoleName}
							required
						/>
					</div>

					<div class="mb-4">
						<label for="role-color" class="block mb-1">角色颜色:</label>
						<div class="flex gap-2">
							<input
								id="role-color"
								type="text"
								class="flex-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-2 text-zinc-300"
								bind:value={newRoleColorHex}
								placeholder="十六进制颜色值，例如: #FF0000 (红色)"
							/>
							<input
								type="color"
								class="h-10 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
								style="outline: none; border: none; overflow: hidden;"
								value={newRoleColorHex ? newRoleColorHex.substring(0, 7) : "#FF0000"}
								oninput={(e) => {
									// Get the RGB value from the color picker and add alpha (FF)
									const input = e.target as HTMLInputElement;
									newRoleColorHex = input.value + (newRoleColorHex?.substring(7, 9) || 'FF');
								}}
							/>
						</div>

					</div>

					<div class="mb-4">
						<label class="flex items-center">
							<input
								type="checkbox"
								class="mr-2"
								checked={newRoleHoist === 1}
								onchange={() => (newRoleHoist = newRoleHoist === 1 ? 0 : 1)}
							/>
							在成员列表中单独显示
						</label>
					</div>

					<div class="flex justify-end gap-2">
						<button
							type="button"
							class="px-4 py-2 bg-slate-600 rounded hover:bg-slate-500"
							onclick={cancelEdit}
						>
							取消
						</button>
						<button
							type="submit"
							class="px-4 py-2 bg-sky-700 rounded hover:bg-sky-600"
							disabled={loading}
						>
							{loading ? '处理中...' : editingRole ? '保存修改' : '创建角色'}
						</button>
					</div>
				</form>
			</div>
		{:else if selectedGuildId}
			<div class="mt-4">
				<button
					class="px-4 py-2 bg-sky-700 rounded hover:bg-sky-600"
					onclick={startNewRole}
				>
					创建新角色
				</button>
			</div>
		{/if}

		<!-- Roles List -->
		{#if selectedGuildId}
			<div class="mt-6 p-4 rounded-lg" style="background-color: #101010;">
				<h2 class="text-xl font-bold mb-4 text-left">角色列表</h2>

				{#if loading && !roles.length}
					<div class="p-4 text-center">加载中...</div>
				{:else if roles.length === 0}
					<div class="p-4 text-center">没有找到角色</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full text-left">
							<thead>
								<tr class="bg-zinc-900">
									<th class="p-2 rounded-tl">ID</th>
									<th class="p-2">名称</th>
									<th class="p-2">颜色</th>
									<th class="p-2">单独显示</th>
									<th class="p-2">成员数</th>
									<th class="p-2 rounded-tr">操作</th>
								</tr>
							</thead>
							<tbody>
								{#each roles as role}
									<tr class="border-t border-zinc-800 hover:bg-zinc-900">
										<td class="p-2">{role.id}</td>
										<td class="p-2">
											<span
												style="color: {colorToHex(role.color).substring(0, 7)};"
											>
												{role.name}
											</span>
										</td>
										<td class="p-2">
											<div class="flex items-center gap-2">
												<div
													class="w-4 h-4 rounded-full"
													style="background-color: {colorToHex(role.color).substring(0, 7)};"
												></div>
												<span>{colorToHex(role.color)}</span>
											</div>
										</td>
										<td class="p-2">{role.hoist ? '是' : '否'}</td>
										<td class="p-2">{role.number} / {role.member_limit}</td>
										<td class="p-2">
											<!-- Don't allow editing/deleting default system roles -->
											{#if !['1', '2', '4', '5', '6'].includes(role.id)}
												<div class="flex gap-2">
													<button
														class="px-2 py-1 bg-sky-700 rounded text-sm hover:bg-sky-600"
														onclick={() => editRole(role)}
													>
														编辑
													</button>
													<button
														class="px-2 py-1 bg-red-700 rounded text-sm hover:bg-red-600"
														onclick={() => deleteRole(role.id)}
													>
														删除
													</button>
												</div>
											{:else}
												<span class="text-zinc-400">系统角色</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
