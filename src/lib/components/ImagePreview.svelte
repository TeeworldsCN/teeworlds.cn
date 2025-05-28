<script lang="ts">
	import type { TicketAttachmentClient } from '$lib/server/db/tickets';
	import Fa from 'svelte-fa';
	import { faRotateLeft, faRotateRight, faXmark } from '@fortawesome/free-solid-svg-icons';

	interface Props {
		attachment: TicketAttachmentClient | null;
		show: boolean;
		onClose: () => void;
	}

	let { attachment, show = $bindable(), onClose }: Props = $props();

	let rotation = $state(0);

	const rotateLeft = () => {
		rotation -= 90;
	};

	const rotateRight = () => {
		rotation += 90;
	};

	// Check if image is rotated to vertical orientation (90° or 270°)
	const isVertical = $derived(() => {
		const normalizedRotation = ((rotation % 360) + 360) % 360;
		return normalizedRotation === 90 || normalizedRotation === 270;
	});

	const handleClose = () => {
		rotation = 0; // Reset rotation when closing
		onClose();
	};

	const handleBackdropClick = (e: MouseEvent) => {
		if (e.target === e.currentTarget) {
			handleClose();
		}
	};

	// Reset rotation when attachment changes
	$effect(() => {
		if (attachment) {
			rotation = 0;
		}
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
		<div class="flex h-full w-full items-center justify-center" onclick={handleBackdropClick}>
			<img
				src={`/api/tickets/download/${attachment.uuid}`}
				alt={attachment.original_filename}
				class="object-contain transition-transform duration-300 {isVertical()
					? 'max-h-[100vw] max-w-[100vh]'
					: 'max-h-full max-w-full'}"
				style="transform: rotate({rotation}deg)"
				onclick={(e) => e.stopPropagation()}
				draggable="false"
			/>
		</div>

		<!-- Fixed Control Panel at Bottom -->
		<div class="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 gap-3 rounded-lg bg-black bg-opacity-75 p-3 shadow-lg backdrop-blur-sm">
			<!-- Rotate Left Button -->
			<button
				onclick={rotateLeft}
				class="rounded-full bg-black bg-opacity-50 p-3 text-white transition-colors hover:bg-opacity-70"
				title="逆时针旋转"
				aria-label="逆时针旋转"
			>
				<Fa icon={faRotateLeft} />
			</button>

			<!-- Rotate Right Button -->
			<button
				onclick={rotateRight}
				class="rounded-full bg-black bg-opacity-50 p-3 text-white transition-colors hover:bg-opacity-70"
				title="顺时针旋转"
				aria-label="顺时针旋转"
			>
				<Fa icon={faRotateRight} />
			</button>

			<!-- Close Button -->
			<button
				onclick={handleClose}
				class="rounded-full bg-black bg-opacity-50 p-3 text-white transition-colors hover:bg-opacity-70"
				title="关闭"
				aria-label="关闭"
			>
				<Fa icon={faXmark} />
			</button>
		</div>
	</div>
{/if}
