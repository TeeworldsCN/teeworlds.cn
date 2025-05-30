<script lang="ts">
	import type { SystemMessageData, SystemMessageButtonGroup, SystemMessageCopyable } from '$lib/server/db/tickets';

	interface Props {
		type: 'system' | 'sys';
		message: string; // JSON string for system messages
		timestamp: number; // Timestamp for the message
		visibility?: number; // Message visibility (0 = all, 1 = admin only, 2 = visitor only, -1 = local only)
		onButtonClick?: (buttonId: string) => void; // Callback for button clicks
	}

	let { type, message, timestamp, visibility = 0, onButtonClick }: Props = $props();

	// State for copy feedback
	let copySuccess = $state(false);

	const parseSystemMessage = (messageStr: string): string => {
		try {
			const systemMessage: SystemMessageData = JSON.parse(messageStr);

			switch (systemMessage.type) {
				case 'status_change':
					const newStatusText = getStatusDisplayText(systemMessage.data.new_status);
					const actorName = systemMessage.data.actor || '';

					if (!systemMessage.data.admin) {
						if (systemMessage.data.new_status === 'closed') {
							return `发起人 ${actorName} 关闭了工单`;
						} else {
							return `发起人 ${actorName} 将状态更改为 ${newStatusText}`;
						}
					}
					return `管理员 ${actorName} 将状态更改为 ${newStatusText}`;

				case 'admin_subscribed':
					return `管理员 ${systemMessage.data.admin_name} 正在帮助你`;

				case 'admin_unsubscribed':
					return `管理员 ${systemMessage.data.admin_name} 放弃了处理`;

				case 'attachment_limit_increased':
					const newLimit = systemMessage.data.new_limit || 0;
					return `管理员 ${systemMessage.data.admin_name} 将附件上传限制增加到了 ${newLimit} 个`;

				case 'upload_error':
					const errorMessage = systemMessage.data.error_message || '上传失败';
					return `附件上传失败：${errorMessage}`;

				case 'message_send_error':
					const sendErrorMessage = systemMessage.data.error_message || '发送失败';
					return `消息发送失败：${sendErrorMessage}`;

				case 'navigation_warning':
					return systemMessage.data.message || '导航警告';

				case 'visitor_connected':
					const connectedVisitorName = systemMessage.data.visitor_name || '访客';
					return `${connectedVisitorName} 已连接`;

				case 'visitor_disconnected':
					const disconnectedVisitorName = systemMessage.data.visitor_name || '访客';
					return `${disconnectedVisitorName} 已断开连接`;

				case 'button_group':
					return systemMessage.data.message || '';

				case 'copyable_message':
					return systemMessage.data.message || '';

				default:
					return messageStr; // Fallback to original message
			}
		} catch (error) {
			// If parsing fails, return the original message (for backward compatibility)
			return messageStr;
		}
	};

	const getStatusDisplayText = (status: string): string => {
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

	const displayMessage = $derived(parseSystemMessage(message));

	// Check message type for different styling
	const messageType = $derived(() => {
		try {
			const systemMessage = JSON.parse(message);
			return systemMessage.type;
		} catch {
			return 'unknown';
		}
	});

	const isUploadError = $derived(() => messageType() === 'upload_error');
	const isSendError = $derived(() => messageType() === 'message_send_error');
	const isNavigationWarning = $derived(() => messageType() === 'navigation_warning');
	const isConnectionEvent = $derived(() => messageType() === 'visitor_connected');
	const isDisconnectionEvent = $derived(() => messageType() === 'visitor_disconnected');
	const isButtonGroup = $derived(() => messageType() === 'button_group');
	const isCopyableMessage = $derived(() => messageType() === 'copyable_message');

	// Check if message should show visibility notice
	const shouldShowVisibilityNotice = $derived(() => {
		// Show notice for any message with restricted visibility (not visible to all)
		return visibility !== 0;
	});

	// Get buttons from system message
	const buttons = $derived(() => {
		if (!isButtonGroup()) return [];
		try {
			const systemMessage: SystemMessageButtonGroup = JSON.parse(message);
			return systemMessage.data.buttons;
		} catch {
			return [];
		}
	});

	// Check if any button has a description to determine layout
	const hasDescriptions = $derived(() => buttons().some((button) => button.description));

	const handleButtonClick = (buttonId: string) => {
		if (onButtonClick) {
			onButtonClick(buttonId);
		}
	};

	const getButtonVariantClasses = (variant?: string) => {
		switch (variant) {
			case 'primary':
				return 'bg-blue-800 hover:bg-blue-700 text-white';
			case 'danger':
				return 'bg-red-800 hover:bg-red-700 text-white';
			case 'warning':
				return 'bg-orange-800 hover:bg-orange-700 text-white';
			case 'success':
				return 'bg-green-800 hover:bg-green-700 text-white';
			case 'secondary':
			default:
				return 'bg-slate-700 hover:bg-slate-600 text-white';
		}
	};
	const getButtonContainerVariantClasses = (variant?: string) => {
		switch (variant) {
			case 'primary':
				return 'bg-blue-900/50 text-white';
			case 'danger':
				return 'bg-red-900/50 text-white';
			case 'warning':
				return 'bg-orange-900/50 text-white';
			case 'success':
				return 'bg-green-900/50 text-white';
			case 'secondary':
			default:
				return 'bg-slate-800/50 text-white';
		}
	};

	const getMessageTextColor = () => {
		if (isUploadError() || isSendError()) return 'text-red-400';
		if (isNavigationWarning()) return 'text-blue-400';
		if (isDisconnectionEvent()) return 'text-red-400';
		if (isConnectionEvent()) return 'text-green-400';
		if (isButtonGroup()) return 'text-slate-400';
		if (isCopyableMessage()) return 'text-blue-300';
		return 'text-orange-300';
	};

	const getContainerClasses = () => {
		if (isUploadError() || isSendError()) return `border-red-600/50 bg-red-900/30`;
		if (isNavigationWarning()) return `border-blue-600/50 bg-blue-900/30`;
		if (isDisconnectionEvent()) return `border-red-600/50 bg-red-900/30`;
		if (isConnectionEvent()) return `border-green-600/50 bg-green-900/30`;
		if (isButtonGroup()) return 'border-zinc-600/50 bg-zinc-900/30';
		if (isCopyableMessage()) return 'border-blue-600/50 bg-blue-900/30';
		return `border-amber-600/50 bg-amber-900/30`;
	};

	const formatDate = (timestamp: number): string => {
		return new Date(timestamp).toLocaleString('zh-CN');
	};

	// Get the content to copy (for copyable messages, use copy_content if available)
	const getCopyContent = () => {
		if (isCopyableMessage()) {
			try {
				const systemMessage: SystemMessageCopyable = JSON.parse(message);
				return systemMessage.data.copy_content || systemMessage.data.message;
			} catch {
				return displayMessage;
			}
		}
		return displayMessage;
	};

	// Copy message content to clipboard
	const copyToClipboard = async () => {
		try {
			await navigator.clipboard.writeText(getCopyContent());
			copySuccess = true;
			// Reset the success state after a brief moment
			setTimeout(() => {
				copySuccess = false;
			}, 1000);
		} catch (error) {
			console.error('Failed to copy to clipboard:', error);
		}
	};
</script>

{#if isCopyableMessage()}
	<!-- Copyable message with click-to-copy functionality -->
	<button
		onclick={copyToClipboard}
		class="max-w-md rounded-xl border px-4 py-1 cursor-pointer transition-all duration-200 {getContainerClasses()} {copySuccess ? 'ring-2 ring-green-500/50 bg-green-900/40' : 'hover:bg-opacity-60'}"
		title="点击复制消息内容"
	>
		{#if type == 'sys'}
			<div class="flex items-center justify-center gap-2 text-xs {getMessageTextColor()}">
				<span class="opacity-70">{formatDate(timestamp)}</span>
				<span>{displayMessage.replace(/\n/g, ' ')}</span>
				{#if shouldShowVisibilityNotice()}
					<span class="opacity-70">只有你可以看到</span>
				{/if}
			</div>
		{:else}
			<div class="text-center text-sm {getMessageTextColor()}">
				{#each displayMessage.split('\n') as line, index}
					{#if index > 0}<br />{/if}{line}
				{/each}
				{#if shouldShowVisibilityNotice()}
					<div class="mt-1 text-xs opacity-70">这条消息只有你可以看到</div>
				{/if}
			</div>

			<div class="mt-1 text-center text-xs {getMessageTextColor()}/70">
				{formatDate(timestamp)}
			</div>
		{/if}
	</button>
{:else if !isButtonGroup()}
	<!-- Regular system message (non-clickable) -->
	<div class="max-w-md rounded-xl border px-4 py-1 {getContainerClasses()}">
		{#if type == 'sys'}
			<div class="flex items-center justify-center gap-2 text-xs {getMessageTextColor()}">
				<span class="opacity-70">{formatDate(timestamp)}</span>
				<span>{displayMessage.replace(/\n/g, ' ')}</span>
				{#if shouldShowVisibilityNotice()}
					<span class="opacity-70">仅你可见</span>
				{/if}
			</div>
		{:else}
			<div class="text-center text-sm {getMessageTextColor()}">
				{#each displayMessage.split('\n') as line, index}
					{#if index > 0}<br />{/if}{line}
				{/each}
				{#if shouldShowVisibilityNotice()}
					<div class="mt-1 text-xs opacity-70">这条消息只有你可以看到</div>
				{/if}
			</div>

			<div class="mt-1 text-center text-xs {getMessageTextColor()}/70">
				{formatDate(timestamp)}
			</div>
		{/if}
	</div>
{:else}
	<!-- Button group message -->
	<div class="max-w-md rounded-xl border px-4 py-1 {getContainerClasses()}">
		<div class="text-center text-sm {getMessageTextColor()}">
			<div class="py-2">
				{#if displayMessage}
					<div class="mb-3 text-slate-300">
						{#each displayMessage.split('\n') as line, index}
							{#if index > 0}<br />{/if}{line}
						{/each}
					</div>
				{/if}

				{#if buttons().length > 0}
					{#if hasDescriptions()}
						<!-- Row layout with descriptions -->
						<div class="space-y-1">
							{#each buttons() as button}
								{#if button.description}
									<div
										class="flex items-center gap-3 rounded-lg pr-2 {getButtonContainerVariantClasses(
											button.variant
										)}"
									>
										<button
											onclick={() => handleButtonClick(button.id)}
											class="flex-shrink-0 rounded-lg px-4 py-2.5 text-sm font-medium {getButtonVariantClasses(
												button.variant
											)}"
										>
											{button.text}
										</button>
										{#if button.description}
											<div class="text-left text-xs text-slate-300">{button.description}</div>
										{/if}
									</div>
								{:else}
									<button
										onclick={() => handleButtonClick(button.id)}
										class="rounded-lg px-4 py-2 text-sm font-medium transition-colors {getButtonVariantClasses(
											button.variant
										)}"
									>
										{button.text}
									</button>
								{/if}
							{/each}
						</div>
					{:else}
						<!-- Inline layout without descriptions -->
						<div class="flex flex-wrap justify-center gap-2">
							{#each buttons() as button}
								<button
									onclick={() => handleButtonClick(button.id)}
									class="rounded-lg px-4 py-2 text-sm font-medium transition-colors {getButtonVariantClasses(
										button.variant
									)}"
								>
									{button.text}
								</button>
							{/each}
						</div>
					{/if}
				{/if}
			</div>

			<div class="mt-1 text-center text-xs {getMessageTextColor()}/70">
				{formatDate(timestamp)}
			</div>
		</div>
	</div>
{/if}
