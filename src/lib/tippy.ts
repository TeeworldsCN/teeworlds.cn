import {
	computePosition,
	flip,
	shift,
	offset,
	arrow,
	autoUpdate,
	type Placement
} from '@floating-ui/dom';

/**
 * Tooltip properties interface compatible with the original tippy.js API
 */
export interface TippyProps {
	content?: string;
	placement?: Placement;
	offset?: number | [number, number];
	hideOnClick?: boolean;
	arrow?: boolean;
	delay?: number | [number, number];
	interactive?: boolean;
	maxWidth?: number | string;
	zIndex?: number;
	appendTo?: Element | 'parent';
	touch?: 'tap' | 'hold';
}

export interface TippyReturn {
	update: (newProps: TippyProps) => void;
	destroy: () => void;
}

export type Tippy = (element: HTMLElement, props?: TippyProps) => TippyReturn;

/**
 * Svelte action for rendering tooltips using Floating UI
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import {tippy} from '$lib/tippy';
 * </script>
 * <button use:tippy={{content: 'Test'}}>Test</button>
 * <button use:tippy={{content: 'Hold me', touch: 'hold'}}>Hold</button>

 * ```
 * @param element The element to target (omitted with use)
 * @param props Tooltip properties
 * @param props.touch Touch interaction mode: 'tap' (default) or 'hold'
 */
