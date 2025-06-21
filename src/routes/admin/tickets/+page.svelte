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
		faChevronDown,
		faChevronRight,
		faRefresh,
		faChevronLeft,
		faEyeSlash,
		faEye,
		faServer,
		faUser,
		faShield
	} from '@fortawesome/free-solid-svg-icons';
	import { browser } from '$app/environment';
	import { SvelteSet } from 'svelte/reactivity';
	import { navigating, page } from '$app/state';
	import { tippy } from '$lib/tippy';
	import type { Permission } from '$lib/types.js';
	import Modal from '$lib/components/Modal.svelte';
	import DdNetMod from '$lib/components/admin/DDNetMod.svelte';

	const { data } = $props();

	let connectedAdmins = $state(data.connectedAdmins || []);
	let isAdminListCollapsed = $state(true);
	let userSubscribedTickets = $state(data.userSubscribedTickets);
	let tickets: (Ticket & { isNew?: boolean })[] = $state(data.tickets);

	// Check if current user has SUPER permission for delete functionality
	const hasSuper = data.user?.data?.permissions?.includes('SUPER') || false;

	// Track whether to show expired tickets
	let showExpired = $state(data.showExpired);

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
	let notificationVolume = $state(1.0);

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

	const hasPermission = (perm: Permission) =>
		(data.user?.data?.permissions || []).some(
			(permission) => permission == perm || permission == 'SUPER'
		);

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
			// clear out tickets that are 14 days old or known to be closed
			for (const ticketUuid in ticketReadStatus) {
				const ticket = tickets.find((t) => t.uuid === ticketUuid);
				if (ticket && Date.now() - ticket.updated_at > 14 * 24 * 60 * 60 * 1000) {
					delete ticketReadStatus[ticketUuid];
				}
			}
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
		if (!browser) return false;

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

	const formatTime = (timestamp: number) => {
		return new Date(timestamp).toLocaleString('zh-CN');
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
					ticket_uuid: ticketUuid,
					as: 'admin'
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
				const errorMessage = await parseErrorResponse(response);
				throw new Error(errorMessage);
			}

			// Status will be updated via SSE
		} catch (error) {
			console.error('Error reopening ticket:', error);
			alertMessage(`重开失败: ${error instanceof Error ? error.message : '未知错误'}`);
		}
	};

	const handleDeleteMessage = async (messageUuid: string) => {
		try {
			const response = await fetch('/api/tickets', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					action: 'delete_message',
					message_uuid: messageUuid,
					as: 'admin'
				})
			});

			if (!response.ok) {
				const errorMessage = await parseErrorResponse(response);
				throw new Error(errorMessage);
			}

			// Message deletion will be updated via SSE
		} catch (error) {
			console.error('Error deleting message:', error);
			alertMessage(`删除消息失败: ${error instanceof Error ? error.message : '未知错误'}`);
		}
	};

	const handleDeleteAttachment = async (attachmentUuid: string) => {
		try {
			const response = await fetch('/api/tickets', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					action: 'delete_attachment',
					attachment_uuid: attachmentUuid,
					as: 'admin'
				})
			});

			if (!response.ok) {
				const errorMessage = await parseErrorResponse(response);
				throw new Error(errorMessage);
			}

			// Attachment deletion will be updated via SSE
		} catch (error) {
			console.error('Error deleting attachment:', error);
			alertMessage(`删除附件失败: ${error instanceof Error ? error.message : '未知错误'}`);
		}
	};

	// Preload audio files to avoid repeated HTTP requests
	let audioCache: { [key: string]: HTMLAudioElement } = {};

	const initializeAudio = () => {
		try {
			audioCache.new = new Audio('/audio/new.ogg');
			audioCache.message = new Audio('/audio/msg.ogg');

			// Preload the audio files
			audioCache.new.preload = 'auto';
			audioCache.message.preload = 'auto';

			audioCache.new.load();
			audioCache.message.load();
		} catch (error) {
			console.error('Error initializing audio:', error);
		}
	};

	const playNotificationSound = (soundType: 'new' | 'message') => {
		if (notificationVolume > 0) {
			try {
				const audio = audioCache[soundType];
				if (audio) {
					audio.volume = notificationVolume;
					audio.currentTime = 0; // Reset to beginning
					audio.play().catch((e) => {
						console.error('Error playing audio:', e);
					});
				}
			} catch (error) {
				console.error('Error playing audio:', error);
			}
		}
	};

	const showNotification = (title: string, body: string, tag?: string) => {
		if ('Notification' in window && Notification.permission === 'granted') {
			try {
				new Notification(title, {
					body,
					icon: '/favicon.png',
					badge: '/favicon.png',
					tag: tag // Group notifications by tag (ticket UUID)
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

		let disconnectReason: string | null = null;

		connection = customSource('/api/sse/tickets?mode=admin', {
			cache: false,
			close({ connect, isLocal }) {
				if (isLocal) {
					disconnectReason = null;
					return;
				}

				console.log('SSE connection closed', disconnectReason);
				if (disconnectReason === 'shutdown') {
					isSSEConnected = false;
					retryAttempts = 0;
					// instantly reconnect when server is restarting
					connect();
				}
				disconnectReason = null;
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

			if (messageData === 'shutdown') {
				console.log('Server is shutting down');
				disconnectReason = 'shutdown';
				return;
			}

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
								ticketEvent.data.ticket.title,
								ticketEvent.data.ticket.uuid
							);
						}
						break;
					case 'admin_list_updated':
						if (ticketEvent.data.connectedAdmins !== undefined) {
							connectedAdmins = ticketEvent.data.connectedAdmins;
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
											`${ticketEvent.data.message.author_name}: ${ticketEvent.data.message.message}`,
											ticket.uuid
										);
									} else if (
										selectedTicket &&
										selectedTicket.uuid === ticketEvent.data.message.ticket_uuid &&
										document.visibilityState !== 'hidden'
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
											`${ticketEvent.data.attachment.uploaded_by} 上传了附件`,
											ticket.uuid
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
					case 'ticket_deleted':
						{
							// Delete is prone to desync, so we simply reload the page
							goto(location.href, { replaceState: true, invalidateAll: true });

							// Close the ticket panel if the deleted ticket is currently selected
							if (selectedTicket && selectedTicket.uuid === ticketEvent.data.ticket_uuid) {
								closeTicketPanel();
							}
						}
						break;
					case 'message_deleted':
						{
							// Mark message as deleted in the UI
							if (selectedTicket && selectedTicket.uuid === ticketEvent.data.ticket_uuid) {
								const messageIndex = selectedTicketMessages.findIndex(
									(m) => m.uuid === ticketEvent.data.message_uuid
								);
								if (messageIndex !== -1) {
									selectedTicketMessages[messageIndex].deleted = 1;
								}
							}
						}
						break;
					case 'attachment_deleted':
						{
							// Mark attachment as deleted in the UI
							if (selectedTicket && selectedTicket.uuid === ticketEvent.data.ticket_uuid) {
								const attachmentIndex = selectedTicketAttachments.findIndex(
									(a) => a.uuid === ticketEvent.data.attachment_uuid
								);
								if (attachmentIndex !== -1) {
									selectedTicketAttachments[attachmentIndex].deleted = 1;
								}
							}
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
			} else {
				notificationPermission = Notification.permission;
			}
		}

		checkOpenTickets();
	};

	let notificationListenerCleanup: (() => void) | null = null;

	// Listen for permission changes
	const setupPermissionListener = () => {
		if ('Notification' in window && 'permissions' in navigator) {
			navigator.permissions
				.query({ name: 'notifications' })
				.then((permissionStatus) => {
					// Update initial state
					notificationPermission =
						permissionStatus.state === 'prompt' ? 'default' : permissionStatus.state;

					const handler = () => {
						notificationPermission =
							permissionStatus.state === 'prompt' ? 'default' : permissionStatus.state;
						console.log('Notification permission changed to:', permissionStatus.state);
					};

					// Listen for changes
					permissionStatus.addEventListener('change', handler);
					notificationListenerCleanup = () => {
						permissionStatus.removeEventListener('change', handler);
					};
				})
				.catch((error) => {
					console.warn('Could not set up permission listener:', error);
					// Fallback: just set initial state
					if ('Notification' in window) {
						notificationPermission = Notification.permission;
					}
				});
		} else if ('Notification' in window) {
			// Fallback for browsers that don't support permissions API
			notificationPermission = Notification.permission;
		}
	};

	const openTicketPanel = async (ticket: Ticket) => {
		isLoadingTicket = true;
		selectedTicket = ticket;
		selectedTicketMessages = [];
		selectedTicketAttachments = [];

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
			created_at: Date.now(),
			deleted: 0
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
				as: 'admin'
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
				const errorMessage = await parseErrorResponse(response);
				throw new Error(errorMessage);
			}

			const result = await response.json();
			console.log('Attachment limit increased to:', result.newLimit);
		} catch (error) {
			console.error('Failed to increase attachment limit:', error);
			alertMessage('增加附件限制失败: ' + (error instanceof Error ? error.message : '未知错误'));
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
			alertMessage(`用户已被拉黑 ${duration} 天${closedTicketMessage}${disconnectedMessage}`);
		} catch (error) {
			console.error('Failed to ban user:', error);
			alertMessage('拉黑用户失败: ' + (error instanceof Error ? error.message : '未知错误'));
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

			alertMessage('用户拉黑已解除');
		} catch (error) {
			console.error('Failed to unban user:', error);
			alertMessage('解除拉黑失败: ' + (error instanceof Error ? error.message : '未知错误'));
		}
	};

	const handleDeleteTicket = async (ticketUuid: string) => {
		try {
			const response = await fetch('/api/tickets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'delete_ticket',
					ticket_uuid: ticketUuid
				})
			});

			if (!response.ok) {
				const errorMessage = await parseErrorResponse(response);
				throw new Error(errorMessage);
			}

			alertMessage('工单已删除');
		} catch (error) {
			console.error('Failed to delete ticket:', error);
			alertMessage('删除工单失败: ' + (error instanceof Error ? error.message : '未知错误'));
		}
	};

	const dismissWelcomeScreen = () => {
		showWelcomeScreen = false;
	};

	// Check for open tickets on mount and show notifications
	const checkOpenTickets = () => {
		if (!browser) return;

		// Find all tickets with 'open' status
		const openTickets = tickets.filter((ticket) => ticket.status === 'open');

		if (openTickets.length > 0) {
			// Play notification sound for open tickets
			playNotificationSound('new');

			// Show a summary notification for multiple open tickets
			if (openTickets.length === 1) {
				const ticket = openTickets[0];
				showNotification(
					'有待处理的工单',
					`${ticket.visitor_name || '匿名用户'}: ${ticket.title}`,
					ticket.uuid
				);
			} else {
				showNotification(
					'有待处理的工单',
					`当前有 ${openTickets.length} 个工单等待处理`,
					'open-tickets-summary'
				);
			}

			console.log(`Found ${openTickets.length} open tickets on page load`);
		}
	};

	const handlePreviousPage = () => {
		const newOffset = Math.max(0, offset - data.limit);
		if (newOffset === 0) {
			offsetIncrementedByNewTicket = false;
		}
		goto(`?offset=${newOffset}&limit=${data.limit}&show_expired=${showExpired}`, {
			replaceState: true
		});
	};

	const handleNextPage = () => {
		const newOffset = offset + data.limit;
		goto(`?offset=${newOffset}&limit=${data.limit}&show_expired=${showExpired}`, {
			replaceState: true
		});
	};

	const handleRefresh = () => {
		tickets = [];
		goto(`?offset=${offset}&limit=${data.limit}&show_expired=${showExpired}`, {
			invalidateAll: true
		});
	};

	const handleToggleExpired = () => {
		showExpired = !showExpired;
		goto(`?offset=0&limit=${data.limit}&show_expired=${showExpired}`, { replaceState: true });
	};

	let hydrated = $state(false);

	onMount(() => {
		loadReadStatus();
		setupSSE();
		setupPermissionListener();
		requestNotificationPermission();
		initializeAudio();
		hydrated = true;

		// Add keyboard shortcut listener
		if (typeof window !== 'undefined') {
			window.addEventListener('keydown', handleKeydown);
		}
	});

	onDestroy(() => {
		if (notificationListenerCleanup) {
			notificationListenerCleanup();
		}
		if (connection) {
			connection.close();
		}

		// Remove keyboard shortcut listener
		if (typeof window !== 'undefined') {
			window.removeEventListener('keydown', handleKeydown);
		}
	});

	afterNavigate(() => {
		tickets = data.tickets;
		userSubscribedTickets = data.userSubscribedTickets;
		connectedAdmins = data.connectedAdmins || [];
		offset = data.offset;
		data.limit = data.limit;
		totalCount = data.totalCount;
		showExpired = data.showExpired;

		// Reset highlight flag when navigating to offset 0
		if (data.offset === 0) {
			offsetIncrementedByNewTicket = false;
		}

		if (selectedTicket) {
			const uuid = selectedTicket.uuid;
			selectedTicket = data.tickets.find((t) => t.uuid === uuid) || null;
		}
	});

	// MODs
	let ddnetMod = $state(false);

	// Keyboard shortcuts
	const handleKeydown = (event: KeyboardEvent) => {
		// Ctrl+E to toggle DDNet MOD modal
		if (event.ctrlKey && event.key === 'e') {
			event.preventDefault();
			if (hasPermission('DDNET_MOD')) {
				ddnetMod = !ddnetMod;
			}
		}
	};
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

