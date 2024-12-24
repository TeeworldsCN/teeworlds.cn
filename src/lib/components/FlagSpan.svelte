<script lang="ts">
	import { flagAsset } from '$lib/ddnet/helpers';
	const { flag, title }: { flag: string; title?: string } = $props();
</script>

<span
	title={title ? title : flag}
	style="background-image: url({flagAsset(
		flag
	)}); background-size: contain; background-repeat: no-repeat; background-position: center; display: inline-block; width: 2em; height: 1em; vertical-align: middle;"
></span>
