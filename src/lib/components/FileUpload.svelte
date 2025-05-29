<script lang="ts">
	import type { TicketAttachmentClient } from '$lib/server/db/tickets';
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		ticketUuid: string;
		uploadUrl: string;
		as: 'admin' | 'visitor'; // Authentication type
		onUploadComplete?: (attachment: TicketAttachmentClient) => void;
		onUploadError?: (error: string, filename: string, errorType?: string) => void;
		disabled?: boolean;
		multiple?: boolean;
	}

	let {
		ticketUuid,
		uploadUrl,
		as,
		onUploadComplete,
		onUploadError,
		disabled = false,
		multiple = false
	}: Props = $props();

	let fileInput: HTMLInputElement;
	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let dragOver = $state(false);

	const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
	const ALLOWED_TYPES = [
		'image/jpeg',
		'image/png',
		'image/gif',
		'image/webp',
		'application/pdf',
		'text/plain',
		'application/msword',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'application/vnd.ms-excel',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'application/zip',
		'application/x-zip-compressed',
		'application/octet-stream', // For .demo files and other binary files
		'text/x-log' // For .log files
	];

	const formatFileSize = (bytes: number): string => {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	};

	const validateFile = (file: File): string | null => {
		if (file.size > MAX_FILE_SIZE) {
			return `文件大小超过 ${formatFileSize(MAX_FILE_SIZE)} 限制`;
		}

		if (!ALLOWED_TYPES.includes(file.type)) {
			return '不支持的文件类型';
		}

		return null;
	};

	const compressImage = async (file: File): Promise<File> => {
		// Only compress images larger than 1MB
		const isImage = file.type.startsWith('image/');
		const isLargeFile = file.size > 1024 * 1024; // 1MB
		const isGif = file.type === 'image/gif';

		// Don't compress GIF files to preserve animation
		if (!isImage || !isLargeFile || isGif) {
			return file;
		}

		try {
			// Create an image element to load the file
			const img = new Image();
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');

			if (!ctx) {
				throw new Error('Could not get canvas context');
			}

			// Load the image
			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve();
				img.onerror = () => reject(new Error('Failed to load image'));
				img.src = URL.createObjectURL(file);
			});

			// Calculate new dimensions to reduce file size
			// Target around 800KB by reducing dimensions if needed
			const targetSize = 800 * 1024; // 800KB
			const compressionRatio = Math.sqrt(targetSize / file.size);

			let newWidth = img.width;
			let newHeight = img.height;

			if (compressionRatio < 1) {
				newWidth = Math.floor(img.width * compressionRatio);
				newHeight = Math.floor(img.height * compressionRatio);

				// Ensure minimum dimensions
				newWidth = Math.max(newWidth, 200);
				newHeight = Math.max(newHeight, 200);
			}

			// Set canvas dimensions
			canvas.width = newWidth;
			canvas.height = newHeight;

			// Draw the resized image
			ctx.drawImage(img, 0, 0, newWidth, newHeight);

			// Clean up the object URL
			URL.revokeObjectURL(img.src);

			// Convert canvas to blob with compression
			const blob = await new Promise<Blob>((resolve, reject) => {
				let outputType = file.type;
				let quality = 0.85; // 85% quality

				// For GIF, convert to JPEG for better compression
				if (file.type === 'image/gif') {
					outputType = 'image/jpeg';
				}

				// PNG doesn't support quality parameter, so convert large PNGs to JPEG
				if (file.type === 'image/png' && file.size > 2 * 1024 * 1024) {
					outputType = 'image/jpeg';
				}

				canvas.toBlob(
					(result) => {
						if (result) {
							resolve(result);
						} else {
							reject(new Error('Failed to compress image'));
						}
					},
					outputType,
					quality
				);
			});

			// Create new file with compressed data
			const compressedFile = new File([blob], file.name, {
				type: blob.type,
				lastModified: file.lastModified
			});

			return compressedFile;
		} catch (error) {
			console.warn('Image compression failed, using original file:', error);
			return file;
		}
	};

	const uploadFile = async (file: File) => {
		// First compress the image if it's large
		let processedFile: File;
		try {
			processedFile = await compressImage(file);
		} catch (error) {
			console.warn('Image compression failed:', error);
			processedFile = file;
		}

		const validationError = validateFile(processedFile);
		if (validationError) {
			// Call the error callback for validation errors
			onUploadError?.(validationError, file.name, 'validation_error');
			return;
		}

		isUploading = true;
		uploadProgress = 0;

		try {
			const formData = new FormData();
			formData.append('file', processedFile);
			formData.append('ticket_uuid', ticketUuid);
			formData.append('as', as);

			const xhr = new XMLHttpRequest();

			xhr.upload.addEventListener('progress', (e) => {
				if (e.lengthComputable) {
					uploadProgress = (e.loaded / e.total) * 100;
				}
			});

			const response = await new Promise<Response>((resolve, reject) => {
				xhr.onload = () => {
					resolve(new Response(xhr.responseText, { status: xhr.status }));
				};

				xhr.onerror = () => reject(new Error('Network error'));

				xhr.open('POST', uploadUrl);
				xhr.send(formData);
			});

			const result = await response.json();

			if (result.success && result.attachment) {
				onUploadComplete?.(result.attachment);
				uploadProgress = 100;

				// Reset after a short delay
				setTimeout(() => {
					uploadProgress = 0;
					isUploading = false;
				}, 250);
			} else {
				// Handle server error response
				const errorMessage = result.error || '上传失败';
				const errorType = result.errorType || 'unknown_error';

				onUploadError?.(errorMessage, file.name, errorType);

				isUploading = false;
				uploadProgress = 0;
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : '上传失败';
			onUploadError?.(errorMessage, file.name, 'network_error');
			isUploading = false;
			uploadProgress = 0;
		}
	};

	// Public function that can be called from parent component
	export const uploadFiles = (files: FileList | File[]) => {
		if (disabled || isUploading) return;

		const fileArray = Array.from(files);
		if (multiple) {
			fileArray.forEach(uploadFile);
		} else if (fileArray.length > 0) {
			uploadFile(fileArray[0]);
		}
	};

	const handleFileSelect = (event: Event) => {
		const target = event.target as HTMLInputElement;
		const files = target.files;

		if (files && files.length > 0) {
			uploadFiles(files);
		}

		// Reset input
		target.value = '';
	};

	const openFileDialog = () => {
		if (!disabled && !isUploading) {
			fileInput.click();
		}
	};

	// Drag and drop handlers
	const handleDrop = (event: DragEvent) => {
		event.preventDefault();
		dragOver = false;

		if (disabled || isUploading) return;

		const files = event.dataTransfer?.files;
		if (files && files.length > 0) {
			uploadFiles(files);
		}
	};

	const handleDragOver = (event: DragEvent) => {
		event.preventDefault();
		if (!disabled && !isUploading) {
			dragOver = true;
		}
	};

	const handleDragLeave = (event: DragEvent) => {
		event.preventDefault();
		// Only set dragOver to false if we're leaving the window entirely
		const x = event.clientX;
		const y = event.clientY;

		if (x <= 0 || x >= window.innerWidth || y <= 0 || y >= window.innerHeight) {
			dragOver = false;
		}
	};

	// Setup drag and drop listeners
	const setupDragAndDrop = () => {
		if (typeof window === 'undefined') return;

		window.addEventListener('drop', handleDrop);
		window.addEventListener('dragover', handleDragOver);
		window.addEventListener('dragleave', handleDragLeave);
	};

	// Cleanup drag and drop listeners
	const cleanupDragAndDrop = () => {
		if (typeof window === 'undefined') return;

		window.removeEventListener('drop', handleDrop);
		window.removeEventListener('dragover', handleDragOver);
		window.removeEventListener('dragleave', handleDragLeave);
	};

	// Paste handlers
	const handlePaste = async (event: ClipboardEvent) => {
		if (disabled || isUploading) return;

		const clipboardData = event.clipboardData;
		if (!clipboardData) return;

		// Check if clipboard contains files
		const items = Array.from(clipboardData.items);
		const imageItems = items.filter((item) => item.type.startsWith('image/'));

		if (imageItems.length === 0) return;

		// Prevent default paste behavior when we have images
		event.preventDefault();

		// Process each image item and collect them into an array
		const pastedFiles: File[] = [];
		for (const item of imageItems) {
			const file = item.getAsFile();
			if (file) {
				// Create a more descriptive filename for pasted images
				const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
				const extension = file.type.split('/')[1] || 'png';
				const filename = `pasted-${timestamp}.${extension}`;

				// Create a new File object with a better name
				const renamedFile = new File([file], filename, { type: file.type });
				pastedFiles.push(renamedFile);

				// For single file mode, only process the first image
				if (!multiple) {
					break;
				}
			}
		}

		// Use the existing uploadFiles function to handle the upload
		if (pastedFiles.length > 0) {
			uploadFiles(pastedFiles);
		}
	};

	// Setup paste listeners
	const setupPasteHandlers = () => {
		if (typeof window === 'undefined') return;

		window.addEventListener('paste', handlePaste);
	};

	// Cleanup paste listeners
	const cleanupPasteHandlers = () => {
		if (typeof window === 'undefined') return;

		window.removeEventListener('paste', handlePaste);
	};

	onMount(() => {
		setupDragAndDrop();
		setupPasteHandlers();
	});

	onDestroy(() => {
		cleanupDragAndDrop();
		cleanupPasteHandlers();
	});
</script>

<div class="file-upload">
	<input
		bind:this={fileInput}
		type="file"
		{multiple}
		accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.doc,.docx,.xls,.xlsx,.zip,.demo,.log"
		onchange={handleFileSelect}
		class="hidden"
		{disabled}
	/>

	{#if isUploading}
		<div class="flex items-center space-x-2 rounded border border-slate-600 bg-slate-800 px-3 py-2">
			<div class="h-4 w-4">
				<svg class="h-full w-full animate-spin text-sky-500" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
			</div>
			<span class="text-sm text-slate-300">上传中... {Math.round(uploadProgress)}%</span>
		</div>
	{:else}
		<button
			type="button"
			onclick={openFileDialog}
			{disabled}
			class="flex items-center space-x-2 rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
		>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
				></path>
			</svg>
			<span>上传文件</span>
		</button>
	{/if}

	<!-- Drag overlay -->
	{#if dragOver}
		<div
			class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-sky-400 bg-sky-500/10"
		>
			<div class="text-center">
				<div class="mx-auto mb-2 h-12 w-12 text-sky-400">
					<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
						></path>
					</svg>
				</div>
				<div class="font-medium text-sky-300">拖拽文件到此处上传或按 Ctrl+V 粘贴图片</div>
			</div>
		</div>
	{/if}
</div>
