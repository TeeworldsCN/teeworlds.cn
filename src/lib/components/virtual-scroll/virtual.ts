/**
 * Vendored from `@josesan9/svelte-virtual-scroll-list` (MIT), the Svelte 5 fork of
 * `svelte-virtual-scroll-list` by vlack:
 *   https://github.com/ArcticKeaton/svelte-virtual-scroll-list
 *
 * Local patches:
 * - fall back to the estimated size when an item's measured size is unknown, so rebuilding
 *   offsets after a data source change never produces NaN offsets (upstream rendered the
 *   whole data set after e.g. clearing a search filter)
 * - clamp the scroll offset to the virtual content, so overscrolling can't make every
 *   item render at once
 */

type DataKey<T> = (item: T, index: number) => any;
type EstimateSize<T> = (item: T) => number;

interface IParam<T> {
	slotHeaderSize: number;
	slotFooterSize: number;
	overflow: number;
	data: T[];
}

interface IRange {
	start: number;
	end: number;
	padFront: number;
	padBehind: number;
}

export class Virtual<T> {
	param: IParam<T>;
	callUpdate: (range: IRange) => void;
	currOffset = 0;
	clientHeight = 0;
	range: IRange;
	/** array of sizes for each container */
	sizes = new Map<any, number>();
	/** array of offsets for each container */
	offsets: number[];
	keyFn: DataKey<T>;
	estimateSize: EstimateSize<T>;

	constructor(
		param: IParam<T>,
		callUpdate: typeof this.callUpdate,
		keyFn: DataKey<T>,
		estimateSize: number | EstimateSize<T>
	) {
		// param data
		this.param = param;
		this.callUpdate = callUpdate;
		this.keyFn = keyFn;
		this.estimateSize = estimateSize instanceof Function ? estimateSize : () => estimateSize;

		// size data
		this.sizes = new Map();
		this.offsets = [];
		this.param.data.forEach((d, i) => {
			this.sizes.set(this.keyFn(d, i), this.estimateSize(d));
		});
		this.rebuildOffsets();

		this.range = Object.create({ start: -1, end: -1, padFront: 0, padBehind: 0 });
	}

	// return current render range
	getRange() {
		return { ...this.range };
	}

	// return start index offset
	getOffset(start: number) {
		return (start < 1 ? 0 : this.getIndexOffset(start)) + this.param.slotHeaderSize;
	}

	updateParam<K extends keyof IParam<T>>(key: K, value: IParam<T>[K]) {
		if (this.param && key in this.param) {
			this.param[key] = value;
			// if data change, find out deleted id and remove from size map
			if (key === 'data') {
				const ids = (value as T[]).map((d, i) => this.keyFn(d, i));
				this.sizes.forEach((v, sizeKey) => {
					if (!ids.includes(sizeKey)) {
						this.sizes.delete(sizeKey);
					}
				});
				this.rebuildOffsets();
				this.handleScroll(this.currOffset, this.clientHeight, true);
			}
		}
	}

	// save each size map by id
	saveSize(id: any, size: number) {
		if (this.sizes.get(id) === size) {
			return;
		}
		this.sizes.set(id, size);
		this.rebuildOffsets(this.param.data.findIndex((d, i) => this.keyFn(d, i) === id));
	}

	// calculating range on scroll
	handleScroll(offset: number, clientHeight: number, forceUpdate = false) {
		this.currOffset = offset;
		this.clientHeight = clientHeight;

		const lastIndex = this.param.data.length - 1;
		if (lastIndex < 0) {
			this.updateRange(0, 0, forceUpdate);
			return;
		}

		// clamp so a scroll past the content can't compute indexes outside of the data
		offset = Math.min(Math.max(offset, 0), this.offsets[lastIndex] ?? 0);

		let startIndex = Math.max(
			this.offsets.findIndex((o) => o >= offset) - 1 - this.param.overflow,
			0
		);
		let endIndex = this.offsets.findIndex((o) => o >= offset + clientHeight);
		if (endIndex === -1) {
			endIndex = lastIndex;
		} else if (endIndex < startIndex) {
			endIndex = startIndex;
		}
		endIndex = Math.min(endIndex + this.param.overflow, lastIndex);
		this.updateRange(startIndex, endIndex, forceUpdate);
	}

	// ----------- public method end -----------

	// rebuilds the offset array
	rebuildOffsets(startIndex?: number) {
		if (this.param.data.length === 0) {
			this.offsets = [0];
			return;
		}
		if (startIndex === undefined) {
			this.offsets = [0];
			startIndex = 0;
		}
		if (startIndex < 0 || startIndex >= this.param.data.length) {
			return;
		}
		let lastOffset = this.offsets[startIndex] ?? 0;
		for (let i = startIndex + 1; i < this.param.data.length; i++) {
			const previous = this.param.data[i - 1];
			lastOffset += this.sizes.get(this.keyFn(previous, i - 1)) ?? this.estimateSize(previous);
			this.offsets[i] = lastOffset;
		}
		this.offsets.length = this.param.data.length;
	}

	// return a scroll offset from given index, can efficiency be improved more here?
	// although the call frequency is very high, its only a superposition of numbers
	getIndexOffset(givenIndex: number) {
		if (!givenIndex) {
			return 0;
		}

		return this.offsets[givenIndex] ?? 0;
	}

	// setting to a new range and rerender
	updateRange(start: number, end: number, forceUpdate = false) {
		if (!forceUpdate && start === this.range.start && end === this.range.end) return;
		this.range.start = start;
		this.range.end = end;
		this.range.padFront = this.getPadFront();
		this.range.padBehind = this.getPadBehind();
		this.callUpdate(this.range);
	}

	// return total front offset
	getPadFront() {
		return this.offsets[this.range.start] ?? 0;
	}

	// return total behind offset
	getPadBehind() {
		const lastIndex = this.param.data.length - 1;
		if (this.range.end >= lastIndex) {
			return 0;
		}
		const lastItem = this.param.data[lastIndex];
		const lastSize = this.sizes.get(this.keyFn(lastItem, lastIndex)) ?? this.estimateSize(lastItem);
		return (this.offsets[lastIndex] ?? 0) + lastSize - (this.offsets[this.range.end + 1] ?? 0);
	}
}

export function isBrowser() {
	return typeof document !== 'undefined';
}
