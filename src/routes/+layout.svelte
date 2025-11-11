<script lang="ts">
	import nis from '$lib/assets/nis.png';
	import { enhance } from '$app/forms';
	import { navigating, page } from '$app/state';
	import Link from '$lib/components/Link.svelte';
	import { resetShare, share } from '$lib/share';
	import '../app.css';
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import Fa from 'svelte-fa';
	import { faGithub } from '@fortawesome/free-brands-svg-icons';
	import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
	import { uaNeedBackButton } from '$lib/helpers';

	let { children, data } = $props();

	afterNavigate(() => {
		share(
			{
				icon: `${window.location.origin}/shareicon.png`,
				link: window.location.href,
				title: 'TeeworldsCN',
				desc: 'TeeworldsCN工具箱'
			},
			'layout'
		);
	});

	let disabled = $state(page.route.id == '/');

	beforeNavigate(() => {
		resetShare();
		if (timer) clearTimeout(timer);
	});

	afterNavigate(() => {
		disabled = page.route.id == '/';
	});

	let timer: NodeJS.Timeout;

	const handleBack = () => {
		history.back();

		const href = window.location.href;

		timer = setTimeout(() => {
			if (window.location.href == href) {
				goto('/');
			}
		}, 250);
	};
</script>

<div
	class="max-w-svw flex min-h-svh flex-col overflow-x-hidden bg-slate-800 {navigating.to
		? 'opacity-60'
		: 'opacity-100'}"
	style={navigating.to ? 'transition: opacity 0.1s ease-in-out 0.1s;' : ''}
>
	<header class="flex bg-slate-900 px-4 py-2 text-slate-300">
		{#if uaNeedBackButton(data.ua)}
			<button
				class="fixed z-50 -ml-2 -mt-0.5 flex h-8 w-12 items-center justify-center rounded-md border border-slate-600 bg-sky-700 text-white shadow-md
				hover:bg-sky-600 active:bg-sky-800 disabled:bg-slate-800 disabled:opacity-50"
				onclick={handleBack}
				{disabled}
			>
				<Fa icon={faArrowLeft} />
			</button>
			<div class="w-20"></div>
		{/if}
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

	<main class="flex flex-grow bg-slate-800 p-2 text-slate-300">
		<div class="container relative mx-auto flex-grow">
			{@render children()}
		</div>
	</main>

	<footer
		class="flex h-8 flex-row flex-nowrap items-center text-nowrap bg-slate-900 px-4 py-1 text-slate-300"
	>
		<div class="flex max-h-8 flex-col overflow-hidden text-xs">
			<Link href="https://beian.miit.gov.cn/" rel="noreferrer" target="_blank" type="subtle"
				>冀ICP备2021002466号</Link
			>
			<Link
				href="https://beian.mps.gov.cn/#/query/webSearch?code=13020302001199"
				rel="noreferrer"
				target="_blank"
				type="subtle"
				><div class="h-2.5 w-2.5 inline-block" style="background-image: url({nis});background-size: contain;"></div>
				冀公网安备13020302001199号</Link
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
