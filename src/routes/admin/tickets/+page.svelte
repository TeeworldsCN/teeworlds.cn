<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import TicketPanel from '$lib/components/TicketPanel.svelte';
	import { onMount, onDestroy, tick } from 'svelte';
	import type { Ticket, TicketMessage, TicketAttachmentClient } from '$lib/server/db/tickets';
	import type { TicketEvent } from '$lib/server/realtime/tickets';
	import { source } from 'sveltekit-sse';
	import { customSource } from '$lib/controlable-sse.js';
	import { afterNavigate, goto, replaceState } from '$app/navigation';
	import Fa from 'svelte-fa';
	import {
		faXmark,
		faVolumeHigh,
		faVolumeLow,
		faVolumeXmark
	} from '@fortawesome/free-solid-svg-icons';
	import { browser } from '$app/environment';
	import { SvelteSet } from 'svelte/reactivity';
	import { page } from '$app/state';

	const { data } = $props();

	let adminConnectionCount = $state(data.adminConnectionCount);
	let userSubscribedTickets = $state(data.userSubscribedTickets);
	let tickets: (Ticket & { isNew?: boolean })[] = $state(data.tickets);

	let notificationPermission = $state<NotificationPermission>('default');
	let selectedTicket = $state<Ticket | null>(null);
	let selectedTicketMessages = $state<TicketMessage[]>([]);
	let selectedTicketAttachments = $state<TicketAttachmentClient[]>([]);
	let isLoadingTicket = $state(false);

	let offset = $state(data.offset);
	let totalCount = $state(data.totalCount);

	// Track when offset was incremented due to new tickets (for page up button highlighting)
	let offsetIncrementedByNewTicket = $state(false);

	// Welcome screen state
	let showWelcomeScreen = $state(true);

	// Setup SSE connection using sveltekit-sse
	let connection: ReturnType<typeof source> | null = null;
	let isSSEConnected = $state(true);
	let retryAttempts = $state(0);

	// Unread message tracking
	const STORAGE_KEY = 'teeworlds:tickets:read-status';
	let ticketReadStatus = $state<{ [ticketUuid: string]: number }>({});

	// Volume setting for notification sounds
	let notificationVolume = $state(0.5);

	// Animation state for ticket cards
	let animatingTickets = $state<SvelteSet<string>>(new SvelteSet());

	// Trigger animation for a ticket card
	const triggerTicketAnimation = (ticketUuid: string) => {
		animatingTickets.add(ticketUuid);
		// Reset animation after duration
		setTimeout(() => {
			animatingTickets.delete(ticketUuid);
		}, 300); // Match motion duration
	};

	// Load read status from localStorage
	const loadReadStatus = () => {
		if (!browser) return;
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				ticketReadStatus = JSON.parse(stored);
			}
		} catch (error) {
			console.error('Error loading ticket read status:', error);
			ticketReadStatus = {};
		}
	};

	// Save read status to localStorage
	const saveReadStatus = () => {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(ticketReadStatus));
		} catch (error) {
			console.error('Error saving ticket read status:', error);
		}
	};

	// Mark ticket as read
	const markTicketAsRead = (ticketUuid: string, timestamp?: number) => {
		const readTime = timestamp || Date.now();
		ticketReadStatus[ticketUuid] = readTime;
		saveReadStatus();
	};

	// Check if ticket has unread messages
	const hasUnreadMessages = (ticket: Ticket): boolean => {
		// Don't track unread for closed tickets
		if (ticket.status === 'closed') return false;

		const lastReadTime = ticketReadStatus[ticket.uuid] || 0;
		return ticket.updated_at > lastReadTime;
	};

	// Count unread tickets
	const unreadCount = $derived(() => tickets.filter(hasUnreadMessages).length);

	// Helper function to check if current user is subscribed to a ticket
	const isUserSubscribedToTicket = (ticketUuid: string) => {
		return userSubscribedTickets.includes(ticketUuid);
	};

	const formatTimeAgo = (timestamp: number) => {
		const now = Date.now();
		const diff = now - timestamp;
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return '刚刚';
		if (minutes < 60) return `${minutes}分钟前`;
		if (hours < 24) return `${hours}小时前`;
		if (days < 7) return `${days}天前`;

		return new Date(timestamp).toLocaleDateString('zh-CN', {
			month: 'short',
			day: 'numeric'
		});
	};

	const handleCloseTicket = async (ticketUuid: string) => {
		try {
			const response = await fetch('/api/tickets', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					action: 'close_ticket',
					ticket_uuid: ticketUuid
				})
			});

			if (!response.ok) {
				throw new Error('Failed to close ticket');
			}

			// Status will be updated via SSE
		} catch (error) {
			console.error('Error closing ticket:', error);
			alertMessage('关闭失败');
		}
	};

	const handleReopenTicket = async (ticketUuid: string) => {
		try {
			const response = await fetch('/api/tickets', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					action: 'reopen_ticket',
					ticket_uuid: ticketUuid
				})
			});

			if (!response.ok) {
				throw new Error('Failed to reopen ticket');
			}

			// Status will be updated via SSE
		} catch (error) {
			console.error('Error reopening ticket:', error);
			alertMessage('重开失败');
		}
	};

	const playNotificationSound = (soundType: 'new' | 'message') => {
		if (
			'Notification' in window &&
			Notification.permission === 'granted' &&
			notificationVolume > 0
		) {
			try {
				const audio = new Audio(`/audio/${soundType === 'new' ? 'new.ogg' : 'msg.ogg'}`);
				audio.volume = notificationVolume;
				audio.play().catch(() => {});
			} catch (error) {
				console.error('Error creating audio element:', error);
			}
		}
	};

	const showNotification = (title: string, body: string) => {
		if ('Notification' in window && Notification.permission === 'granted') {
			try {
				new Notification(title, {
					body,
					icon: '/favicon.ico',
					badge: '/favicon.ico'
				});
			} catch (error) {
				console.error('Error showing notification:', error);
			}
		}
	};

	const scrollToBottom = async () => {
		await tick();
		const messagesContainer = document.getElementById('ticket-messages-container');
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	};

	const focusInput = async () => {
		await tick();
		const input = document.getElementById('message-input');
		if (input) {
			input.focus();
		}
	};

	const setupSSE = () => {
		if (typeof window === 'undefined') return;

		connection = customSource('/api/sse/tickets?mode=admin', {
			cache: false,
			close() {
				isSSEConnected = false;
			},
			lost() {
				isSSEConnected = false;
				console.log('SSE connection lost');
			},
			restore() {
				isSSEConnected = true;
				retryAttempts = 0;
				console.log('SSE connection restored');
				goto('', { invalidateAll: true });
			},
			attempts(attempts) {
				retryAttempts = attempts;
				console.log('SSE retry attempt:', attempts);
			}
		});

		// Set connected status when connection is established
		isSSEConnected = true;
		console.log('SSE connection opened');

		const sseMessages = connection.select('message');

		// Subscribe to SSE messages
		sseMessages.subscribe((messageData) => {
			if (!messageData) return;

			try {
				const ticketEvent: TicketEvent = JSON.parse(messageData);

				switch (ticketEvent.type) {
					case 'ticket_created':
						if (ticketEvent.data.ticket) {
							if (offset == 0) {
								tickets.unshift({ ...ticketEvent.data.ticket, isNew: true });
								for (let i = 1; i < tickets.length; i++) {
									tickets[i].isNew = false;
								}
								if (tickets.length > data.limit) {
									tickets.pop();
								}
							} else {
								offset++;
								replaceState(`?offset=${offset}&limit=${data.limit}`, page.state);
								offsetIncrementedByNewTicket = true;
							}
							totalCount++;

							playNotificationSound('new');
							showNotification(
								`${ticketEvent.data.ticket.visitor_name} 提交了工单`,
								ticketEvent.data.ticket.title
							);
						}
						break;
					case 'admin_connection_count_updated':
						if (ticketEvent.data.adminConnectionCount !== undefined) {
							adminConnectionCount = ticketEvent.data.adminConnectionCount;
						}
						break;
					case 'status_changed':
						{
							const ticket = tickets.find((t) => t.uuid === ticketEvent.data.ticket_uuid);
							if (ticket) {
								ticket.status = ticketEvent.data.new_status;
								ticket.updated_at = Date.now();
								triggerTicketAnimation(ticket.uuid);
							}

							// Remove subscriptions for closed tickets
							if (ticketEvent.data.new_status === 'closed') {
								const index = userSubscribedTickets.indexOf(ticketEvent.data.ticket_uuid);
								if (index > -1) {
									userSubscribedTickets.splice(index, 1);
								}
							}

							// If this is the currently selected ticket, update it
							if (selectedTicket && selectedTicket.uuid === ticketEvent.data.ticket_uuid) {
								selectedTicket.status = ticketEvent.data.new_status;
							}
						}
						break;
					case 'message_added':
						{
							const ticket = tickets.find((t) => t.uuid === ticketEvent.data.message.ticket_uuid);

							if (ticket) {
								if (ticketEvent.data.updated) {
									ticket.updated_at = ticketEvent.data.message.created_at;
									triggerTicketAnimation(ticket.uuid);
								}

								if (
									ticketEvent.data.message.author_type === 'visitor' ||
									(ticketEvent.data.message.author_type === 'admin' &&
										ticketEvent.data.message.author_name !== data.user?.username)
								) {
									if (isUserSubscribedToTicket(ticket.uuid) && ticket.status !== 'closed') {
										playNotificationSound('message');
										showNotification(
											`${ticket.title} #${ticket.uuid.slice(0, 8)}`,
											`${ticketEvent.data.message.author_name}: ${ticketEvent.data.message.message}`
										);
									} else if (
										selectedTicket &&
										selectedTicket.uuid === ticketEvent.data.message.ticket_uuid
									) {
										playNotificationSound('message');
									}
								}
							}

							// If this is for the currently selected ticket, add to messages and scroll
							if (selectedTicket && selectedTicket.uuid === ticketEvent.data.message.ticket_uuid) {
								selectedTicketMessages.push(ticketEvent.data.message);
								// Mark ticket as read when viewing new messages
								markTicketAsRead(selectedTicket.uuid, ticketEvent.data.message.created_at);
								scrollToBottom();
							}
						}
						break;
					case 'attachment_added':
						{
							// Update the ticket's updated_at time in the main list
							const ticket = tickets.find(
								(t) => t.uuid === ticketEvent.data.attachment.ticket_uuid
							);

							if (ticket) {
								ticket.updated_at = ticketEvent.data.attachment.uploaded_at;
								triggerTicketAnimation(ticket.uuid);

								// Show notification for visitor attachments
								if (ticketEvent.data.attachment.uploaded_by !== data.user?.username) {
									if (isUserSubscribedToTicket(ticket.uuid) && ticket.status !== 'closed') {
										playNotificationSound('message');
										showNotification(
											`${ticket.title} #${ticket.uuid.slice(0, 8)}`,
											`${ticketEvent.data.attachment.uploaded_by} 上传了附件`
										);
									} else if (
										selectedTicket &&
										selectedTicket.uuid === ticketEvent.data.attachment.ticket_uuid
									) {
										playNotificationSound('message');
									}
								}
							}

							// If this is for the currently selected ticket, add to attachments and scroll
							if (
								selectedTicket &&
								selectedTicket.uuid === ticketEvent.data.attachment.ticket_uuid
							) {
								selectedTicketAttachments.push(ticketEvent.data.attachment);
								// Mark ticket as read when viewing new attachments
								markTicketAsRead(selectedTicket.uuid, ticketEvent.data.attachment.uploaded_at);
								scrollToBottom();
							}
						}
						break;
					case 'admin_subscription_changed':
						{
							// Update the user's subscription status for this ticket
							const { ticket_uuid, subscribed } = ticketEvent.data;

							if (subscribed) {
								if (!userSubscribedTickets.includes(ticket_uuid)) {
									userSubscribedTickets.push(ticket_uuid);
								}
							} else {
								// Remove ticket from subscribed list
								const index = userSubscribedTickets.indexOf(ticket_uuid);
								if (index > -1) {
									userSubscribedTickets.splice(index, 1);
								}
							}

							console.log(
								`Subscription ${subscribed ? 'added' : 'removed'} for ticket ${ticket_uuid.slice(0, 8)}`
							);
						}
						break;
					case 'user_banned':
						{
							// Update ban status for the currently selected ticket if it matches
							if (selectedTicket && selectedTicket.author_uid === ticketEvent.data.author_uid) {
								selectedTicket.author_banned = true;
							}
							console.log(
								`User ${ticketEvent.data.author_uid} was banned by ${ticketEvent.data.banned_by}`
							);
						}
						break;
					case 'user_unbanned':
						{
							// Update ban status for the currently selected ticket if it matches
							if (selectedTicket && selectedTicket.author_uid === ticketEvent.data.author_uid) {
								selectedTicket.author_banned = false;
							}
							console.log(
								`User ${ticketEvent.data.author_uid} was unbanned by ${ticketEvent.data.unbanned_by}`
							);
						}
						break;
				}
			} catch (err) {
				console.error('Error parsing SSE event:', err);
			}
		});
	};

	const requestNotificationPermission = async () => {
		if ('Notification' in window) {
			if (Notification.permission === 'default') {
				const permission = await Notification.requestPermission();
				notificationPermission = permission;
				if (permission === 'granted') {
					showNotification('通知已启用', '您将收到新反馈和回复的实时通知');
				}
			} else {
				notificationPermission = Notification.permission;
			}
		}
	};

	const openTicketPanel = async (ticket: Ticket) => {
		isLoadingTicket = true;
		selectedTicket = ticket;

		try {
			// Fetch ticket details and messages
			const response = await fetch(`/api/tickets?uuid=${ticket.uuid}&messages=true`);
			if (response.ok) {
				const result = await response.json();
				selectedTicket = result.ticket;
				selectedTicketMessages = result.messages;
				selectedTicketAttachments = result.attachments || [];

				// Mark ticket as read when opened
				markTicketAsRead(ticket.uuid);

				scrollToBottom();
				focusInput();
			}
		} catch (error) {
			console.error('Error loading ticket details:', error);
		} finally {
			isLoadingTicket = false;
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

	const alertMessage = (message: string) => {
		selectedTicketMessages.push({
			uuid: randomUUID(),
			ticket_uuid: selectedTicket?.uuid || 'FAKE',
			message: message,
			author_type: 'system' as const,
			author_name: 'System',
			visibility: -1,
			created_at: Date.now()
		});
		scrollToBottom();
	};

	const closeTicketPanel = () => {
		selectedTicket = null;
		selectedTicketMessages = [];
		selectedTicketAttachments = [];
	};

	const handleAttachmentAdded = (attachment: TicketAttachmentClient) => {
		// Attachment added, no need to update main list
		console.log('Attachment added:', attachment.original_filename);
	};

	// Admin callback functions for TicketPanel
	const handleAdminCloseTicket = async () => {
		if (!selectedTicket) return;
		await handleCloseTicket(selectedTicket.uuid);
	};

	const handleAdminReopenTicket = async () => {
		if (!selectedTicket) return;
		await handleReopenTicket(selectedTicket.uuid);
	};

	// Helper function to parse error responses
	const parseErrorResponse = async (response: Response): Promise<string> => {
		try {
			const text = await response.text();
			// Try to parse as JSON first
			try {
				const json = JSON.parse(text);
				// If it's a JSON object with a message property, return that
				if (json && typeof json === 'object' && json.message) {
					return json.message;
				}
			} catch {
				// If JSON parsing fails, return the text as-is
			}
			return text;
		} catch {
			return '操作失败';
		}
	};

	const handleMessageSubmit = async (message: string) => {
		if (!selectedTicket) return;

		const response = await fetch('/api/tickets', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				action: 'add_message',
				ticket_uuid: selectedTicket.uuid,
				message: message,
				author_name: data.user?.username || 'Admin'
			})
		});

		if (!response.ok) {
			const errorMessage = await parseErrorResponse(response);
			throw new Error(errorMessage);
		}

		const result = await response.json();
		if (!result.success) {
			throw new Error('发送消息失败');
		}

		// Message will be added via SSE
	};

	const handleSubscribe = async (ticketUuid: string) => {
		try {
			const response = await fetch('/api/tickets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'subscribe',
					ticket_uuid: ticketUuid
				})
			});

			if (!response.ok) {
				throw new Error('Failed to subscribe');
			}
		} catch (error) {
			console.error('Failed to subscribe:', error);
			alertMessage('接单失败');
		}
	};

	const handleUnsubscribe = async (ticketUuid: string) => {
		try {
			const response = await fetch('/api/tickets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'unsubscribe',
					ticket_uuid: ticketUuid
				})
			});

			if (!response.ok) {
				throw new Error('Failed to unsubscribe');
			}
		} catch (error) {
			console.error('Failed to unsubscribe:', error);
			alertMessage('取消接单失败');
		}
	};

	const handleIncreaseAttachmentLimit = async (ticketUuid: string) => {
		try {
			const response = await fetch('/api/tickets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'increase_attachment_limit',
					ticket_uuid: ticketUuid
				})
			});

			if (!response.ok) {
				throw new Error('Failed to increase attachment limit');
			}

			const result = await response.json();
			console.log('Attachment limit increased to:', result.newLimit);
		} catch (error) {
			console.error('Failed to increase attachment limit:', error);
			alertMessage('增加附件限制失败');
		}
	};

	const handleBanUser = async (authorUid: string, duration: number, reason?: string) => {
		try {
			const response = await fetch('/api/tickets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'ban_user',
					author_uid: authorUid,
					ban_duration_days: duration,
					reason
				})
			});

			if (!response.ok) {
				const errorMessage = await parseErrorResponse(response);
				throw new Error(errorMessage);
			}

			const result = await response.json();
			console.log('User banned:', result.ban);

			const closedTicketMessage =
				result.closedTicketCount > 0 ? `，已自动关闭 ${result.closedTicketCount} 个工单` : '';
			const disconnectedMessage =
				result.disconnectedCount > 0 ? `，已强制断开 ${result.disconnectedCount} 个连接` : '';
			alertMessage(`用户已被封禁 ${duration} 天${closedTicketMessage}${disconnectedMessage}`);
		} catch (error) {
			console.error('Failed to ban user:', error);
			alertMessage('封禁用户失败: ' + (error instanceof Error ? error.message : '未知错误'));
		}
	};

	const handleUnbanUser = async (authorUid: string) => {
		try {
			const response = await fetch('/api/tickets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'unban_user',
					author_uid: authorUid
				})
			});

			if (!response.ok) {
				const errorMessage = await parseErrorResponse(response);
				throw new Error(errorMessage);
			}

			alertMessage('用户封禁已解除');
		} catch (error) {
			console.error('Failed to unban user:', error);
			alertMessage('解除封禁失败: ' + (error instanceof Error ? error.message : '未知错误'));
		}
	};

	const dismissWelcomeScreen = () => {
		showWelcomeScreen = false;
	};

	const handlePreviousPage = () => {
		const newOffset = Math.max(0, offset - data.limit);
		if (newOffset === 0) {
			offsetIncrementedByNewTicket = false;
		}
		goto(`?offset=${newOffset}&limit=${data.limit}`, { replaceState: true });
	};

	const handleNextPage = () => {
		const newOffset = offset + data.limit;
		goto(`?offset=${newOffset}&limit=${data.limit}`, { replaceState: true });
	};

	let hydrated = $state(false);

	onMount(() => {
		loadReadStatus();
		setupSSE();
		requestNotificationPermission();
		hydrated = true;
	});

	onDestroy(() => {
		if (connection) {
			connection.close();
		}
	});

	afterNavigate(() => {
		tickets = data.tickets;
		userSubscribedTickets = data.userSubscribedTickets;
		adminConnectionCount = data.adminConnectionCount;
		offset = data.offset;
		totalCount = data.totalCount;

		// Reset highlight flag when navigating to offset 0
		if (data.offset === 0) {
			offsetIncrementedByNewTicket = false;
		}

		if (selectedTicket) {
			const uuid = selectedTicket.uuid;
			selectedTicket = data.tickets.find((t) => t.uuid === uuid) || null;
		}
	});
