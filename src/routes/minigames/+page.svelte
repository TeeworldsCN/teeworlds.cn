<script>
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import ToolboxButton from '$lib/components/ToolboxButton.svelte';
	import Fa from 'svelte-fa';
	import { faArrowLeft, faDice, faGamepad } from '@fortawesome/free-solid-svg-icons';
</script>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ text: '小游戏', title: '小游戏' }
	]}
/>

<div class="mt-6 grid gap-6 md:grid-cols-2">
	<div class="rounded-lg border border-slate-600 p-6">
		<div>
			<ToolboxButton href="/minigames/zhongqiu"
				><Fa icon={faDice} class="inline text-amber-400"></Fa> 中秋博饼大会</ToolboxButton
			>
			<div class="text-semibold">带上你的 Tee 掷骰博月饼，一路过关冲榜</div>
		</div>
	</div>

	<div class="rounded-lg border border-slate-600 p-6">
		<div>
			<ToolboxButton href="/minigames/nouis"
				><Fa icon={faGamepad} class="inline"></Fa> 合成超大Tee</ToolboxButton
			>
			<div class="text-semibold">合成系小游戏：把 Tee 越合越大</div>
		</div>
	</div>
</div>

<div class="mt-6 text-sm text-slate-400">游玩 Tee 主题相关的小游戏</div>

<div class="mt-6">
	<ToolboxButton href="/"><Fa icon={faArrowLeft} class="inline"></Fa> 返回首页</ToolboxButton>
</div>
