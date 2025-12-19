<script>
	import ToolboxButton from '$lib/components/ToolboxButton.svelte';
	import Fa from 'svelte-fa';
	import { faGamepad, faHeart } from '@fortawesome/free-solid-svg-icons';

	const { data } = $props();

	const isAdmin = $derived(() => (data.user?.data?.permissions || []).length > 0);
</script>

<div class="mb-2 flex h-8 items-center text-sm whitespace-nowrap text-slate-500 md:text-base">
	TsFreddie 的 Teeworlds 信息工具箱
</div>

<div class="mt-4">
	<img src="/logos/ddnet.svg" alt="DDNet" class="h-14" />
</div>

<div class="mt-6">
	<ToolboxButton href="/ddnet">DDNet 工具箱</ToolboxButton>
	<div class="text-semibold">查询 DDraceNetwork 相关信息</div>
</div>

<div class="mt-6">
	<ToolboxButton href="/donate"
		><Fa icon={faHeart} class="inline text-red-400" /> 捐赠支持</ToolboxButton
	>
	<div class="text-semibold">打赏与支持</div>
</div>

<div class="mt-6 h-px w-full bg-gradient-to-r from-slate-600 to-transparent"></div>

{#if isAdmin()}
	<div class="mt-6">
		<ToolboxButton href="/admin">管理工具</ToolboxButton>
		<div class="text-semibold">管理员你好，点这里使用管理工具</div>
	</div>
{/if}

<div class="mt-6">
	<ToolboxButton href="/ddnet/nouis"
		><Fa icon={faGamepad} class="inline"></Fa> 合成超大Tee</ToolboxButton
	>
	<div class="text-semibold">游玩搞怪小游戏</div>
</div>

<div class="mt-6 flex items-start">
	<div class="h-px grow bg-gradient-to-r from-slate-600 to-transparent"></div>
</div>

<div class="mt-6">
	<ToolboxButton href="https://chat.teeworlds.cn" newTab>加入社区</ToolboxButton>
	<div class="text-semibold">加入社区群聊获取游戏动态与活动消息</div>
</div>