<div id="admin-tickets-page" class="flex h-[calc(100vh-9rem)] gap-2">
	<div class="flex w-full flex-col gap-2 sm:w-[48%] sm:max-w-[360px]">
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

			{#if unreadCount() > 0}
				<span class="text-sm text-red-400">未读: {unreadCount()}</span>
			{/if}

			<div class="flex flex-1 flex-col items-end gap-1 text-sm text-slate-400">
				<div class="flex items-center gap-3">
					<button
						onclick={() => (isAdminListCollapsed = !isAdminListCollapsed)}
						class="flex items-center gap-1 transition-colors hover:text-slate-200"
					>
						<span>管理: {connectedAdmins.length}</span>
						<Fa icon={isAdminListCollapsed ? faChevronRight : faChevronDown} size="xs" />
					</button>
				</div>
			</div>

			<button
				onclick={() => {
					if (notificationVolume > 0.5) {
						notificationVolume = 0.3; // Low volume
					} else {
						notificationVolume = 1.0; // High volume
					}
				}}
				class="w-4 text-slate-400 hover:text-slate-200"
			>
				<Fa icon={notificationVolume <= 0.3 ? faVolumeLow : faVolumeHigh} size="sm" />
			</button>
		</div>
		<!-- Collapsible Admin List -->
		{#if !isAdminListCollapsed && connectedAdmins.length > 0}
			<div class="scrollbar-subtle max-h-[25vh] overflow-y-auto rounded-lg bg-slate-900 px-2 py-2">
				<div class="mb-1 text-xs text-slate-400">在线管理员:</div>
				<div class="space-y-1">
					{#each connectedAdmins as admin}
						<div class="flex items-center gap-2 text-sm">
							<div class="h-2 w-2 rounded-full bg-green-500"></div>
							<span class="text-slate-300">{admin.username}</span>
							{#if admin.uuid === data.user?.uuid}
								<span class="text-xs text-slate-500">(你)</span>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				<div class="text-xs text-slate-400">
					显示 {offset + 1} - {Math.min(offset + data.limit, totalCount)} 条，共 {totalCount}
					条
				</div>
			</div>

			<div class="flex space-x-2">
				<button
					onclick={handleToggleExpired}
					class="flex h-6 w-8 items-center justify-center rounded-md px-2 py-1 text-xs transition-colors"
					class:bg-blue-600={showExpired}
					class:hover:bg-blue-700={showExpired}
					class:text-white={showExpired}
					class:bg-slate-700={!showExpired}
					class:hover:bg-slate-600={!showExpired}
					class:text-slate-200={!showExpired}
					use:tippy={{
						content: showExpired ? '点击隐藏已过期工单' : '点击显示已过期工单',
						placement: 'top'
					}}
				>
					<Fa icon={showExpired ? faEye : faEyeSlash} size="sm" />
				</button>
				<button
					onclick={handlePreviousPage}
					disabled={offset <= 0}
					class="flex h-6 w-8 items-center justify-center rounded-md px-2 py-1 text-sm transition-colors disabled:pointer-events-none disabled:opacity-50"
					class:bg-yellow-600={offsetIncrementedByNewTicket}
					class:hover:bg-yellow-700={offsetIncrementedByNewTicket}
					class:text-white={offsetIncrementedByNewTicket}
					class:bg-slate-700={!offsetIncrementedByNewTicket}
					class:hover:bg-slate-600={!offsetIncrementedByNewTicket}
					class:text-slate-200={!offsetIncrementedByNewTicket}
					use:tippy={{
						content: '上一页',
						placement: 'top'
					}}
				>
					<Fa icon={faChevronLeft} size="sm" />
				</button>
				<button
					onclick={handleNextPage}
					disabled={offset + data.limit >= totalCount}
					class="flex h-6 w-8 items-center justify-center rounded-md bg-slate-700 px-2 py-1 text-sm text-slate-200 hover:bg-slate-600 disabled:pointer-events-none disabled:opacity-50"
					use:tippy={{
						content: '下一页',
						placement: 'top'
					}}
				>
					<Fa icon={faChevronRight} size="sm" />
				</button>
				<button
					onclick={handleRefresh}
					class="flex h-6 w-8 items-center justify-center rounded-md bg-slate-700 px-2 py-1 text-sm text-slate-200 *:rounded-md hover:bg-slate-600"
					use:tippy={{
						content: '刷新当前页面数据',
						placement: 'top'
					}}
				>
					<Fa icon={faRefresh} size="sm" />
				</button>
			</div>
		</div>
		<div class="scrollbar-subtle flex-1 overflow-auto">
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
											<span>{formatTime(ticket.updated_at)}</span>
										</div>
									</div>
									<div class="flex-shrink-0">
										{#snippet tag(name: string, classes: string)}
											<span
												class="inline-flex items-center rounded-lg px-2 py-1 text-xs font-medium {classes}"
											>
												{name}
											</span>
										{/snippet}
										{#if isUserSubscribedToTicket(ticket.uuid) && ticket.status !== 'closed'}
											{@render tag(
												'已接单',
												'border  border-green-700 bg-green-950 text-green-100'
											)}
										{:else if ticket.status === 'open'}
											{@render tag('待处理', 'border border-yellow-600 bg-yellow-700 text-white')}
										{:else if ticket.status === 'in_progress'}
											{@render tag('处理中', 'border border-blue-600 bg-blue-950 text-blue-100')}
										{:else if ticket.updated_at < Date.now() - 3 * 24 * 60 * 60 * 1000}
											{@render tag('已过期', 'border border-slate-800 bg-slate-900 text-slate-700')}
										{:else}
											{@render tag('已关闭', 'border border-slate-800 bg-slate-900 text-slate-500')}
										{/if}
									</div>
								</div>
							</button>
						</div>
					{/key}
				{/each}
				{#if tickets.length === 0}
					<div class="py-12 text-center">
						<p class="text-slate-400">{navigating.to ? '加载中...' : '暂无反馈'}</p>
					</div>
				{/if}
			</div>
		</div>
		<div class="flex h-8 items-center gap-2 rounded-lg bg-slate-900 px-2">
			{#if hasPermission('DDNET_MOD')}
				<button
					onclick={(ev) => {
						ev?.currentTarget?.blur();
						ddnetMod = true;
					}}
					use:tippy={{
						content: 'DDNet 封禁工具 (Ctrl+E)',
						placement: 'top'
					}}
					class="flex h-6 w-8 items-center justify-center rounded-md bg-blue-700 px-2 py-1 text-sm text-slate-200 hover:bg-blue-600"
				>
					<Fa icon={faShield} size="sm" />
				</button>
			{/if}
			<a
				href="/ddnet/servers"
				target="_blank"
				onclick={(ev) => {
					ev?.currentTarget?.blur();
				}}
				use:tippy={{
					content: '服务器列表',
					placement: 'top'
				}}
				class="flex h-6 w-8 items-center justify-center rounded-md bg-green-700 px-2 py-1 text-sm text-slate-200 hover:bg-green-600"
			>
				<Fa icon={faServer} size="sm" />
			</a>
			<a
				href="/ddnet/players"
				target="_blank"
				onclick={(ev) => {
					ev?.currentTarget?.blur();
				}}
				use:tippy={{
					content: '玩家查询页面',
					placement: 'top'
				}}
				class="flex h-6 w-8 items-center justify-center rounded-md bg-green-700 px-2 py-1 text-sm text-slate-200 hover:bg-green-600"
			>
				<Fa icon={faUser} size="sm" />
			</a>
		</div>
	</div>

	<div
		id="ticket-panel"
		class="fixed bottom-10 left-0 right-0 top-14 flex-1 sm:static sm:block"
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
					uploadAs="admin"
					onAttachmentAdded={handleAttachmentAdded}
					onMessageSubmit={handleMessageSubmit}
					onSubscribe={handleSubscribe}
					onUnsubscribe={handleUnsubscribe}
					onCloseTicket={selectedTicket?.status !== 'closed' ? handleAdminCloseTicket : undefined}
					onReopenTicket={selectedTicket?.status === 'closed' ? handleAdminReopenTicket : undefined}
					onDeleteTicket={hasSuper ? handleDeleteTicket : undefined}
					onIncreaseAttachmentLimit={handleIncreaseAttachmentLimit}
					onBanUser={handleBanUser}
					onUnbanUser={handleUnbanUser}
					onDeleteMessage={handleDeleteMessage}
					onDeleteAttachment={handleDeleteAttachment}
					isCurrentUserSubscribed={selectedTicket
						? isUserSubscribedToTicket(selectedTicket.uuid)
						: false}
					isAdmin={true}
					isSuperAdmin={hasSuper}
					currentUsername={data.user?.username}
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
		{#if selectedTicket}
			<button
				onclick={closeTicketPanel}
				class="absolute right-2 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 p-2 text-slate-400 hover:bg-slate-700 hover:text-slate-200 sm:top-11"
				aria-label="关闭面板"
				use:tippy={{
					content: '关闭面板',
					placement: 'left'
				}}
			>
				<Fa icon={faXmark} />
			</button>
		{/if}
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
		id="welcome-screen"
		class="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black opacity-80"
		onclick={dismissWelcomeScreen}
		disabled={!hydrated}
	>
		<h1 class="mb-8 text-4xl font-bold text-slate-200">欢迎使用反馈管理系统</h1>
		<p class:opacity-0={!hydrated}>点击任意位置开始使用</p>
	</button>
{/if}

{#if hasPermission('DDNET_MOD')}
	<Modal bind:show={ddnetMod}>
		<DdNetMod show={ddnetMod}></DdNetMod>
	</Modal>
{/if}
