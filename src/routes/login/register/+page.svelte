<script lang="ts">
	import { enhance } from '$app/forms';

	const { data } = $props();

	let username = $state('');
	let password = $state('');
</script>

<div class="mx-auto max-w-96">
	{#if data.error}
		<div class="mb-4 flex items-center justify-between rounded-lg bg-orange-900 px-4 py-2">
			<p>注册失败：{data.error}</p>
		</div>
	{/if}
	<div class="w-full rounded-lg border border-slate-600 bg-slate-700 shadow-md">
		<div class="flex items-center justify-between rounded-t-lg bg-sky-700 p-4">
			<p class="text-lg font-semibold">{data.inviter} 邀请你注册</p>
		</div>
		<div class="h-full max-h-[calc(100svh-20rem)] space-y-3 overflow-y-auto p-4">
			<form class="flex flex-col space-y-2" method="POST" use:enhance>
				<div class="flex flex-col space-y-2">
					<label for="registerToken" class="text-sm font-medium text-slate-300">邀请码</label>
					{#key 'registerToken'}
						<input
							type="text"
							id="registerToken"
							name="registerToken"
							bind:value={data.registerToken}
							readonly
							class="w-full rounded-l-md border border-slate-500 bg-slate-600 px-3 py-2 text-sm font-normal opacity-50 shadow-md md:flex-1"
						/>
					{/key}
				</div>
				<div class="flex flex-col space-y-2">
					<label for="username" class="text-sm font-medium text-slate-300">用户名</label>
					{#key 'username'}
						<input
							type="text"
							id="username"
							name="username"
							bind:value={username}
							class="w-full rounded-l-md border border-slate-500 bg-slate-600 px-3 py-2 text-sm font-normal shadow-md md:flex-1"
						/>
					{/key}
				</div>
				<div class="flex flex-col space-y-2">
					<label for="password" class="text-sm font-medium text-slate-300">密码</label>
					{#key 'reg-password'}
						<input
							type="password"
							id="password"
							name="password"
							bind:value={password}
							class="w-full rounded-l-md border border-slate-500 bg-slate-600 px-3 py-2 text-sm font-normal shadow-md md:flex-1"
						/>
					{/key}
				</div>
				<div class="flex flex-col space-y-2">
					<button
						type="submit"
						class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:bg-blue-500 disabled:opacity-50"
						disabled={!username || !password}
					>
						注册
					</button>
				</div>
			</form>

			<div class="mt-2 flex items-center justify-center space-x-4">
				<a href="/login" class="text-sm font-semibold text-blue-300 hover:text-blue-400">返回登录</a
				>
			</div>
		</div>
	</div>
</div>
