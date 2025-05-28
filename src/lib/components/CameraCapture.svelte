<script lang="ts">
	import { page } from '$app/state';
	import { uaIsMobile } from '$lib/helpers';
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		onCapture?: (file: File) => void;
		onError?: (error: string) => void;
		disabled?: boolean;
	}

	let { onCapture, onError, disabled = false }: Props = $props();

	let showCamera = $state(false);
	let videoElement: HTMLVideoElement | undefined = $state();
	let canvasElement: HTMLCanvasElement | undefined = $state();
	let stream: MediaStream | null = null;
	let isCapturing = $state(false);

	const isMobile = uaIsMobile(page.data.ua);

	const startCamera = async () => {
		// Check if getUserMedia is supported
		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
			onError?.('您的浏览器不支持摄像头功能');
			return;
		}

		try {
			// Try to get back camera first, fallback to any camera
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					video: {
						facingMode: { exact: 'environment' }, // Force back camera
						width: { ideal: 1920 },
						height: { ideal: 1080 }
					},
					audio: false
				});
			} catch (err) {
				// Fallback to ideal back camera if exact fails
				stream = await navigator.mediaDevices.getUserMedia({
					video: {
						facingMode: { ideal: 'environment' },
						width: { ideal: 1920 },
						height: { ideal: 1080 }
					},
					audio: false
				});
			}

			showCamera = true;

			// Wait for the video element to be available
			setTimeout(() => {
				if (videoElement) {
					videoElement.srcObject = stream;
				}
			}, 100);
		} catch (err) {
			console.error('Error accessing camera:', err);
			onError?.('无法访问摄像头，请检查权限设置');
		}
	};

	const stopCamera = () => {
		if (stream) {
			stream.getTracks().forEach((track) => track.stop());
			stream = null;
		}
		showCamera = false;
	};

	const capturePhoto = () => {
		if (!videoElement || !canvasElement || isCapturing || disabled) return;

		isCapturing = true;

		try {
			const context = canvasElement.getContext('2d');
			if (!context) {
				onError?.('无法创建画布上下文');
				isCapturing = false;
				return;
			}

			// Set canvas size to match video
			canvasElement.width = videoElement.videoWidth;
			canvasElement.height = videoElement.videoHeight;

			// Draw video frame to canvas
			context.drawImage(videoElement, 0, 0);

			// Convert canvas to blob
			canvasElement.toBlob(
				(blob) => {
					if (blob) {
						// Create a file from the blob
						const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
						const filename = `camera-${timestamp}.jpg`;
						const file = new File([blob], filename, { type: 'image/jpeg' });

						onCapture?.(file);
						stopCamera();
					} else {
						onError?.('拍照失败');
					}
					isCapturing = false;
				},
				'image/jpeg',
				0.9
			);
		} catch (err) {
			console.error('Error capturing photo:', err);
			onError?.('拍照失败');
			isCapturing = false;
		}
	};

	const handleKeydown = (event: KeyboardEvent) => {
		if (showCamera) {
			if (event.key === 'Escape') {
				stopCamera();
			} else if (event.key === ' ' || event.key === 'Enter') {
				event.preventDefault();
				capturePhoto();
			}
		}
	};

	onMount(() => {
		if (typeof window !== 'undefined') {
			window.addEventListener('keydown', handleKeydown);
		}
	});

	onDestroy(() => {
		stopCamera();
		if (typeof window !== 'undefined') {
			window.removeEventListener('keydown', handleKeydown);
		}
	});
</script>

{#if !showCamera && isMobile}
	<button
		type="button"
		onclick={startCamera}
		{disabled}
		class="flex items-center space-x-2 rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
	>
		<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
			></path>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
			></path>
		</svg>
		<span>拍照</span>
	</button>
{/if}

{#if showCamera}
	<!-- Fullscreen Camera Interface -->
	<div class="fixed inset-0 z-50 bg-black">
		<!-- Video Preview -->
		<video bind:this={videoElement} autoplay playsinline muted class="h-full w-full object-contain"
		></video>

		<!-- Hidden canvas for capturing -->
		<canvas bind:this={canvasElement} class="hidden"></canvas>

		<!-- Top Controls -->
		<div class="absolute left-4 right-4 top-4 flex items-center justify-between">
			<button
				type="button"
				onclick={stopCamera}
				class="flex h-10 w-10 items-center justify-center rounded-full bg-black bg-opacity-50 text-white hover:bg-opacity-70"
				aria-label="关闭摄像头"
			>
				<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					></path>
				</svg>
			</button>

			<div class="rounded-lg bg-black bg-opacity-50 px-3 py-1">
				<p class="text-sm text-white">拍照上传</p>
			</div>

			<div class="w-10"></div>
			<!-- Spacer for centering -->
		</div>

		<!-- Bottom Controls -->
		<div class="absolute bottom-8 left-0 right-0 flex items-center justify-center">
			<!-- Cancel Button (positioned further left) -->
			<button
				type="button"
				onclick={stopCamera}
				class="absolute left-8 flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-700"
				aria-label="取消拍照"
			>
				<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					></path>
				</svg>
			</button>

			<!-- Capture Button (centered) -->
			<button
				type="button"
				onclick={capturePhoto}
				disabled={isCapturing}
				class="flex h-16 w-16 items-center justify-center rounded-full bg-white text-gray-800 transition-colors hover:bg-gray-100 disabled:opacity-50"
				aria-label="拍照"
			>
				{#if isCapturing}
					<svg class="h-8 w-8 animate-spin" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
				{:else}
					<svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
						></path>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
						></path>
					</svg>
				{/if}
			</button>
		</div>
	</div>
{/if}
