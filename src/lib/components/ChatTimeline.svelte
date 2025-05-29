<script lang="ts">
	import type { TicketMessage, TicketAttachmentClient } from '$lib/server/db/tickets';
	import SystemMessage from './SystemMessage.svelte';
	import ImagePreview from './ImagePreview.svelte';
	import { onMount, tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import Fa from 'svelte-fa';
	import { faSearchPlus } from '@fortawesome/free-solid-svg-icons';

	export type TicketImageUrl = {
		uuid: string;
		ticket_uuid: string;
		url: string;
		name?: string;
		uploaded_at?: number;
	};

	// Timeline item type for combining messages and attachments
	type TimelineItem = {
		type: 'message' | 'attachment' | 'image';
		timestamp: number;
		data: TicketMessage | TicketAttachmentClient | TicketImageUrl;
	};

	interface Props {
		messages: TicketMessage[];
		attachments: TicketAttachmentClient[];
		localMessages: TicketMessage[];
		images?: TicketImageUrl[];
		containerId?: string;
		isVisitorView?: boolean; // For visitor page to flip message alignment
		onButtonClick?: (buttonId: string) => void; // Callback for button clicks in system messages
	}

	let {
		messages,
		attachments,
		localMessages,
		images,
		containerId = 'messages-container',
		isVisitorView = false,
		onButtonClick
	}: Props = $props();

	// Image preview state
	let showImagePreview = $state(false);
	let previewAttachment = $state<TicketAttachmentClient | null>(null);

	// Create unified timeline combining messages and attachments
	let timeline = $derived(() => {
		const items: TimelineItem[] = [];

		// Add messages to timeline
		messages.forEach((message) => {
			items.push({
				type: 'message',
				timestamp: message.created_at,
				data: message
			});
		});

		// Add attachments to timeline
		attachments.forEach((attachment) => {
			items.push({
				type: 'attachment',
				timestamp: attachment.uploaded_at,
				data: attachment
			});
		});

		// Add local messages to timeline
		localMessages.forEach((message) => {
			items.push({
				type: 'message',
				timestamp: message.created_at,
				data: message
			});
		});

		// Add images to timeline
		if (images) {
			images.forEach((image) => {
				items.push({
					type: 'image',
					timestamp: image.uploaded_at || 0,
					data: image
				});
			});
		}

		// Sort by timestamp
		return items.sort((a, b) => a.timestamp - b.timestamp);
	});

	const formatDate = (timestamp: number) => {
		return new Date(timestamp).toLocaleString('zh-CN');
	};

	const formatFileSize = (bytes: number): string => {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	};

	const getFileIcon = (mimeType: string): string => {
		if (mimeType.startsWith('image/')) {
			return '🖼️';
		} else if (mimeType === 'application/pdf') {
			return '📄';
		} else if (mimeType.includes('word') || mimeType.includes('document')) {
			return '📝';
		} else if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
			return '📊';
		} else if (mimeType.includes('zip')) {
			return '🗜️';
		} else {
			return '📎';
		}
	};

	const isImage = (mimeType: string): boolean => {
		return mimeType.startsWith('image/');
	};

	const downloadFile = (attachment: TicketAttachmentClient) => {
		window.open(`/api/tickets/download/${attachment.uuid}`, '_blank');
	};

	const previewImage = (attachment: TicketAttachmentClient) => {
		previewAttachment = attachment;
		showImagePreview = true;
	};

	const closeImagePreview = () => {
		showImagePreview = false;
		previewAttachment = null;
	};

	const chatColor = (authorType: string, isVisitorView: boolean) => {
		switch (authorType) {
			case 'visitor':
				return isVisitorView ? 'bg-sky-600' : 'bg-slate-700';
			case 'admin':
				return isVisitorView ? 'bg-slate-700' : 'bg-sky-600';
			case 'bot':
				return 'bg-green-700';
			default:
				return 'bg-slate-800';
		}
	};

	const nameColor = (authorType: string) => {
		switch (authorType) {
			case 'visitor':
				return isVisitorView ? 'text-slate-400' : 'text-sky-500';
			case 'admin':
				return isVisitorView ? 'text-sky-500' : 'text-slate-400';
			case 'bot':
				return 'text-green-400';
			default:
				return 'text-orange-400';
		}
	};

	// Function to detect URLs and make them clickable
	const linkifyText = (text: string) => {
		// URL regex pattern that matches http/https URLs
		const urlRegex = /(https?:\/\/[^\s]+)/g;

		// Split text by URLs and create array of text and link parts
		const parts = text.split(urlRegex);

		return parts.map((part, index) => {
			if (urlRegex.test(part)) {
				// This is a URL, make it clickable
				return {
					type: 'link',
					content: part,
					key: index
				};
			} else {
				// This is regular text
				return {
					type: 'text',
					content: part,
					key: index
				};
			}
		});
	};

	let delayedAppearance = $state(false);
	let containerElement: HTMLDivElement;
	let resizeObserver: ResizeObserver | null = null;
	let lastScrollHeight = 0;
	let lastClientHeight = 0;

	const handleResize = () => {
		if (!containerElement) return;

		const { scrollHeight, scrollTop, clientHeight } = containerElement;

		// Calculate how much the content or container size changed
		const bottomDistance = lastScrollHeight - scrollTop - lastClientHeight;

		if (scrollHeight === lastScrollHeight && clientHeight === lastClientHeight) return;

		if (clientHeight < lastClientHeight) {
			containerElement.scrollTop = scrollHeight - clientHeight - bottomDistance;
		}

		lastScrollHeight = scrollHeight;
		lastClientHeight = clientHeight;
	};

	onMount(() => {
		setTimeout(async () => {
			await tick();
			delayedAppearance = true;
		}, 100);

		// Initialize bottom-anchored scroll
		if (containerElement) {
			// Set up ResizeObserver to handle container resize
			resizeObserver = new ResizeObserver(() => {
				handleResize();
			});
			resizeObserver.observe(containerElement);

			// Initialize measurements
			lastScrollHeight = containerElement.scrollHeight;
			lastClientHeight = containerElement.clientHeight;

			// Scroll to bottom initially
			containerElement.scrollTop = containerElement.scrollHeight;
		}

		return () => {
			if (resizeObserver) {
				resizeObserver.disconnect();
			}
		};
	});
