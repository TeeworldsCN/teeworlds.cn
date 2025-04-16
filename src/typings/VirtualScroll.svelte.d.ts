/** Custom typing for svelte-virtual-scroll-list, this helps with child items' typing */

declare module 'svelte-virtual-scroll-list' {
	/** @typedef {typeof __propDef.props}  VirtualScrollProps */
	/** @typedef {typeof __propDef.events}  VirtualScrollEvents */
	/** @typedef {typeof __propDef.slots}  VirtualScrollSlots */
	export default class VirtualScroll<T> extends SvelteComponentTyped<
		{
			data: T[];
			keeps?: number | undefined;
			key?: keyof T | undefined;
			estimateSize?: number | undefined;
			isHorizontal?: boolean | undefined;
			start?: number | undefined;
			offset?: number | undefined;
			pageMode?: boolean | undefined;
			topThreshold?: number | undefined;
			bottomThreshold?: number | undefined;
			getSize?: ((id: number) => number) | undefined;
			getSizes?: (() => number) | undefined;
			getOffset?: (() => number) | undefined;
			getClientSize?: (() => number) | undefined;
			getScrollSize?: (() => number) | undefined;
			updatePageModeFront?: (() => void) | undefined;
			scrollToOffset?: ((offset: number) => void) | undefined;
			scrollToIndex?: ((index: number) => void) | undefined;
			scrollToBottom?: (() => void) | undefined;
		},
		{
			scroll: CustomEvent<any>;
			top: CustomEvent<any>;
			bottom: CustomEvent<any>;
		} & {
			[evt: string]: CustomEvent<any>;
		},
		{
			header: {};
			default: {
				data: T;
				index: any;
			};
			footer: {};
		}
	> {
		get getSize(): (id: number) => number;
		get getSizes(): () => number;
		get getOffset(): () => number;
		get getClientSize(): () => number;
		get getScrollSize(): () => number;
		get updatePageModeFront(): () => void;
		get scrollToOffset(): (offset: number) => void;
		get scrollToIndex(): (index: number) => void;
		get scrollToBottom(): () => void;
	}
	export type VirtualScrollProps = typeof __propDef.props;
	export type VirtualScrollEvents = typeof __propDef.events;
	export type VirtualScrollSlots = typeof __propDef.slots;
	import { SvelteComponentTyped } from 'svelte';
	const __propDef: {
		props: {
			data: Array<any>;
			keeps?: number | undefined;
			key?: string | undefined;
			estimateSize?: number | undefined;
			isHorizontal?: boolean | undefined;
			start?: number | undefined;
			offset?: number | undefined;
			pageMode?: boolean | undefined;
			topThreshold?: number | undefined;
			bottomThreshold?: number | undefined;
			getSize?: ((id: number) => number) | undefined;
			getSizes?: (() => number) | undefined;
			getOffset?: (() => number) | undefined;
			getClientSize?: (() => number) | undefined;
			getScrollSize?: (() => number) | undefined;
			updatePageModeFront?: (() => void) | undefined;
			scrollToOffset?: ((offset: number) => void) | undefined;
			scrollToIndex?: ((index: number) => void) | undefined;
			scrollToBottom?: (() => void) | undefined;
		};
		events: {
			scroll: CustomEvent<any>;
			top: CustomEvent<any>;
			bottom: CustomEvent<any>;
		} & {
			[evt: string]: CustomEvent<any>;
		};
		slots: {
			header: {};
			default: {
				data: any;
				index: any;
			};
			footer: {};
		};
	};
	export {};
}
