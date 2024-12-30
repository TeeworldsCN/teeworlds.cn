<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { SUBSCRIPTION_KEYS } from '$lib/types.js';

	const { data } = $props();

	let hoveringChannel = $state('');
	let selectedKey = $state('');
	let query = $state('');

	const sendOp = async (body: any) => {
		return await fetch('/admin/subs', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});
	};

	const addSubscription = async (type: string) => {
		if (!selectedKey || !hoveringChannel) {
			return;
		}
		await sendOp({
			op: 'add',
			key: selectedKey,
			value: `${type}:${hoveringChannel}`
		});
		await invalidateAll();
	};

	const removeSubscription = async (key: string, value: string) => {
		await sendOp({
			op: 'rm',
			key: key,
			value: value
		});
		await invalidateAll();
	};

	const triggerMapRelease = async () => {
		await sendOp({ op: 'trigger-map' });
	};

	const triggerRecordRelease = async () => {
		await sendOp({ op: 'trigger-record' });
	};

	const downloadOp = async (body: any) => {
		const result = await fetch('/admin/subs', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		if (result.ok) {
			const data = await result.text();
			const blob = new Blob([data], { type: 'text/plain' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = body.title;
			link.click();
			URL.revokeObjectURL(url);
		}
	};
</script>

<div class="mx-auto mt-5 max-w-4xl">
	<div class="text-slate-300">
		<h1 class="text-center text-2xl font-bold">测试工具（危险）</h1>
		<button class="rounded bg-sky-800 px-2 py-1 hover:bg-sky-700" onclick={triggerMapRelease}
			>测试发布地图</button
		>
		<button class="rounded bg-sky-800 px-2 py-1 hover:bg-sky-700" onclick={triggerRecordRelease}
			>测试发布世界记录</button
		>
	</div>

	<div class="text-center text-slate-300">
		<h1 class="text-2xl font-bold">数据获取</h1>
		<input
			type="text"
			placeholder="查询条目"
			class="mt-5 w-full rounded border border-slate-600 bg-slate-700 px-2 text-slate-300 md:flex-1"
			bind:value={query}
		/>
	</div>

	<div class="my-5 text-center text-slate-300">
		<h1 class="text-2xl font-bold">所有订阅</h1>
	</div>

	{#each data.subs as sub}
		{#if sub.value.length}
			<div class="mb-2 flex items-center justify-between rounded-lg bg-slate-600 px-4 py-1">
				<p class="text-lg">{sub.key}</p>
				<p class="text-lg">{sub.value.length}</p>
			</div>
			{#each sub.value as value}
				<div class="mb-2 ml-5 flex items-center justify-between rounded-lg bg-slate-600 px-4 py-1">
					<p class="text-lg">
						{value}
						{#if value.startsWith('channel:')}
							{#each data.guilds as guild}
								{#if guild.channels}
									{#each guild.channels as channel}
										{#if channel.id == value.slice(8)}
											<span class="ml-2">
												{guild.name}#{channel.name}
											</span>
										{/if}
									{/each}
								{/if}
							{/each}
						{/if}
					</p>
					<button
						class="rounded bg-sky-800 px-2 py-1 text-sm hover:bg-sky-700"
						onclick={() => removeSubscription(sub.key, value)}>删除</button
					>
				</div>
			{/each}
		{/if}
	{/each}

	<div class="text-center text-slate-300">
		<h1 class="text-2xl font-bold">所有频道</h1>
	</div>

	{#each data.guilds as guild}
		<div class="mb-2 flex items-center justify-between rounded-lg bg-slate-600 px-4 py-1">
			<p class="text-lg">{guild.name}</p>
			<p class="text-lg">{guild.member_count} / {guild.max_members}</p>
		</div>
		{#if guild.channels}
			{#each guild.channels as channel}
				<div
					class="mb-2 ml-5 flex items-center justify-between rounded-lg bg-slate-600 px-4 py-2"
					onmouseenter={() => (hoveringChannel = channel.id)}
					role="list"
				>
					<p class="text-lg">{channel.name}</p>
					<div>
						<!-- add a dropdown menu to list all subkeys, and a submit button to add it-->
						{#if hoveringChannel == channel.id}
							<select class="rounded bg-slate-700 px-2 py-1 text-sm" bind:value={selectedKey}>
								{#each SUBSCRIPTION_KEYS as key}
									<option value={key}>{key}</option>
								{/each}
							</select>
							<button
								class="rounded bg-sky-800 px-2 py-1 text-sm hover:bg-sky-700"
								onclick={() => addSubscription('channel')}>添加</button
							>
							<button
								class="rounded bg-sky-800 px-2 py-1 text-sm hover:bg-sky-700"
								onclick={() =>
									downloadOp({ op: 'download-thread', channel: hoveringChannel, title: query })}
								>下载帖子</button
							>
						{/if}
					</div>
				</div>
			{/each}
		{/if}
	{/each}
</div>
