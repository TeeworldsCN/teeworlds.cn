<script lang="ts">
	import type { TicketMessage, Ticket, TicketAttachmentClient } from '$lib/server/db/tickets';
	import FileUpload from './FileUpload.svelte';
	import CameraCapture from './CameraCapture.svelte';
	import ChatTimeline, { type TicketImageUrl } from './ChatTimeline.svelte';
	import { tick, type Snippet } from 'svelte';
	import tippy from 'tippy.js';
	import { fade } from 'svelte/transition';

	interface Props {
		ticket: Partial<Ticket>;
		messages: TicketMessage[];
		attachments?: TicketAttachmentClient[];
		images?: TicketImageUrl[];
		uploadUrl?: string; // URL for file uploads
		uploadAs?: 'admin' | 'visitor'; // Authentication type for uploads
		onAttachmentAdded?: (attachment: TicketAttachmentClient) => void;
		onMessageSubmit?: (message: string) => Promise<void> | void;
		onSubscribe?: (ticketUuid: string) => Promise<void> | void;
		onUnsubscribe?: (ticketUuid: string) => Promise<void> | void;
		onCloseTicket?: () => Promise<void> | void; // For closing tickets (both admin and visitor)
		onReopenTicket?: () => Promise<void> | void; // For admins to reopen tickets
		onIncreaseAttachmentLimit?: (ticketUuid: string) => Promise<void> | void; // For admins to increase attachment limits
		onBanUser?: (authorUid: string, duration: number, reason?: string) => Promise<void> | void; // For admins to ban users
		onUnbanUser?: (authorUid: string) => Promise<void> | void; // For admins to unban users
		isCurrentUserSubscribed?: boolean; // For checking subscription status
		isVisitorView?: boolean; // For visitor page to flip message alignment
		readonlyInput?: boolean;
		onButtonClick?: (buttonId: string) => void; // Callback for button clicks in system messages
		children?: Snippet; // For passing in custom content
		adminCount?: number; // For displaying admin count in visitor view
	}

	let {
		ticket = $bindable(),
		messages = $bindable(),
		attachments = $bindable([]),
		images = $bindable([]),
		uploadUrl = '/api/tickets/upload',
		uploadAs = 'visitor',
		onAttachmentAdded,
		onMessageSubmit,
		onSubscribe,
		onUnsubscribe,
		onCloseTicket,
		onReopenTicket,
		onIncreaseAttachmentLimit,
		onBanUser,
		onUnbanUser,
		isCurrentUserSubscribed = false,
		isVisitorView = false,
		readonlyInput = false,
		onButtonClick,
		children,
		adminCount
	}: Props = $props();

	let newMessage = $state('');
	let isSubscribing = $state(false);
	let localMessages = $state<TicketMessage[]>([]);
	let fileUploadComponent: FileUpload | null = $state(null);

	// Ban dialog state
	let showBanDialog = $state(false);
	let banDuration = $state(1);
	let banReason = $state('');

	const getStatusText = (status: string) => {
		switch (status) {
			case 'open':
				return '待处理';
			case 'in_progress':
				return '处理中';
			case 'closed':
				return '已关闭';
			default:
				return status;
		}
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case 'open':
				return 'bg-yellow-600';
			case 'in_progress':
				return 'bg-blue-600';
			case 'closed':
				return 'bg-gray-600';
			default:
				return 'bg-gray-600';
		}
	};

	const handleMessageSendError = (errorMessage: string, originalMessage?: string) => {
		// Create a client-side system message for the send error
		const errorSystemMessage = {
			uuid: randomUUID(),
			ticket_uuid: ticket.uuid || 'FAKE_TICKET_UUID',
			message: JSON.stringify({
				type: 'message_send_error',
				data: {
					error_message: errorMessage,
					original_message: originalMessage
				}
			}),
			author_type: 'system' as const,
			author_name: 'System',
			visibility: -1, // Local only - send errors are only visible to the current user
			created_at: Date.now()
		};

		localMessages.push(errorSystemMessage);
		scrollToBottom();
	};

	const handleSubmit = async () => {
		if (!newMessage.trim()) {
			handleMessageSendError('消息内容不能为空');
			return;
		}

		// Check message length limit
		if (newMessage.length > 4096) {
			handleMessageSendError('消息长度不能超过 4096 个字符');
			return;
		}

		if (!onMessageSubmit) {
			handleMessageSendError('无法发送消息：功能不可用');
			return;
		}

		const messageToSend = newMessage.trim();

		try {
			newMessage = '';
			await onMessageSubmit(messageToSend);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : '发送消息失败';
			handleMessageSendError(errorMessage, messageToSend);
		}
	};

	const handleReopenTicket = async () => {
		if (!onReopenTicket) {
			console.error('Reopen ticket function not available');
			return;
		}

		try {
			await onReopenTicket();
		} catch (error) {
			console.error('Error reopening ticket:', error);
			handleMessageSendError('重开失败');
		}
	};

	const handleAttachmentUpload = (attachment: TicketAttachmentClient) => {
		onAttachmentAdded?.(attachment);
		scrollToBottom();
	};

	const handleCloseTicket = async () => {
		if (!onCloseTicket) {
			console.error('Close ticket function not available');
			return;
		}

		// Show warning for visitors before closing
		if (isVisitorView) {
			const shouldClose = confirm(
				'关闭反馈后，系统将告知管理员这个问题已解决或不需要解决。\n\n确定要关闭这个反馈吗？'
			);

			if (!shouldClose) {
				return;
			}
		}

		try {
			await onCloseTicket();
		} catch (error) {
			console.error('Error closing ticket:', error);
			handleMessageSendError('关闭失败');
		}
	};

	const handleSubscribe = async () => {
		if (!onSubscribe) return;
		if (!ticket.uuid) return;

		isSubscribing = true;
		try {
			await onSubscribe(ticket.uuid);
		} catch (err) {
			console.error('Failed to subscribe:', err);
		} finally {
			isSubscribing = false;
		}
	};

	const handleUnsubscribe = async () => {
		if (!onUnsubscribe) return;
		if (!ticket.uuid) return;

		isSubscribing = true;
		try {
			await onUnsubscribe(ticket.uuid);
		} catch (err) {
			console.error('Failed to unsubscribe:', err);
		} finally {
			isSubscribing = false;
		}
	};

	const handleIncreaseAttachmentLimit = async () => {
		if (!onIncreaseAttachmentLimit) return;
		if (!ticket.uuid) return;

		try {
			await onIncreaseAttachmentLimit(ticket.uuid);
		} catch (err) {
			console.error('Failed to increase attachment limit:', err);
			alert('增加附件限制失败');
		}
	};

	const handleBanUser = async () => {
		if (!onBanUser || !ticket.author_uid) return;

		try {
			await onBanUser(ticket.author_uid, banDuration, banReason.trim() || undefined);
			showBanDialog = false;
			banDuration = 1;
			banReason = '';
		} catch (err) {
			console.error('Failed to ban user:', err);
			alert('封禁用户失败');
		}
	};

	const handleUnbanUser = async () => {
		if (!onUnbanUser || !ticket.author_uid) return;

		const shouldUnban = confirm('确定要解除此用户的封禁吗？');
		if (!shouldUnban) return;

		try {
			await onUnbanUser(ticket.author_uid);
		} catch (err) {
			console.error('Failed to unban user:', err);
			alert('解除封禁失败');
		}
	};

	const randomUUID = () => {
		if (crypto && crypto.randomUUID) {
			return crypto.randomUUID();
		} else {
			return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
				const r = (Math.random() * 16) | 0;
				const v = c === 'x' ? r : (r & 0x3) | 0x8;
				return v.toString(16);
			});
		}
	};

	const handleUploadError = (errorMessage: string, filename: string, errorType?: string) => {
		// Create a client-side system message for the upload error
		const errorSystemMessage = {
			uuid: randomUUID(),
			ticket_uuid: ticket.uuid || 'FAKE_TICKET_UUID',
			message: JSON.stringify({
				type: 'upload_error',
				data: {
					error_message: errorMessage,
					error_type: errorType,
					filename: filename
				}
			}),
			author_type: 'system' as const,
			author_name: 'System',
			visibility: -1, // Local only - upload errors are only visible to the current user
			created_at: Date.now()
		};

		localMessages.push(errorSystemMessage);
		scrollToBottom();
	};

	const scrollToBottom = async () => {
		await tick();
		const messagesContainer = document.getElementById('ticket-messages-container');
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	};
</script>

