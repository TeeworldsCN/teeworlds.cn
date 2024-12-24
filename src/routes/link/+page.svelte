<!-- 若为不支持跳转的平台则提示复制链接 -->
<script>
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { share } from '$lib/share';

	afterNavigate(() => {
		share(
			{
				icon: `${window.location.origin}/shareicon.png`,
				link: window.location.href,
				title: '分享链接',
				desc: page.url.searchParams.get('ref') || ''
			},
			'layout'
		);
	});
</script>

<p class="mb-8 mt-8 text-lg">您正在访问外部链接，请分享到浏览器中打开</p>

<p class="mb-2 mt-8 text-lg">或者您也可以手动复制链接：</p>
<code class="mx-3 text-white">{page.url.searchParams.get('ref')}</code>