export const tippy: Tippy = (element, props = {}) => {
	let tooltipElement: HTMLElement | null = null;
	let contentElement: HTMLElement | null = null;
	let arrowElement: HTMLElement | null = null;
	let cleanup: (() => void) | null = null;
	let isVisible = false;
	let currentProps = { arrow: true, appendTo: 'parent', touch: 'tap', ...props };
	let appendTo: Element | null = null;

	// Touch-specific state
	let activePointerId: number | null = null;

	const createTooltip = () => {
		if (tooltipElement) return tooltipElement;

		tooltipElement = document.createElement('div');
		tooltipElement.setAttribute('role', 'tooltip');
		tooltipElement.className = 'floating-tooltip';

		// Create content container
		contentElement = document.createElement('div');
		contentElement.className = 'floating-tooltip-content';
		tooltipElement.appendChild(contentElement);

		// Apply custom styles if provided
		if (currentProps.maxWidth) {
			tooltipElement.style.maxWidth =
				typeof currentProps.maxWidth === 'number'
					? currentProps.maxWidth + 'px'
					: currentProps.maxWidth;
		}
		if (currentProps.zIndex) {
			tooltipElement.style.zIndex = currentProps.zIndex.toString();
		}
		if (currentProps.interactive) {
			tooltipElement.classList.add('interactive');
		}

		// Add arrow by default (unless explicitly disabled)
		if (currentProps.arrow !== false) {
			arrowElement = document.createElement('div');
			arrowElement.className = 'floating-tooltip-arrow';
			tooltipElement.appendChild(arrowElement);
		}

		appendTo =
			currentProps.appendTo === 'parent'
				? element.parentElement
				: currentProps.appendTo instanceof Element
					? currentProps.appendTo
					: document.body;
		appendTo?.appendChild(tooltipElement);

		return tooltipElement;
	};

	const updatePosition = async () => {
		if (!tooltipElement || !isVisible) return;

		const middleware = [
			offset(
				typeof currentProps.offset === 'number'
					? currentProps.offset
					: Array.isArray(currentProps.offset)
						? currentProps.offset[1]
						: 8
			),
			flip(),
			shift({ padding: 8 })
		];

		if (arrowElement) {
			middleware.push(arrow({ element: arrowElement }));
		}

		const { x, y, placement, middlewareData } = await computePosition(element, tooltipElement, {
			placement: currentProps.placement || 'top',
			middleware
		});

		Object.assign(tooltipElement.style, {
			left: `${x}px`,
			top: `${y}px`
		});

		// Set placement data attribute for CSS styling
		tooltipElement.setAttribute('data-placement', placement);

		// Set transform-origin based on placement for scale animations
		let transformOrigin = '50% 50%'; // default center

		if (placement.startsWith('top')) {
			transformOrigin = '50% 100%'; // scale from bottom edge (closest to target)
		} else if (placement.startsWith('bottom')) {
			transformOrigin = '50% 0%'; // scale from top edge
		} else if (placement.startsWith('left')) {
			transformOrigin = '100% 50%'; // scale from right edge
		} else if (placement.startsWith('right')) {
			transformOrigin = '0% 50%'; // scale from left edge
		}

		tooltipElement.style.transformOrigin = transformOrigin;

		if (arrowElement && middlewareData.arrow) {
			const { x: arrowX, y: arrowY } = middlewareData.arrow;

			// Position the arrow based on floating-ui calculations
			Object.assign(arrowElement.style, {
				left: arrowX != null ? `${arrowX}px` : '',
				top: arrowY != null ? `${arrowY}px` : ''
			});
		}
	};

	const show = () => {
		const delay = Array.isArray(currentProps.delay)
			? currentProps.delay[0]
			: currentProps.delay || 0;

		const tooltip = createTooltip();
		// Start auto-update for position tracking
		cleanup = autoUpdate(element, tooltip, updatePosition);

		window.setTimeout(() => {
			isVisible = true;
			if (currentProps.content && contentElement) {
				contentElement.textContent = currentProps.content;
			}
			// Show with animation
			tooltip.classList.add('visible');
			updatePosition();
		}, delay);
	};

	const hide = () => {
		const delay = Array.isArray(currentProps.delay) ? currentProps.delay[1] : 0;

		if (!tooltipElement) return;

		const tooltip = tooltipElement;
		tooltipElement = null;
		contentElement = null;
		arrowElement = null;

		const cleanupCall = cleanup;
		cleanup = null;

		window.setTimeout(() => {
			isVisible = false;
			tooltip.classList.remove('visible');
			// Remove after animation
			setTimeout(() => {
				if (tooltip) {
					tooltip.remove();
					if (cleanupCall) {
						cleanupCall();
					}
				}
			}, 200);
		}, delay);
	};

	const handleMouseEnter = () => {
		// Don't show on mouse enter if we're in tap mode and already visible from touch
		if (currentProps.touch === 'tap' && isVisible) return;
		show();
	};
	const handleMouseLeave = () => {
		if (!currentProps.interactive) {
			hide();
		}
	};
	const handleFocus = () => show();
	const handleBlur = () => {
		if (currentProps.touch !== 'tap') {
			hide();
		}
	};
	const handleClick = () => {
		if (currentProps.hideOnClick !== false && currentProps.touch !== 'tap') {
			hide();
		}
	};

	// Touch event handlers
	const handlePointerDown = (ev: PointerEvent) => {
		// Only handle touch events, let mouse events use existing handlers
		if (ev.pointerType !== 'touch') return;

		// Prevent multiple touch interactions
		if (activePointerId !== null) return;

		activePointerId = ev.pointerId;

		if (currentProps.touch === 'tap') {
			show();
		} else if (currentProps.touch === 'hold') {
			// Show immediately when starting to hold
			show();
		}
	};

	const handlePointerUp = (ev: PointerEvent) => {
		if (ev.pointerId !== activePointerId) return;

		if (currentProps.touch === 'tap') {
			// For tap mode, do nothing - tooltip stays visible until tapping elsewhere
			// The hide will be handled by document pointer listener
		} else if (currentProps.touch === 'hold') {
			// Hide immediately when releasing hold
			hide();
		}

		activePointerId = null;
	};

	const handlePointerCancel = (ev: PointerEvent) => {
		if (ev.pointerId !== activePointerId) return;

		hide();
		activePointerId = null;
	};

	// Document-level handler for tap mode to hide when tapping elsewhere
	const handleDocumentPointerDown = (ev: PointerEvent) => {
		if (ev.pointerType !== 'touch' || currentProps.touch !== 'tap') return;
		if (!isVisible || !tooltipElement) return;

		// Check if the touch is outside the tooltip and trigger element
		const target = ev.target as Element;
		if (!element.contains(target) && !tooltipElement.contains(target)) {
			hide();
		}
	};

	// Add event listeners
	element.addEventListener('mouseenter', handleMouseEnter);
	element.addEventListener('mouseleave', handleMouseLeave);
	element.addEventListener('focus', handleFocus);
	element.addEventListener('blur', handleBlur);
	element.addEventListener('click', handleClick);

	// Add touch event listeners
	element.addEventListener('pointerdown', handlePointerDown);
	element.addEventListener('pointerup', handlePointerUp);
	element.addEventListener('pointercancel', handlePointerCancel);

	// Add document listener for tap mode
	if (currentProps.touch === 'tap') {
		document.addEventListener('pointerdown', handleDocumentPointerDown);
	}

	const update = (newProps: TippyProps) => {
		const oldTouch = currentProps.touch;
		currentProps = { ...currentProps, ...newProps };

		// Handle touch mode changes
		if (newProps.touch && newProps.touch !== oldTouch) {
			// Remove old document listener
			document.removeEventListener('pointerdown', handleDocumentPointerDown);

			// Add new document listener if needed
			if (currentProps.touch === 'tap') {
				document.addEventListener('pointerdown', handleDocumentPointerDown);
			}
		}

		if (isVisible && contentElement && currentProps.content) {
			contentElement.textContent = currentProps.content;
			updatePosition();
		}
	};

	const destroy = () => {
		hide();

		// Clean up touch-specific state
		activePointerId = null;

		// Remove mouse event listeners
		element.removeEventListener('mouseenter', handleMouseEnter);
		element.removeEventListener('mouseleave', handleMouseLeave);
		element.removeEventListener('focus', handleFocus);
		element.removeEventListener('blur', handleBlur);
		element.removeEventListener('click', handleClick);

		// Remove touch event listeners
		element.removeEventListener('pointerdown', handlePointerDown);
		element.removeEventListener('pointerup', handlePointerUp);
		element.removeEventListener('pointercancel', handlePointerCancel);

		// Remove document listener
		document.removeEventListener('pointerdown', handleDocumentPointerDown);

		// Remove instance reference
		delete (element as any)._tippyInstance;
		isVisible = false;
	};

	const instance = {
		update,
		destroy
	};

	// Store instance on element for compatibility
	(element as any)._tippyInstance = instance;

	return instance;
};

