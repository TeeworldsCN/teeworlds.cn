<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { onMount } from 'svelte';

	const { data } = $props();

	// Define types for menu structure
	interface MenuButton {
		name: string;
		type?: string;
		value?: string;
		key?: string;
		url?: string;
		appid?: string;
		pagepath?: string;
		media_id?: string;
		article_id?: string;
		sub_button: MenuButton[];
	}

	interface Menu {
		button: MenuButton[];
	}

	// Process menu data from API response
	let initialMenu: Menu = { button: [] };

	// Format from get_current_selfmenu_info API
	initialMenu = {
		button: data.menu.selfmenu_info.button.map((btn: any) => {
			// Convert sub_button.list to sub_button array format
			if (btn.sub_button && btn.sub_button.list) {
				return {
					...btn,
					sub_button: btn.sub_button.list
				};
			}
			return {
				...btn,
				sub_button: btn.sub_button || []
			};
		})
	};

	let menu = $state<Menu>(initialMenu);

	$inspect(menu);

	let error = $state('');
	let success = $state('');
	let loading = $state(false);
	let showPreview = $state(true);

	// Button type options
	const buttonTypes = [
		{ value: 'click', label: '点击推事件' },
		{ value: 'view', label: '跳转URL' },
		{ value: 'miniprogram', label: '小程序' },
		{ value: 'scancode_push', label: '扫码推事件' },
		{ value: 'scancode_waitmsg', label: '扫码带提示' },
		{ value: 'pic_sysphoto', label: '系统拍照发图' },
		{ value: 'pic_photo_or_album', label: '拍照或相册发图' },
		{ value: 'pic_weixin', label: '微信相册发图' },
		{ value: 'location_select', label: '发送位置' },
		{ value: 'media_id', label: '下发消息' },
		{ value: 'view_limited', label: '跳转图文消息URL' },
		{ value: 'article_id', label: '发布后的图文消息' },
		{ value: 'article_view_limited', label: '发布后的图文消息(限制)' },
		{ value: 'img', label: '图片' },
		{ value: 'voice', label: '语音' },
		{ value: 'video', label: '视频' },
		{ value: 'text', label: '文本' },
		{ value: 'undefined', label: '菜单' }
	];

	// Add a new top-level button
	function addButton() {
		if (menu.button.length >= 3) {
			error = '一级菜单最多只能有3个';
			return;
		}

		const newButton: MenuButton = {
			name: '新菜单',
			sub_button: []
		};

		menu.button = [...menu.button, newButton];
	}

	// Add a sub-button to a parent button
	function addSubButton(parentIndex: number) {
		if (menu.button[parentIndex].sub_button.length >= 5) {
			error = '二级菜单最多只能有5个';
			return;
		}

		const newSubButton: MenuButton = {
			name: '子菜单',
			type: 'click',
			key: `key_${Date.now()}`,
			sub_button: []
		};

		menu.button[parentIndex].sub_button = [...menu.button[parentIndex].sub_button, newSubButton];
	}

	// Remove a button
	function removeButton(parentIndex: number, subIndex?: number) {
		if (subIndex !== undefined) {
			// Remove sub-button
			menu.button[parentIndex].sub_button = menu.button[parentIndex].sub_button.filter(
				(_, i) => i !== subIndex
			);
		} else {
			// Remove parent button
			menu.button = menu.button.filter((_, i) => i !== parentIndex);
		}
	}

	// Move a button up
	function moveUp(parentIndex: number, subIndex?: number) {
		if (subIndex !== undefined) {
			if (subIndex === 0) return;
			const temp = menu.button[parentIndex].sub_button[subIndex];
			menu.button[parentIndex].sub_button[subIndex] =
				menu.button[parentIndex].sub_button[subIndex - 1];
			menu.button[parentIndex].sub_button[subIndex - 1] = temp;
		} else {
			if (parentIndex === 0) return;
			const temp = menu.button[parentIndex];
			menu.button[parentIndex] = menu.button[parentIndex - 1];
			menu.button[parentIndex - 1] = temp;
		}
	}

	// Move a button down
	function moveDown(parentIndex: number, subIndex?: number) {
		if (subIndex !== undefined) {
			if (subIndex === menu.button[parentIndex].sub_button.length - 1) return;
			const temp = menu.button[parentIndex].sub_button[subIndex];
			menu.button[parentIndex].sub_button[subIndex] =
				menu.button[parentIndex].sub_button[subIndex + 1];
			menu.button[parentIndex].sub_button[subIndex + 1] = temp;
		} else {
			if (parentIndex === menu.button.length - 1) return;
			const temp = menu.button[parentIndex];
			menu.button[parentIndex] = menu.button[parentIndex + 1];
			menu.button[parentIndex + 1] = temp;
		}
	}

	// Save the menu configuration
	async function saveMenu() {
		error = '';
		success = '';
		loading = true;

		try {
			// Validate menu
			if (menu.button.length === 0) {
				error = '菜单不能为空';
				loading = false;
				return;
			}

			// Check if any parent button has no sub-buttons and no type
			for (let i = 0; i < menu.button.length; i++) {
				const button = menu.button[i];
				if (button.sub_button.length === 0 && !button.type) {
					error = `菜单 "${button.name}" 没有子菜单，必须设置类型`;
					loading = false;
					return;
				}
			}

			const response = await fetch('/admin/api/wechat-menu', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ button: menu.button })
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || '保存菜单失败');
			}

			success = '菜单保存成功！菜单会在用户下次打开公众号时更新';
			await invalidateAll();
		} catch (err) {
			console.error('Failed to save menu:', err);
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	// Delete the menu
	async function deleteMenu() {
		if (!confirm('确定要删除当前菜单吗？此操作不可恢复。')) {
			return;
		}

		error = '';
		success = '';
		loading = true;

		try {
			const response = await fetch('/admin/api/wechat-menu', {
				method: 'DELETE'
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || '删除菜单失败');
			}

			success = '菜单删除成功！';
			menu = { button: [] };
			await invalidateAll();
		} catch (err) {
			console.error('Failed to delete menu:', err);
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	// Handle button type change
	function handleTypeChange(button: MenuButton, newType: string): MenuButton {
		// Reset button properties based on type

		const newButton: MenuButton =
			newType == 'undefined'
				? {
						name: button.name,
						sub_button: button.sub_button || []
					}
				: {
						name: button.name,
						type: newType,
						sub_button: button.sub_button || []
					};

		switch (newType) {
			case 'click':
			case 'scancode_push':
			case 'scancode_waitmsg':
			case 'pic_sysphoto':
			case 'pic_photo_or_album':
			case 'pic_weixin':
			case 'location_select':
				newButton.key = '';
				break;
			case 'text':
			case 'img':
			case 'voice':
			case 'video':
				newButton.value = '';
				break;
			case 'view':
				newButton.url = '';
				break;
			case 'miniprogram':
				newButton.url = '';
				newButton.appid = '';
				newButton.pagepath = '';
				break;
			case 'media_id':
			case 'view_limited':
				newButton.media_id = '';
				break;
			case 'article_id':
			case 'article_view_limited':
				newButton.article_id = '';
				break;
		}

		// Return the new button
		return newButton;
	}

	onMount(() => {
		// Initialize menu if it's empty
		if (!menu.button) {
			menu = { button: [] };
		}
	});
</script>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ href: '/admin', text: '管理工具', title: '管理工具' },
		{ text: '微信自定义菜单', title: '微信自定义菜单' }
	]}