<div class="relative flex h-full flex-col rounded-lg bg-slate-900">
	{#if children}
		{@render children()}
	{/if}
	<!-- Header -->
	<div class="border-b border-slate-700 p-1 px-4">
		<div class="flex items-start justify-between">
			<div class="flex-1">
				<div class="mb-1 flex items-center space-x-2">
					<h3 class="font-sm text-slate-200">{ticket.title}</h3>
					{#if ticket.uuid}<p class="text-sm text-slate-400">#{ticket.uuid.slice(0, 8)}</p>{/if}
					{#if ticket.status}
						<span
							class="rounded px-2 py-1 text-xs font-medium text-white {getStatusColor(
								ticket.status
							)}"
						>
							{getStatusText(ticket.status)}
						</span>
					{/if}
				</div>
			</div>
			{#if isVisitorView && adminCount !== undefined}
				<div class="text-xs text-slate-400">
					在线管理: {adminCount}
				</div>
			{/if}
		</div>
		<div class="flex items-center justify-between">
			<div class="flex items-center space-x-2">
				{#if ticket.status === 'closed'}
					{#if onReopenTicket}
						<button
							type="button"
							onclick={handleReopenTicket}
							class="rounded bg-blue-600 px-2 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							重开
						</button>
					{/if}
				{:else if onCloseTicket}
					<button
						type="button"
						onclick={handleCloseTicket}
						class="rounded bg-red-600 px-2 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-red-500"
					>
						关闭
					</button>
				{/if}
			</div>
			<div class="text-right text-xs text-slate-400">
				{#if ticket.visitor_name}
					<div>
						{#if ticket.author_banned}
							<span class="text-red-400" in:fade>(封禁中)</span>
						{/if}
						创建者: {ticket.visitor_name}
					</div>
				{/if}

				{#if !isVisitorView && ticket.author_uid}
					<span class="truncate text-slate-500">UID:{ticket.author_uid}</span>
				{/if}
			</div>
		</div>
	</div>

	<!-- Messages and Attachments Timeline -->
	<div class="flex flex-1 flex-col overflow-hidden">
		<div class="max-h-full">
			<ChatTimeline
				{messages}
				{attachments}
				{localMessages}
				{images}
				containerId="ticket-messages-container"
				{isVisitorView}
				{onButtonClick}
			/>
		</div>
	</div>

	<!-- Reply Form -->
	{#if onMessageSubmit}
		<div class="border-t border-slate-700 p-2">
			<div class="space-y-2">
				<form
					class="flex gap-2"
					onsubmit={(e) => {
						e.preventDefault();
						handleSubmit();
					}}
				>
					<div class="relative flex-1">
						<input
							id="message-input"
							bind:value={newMessage}
							placeholder={readonlyInput
								? '发送消息不可用'
								: onSubscribe && !isCurrentUserSubscribed && ticket.status !== 'closed'
									? '回复会自动接单...'
									: '回复...'}
							type="text"
							maxlength="4096"
							class="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50"
							disabled={readonlyInput}
							readonly={readonlyInput}
						/>
					</div>
					<button
						type="submit"
						class="rounded bg-sky-600 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50"
						disabled={!newMessage.trim() || readonlyInput || newMessage.length > 4096}
					>
						发送
					</button>
				</form>

				<div class="flex items-center gap-2">
					{#if ticket.uuid}
						<div class="flex items-center gap-2">
							<FileUpload
								bind:this={fileUploadComponent}
								disabled={readonlyInput}
								ticketUuid={ticket.uuid}
								{uploadUrl}
								as={uploadAs}
								onUploadComplete={handleAttachmentUpload}
								onUploadError={handleUploadError}
								multiple={true}
							/>
							<CameraCapture
								onCapture={(file) => {
									// Use the FileUpload component's uploadFiles function
									if (fileUploadComponent && fileUploadComponent.uploadFiles) {
										fileUploadComponent.uploadFiles([file]);
									}
								}}
								onError={(error) => handleUploadError(error, 'camera-photo.jpg', 'camera_error')}
							/>
						</div>
					{/if}
					{#if !isVisitorView}
						<div
							class="flex items-center gap-2 self-stretch rounded border border-slate-600 bg-slate-800 px-3"
						>
							{#if onSubscribe && onUnsubscribe}
								{#if isCurrentUserSubscribed}
									<button
										onclick={handleUnsubscribe}
										disabled={isSubscribing}
										class="rounded bg-red-800 px-2 py-1 text-xs text-white hover:bg-red-700 focus:outline-none disabled:opacity-50"
									>
										{isSubscribing ? '处理中...' : '放弃'}
									</button>
								{:else}
									<button
										onclick={handleSubscribe}
										disabled={isSubscribing}
										use:tippy={{ content: '接单后你将收到所有后续消息的推送' }}
										class:opacity-50={ticket.status === 'closed'}
										class="rounded bg-green-800 px-2 py-1 text-xs text-white hover:bg-green-700 focus:outline-none disabled:opacity-50"
									>
										{isSubscribing ? '处理中...' : '接单'}
									</button>
								{/if}
							{/if}
							{#if onIncreaseAttachmentLimit}
								<button
									onclick={handleIncreaseAttachmentLimit}
									class="rounded bg-orange-800 px-2 py-1 text-xs text-white hover:bg-orange-700"
									use:tippy={{ content: '增加发起人的附件上传限制' }}
								>
									增加附件
								</button>
							{/if}
							{#if onBanUser && ticket.author_uid && !ticket.author_banned}
								<button
									onclick={() => (showBanDialog = true)}
									class="rounded bg-red-900 px-2 py-1 text-xs text-white hover:bg-red-800"
									use:tippy={{ content: '封禁用户创建反馈' }}
								>
									封禁
								</button>
							{/if}
							{#if onUnbanUser && ticket.author_uid && ticket.author_banned}
								<button
									onclick={handleUnbanUser}
									class="rounded bg-green-900 px-2 py-1 text-xs text-white hover:bg-green-800"
									use:tippy={{ content: '解除用户封禁' }}
								>
									解封
								</button>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Ban Dialog -->
{#if showBanDialog}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
		<div class="w-full max-w-md rounded-lg bg-slate-800 p-6">
			<h3 class="mb-4 text-lg font-medium text-slate-200">封禁用户</h3>
			<div class="space-y-4">
				<div>
					<label for="ban-duration" class="block text-sm font-medium text-slate-300">
						封禁时长 (天)
					</label>
					<input
						id="ban-duration"
						type="number"
						min="1"
						max="30"
						bind:value={banDuration}
						class="mt-1 block w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
					/>
					<p class="mt-1 text-xs text-slate-400">1-30天</p>
				</div>
				<div>
					<label for="ban-reason" class="block text-sm font-medium text-slate-300">
						封禁原因 (可选)
					</label>
					<textarea
						id="ban-reason"
						bind:value={banReason}
						placeholder="请输入封禁原因..."
						rows="3"
						class="mt-1 block w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
					></textarea>
				</div>
			</div>
			<div class="mt-6 flex justify-end space-x-3">
				<button
					onclick={() => (showBanDialog = false)}
					class="rounded bg-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-500"
				>
					取消
				</button>
				<button
					onclick={handleBanUser}
					class="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500"
				>
					确认封禁
				</button>
			</div>
		</div>
	</div>
{/if}
