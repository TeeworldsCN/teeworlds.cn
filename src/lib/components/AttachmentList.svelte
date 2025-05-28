<script lang="ts">
	import type { TicketAttachmentClient } from '$lib/server/db/tickets';
	import ImagePreview from './ImagePreview.svelte';

	interface Props {
		attachments: TicketAttachmentClient[];
		showUploader?: boolean;
		compact?: boolean;
	}

	let { attachments, showUploader = false, compact = false }: Props = $props();

	// Image preview state
	let showImagePreview = $state(false);
	let previewAttachment = $state<TicketAttachmentClient | null>(null);

	const formatFileSize = (bytes: number): string => {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	};

	const formatDate = (timestamp: number): string => {
		return new Date(timestamp).toLocaleString('zh-CN');
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
</script>

{#if attachments.length > 0}
	<div class="attachments-list {compact ? 'space-y-1' : 'space-y-2'}">
		{#each attachments as attachment}
			<div class="flex items-center space-x-3 p-2 bg-slate-800 rounded-lg border border-slate-700">
				<div class="flex-shrink-0">
					{#if isImage(attachment.mime_type)}
						<button
							onclick={() => previewImage(attachment)}
							class="relative group"
						>
							<img
								src={`/api/tickets/download/${attachment.uuid}`}
								alt={attachment.original_filename}
								class="w-10 h-10 object-cover rounded border border-slate-600 group-hover:border-slate-500 transition-colors"
							/>
							<div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded transition-all flex items-center justify-center">
								<svg class="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
								</svg>
							</div>
						</button>
					{:else}
						<div class="w-10 h-10 bg-slate-700 rounded flex items-center justify-center text-lg">
							{getFileIcon(attachment.mime_type)}
						</div>
					{/if}
				</div>

				<div class="flex-1 min-w-0">
					<div class="flex items-center space-x-2">
						<button
							onclick={() => downloadFile(attachment)}
							class="text-sm font-medium text-slate-200 hover:text-sky-400 transition-colors truncate"
							title={attachment.original_filename}
						>
							{attachment.original_filename}
						</button>
						<svg class="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
						</svg>
					</div>

					{#if !compact}
						<div class="flex items-center space-x-4 mt-1 text-xs text-slate-500">
							<span>{formatFileSize(attachment.file_size)}</span>
							<span>•</span>
							<span>{attachment.uploaded_by}</span>
							<span>•</span>
							<span>{formatDate(attachment.uploaded_at)}</span>
						</div>
					{:else}
						<div class="text-xs text-slate-500">
							{formatFileSize(attachment.file_size)} • {attachment.uploaded_by}
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{:else if !showUploader}
	<div class="text-center text-slate-500 text-sm py-4">
		暂无附件
	</div>
{/if}

<!-- Image Preview Modal -->
<ImagePreview
	attachment={previewAttachment}
	bind:show={showImagePreview}
	onClose={closeImagePreview}
/>

<style>
	.attachments-list {
		@apply w-full;
	}
</style>