</script>

<svelte:head>
	<title>反馈和举报管理 - TeeworldsCN Admin</title>
	<meta name="description" content="管理反馈和举报" />
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ href: '/admin', text: '管理工具', title: '管理工具' },
		{ text: '反馈和举报管理', title: '反馈和举报管理' }
	]}
/>

<div class="flex h-[calc(100vh-9rem)] gap-6">
	<div class="flex w-full flex-col gap-2 lg:w-1/3">
		<div class="flex h-8 items-center gap-2 rounded-lg bg-slate-900 px-2">
			{#if notificationPermission === 'denied'}
				<span class="text-sm text-red-400">通知已禁用</span>
			{:else if notificationPermission === 'default'}
				<button
					onclick={requestNotificationPermission}
					class="rounded-md bg-yellow-600 px-2 py-1 text-sm text-white hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
				>
					启用通知
				</button>
			{:else if notificationPermission === 'granted'}
				<span class="text-sm text-green-400">通知已启用</span>
			{/if}

			<div class="flex flex-1 flex-col items-end gap-1 text-sm text-slate-400">
				<div class="flex items-center gap-3">
					<span>管理: {adminConnectionCount}</span>
					{#if unreadCount() > 0}
						<span class="text-red-400">未读: {unreadCount()}</span>
					{/if}
				</div>
			</div>

			<button
				onclick={() => {
					if (notificationVolume === 0) {
						notificationVolume = 0.3; // Low volume
					} else if (notificationVolume <= 0.3) {
						notificationVolume = 1.0; // High volume
					} else {
						notificationVolume = 0; // Mute
					}
				}}
				class="w-4 transition-colors"
				class:text-red-400={notificationVolume === 0}
				class:hover:text-red-300={notificationVolume === 0}
				class:text-slate-400={notificationVolume > 0}
				class:hover:text-slate-200={notificationVolume > 0}
			>
				<Fa
					icon={notificationVolume === 0
						? faVolumeXmark
						: notificationVolume <= 0.3
							? faVolumeLow
							: faVolumeHigh}
					size="sm"
				/>
			</button>
		</div>
		<div class="flex items-center justify-between">
			<div class="block text-sm text-slate-400 lg:hidden xl:block">
				显示 {offset + 1} - {Math.min(offset + data.limit, totalCount)} 条，共 {totalCount}
				条
			</div>

			<div class="flex space-x-2">
				<button
					onclick={handlePreviousPage}
					disabled={offset <= 0}
					class="rounded-md px-2 py-1 text-sm transition-colors disabled:pointer-events-none disabled:opacity-50"
					class:bg-yellow-600={offsetIncrementedByNewTicket}
					class:hover:bg-yellow-700={offsetIncrementedByNewTicket}
					class:text-white={offsetIncrementedByNewTicket}
					class:bg-slate-700={!offsetIncrementedByNewTicket}
					class:hover:bg-slate-600={!offsetIncrementedByNewTicket}
					class:text-slate-200={!offsetIncrementedByNewTicket}
				>
					上一页
				</button>

				<button
					onclick={handleNextPage}
					disabled={offset + data.limit >= totalCount}
					class="rounded-md bg-slate-700 px-2 py-1 text-sm text-slate-200 hover:bg-slate-600 disabled:pointer-events-none disabled:opacity-50"
				>
					下一页
				</button>
			</div>
		</div>
		<div class="scrollbar-subtle flex-1 overflow-scroll">
			<div class="space-y-1">
				{#each tickets as ticket}
					{#key ticket.uuid}
						<div
							class="rounded-lg border bg-slate-900 px-2 py-1 transition-all duration-300 motion-duration-500 hover:border-blue-400"
							class:border-blue-500={ticket.uuid === selectedTicket?.uuid}
							class:border-slate-700={ticket.uuid !== selectedTicket?.uuid}
							class:ring-2={animatingTickets.has(ticket.uuid)}
							class:ring-red-400={animatingTickets.has(ticket.uuid)}
							class:scale-95={animatingTickets.has(ticket.uuid)}
							class:-motion-translate-y-in-100={ticket.isNew}
						>
							<button onclick={() => openTicketPanel(ticket)} class="w-full text-left">
								<div class="flex items-start justify-between gap-4">
									<div class="min-w-0 flex-1">
										<div class="mb-1 flex items-center gap-2">
											<div class="flex items-center gap-1">
												<h3 class="truncate text-sm font-medium text-slate-200">
													{ticket.title}
												</h3>
												{#if hasUnreadMessages(ticket)}
													<div class="h-2 w-2 flex-shrink-0 rounded-full bg-red-500"></div>
												{/if}
											</div>
											<span class="flex-shrink-0 text-xs text-slate-500">
												{ticket.visitor_name || '匿名用户'}
											</span>
										</div>
										<div class="flex items-center gap-4 text-xs text-slate-400">
											<span>ID: {ticket.uuid.slice(0, 8)}</span>
											<span>{formatTimeAgo(ticket.updated_at)}</span>
										</div>
									</div>
									<div class="flex-shrink-0">
										{#snippet tag(name: string, classes: string)}
											<span
												class="inline-flex items-center rounded-lg px-2 py-1 text-xs font-medium text-white {classes}"
											>
												{name}
											</span>
										{/snippet}
										{#if isUserSubscribedToTicket(ticket.uuid) && ticket.status !== 'closed'}
											{@render tag('已接单', 'bg-green-700')}
										{:else if ticket.status === 'open'}
											{@render tag('待处理', 'bg-yellow-600')}
										{:else if ticket.status === 'in_progress'}
											{@render tag('处理中', 'bg-blue-600')}
										{:else}
											{@render tag('已关闭', 'bg-gray-600')}
										{/if}
									</div>
								</div>
							</button>
						</div>
					{/key}
				{/each}

				{#if tickets.length === 0}
					<div class="py-12 text-center">
						<p class="text-slate-400">暂无反馈</p>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<div
		class="fixed bottom-10 left-0 right-0 top-14 flex-1 lg:static lg:block"
		class:hidden={!selectedTicket}
	>
		{#if selectedTicket}
			{#key selectedTicket.uuid}
				<!-- Admin Panel -->
				<TicketPanel
					bind:ticket={selectedTicket}
					bind:messages={selectedTicketMessages}
					bind:attachments={selectedTicketAttachments}
					uploadUrl="/api/tickets/upload"
					onAttachmentAdded={handleAttachmentAdded}
					onMessageSubmit={handleMessageSubmit}
					onSubscribe={handleSubscribe}
					onUnsubscribe={handleUnsubscribe}
					onCloseTicket={selectedTicket?.status !== 'closed' ? handleAdminCloseTicket : undefined}
					onReopenTicket={selectedTicket?.status === 'closed' ? handleAdminReopenTicket : undefined}
					onIncreaseAttachmentLimit={handleIncreaseAttachmentLimit}
					onBanUser={handleBanUser}
					onUnbanUser={handleUnbanUser}
					isCurrentUserSubscribed={selectedTicket
						? isUserSubscribedToTicket(selectedTicket.uuid)
						: false}
				/>
			{/key}
		{:else}
			<!-- Placeholder -->
			<div class="flex h-full items-center justify-center rounded-lg bg-slate-900">
				<div class="p-8 text-center text-slate-400">
					<svg
						class="mx-auto mb-4 h-16 w-16 text-slate-600"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="1"
							d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
						></path>
					</svg>
					<h3 class="mb-2 text-lg font-medium text-slate-300">选择反馈</h3>
					<p class="text-sm">点击左侧反馈标题或管理按钮<br />在此处查看和管理反馈详情</p>
				</div>
			</div>
		{/if}

		<!-- Close Button for lg+ screens -->

		<button
			onclick={closeTicketPanel}
			class="fixed right-2 top-16 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 p-2 text-slate-400 hover:bg-slate-700 hover:text-slate-200 lg:hidden"
			aria-label="关闭面板"
		>
			<Fa icon={faXmark} />
		</button>
	</div>
</div>

<!-- Loading overlay for ticket panel -->
{#if isLoadingTicket}
	<div class="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-25">
		<div class="rounded-lg bg-slate-800 p-4 text-slate-200">
			<div class="flex items-center space-x-3">
				<div class="h-5 w-5 animate-spin rounded-full border-b-2 border-sky-500"></div>
				<span>加载反馈详情...</span>
			</div>
		</div>
	</div>
{/if}

<!-- SSE Connection Lost Overlay -->
{#if !isSSEConnected}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
		<div class="mx-4 max-w-md rounded-lg border border-red-500 bg-slate-800 p-6 text-slate-200">
			<div class="mb-4 flex items-center space-x-3">
				<div class="flex-shrink-0">
					<svg class="h-6 w-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.232 15.5c-.77.833.192 2.5 1.732 2.5z"
						></path>
					</svg>
				</div>
				<div>
					<h3 class="text-lg font-medium text-red-400">连接已断开</h3>
				</div>
			</div>
			<p class="mb-4 text-slate-300">
				与服务器的实时连接已断开。您可能无法接收新的反馈通知和更新。
			</p>
			<div class="text-sm text-slate-400">
				{#if retryAttempts > 0}
					正在自动重连... (已重试 {retryAttempts} 次)
				{:else}
					正在自动重连...
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Welcome Screen -->
{#if showWelcomeScreen}
	<button
		class="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black opacity-80"
		onclick={dismissWelcomeScreen}
		disabled={!hydrated}
	>
		<h1 class="mb-8 text-4xl font-bold text-slate-200">欢迎使用反馈管理系统</h1>
		<p class:opacity-0={!hydrated}>点击任意位置开始使用</p>
	</button>
{/if}
