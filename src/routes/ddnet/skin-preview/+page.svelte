<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import SkinPreview from '$lib/components/SkinPreview.svelte';
</script>

<svelte:head>
	<meta property="og:title" content="DDNet 皮肤预览 - TeeworldsCN" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://teeworlds.cn/ddnet/skin-preview" />
	<meta property="og:description" content="上传自定义 DDNet 皮肤图片并预览游戏内效果" />
	<meta property="og:image" content="https://teeworlds.cn/shareicon.png" />
	<meta name="title" content="DDNet 皮肤预览 - TeeworldsCN" />
	<meta name="description" content="上传自定义 DDNet 皮肤图片并预览游戏内效果" />
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ href: '/ddnet', text: 'DDNet' },
		{ text: '皮肤预览', title: 'DDNet 皮肤预览' }
	]}
/>

<div class="mt-4">
	<SkinPreview />
</div>
