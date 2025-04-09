<script lang="ts">
	import ErrorPage from '$lib/components/ErrorPage.svelte';
</script>

<ErrorPage
	errorMessages={{
		404: '未找到相关玩家',
		500: '服务器出问题了，请稍后重试'
	}}
/>
