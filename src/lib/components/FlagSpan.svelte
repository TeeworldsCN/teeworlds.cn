<script lang="ts">
	import { flagAsset } from '$lib/ddnet/helpers';
	import { tippy } from 'svelte-tippy';
	const { flag, tooltip }: { flag: string; tooltip?: string } = $props();
</script>

<span
	use:tippy={{ content: tooltip ? tooltip : flag }}
	style="background-image: url({flagAsset(
		flag
	)}); background-size: contain; background-repeat: no-repeat; background-position: center; display: inline-block; width: 2em; height: 1em; vertical-align: middle;"
></span>
