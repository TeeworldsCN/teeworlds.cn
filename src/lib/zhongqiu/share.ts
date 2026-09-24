/**
 * 中秋博饼的分享口径(复制文案 / 海报 / 二维码)。
 *
 * 链接只在这里写一次:复制文本、海报上的二维码、海报底部的网址都读它 ——
 * 之前二维码是构建期生成的一张静态图,链接改了图不会跟着变,所以生成脚本
 * (tools/zhongqiu/make-poster-assets.ts)也从这里读。
 */

export const ZQ_SHARE_URL = 'https://teeworlds.cn/minigames/zhongqiu';
export const ZQ_SHARE_TITLE = '中秋博饼大会';

/**
 * 文案的**正文**部分(到「你也来试试吧」结束,不带冒号也不带链接)。
 *
 * 拆成这样是为了弹窗里那行预览:预览要省掉链接,但**不能把标点留在半空**
 * (「你也来试试吧：」后面没东西,看着像被截断了)。所以正文自己收尾,
 * 「：+ 链接」由下面两个函数各自拼 —— 复制给全文,预览只给正文。
 *
 * `cleared` 是**闯过的关数**(倒在第 N 关 → 闯过 N−1 关,和结算屏「倒在了第 N 关」同一口径);
 * 数字用千分位(和页面上 formatScore 一致),免得 12345 和 12,345 两种写法对不上。
 */
export const buildShareBody = (cleared: number, score: number) =>
	`我在中秋博饼大会中成功闯过 ${cleared} 关，总分：${score.toLocaleString('zh-CN')}。你也来试试吧`;

/** 「复制文本」的内容:正文 + 链接(链接前的「：」在这里) */
export const buildShareText = (cleared: number, score: number) =>
	`${buildShareBody(cleared, score)}：${ZQ_SHARE_URL}`;

/** 弹窗里的预览:只给正文(链接在下面那行小字里,复制时会自动带上) */
export const buildShareTextPreview = (cleared: number, score: number) =>
	buildShareBody(cleared, score);

/**
 * 拷进剪贴板。优先 navigator.clipboard(https / localhost 才有),
 * 老浏览器 / 非安全上下文退回 textarea + execCommand —— 返回是否成功,
 * 调用方据此弹「已复制」还是「复制失败,手动选吧」。
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		// 落到下面的兜底
	}
	try {
		const area = document.createElement('textarea');
		area.value = text;
		// 别让页面跟着滚(移动端 focus 会把整页顶上去)
		area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
		area.setAttribute('readonly', '');
		document.body.append(area);
		area.select();
		area.setSelectionRange(0, text.length);
		const ok = document.execCommand('copy');
		area.remove();
		return ok;
	} catch {
		return false;
	}
};

/** 触发一次下载(blob → <a download>);不支持的浏览器退化成新窗口打开 */
export const downloadBlob = (blob: Blob, filename: string) => {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.rel = 'noopener';
	document.body.append(a);
	a.click();
	a.remove();
	// 立刻 revoke 有些浏览器会把下载掐掉,给一拍再收
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
