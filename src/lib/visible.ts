/**
 * 「元素进入视口(或接近视口)时回调一次」。
 *
 * 用途:图鉴一屏上百张卡,每张都要拉一份皮肤 —— 打开就全下会瞬间打出上百个请求。
 * 交给这个函数,滚到哪加载哪。
 *
 * 优先用 `IntersectionObserver`(祖先滚动区、祖先裁剪都算在内,不用自己监听滚动)。
 * 环境里没有它(老浏览器 / 被裁剪过的测试环境),就退回手写检测:
 * 一开始量一次,之后监听 `scroll`(捕获阶段 —— 内层滚动容器的滚动不会冒泡到 window)
 * 和 `resize`,每次用 `getBoundingClientRect()` 和视口比对;命中即回调并解绑。
 *
 * 返回「取消」函数:组件销毁时调用(回调已经触发过就什么都不做)。
 */
export const whenVisible = (
	el: Element,
	cb: () => void,
	/** 提前多少像素开始加载(视口外这一圈内也算「快看见了」) */
	margin = 200
): (() => void) => {
	let done = false;
	let disconnect = () => {};

	const fire = () => {
		if (done) return;
		done = true;
		disconnect();
		cb();
	};

	if (typeof IntersectionObserver !== 'undefined') {
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) fire();
			},
			{ rootMargin: `${margin}px 0px` }
		);
		io.observe(el);
		disconnect = () => io.disconnect();
	} else {
		// 手写检测:rAF 合并同一帧里的多次 scroll/resize
		let raf = 0;
		const check = () => {
			raf = 0;
			if (done) return;
			const r = el.getBoundingClientRect();
			if (r.width === 0 && r.height === 0) return; // 还没渲染出来
			const vw = window.innerWidth || document.documentElement.clientWidth;
			const vh = window.innerHeight || document.documentElement.clientHeight;
			if (r.bottom > -margin && r.top < vh + margin && r.right > -margin && r.left < vw + margin)
				fire();
		};
		const schedule = () => {
			if (!raf) raf = requestAnimationFrame(check);
		};
		check(); // 挂上就先量一次(打开图鉴时可见的那几张要马上出来)
		window.addEventListener('scroll', schedule, { capture: true, passive: true });
		window.addEventListener('resize', schedule);
		disconnect = () => {
			if (raf) cancelAnimationFrame(raf);
			window.removeEventListener('scroll', schedule, { capture: true });
			window.removeEventListener('resize', schedule);
		};
	}

	return () => {
		done = true;
		disconnect();
	};
};
