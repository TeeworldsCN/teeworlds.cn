<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';

	let username = $state('');
	let password = $state('');
</script>

<div class="card h-[calc(100svh-18rem)] max-h-[calc(100svh-18rem)] w-full p-4">
	<div class="text-center text-slate-300">登录</div>
	<div class="text-md font-bold">
		<p>请输入用户名和密码</p>
	</div>
	<div class="w-full rounded border border-slate-600 bg-slate-700 px-3 py-1 shadow-md sm:py-3">
		<div class="flex items-center justify-between rounded-t-lg border-b bg-teal-700 p-4">
			<p class="text-lg font-semibold">DDNet 工具箱</p>
		</div>
		<div class="h-full max-h-[calc(100svh-20rem)] space-y-3 overflow-y-auto p-4">
			<form class="flex flex-col space-y-2" method="POST" action="?/login" use:enhance>
				<div class="flex flex-col space-y-2">
					<label for="username" class="text-sm font-medium text-slate-300">用户名</label>
					<input
						type="text"
						id="username"
						name="username"
						bind:value={username}
						class="w-full rounded-l-md border border-slate-500 bg-slate-600 px-3 py-2 text-sm font-normal shadow-md md:flex-1"
					/>
				</div>
				<input type="password" id="password" bind:value={password} class="hidden" />
				<div class="flex flex-col space-y-2">
					<label for="password" class="text-sm font-medium text-slate-300">密码</label>
					<input
						type="password"
						id="password"
						name="password"
						bind:value={password}
						class="w-full rounded-l-md border border-slate-500 bg-slate-600 px-3 py-2 text-sm font-normal shadow-md md:flex-1"
					/>
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
		</div>
	</div>
</div>