export type CreateTippy = (defaultProps: TippyProps) => Tippy;

/**
 * Create a tippy function with default properties
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import {createTippy} from '$lib/tippy';
 *   const myTippy = createTippy({
 *     arrow: false,
 *     offset: 10,
 *     placement: 'top'
 *   });
 * </script>
 * <button use:myTippy={{content: 'Test'}}>Test</button>
 * ```
 * @param defaultProps The default properties to apply to all tooltips
 * @returns A tippy function with the default properties applied
 */
export const createTippy: CreateTippy = (defaultProps) => (element, props) =>
	tippy(element, { ...defaultProps, ...props });

/**
 * Alert properties interface
 */
export interface AlertProps {
	message: string;
	duration?: number; // Duration in milliseconds, default 3000
	type?: 'info' | 'success' | 'warning' | 'error'; // Alert type for styling
	attachTo?: HTMLElement; // Element to attach the alert container to
}

/**
 * Show a popup alert in the top right corner of the page or attached element
 * Multiple alerts will stack vertically
 *
 * @example
 * ```ts
 * import { alert } from '$lib/tippy';
 *
 * alert({ message: 'Hello world!' });
 * alert({ message: 'Success!', type: 'success', duration: 5000 });
 * alert({ message: 'Error!', type: 'error', attachTo: document.getElementById('my-component') });
 * ```
 *
 * @param props Alert properties
 */
export const alert = (props: AlertProps) => {
	const { message, duration = 3000, type = 'info', attachTo } = props;

	// Create alert container if it doesn't exist
	const containerId = attachTo ? `alert-container-${attachTo.id || 'attached'}` : 'alert-container';
	let container = document.getElementById(containerId);
	if (!container) {
		container = document.createElement('div');
		container.id = containerId;

		if (attachTo) {
			// Position relative to the attached element
			container.className =
				'fixed bottom-4 right-4 z-[10000] flex flex-col gap-2 pointer-events-none';
			attachTo.appendChild(container);
		} else {
			// Global positioning
			container.className =
				'fixed bottom-4 right-4 z-[10000] flex flex-col gap-2 pointer-events-none';
			document.body.appendChild(container);
		}
	}

	// Create alert element
	const alertElement = document.createElement('div');
	alertElement.className = `
		alert-item pointer-events-auto
		bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg
		px-4 py-3 max-w-sm min-w-64 
		motion-translate-x-in-[100%] motion-duration-300 motion-preset-shake 
		${type === 'success' ? 'border-green-500/50 bg-green-950/50' : ''}
		${type === 'warning' ? 'border-yellow-500/50 bg-yellow-950/50' : ''}
		${type === 'error' ? 'border-red-500/50 bg-red-950/50' : ''}
		${type === 'info' ? 'border-blue-500/50 bg-blue-950/50' : ''}
	`
		.replace(/\s+/g, ' ')
		.trim();

	// Create message content
	const messageElement = document.createElement('div');
	messageElement.className = 'text-sm text-zinc-200';
	messageElement.textContent = message;
	alertElement.appendChild(messageElement);

	// Add type indicator if not info
	if (type !== 'info') {
		const indicator = document.createElement('div');
		indicator.className = `
			absolute top-2 right-2 w-2 h-2 rounded-full
			${type === 'success' ? 'bg-green-500' : ''}
			${type === 'warning' ? 'bg-yellow-500' : ''}
			${type === 'error' ? 'bg-red-500' : ''}
		`
			.replace(/\s+/g, ' ')
			.trim();
		alertElement.appendChild(indicator);
	}

	// Add to container (prepend to stack newest at bottom)
	container.appendChild(alertElement);

	// Auto-hide after duration
	const hideTimeout = setTimeout(() => {
		hideAlert(alertElement);
	}, duration);

	// Add click to dismiss
	alertElement.addEventListener('click', () => {
		clearTimeout(hideTimeout);
		hideAlert(alertElement);
	});

	return {
		hide: () => {
			clearTimeout(hideTimeout);
			hideAlert(alertElement);
		}
	};
};

/**
 * Hide an alert with animation
 */
const hideAlert = (alertElement: HTMLElement) => {
	const container = alertElement.parentElement;
	alertElement.remove();

	// Clean up container if empty
	if (container && container.children.length === 0) {
		container.remove();
	}
};