/>

<div class="mx-auto mt-5 max-w-4xl">
	<h1 class="text-center text-2xl font-bold text-slate-300">微信自定义菜单管理</h1>

	<!-- Warning banner for unverified accounts -->
	<div class="mt-4 rounded-md bg-amber-800 p-3 text-white">
		<p class="font-medium">⚠️ 未认证的订阅号并不能编辑菜单，本界面仅做参考</p>
	</div>

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

	<div class="mt-6 flex justify-between">
		<div>
			<button
				class="rounded bg-sky-800 px-4 py-2 text-white hover:bg-sky-700 disabled:opacity-50"
				onclick={addButton}
				disabled={loading || menu.button.length >= 3}
			>
				添加一级菜单
			</button>
		</div>
		<div>
			<button
				class="mr-2 rounded bg-zinc-800 px-4 py-2 text-white hover:bg-zinc-700 disabled:opacity-50"
				onclick={() => (showPreview = !showPreview)}
			>
				{showPreview ? '隐藏预览' : '显示预览'}
			</button>
			<button
				class="mr-2 rounded bg-red-800 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
				onclick={deleteMenu}
				disabled={loading || menu.button.length === 0}
			>
				删除菜单
			</button>
			<button
				class="rounded bg-green-800 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
				onclick={saveMenu}
				disabled={loading}
			>
				{loading ? '保存中...' : '保存菜单'}
			</button>
		</div>
	</div>

	<div class="mt-6 flex flex-col lg:flex-row">
		<!-- Menu Editor -->
		<div class="w-full lg:w-2/3 lg:pr-4">
			<div class="rounded-lg bg-zinc-900 p-4">
				<h2 class="mb-4 text-xl font-semibold text-slate-300">菜单编辑器</h2>

				{#if menu.button.length === 0}
					<div class="rounded-lg bg-zinc-800 p-4 text-center text-slate-400">
						<p>暂无菜单，请点击"添加一级菜单"按钮创建</p>
					</div>
				{:else}
					{#each menu.button as parentButton, parentIndex}
						<div class="mb-6 rounded-lg bg-zinc-800 p-4">
							<div class="mb-4 flex items-center justify-between">
								<h3 class="text-lg font-semibold text-slate-300">一级菜单 #{parentIndex + 1}</h3>
								<div>
									<button
										class="mr-1 rounded bg-zinc-700 px-2 py-1 text-sm text-white hover:bg-zinc-600"
										onclick={() => moveUp(parentIndex)}
										disabled={parentIndex === 0}
									>
										上移
									</button>
									<button
										class="mr-1 rounded bg-zinc-700 px-2 py-1 text-sm text-white hover:bg-zinc-600"
										onclick={() => moveDown(parentIndex)}
										disabled={parentIndex === menu.button.length - 1}
									>
										下移
									</button>
									<button
										class="rounded bg-red-700 px-2 py-1 text-sm text-white hover:bg-red-600"
										onclick={() => removeButton(parentIndex)}
									>
										删除
									</button>
								</div>
							</div>

							<div class="mb-4">
								<div class="mb-1 block text-sm font-medium text-slate-300">菜单名称</div>
								<input
									type="text"
									class="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-white"
									bind:value={parentButton.name}
									maxlength="4"
									placeholder="最多4个汉字"
								/>
								<p class="mt-1 text-xs text-slate-400">
									{parentButton.name ? parentButton.name.length : 0}/4 个字符
								</p>
							</div>

							<!-- Button properties snippet -->
							{#snippet buttonProperties(
								button: MenuButton,
								parentIndex: number,
								subIndex?: number
							)}
								<div class="mb-4">
									<div class="mb-1 block text-sm font-medium text-slate-300">菜单类型</div>
									<select
										class="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-white"
										bind:value={button.type}
										onchange={(e) => {
											const newType = e.currentTarget.value;
											if (subIndex !== undefined) {
												menu.button[parentIndex].sub_button[subIndex] = handleTypeChange(
													button,
													newType
												);
											} else {
												menu.button[parentIndex] = handleTypeChange(button, newType);
											}
										}}
									>
										<option value="">请选择类型</option>
										{#each buttonTypes as type}
											<option value={type.value}>{type.label}</option>
										{/each}
									</select>
								</div>

								{#if typeof button.key !== 'undefined'}
									<div class="mb-4">
										<div class="mb-1 block text-sm font-medium text-slate-300">菜单KEY值</div>
										<input
											type="text"
											class="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-white"
											bind:value={button.key}
											placeholder="用于消息接口推送"
										/>
									</div>
								{/if}
								{#if typeof button.value !== 'undefined'}
									<div class="mb-4">
										<div class="mb-1 block text-sm font-medium text-slate-300">菜单KEY值</div>
										<input
											type="text"
											class="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-white"
											bind:value={button.value}
											placeholder="用于消息接口推送"
										/>
									</div>
								{/if}
								{#if typeof button.url !== 'undefined'}
									<div class="mb-4">
										<div class="mb-1 block text-sm font-medium text-slate-300">跳转URL</div>
										<input
											type="text"
											class="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-white"
											bind:value={button.url}
											placeholder="https://"
										/>
									</div>
								{/if}
								{#if typeof button.appid !== 'undefined'}
									<div class="mb-4">
										<div class="mb-1 block text-sm font-medium text-slate-300">小程序AppID</div>
										<input
											type="text"
											class="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-white"
											bind:value={button.appid}
											placeholder="小程序的appid"
										/>
									</div>
								{/if}
								{#if typeof button.pagepath !== 'undefined'}
									<div class="mb-4">
										<div class="mb-1 block text-sm font-medium text-slate-300">小程序页面路径</div>
										<input
											type="text"
											class="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-white"
											bind:value={button.pagepath}
											placeholder="pages/index/index"
										/>
									</div>
								{/if}
								{#if typeof button.media_id !== 'undefined'}
									<div class="mb-4">
										<div class="mb-1 block text-sm font-medium text-slate-300">媒体ID</div>
										<input
											type="text"
											class="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-white"
											bind:value={button.media_id}
											placeholder="永久素材media_id"
										/>
									</div>
								{/if}
								{#if typeof button.article_id !== 'undefined'}
									<div class="mb-4">
										<div class="mb-1 block text-sm font-medium text-slate-300">文章ID</div>
										<input
											type="text"
											class="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-white"
											bind:value={button.article_id}
											placeholder="发布后的图文消息article_id"
										/>
									</div>
								{/if}
							{/snippet}

							<!-- Parent button properties -->
							{@render buttonProperties(parentButton, parentIndex)}

							<!-- Sub-buttons section -->
							<div class="mt-4 border-t border-zinc-700 pt-4">
								<div class="mb-4 flex items-center justify-between">
									<h4 class="text-md font-medium text-slate-300">子菜单</h4>
									<button
										class="rounded bg-sky-700 px-2 py-1 text-sm text-white hover:bg-sky-600"
										onclick={() => addSubButton(parentIndex)}
										disabled={parentButton.sub_button.length >= 5}
									>
										添加子菜单
									</button>
								</div>

								{#if parentButton.sub_button.length === 0}
									<div class="rounded-lg bg-zinc-700 p-3 text-center text-slate-400">
										<p>暂无子菜单</p>
									</div>
								{:else}
									{#each parentButton.sub_button as subButton, subIndex}
										<div class="mb-4 rounded-lg bg-zinc-700 p-3">
											<div class="mb-3 flex items-center justify-between">
												<h5 class="text-sm font-medium text-slate-300">子菜单 #{subIndex + 1}</h5>
												<div>
													<button
														class="mr-1 rounded bg-zinc-600 px-2 py-1 text-xs text-white hover:bg-zinc-500"
														onclick={() => moveUp(parentIndex, subIndex)}
														disabled={subIndex === 0}
													>
														上移
													</button>
													<button
														class="mr-1 rounded bg-zinc-600 px-2 py-1 text-xs text-white hover:bg-zinc-500"
														onclick={() => moveDown(parentIndex, subIndex)}
														disabled={subIndex === parentButton.sub_button.length - 1}
													>
														下移
													</button>
													<button
														class="rounded bg-red-700 px-2 py-1 text-xs text-white hover:bg-red-600"
														onclick={() => removeButton(parentIndex, subIndex)}
													>
														删除
													</button>
												</div>
											</div>

											<div class="mb-3">
												<div class="mb-1 block text-sm font-medium text-slate-300">菜单名称</div>
												<input
													type="text"
													class="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-white"
													bind:value={subButton.name}
													maxlength="8"
													placeholder="最多8个汉字"
												/>
												<p class="mt-1 text-xs text-slate-400">
													{subButton.name ? subButton.name.length : 0}/8 个字符
												</p>
											</div>

											<!-- Sub-button properties -->
											{@render buttonProperties(subButton, parentIndex, subIndex)}
										</div>
									{/each}
								{/if}
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</div>

		<!-- Menu Preview -->
		{#if showPreview}
			<div class="mt-6 w-full lg:mt-0 lg:w-1/3">
				<div class="rounded-lg bg-zinc-900 p-4">
					<h2 class="mb-4 text-xl font-semibold text-slate-300">菜单预览</h2>

					<div class="rounded-lg bg-zinc-800 p-4">
						<div class="mb-4 rounded-lg bg-zinc-700 p-3">
							<p class="text-center text-sm text-slate-300">微信公众号界面</p>
						</div>

						<div class="flex h-12 border-t border-zinc-700">
							{#each menu.button as button, index}
								<div
									class="flex flex-1 items-center justify-center border-r border-zinc-700 text-center last:border-r-0"
								>
									<span class="text-sm text-slate-300">
										{button.name || `菜单${index + 1}`}
										{#if button.sub_button && button.sub_button.length > 0}
											▲
										{/if}
									</span>
								</div>
							{/each}
							{#if menu.button.length === 0}
								<div class="flex flex-1 items-center justify-center">
									<span class="text-sm text-slate-400">暂无菜单</span>
								</div>
							{:else if menu.button.length < 3}
								{#each Array(3 - menu.button.length) as _}
									<div
										class="flex flex-1 items-center justify-center border-r border-zinc-700 text-center last:border-r-0"
									>
										<span class="text-sm text-slate-500">空</span>
									</div>
								{/each}
							{/if}
						</div>
					</div>

					<div class="mt-6">
						<h3 class="mb-2 text-lg font-semibold text-slate-300">注意事项</h3>
						<ul class="list-inside list-disc text-sm text-slate-400">
							<li>一级菜单最多4个汉字，二级菜单最多8个汉字</li>
							<li>一级菜单最多3个，二级菜单最多5个</li>
							<li>菜单创建后，用户需要重新关注或进入公众号才能看到更新</li>
							<li>带有二级菜单的一级菜单本身不能设置动作</li>
							<li>菜单内容不能出现违法违规内容</li>
						</ul>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
