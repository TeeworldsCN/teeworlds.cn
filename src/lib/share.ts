import { browser } from '$app/environment';
import type NativeShare from 'nativeshare';

let nativeShare: NativeShare | null = null;

if (browser) {
	(async () => {
		// nativeshare is a CJS (UMD) package: depending on the bundler interop the
		// constructor is either the module default or the default of the default
		const mod = (await import('nativeshare')).default as unknown as
			typeof NativeShare | { default: typeof NativeShare };
		const NativeShareClass = typeof mod === 'function' ? mod : mod?.default;
		if (typeof NativeShareClass === 'function') {
			nativeShare = new NativeShareClass({});
		}
	})();
}

interface ShareOptions {
	icon?: string;
	link: string;
	title: string;
	desc: string;
	from?: string;
}

let lastShare: ShareOptions = { link: '', title: '', desc: '' };
let timeout: Timer | null = null;

let sharePriority = 'layout';

export const share = (options: ShareOptions, priority: 'layout' | 'page' = 'page') => {
	if (priority === 'page') {
		sharePriority = 'page';
	} else if (sharePriority === 'page') {
		// cancel layout share when page share is triggered
		return;
	}

	// compare with last share data, if same, do nothing
	const changed = Object.keys(options).some(
		(key) => (options as any)[key] !== (lastShare as any)[key]
	);

	if (changed) {
		if (timeout) clearTimeout(timeout);
		timeout = setTimeout(() => {
			lastShare = options;
			if (nativeShare) {
				console.log(`当前标题：${options.title}`);
				console.log(`当前描述：${options.desc}`);
				if (options.icon) console.log(`当前图标：${options.icon}`);
				nativeShare.setShareData(options);
			}
			if (timeout) clearTimeout(timeout);
		}, 100);
	}
};

export const resetShare = () => {
	sharePriority = 'layout';
};
