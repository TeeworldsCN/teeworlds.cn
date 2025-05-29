<script lang="ts">
	import type { TicketAttachmentClient } from '$lib/server/db/tickets';
	import Fa from 'svelte-fa';
	import {
		faRotateLeft,
		faRotateRight,
		faXmark,
		faSearchMinus,
		faSearchPlus
	} from '@fortawesome/free-solid-svg-icons';

	interface Props {
		attachment: TicketAttachmentClient | null;
		show: boolean;
		onClose: () => void;
	}

	let { attachment, show = $bindable(), onClose }: Props = $props();

	let rotation = $state(0);
	let scale = $state(1);
	let translateX = $state(0);
	let translateY = $state(0);
	let isDragging = $state(false);
	let lastMousePos = $state({ x: 0, y: 0 });

	let imageContainer: HTMLDivElement | null = $state(null);

	const rotateLeft = () => {
		rotation -= 90;
	};

	const rotateRight = () => {
		rotation += 90;
	};

	const zoomIn = () => {
		scale = Math.min(scale * 1.2, 5);
	};

	const zoomOut = () => {
		scale = Math.max(scale / 1.2, 0.1);
	};

	const resetView = () => {
		scale = 1;
		translateX = 0;
		translateY = 0;
		rotation = 0;
	};

	// Check if image is rotated to vertical orientation (90° or 270°)
	const isVertical = $derived(() => {
		const normalizedRotation = ((rotation % 360) + 360) % 360;
		return normalizedRotation === 90 || normalizedRotation === 270;
	});

	const handleClose = () => {
		resetView(); // Reset all transformations when closing
		onClose();
	};

	const handleBackdropClick = (e: MouseEvent) => {
		if (e.target === e.currentTarget) {
			handleClose();
		}
	};

	const handleWheel = (e: WheelEvent) => {
		e.preventDefault();

		if (!imageContainer) return;

		const rect = imageContainer.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;

		// Calculate the point in the image coordinate system before zoom
		// Since transform order is translate -> scale -> rotate, we need to account for current translation
		const centerX = rect.width / 2;
		const centerY = rect.height / 2;
		const imageX = (mouseX - centerX - translateX) / scale;
		const imageY = (mouseY - centerY - translateY) / scale;

		const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
		scale = Math.max(0.1, Math.min(5, scale * zoomFactor));

		// Adjust translation to keep the zoom centered on the mouse cursor
		translateX = mouseX - centerX - imageX * scale;
		translateY = mouseY - centerY - imageY * scale;
	};

	const handleMouseDown = (e: MouseEvent) => {
		// Only handle left click (button 0)
		if (e.button !== 0) return;

		e.preventDefault();
		isDragging = true;
		lastMousePos = { x: e.clientX, y: e.clientY };

		// Add global event listeners
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	};

	const handleDoubleClick = (e: MouseEvent) => {
		// Only handle left click (button 0)
		if (e.button !== 0) return;

		e.preventDefault();
		e.stopPropagation();

		if (scale === 1) {
			// Zoom in to 2x centered on the click point
			if (!imageContainer) return;

			const rect = imageContainer.getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;
			const centerX = rect.width / 2;
			const centerY = rect.height / 2;

			// Calculate the point in the image coordinate system
			const imageX = (mouseX - centerX - translateX) / scale;
			const imageY = (mouseY - centerY - translateY) / scale;

			scale = 2;

			// Center the zoom on the double-click point
			translateX = mouseX - centerX - imageX * scale;
			translateY = mouseY - centerY - imageY * scale;
		} else {
			// Reset to 1:1
			resetView();
		}
	};

	const handleMouseMove = (e: MouseEvent) => {
		if (!isDragging) return;

		const deltaX = e.clientX - lastMousePos.x;
		const deltaY = e.clientY - lastMousePos.y;

		// Apply the movement directly since translate happens before scale
		translateX += deltaX;
		translateY += deltaY;

		lastMousePos = { x: e.clientX, y: e.clientY };
	};

	const handleMouseUp = () => {
		isDragging = false;

		// Remove global event listeners
		document.removeEventListener('mousemove', handleMouseMove);
		document.removeEventListener('mouseup', handleMouseUp);
	};

	// Reset all transformations when attachment changes
	$effect(() => {
		if (attachment) {
			resetView();
		}
	});

	// Cleanup event listeners when component is destroyed
	$effect(() => {
		return () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};
	});
</script>

{#if show && attachment}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
		onclick={handleBackdropClick}
	>
		<!-- Image Container -->
		<div
			class="flex h-full w-full items-center justify-center overflow-hidden"
			onclick={handleBackdropClick}
			bind:this={imageContainer}
			onwheel={handleWheel}
		>
			<img
				src={`/api/tickets/download/${attachment.uuid}`}
				alt={attachment.original_filename}
				class="object-contain transition-transform duration-100 ease-out {isVertical()
					? 'max-h-[100vw] max-w-[100vh]'
					: 'max-h-full max-w-full'} {isDragging ? 'cursor-grabbing' : 'cursor-grab'}"
				style="transform: translate({translateX}px, {translateY}px) scale({scale}) rotate({rotation}deg)"
				onclick={(e) => e.stopPropagation()}
				onmousedown={handleMouseDown}
				ondblclick={handleDoubleClick}
				draggable="false"
			/>
		</div>

		<!-- Fixed Control Panel at Bottom -->
		<div
			class="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 gap-3 rounded-lg bg-black bg-opacity-75 p-3 shadow-lg backdrop-blur-sm"
		>
			<!-- Zoom Out Button -->
			<button
				onclick={zoomOut}
				class="flex h-12 w-12 items-center justify-center rounded-full bg-black bg-opacity-50 text-white transition-colors hover:bg-opacity-70"
				title="缩小"
				aria-label="缩小"
			>
				<Fa icon={faSearchMinus} />
			</button>

			<!-- Zoom In Button -->
			<button
				onclick={zoomIn}
				class="flex h-12 w-12 items-center justify-center rounded-full bg-black bg-opacity-50 text-white transition-colors hover:bg-opacity-70"
				title="放大"
				aria-label="放大"
			>
				<Fa icon={faSearchPlus} />
			</button>

			<!-- Rotate Left Button -->
			<button
				onclick={rotateLeft}
				class="flex h-12 w-12 items-center justify-center rounded-full bg-black bg-opacity-50 text-white transition-colors hover:bg-opacity-70"
				title="逆时针旋转"
				aria-label="逆时针旋转"
			>
				<Fa icon={faRotateLeft} />
			</button>

			<!-- Rotate Right Button -->
			<button
				onclick={rotateRight}
				class="flex h-12 w-12 items-center justify-center rounded-full bg-black bg-opacity-50 text-white transition-colors hover:bg-opacity-70"
				title="顺时针旋转"
				aria-label="顺时针旋转"
			>
				<Fa icon={faRotateRight} />
			</button>

			<!-- Reset View Button -->
			<button
				onclick={resetView}
				class="flex h-12 w-12 items-center justify-center rounded-full bg-black bg-opacity-50 text-white transition-colors hover:bg-opacity-70"
				title="重置视图"
				aria-label="重置视图"
			>
				<span class="text-sm font-bold">1:1</span>
			</button>

			<!-- Close Button -->
			<button
				onclick={handleClose}
				class="flex h-12 w-12 items-center justify-center rounded-full bg-black bg-opacity-50 text-white transition-colors hover:bg-opacity-70"
				title="关闭"
				aria-label="关闭"
			>
				<Fa icon={faXmark} />
			</button>
		</div>
	</div>
{/if}
