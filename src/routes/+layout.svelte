<script lang="ts">
	import { enhance } from '$app/forms';
	import { navigating } from '$app/state';
	import Link from '$lib/components/Link.svelte';
	import { resetShare, share } from '$lib/share';
	import '../app.css';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import Fa from 'svelte-fa';
	import { faGithub } from '@fortawesome/free-brands-svg-icons';

	let { children, data } = $props();

	afterNavigate(() => {
		share(
			{
				icon: `${window.location.origin}/shareicon.png`,
				link: window.location.href,
				title: 'TeeworldsCN',
				desc: 'Teeworlds 中文社区工具箱'
			},
			'layout'
		);
	});

	beforeNavigate(() => {
		resetShare();
	});
</script>

<div
	class="max-w-svw flex min-h-svh flex-col overflow-x-hidden bg-slate-800 {navigating.to
		? 'opacity-60'
		: 'opacity-100'}"
	style={navigating.to ? 'transition: opacity 0.1s ease-in-out 0.1s;' : ''}
>
	<header class="flex bg-slate-900 px-4 py-2 text-slate-300">
		<div class="container mx-auto">
			<div class="flex w-full">
				<div class="flex-grow">
					<a href="/" class="text-lg font-bold"> TeeworldsCN </a>
				</div>
				{#if data.user}
					<form class="flex" method="POST" action="/login/logout" use:enhance>
						<div class="scrollbar-hide mr-5 max-w-40 justify-center overflow-x-auto text-nowrap">
							{data.user.username}
						</div>
						<button type="submit" class="justify-center text-nowrap rounded bg-sky-700 px-2"
							>登出</button
						>
					</form>
				{/if}
			</div>
		</div>
	</header>

	<main class="flex flex-grow bg-slate-800 p-2 text-slate-300 md:p-4">
		<div class="container relative mx-auto flex-grow">
			{@render children()}
		</div>
	</main>

	<footer class="flex flex-row items-center bg-slate-900 px-4 py-1 text-slate-300">
		<div class="text-sm md:text-base">
			<Link href="https://beian.miit.gov.cn/" type="subtle" className="font-bold"
				>冀ICP备2021002466号</Link
			>
		</div>
		<div class="flex-grow"></div>
		<div>
			<Link href="https://github.com/TeeworldsCN/teeworlds.cn" type="subtle" className="font-bold"
				><Fa icon={faGithub} class="inline"></Fa> GitHub</Link
			>
		</div>
	</footer>
</div>