</script>

<div
	bind:this={containerElement}
	id={containerId}
	class="scrollbar-subtle h-full max-h-full space-y-2 overflow-y-auto p-4 transition-opacity"
	class:opacity-0={!delayedAppearance}
>
	{#each timeline() as item}
		<div in:fade={{ duration: 150 }}>
			{#if item.type === 'message'}
				{@const message = item.data as TicketMessage}
				{#if message.author_type === 'system' || message.author_type === 'sys'}
					<!-- System message (status changes, errors, etc.) -->
					<div class="flex justify-center">
						<SystemMessage
							type={message.author_type}
							message={message.message}
							timestamp={message.created_at}
							visibility={message.visibility}
							{onButtonClick}
						/>
					</div>
				{:else}
					<!-- Regular user/admin message -->
					{@const shouldAlignRight =
						message.author_type !== 'bot' && isVisitorView
							? message.author_type === 'visitor'
							: message.author_type === 'admin'}
					<div class="flex {shouldAlignRight ? 'justify-end' : 'justify-start'}">
						<div class="max-w-xs lg:max-w-md">
							<div class="flex" class:flex-row-reverse={!shouldAlignRight}>
								<div class="flex-1"></div>
								<div class="{chatColor(message.author_type, isVisitorView)} rounded-lg px-3 py-2">
									<p class="whitespace-pre-wrap break-all text-sm text-white">
										{#each linkifyText(message.message) as part (part.key)}
											{#if part.type === 'link'}
												<a
													href={part.content}
													target="_blank"
													rel="noopener noreferrer"
													class="text-blue-100 underline transition-colors hover:text-blue-200"
												>
													{part.content}
												</a>
											{:else}
												{part.content}
											{/if}
										{/each}
									</p>
								</div>
							</div>
							<div
								class="mt-0.5 text-xs text-slate-400 {shouldAlignRight
									? 'text-right'
									: 'text-left'}"
							>
								<span class={nameColor(message.author_type)}>{message.author_name}</span>
								• {formatDate(message.created_at)}
								{#if message.visibility !== 0}
									<div class="mt-0.5 text-xs opacity-70">这条消息只有你可以看到</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			{:else if item.type === 'attachment'}
				{@const attachment = item.data as TicketAttachmentClient}
				<!-- Inline attachment -->
				<div class="flex justify-center">
					{#if isImage(attachment.mime_type)}
						<!-- Full image display -->
						<div class="rounded-lg border border-slate-600 bg-slate-800 px-4 py-1">
							<button onclick={() => previewImage(attachment)} class="group relative block">
								<div
									class="mx-auto overflow-hidden rounded border border-slate-600 transition-colors group-hover:border-slate-500"
								>
									<img
										src={`/api/tickets/download/${attachment.uuid}`}
										alt={attachment.original_filename}
										class="h-36 w-36 object-contain"
									/>
									<div
										class="absolute inset-0 flex items-center justify-center rounded transition-colors group-hover:bg-black/50"
									>
										<Fa
											class="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100"
											icon={faSearchPlus}
											size="lg"
										/>
										<div class="absolute right-0 top-0 rounded-bl rounded-tr bg-slate-600 px-2">
											<p class="text-xs text-white">
												{attachment.uploaded_by}
											</p>
										</div>
										<div class="absolute bottom-0 left-0 rounded-bl rounded-tr bg-slate-600 px-2">
											<p class="text-xs text-white">
												{formatFileSize(attachment.file_size)}
											</p>
										</div>
									</div>
								</div>
							</button>
							<div class="text-center">
								<p class="max-w-36 truncate text-sm font-medium text-slate-200">
									{attachment.original_filename}
								</p>
								<div class="max-w-36 truncate text-xs text-slate-500">
									<span>{formatDate(attachment.uploaded_at)}</span>
								</div>
							</div>
						</div>
					{:else}
						<!-- File attachment display -->
						<div class="max-w-64 rounded-lg border border-slate-600 bg-slate-800 p-3">
							<div class="flex items-center space-x-3">
								<div class="flex-shrink-0">
									<div
										class="flex h-12 w-12 items-center justify-center rounded border border-slate-600 bg-slate-700 text-lg"
									>
										{getFileIcon(attachment.mime_type)}
									</div>
								</div>

								<div class="min-w-0 flex-1">
									<button onclick={() => downloadFile(attachment)} class="group w-full text-left">
										<p
											class="truncate text-sm font-medium text-slate-200 transition-colors group-hover:text-sky-400"
										>
											{attachment.original_filename}
										</p>
										<div class="mt-1 flex items-center space-x-2 text-xs text-slate-500">
											<span>{formatFileSize(attachment.file_size)}</span>
											<span>•</span>
											<span>{attachment.uploaded_by}</span>
										</div>
									</button>
								</div>
							</div>
							<div class="mt-2 text-center text-xs text-slate-400">
								{formatDate(attachment.uploaded_at)}
							</div>
						</div>
					{/if}
				</div>
			{:else if item.type === 'image'}
				{@const image = item.data as TicketImageUrl}
				<div class="flex justify-center">
					<div class="max-w-64 rounded-lg border border-slate-600 bg-slate-800 p-3">
						<div class="mx-auto h-40 w-40 overflow-hidden rounded border border-slate-600">
							<img src={image.url} alt={image.name || ''} class="h-full w-full object-cover" />
						</div>
						<div class="mt-2 text-center">
							{#if image.name}
								<p class="truncate text-sm font-medium text-slate-200">
									{image.name}
								</p>
							{/if}
							{#if image.uploaded_at}
								<div class="mt-1 text-xs text-slate-400">
									{formatDate(image.uploaded_at)}
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/each}
</div>

<!-- Image Preview Modal -->
<ImagePreview
	attachment={previewAttachment}
	bind:show={showImagePreview}
	onClose={closeImagePreview}
/>
