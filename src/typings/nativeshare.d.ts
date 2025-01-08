/** Custom typing for js only library nativeshare */

declare module 'nativeshare' {
	export default class NativeShare {
		constructor(options: {
			syncDescToTag?: boolean;
			syncIconToTag?: boolean;
			syncTitleToTag?: boolean;
		});
		setShareData: (data: {
			icon?: string;
			link: string;
			title: string;
			desc: string;
			from?: string;
		}) => void;
	}
}
