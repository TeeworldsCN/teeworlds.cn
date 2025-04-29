<script lang="ts">
	let { show = $bindable(), header = null, children } = $props();
	import Fa from 'svelte-fa';
	import { faXmark } from '@fortawesome/free-solid-svg-icons';

	let dialog = $state() as HTMLDialogElement;

	$effect(() => {
		if (show) dialog.showModal();
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
	class="fixed z-50 overflow-visible border-none bg-transparent text-slate-300 shadow-lg backdrop:bg-black/60 top-8"
	bind:this={dialog}
	onclose={() => (show = false)}
	onclick={(e) => {
		if (e.target === dialog) dialog.close();
	}}
>
	<!-- svelte-ignore a11y_autofocus -->
	<button
		autofocus
		onclick={() => dialog.close()}
		class="absolute -top-8 right-0 flex h-8 w-16 items-center justify-center rounded-t-lg bg-slate-600 text-white hover:bg-slate-500 focus:outline-none active:bg-slate-600"
		><Fa icon={faXmark}></Fa></button
	>
	<div>
		{@render header?.()}
		{@render children?.()}
	</div>
</dialog>
