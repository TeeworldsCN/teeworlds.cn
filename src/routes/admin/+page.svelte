<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import TeeRender from '$lib/components/TeeRender.svelte';
	import ToolboxButton from '$lib/components/ToolboxButton.svelte';
	import { encodeAsciiURIComponent } from '$lib/link.js';
	import { type PERMISSIONS } from '$lib/types.js';
	import qrcode from 'qrcode';
	import { onMount } from 'svelte';

	const { data } = $props();

	const hasPermission = (perm: (typeof PERMISSIONS)[number]) =>
		(data.user?.data?.permissions || []).some(
			(permission) => permission == perm || permission == 'SUPER'
		);

	let qrCode = $state('');

	async function generateQRCode() {
		qrCode = await qrcode.toDataURL(
			`https://teeworlds.cn/goto#p${encodeAsciiURIComponent('1人2人3人4人')}`,
			{ scale: 4, errorCorrectionLevel: 'L' }
		);
	}

	onMount(generateQRCode);
</script>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ text: '管理工具', title: '管理工具' }
	]}
/>

{#if hasPermission('SUPER')}
	<div class="mt-6">
		<ToolboxButton href="/admin/users">用户管理</ToolboxButton>
		<div class="text-semibold">管理用户和权限</div>
	</div>

	<div class="mt-6">
		<ToolboxButton href="/admin/subs">订阅管理</ToolboxButton>
		<div class="text-semibold">管理机器人自动发布消息的订阅功能</div>
	</div>

	<div class="mt-6">
		<ToolboxButton href="/admin/wechat-menu">微信菜单管理</ToolboxButton>
		<div class="text-semibold">管理微信公众号的自定义菜单</div>
	</div>

	<div class="mt-6">
		<ToolboxButton href="/admin/wechat-materials">微信素材管理</ToolboxButton>
		<div class="text-semibold">管理微信公众号的永久素材</div>
	</div>
{/if}

{#if hasPermission('TICKETS')}
	<div class="mt-6">
		<ToolboxButton href="/admin/tickets">反馈和举报管理</ToolboxButton>
		<div class="text-semibold">管理反馈和举报</div>
	</div>
{/if}

{#if hasPermission('POSTING')}
	<div class="mt-6">
		<ToolboxButton href="/admin/qq-threads">QQ 机器人发帖</ToolboxButton>
		<div class="text-semibold">使用机器人在 QQ 频道发布帖子</div>
	</div>
{/if}

{#if hasPermission('CHANNEL_SETTINGS')}
	<div class="mt-6">
		<ToolboxButton href="/admin/roles">角色管理</ToolboxButton>
		<div class="text-semibold">管理频道中的角色</div>
	</div>
{/if}

<div class="relative inline-block">
	<TeeRender name="ahl_WarfoxOrangeGlow" body={11730831} feet={11927397} className="h-[64px] w-[64px] absolute inline-block" />
	<img
		class="-left-[6px] top-0 inline-block align-bottom"
		src={'/api/images/points'}
		alt="QR Code"
	/>
</div>
