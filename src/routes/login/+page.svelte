<script lang="ts">
	import { enhance } from '$app/forms';
	import { afterNavigate } from '$app/navigation';

	const { data } = $props();

	let forgetPassword = $state(false);

	let username = $state('');
	let password = $state('');

	afterNavigate(() => {
		const errorElement = document.getElementById('error');
		errorElement?.classList.remove('motion-preset-shake');
		requestAnimationFrame(() => {
			setTimeout(() => {
				errorElement?.classList.add('motion-preset-shake');
			}, 0);
		});
	});
</script>

<div id="login" class="mx-auto max-w-96">
	<div class="h-16">
		{#if data.registered}
			<div class="mb-4 flex items-center justify-between rounded-lg bg-slate-600 px-4 py-2">
				<p>{data.registered}</p>
			</div>
		{/if}

		{#if data.error}
			<div
				id="error"
				class="motion-preset-shake mb-4 flex items-center justify-between rounded-lg bg-orange-900 px-4 py-2"
			>
				<p>{data.error}</p>
			</div>
		{/if}
	</div>
	<div class="w-full rounded-lg border border-slate-600 bg-slate-700 shadow-md">
		<div class="flex items-center justify-between rounded-t-lg bg-sky-700 p-4">
			<p class="text-lg font-semibold">登录入口</p>
		</div>
		<div class="h-full max-h-[calc(100svh-20rem)] space-y-3 overflow-y-auto p-4">
			<form class="flex flex-col space-y-2" method="POST" use:enhance>
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
					{#key 'password'}
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
						登录
					</button>
				</div>
			</form>

			<div class="mt-2 flex items-center justify-center space-x-4">
				<button
					class="cursor-pointer text-sm font-semibold text-blue-300 hover:text-blue-400"
					onclick={() => (forgetPassword = !forgetPassword)}>忘记密码？</button
				>
			</div>
		</div>
	</div>
	{#if forgetPassword}
		<div class="mt-4 flex items-center justify-between rounded-lg bg-slate-600 px-4 py-2">
			<p>啊？那太可惜了，没有找回密码的功能呢~ 联系管理员帮你重置吧</p>
		</div>
	{/if}
</div>
