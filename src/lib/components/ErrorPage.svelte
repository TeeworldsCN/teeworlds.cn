<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	const {
		errorMessages = {
			400: '请求错误',
			401: '需要登录后访问',
			403: '没有权限访问',
			404: '未找到请求的页面',
			408: '请求超时',
			429: '请求过于频繁，请稍后重试',
			500: '服务器出问题了，请稍后重试',
			502: '服务器暂时不可用',
			503: '服务器维护中',
			504: '服务器响应超时'
		}
	} = $props();

	// Determine color based on error code
	function getErrorColor(status: number): string {
		if (status >= 400 && status < 500) {
			return 'text-amber-500'; // Client errors - amber/orange
		} else if (status >= 500) {
			return 'text-purple-500'; // Server errors - purple
		} else {
			return 'text-blue-500'; // Other status codes - blue
		}
	}

	function handleButtonClick() {
		if (window.history.length > 1) {
			window.history.back();
		} else {
			goto('/');
		}
	}
</script>

<div class="flex h-full w-full flex-col items-center justify-center p-4">
	<div
		class="motion-safe:animate-fade-in w-full max-w-lg rounded-lg border border-slate-500/30 bg-gradient-to-b from-slate-700 to-slate-800 p-8 shadow-xl backdrop-blur-sm"
	>
		<div class="flex flex-col items-center justify-center">
			<div
				class="motion-safe:motion-preset-slide-down-md motion-safe:motion-duration-1000 text-9xl font-semibold {getErrorColor(
					page.status
				)} drop-shadow-md"
			>
				{page.status}
			</div>

			<div
				class="motion-safe:motion-preset-slide-down-md motion-safe:motion-delay-300 mt-6 text-center text-xl font-medium text-slate-200"
			>
				{#if errorMessages[page.status]}
					{errorMessages[page.status]}
				{:else}
					发生了错误，请稍后重试
				{/if}
			</div>

			<div class="mt-10">
				<button
					class="focus:ring-opacity-50 rounded-md bg-gradient-to-r from-blue-500 to-blue-600 px-8 py-2.5 font-medium text-white shadow-md focus:ring-2 focus:ring-blue-300 focus:outline-none"
					onclick={handleButtonClick}
				>
					返回
				</button>
			</div>
		</div>
	</div>
</div>
