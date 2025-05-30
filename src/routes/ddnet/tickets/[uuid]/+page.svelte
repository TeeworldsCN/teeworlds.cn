<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import TicketPanel from '$lib/components/TicketPanel.svelte';
	import type { TicketMessage, Ticket, TicketAttachmentClient } from '$lib/server/db/tickets';
	import type { TicketEvent } from '$lib/server/realtime/tickets';
	import { onMount, onDestroy, tick } from 'svelte';
	import { afterNavigate, beforeNavigate, invalidate } from '$app/navigation';
	import { customSource } from '$lib/controlable-sse';
	import Fa from 'svelte-fa';
	import { faPlugCircleBolt } from '@fortawesome/free-solid-svg-icons';

	const { data } = $props();

	let ticket = $state<Ticket>(data.ticket);
	let messages = $state<TicketMessage[]>(data.messages);
	let attachments = $state<TicketAttachmentClient[]>(data.attachments || []);
	let hasShownUnloadWarning = $state(false);
	let adminCount = $state<number>(data.adminConnectionCount);

	// Setup SSE connection using customSource
	let connection: ReturnType<typeof customSource> | null = null;
	let isSSEConnectLost = $state(false);
	let retryAttempts = $state(0);

	let isSSEClosed = $state(false);
	let isSSEClosedByUser = $state(false);
	let readonly = $state(false);

	// Preload audio files to avoid repeated HTTP requests
	let audioCache: HTMLAudioElement | null = null;

	const initializeAudio = () => {
		try {
			audioCache = new Audio('/audio/msg.ogg');
			audioCache.preload = 'auto';
			audioCache.load();
		} catch (error) {
			console.error('Error initializing audio:', error);
		}
	};

	const playNotificationSound = () => {
		try {
			if (audioCache) {
				audioCache.volume = 1.0;
				audioCache.currentTime = 0; // Reset to beginning
				audioCache.play().catch(() => {});
			}
		} catch (error) {
			console.error('Error playing audio:', error);
		}
	};

	const scrollToBottom = async () => {
		await tick();
		const messagesContainer = document.getElementById('ticket-messages-container');
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	};

	const setupSSE = () => {
		if (typeof window === 'undefined') return;

		console.log('Setting up SSE...');

		connection = customSource(`/api/sse/tickets?mode=ticket&ticket=${ticket.uuid}`, {
			cache: false,
			close({ isLocal }) {
				if (!isLocal) {
					isSSEClosed = true;
					readonly = true;
				}
			},
			lost() {
				isSSEConnectLost = true;
				console.log('SSE connection lost');
			},
			restore() {
				isSSEConnectLost = false;
				retryAttempts = 0;
				console.log('SSE connection restored');
				invalidate((url) => url.pathname.startsWith('/ddnet/tickets/'));
			},
			attempts(attempts) {
				retryAttempts = attempts;
				console.log('SSE retry attempt:', attempts);
			}
		});

		// Set connected status when connection is established
		isSSEConnectLost = false;
		console.log('SSE connection established');
		const sseMessages = connection.select('message');

		// Subscribe to SSE messages
		sseMessages.subscribe((messageData) => {
			if (!messageData) return;

			try {
				const ticketEvent: TicketEvent = JSON.parse(messageData);

				switch (ticketEvent.type) {
					case 'message_added':
						if (ticketEvent.data.message) {
							messages.push(ticketEvent.data.message);

							if (ticketEvent.data.message.author_type === 'admin') {
								playNotificationSound();
							}

							scrollToBottom();
						}
						break;
					case 'attachment_added':
						if (ticketEvent.data.attachment) {
							attachments.push(ticketEvent.data.attachment);

							if (ticketEvent.data.attachment.uploaded_by !== data.visitorName) {
								playNotificationSound();
							}
							scrollToBottom();
						}
						break;
					case 'status_changed':
						if (ticketEvent.data.ticket_uuid === ticket.uuid) {
							ticket.status = ticketEvent.data.new_status;
						}
						break;
					case 'admin_connection_count_updated':
						if (ticketEvent.data.adminConnectionCount !== undefined) {
							adminCount = ticketEvent.data.adminConnectionCount;
						}
						break;
				}
			} catch (err) {
				console.error('Error parsing SSE event:', err);
			}
		});

		return connection;
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
			return '发送消息失败';
		}
	};

	// Visitor callback functions for TicketPanel
	const handleVisitorMessageSubmit = async (message: string) => {
		const response = await fetch('/api/tickets', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				action: 'add_message',
				ticket_uuid: ticket.uuid,
				message: message,
				as: 'visitor'
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

	const handleAttachmentAdded = (_attachment: TicketAttachmentClient) => {
		// Attachment already added via binding, no additional action needed
	};

	const handleCloseTicket = async () => {
		const response = await fetch('/api/tickets', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				action: 'close_ticket',
				ticket_uuid: ticket.uuid,
				as: 'visitor'
			})
		});

		if (!response.ok) {
			const errorMessage = await parseErrorResponse(response);
			throw new Error(errorMessage);
		}

		const result = await response.json();
		if (!result.success) {
			throw new Error('关闭失败');
		}

		// Status will be updated via SSE
	};

	onMount(() => {
		const connection = setupSSE();

		// Add beforeunload event listener to prevent closing tab/window
		window.addEventListener('beforeunload', handleBeforeUnload);

		initializeAudio();
		scrollToBottom();

		// Return cleanup function
		return () => {
			isSSEClosedByUser = true;
			connection?.close();
			window.removeEventListener('beforeunload', handleBeforeUnload);
		};
	});

	afterNavigate(() => {
		ticket = data.ticket;
		messages = data.messages;
		attachments = data.attachments || [];
		hasShownUnloadWarning = false;
		adminCount = data.adminConnectionCount;
	});

	onDestroy(() => {
		if (connection) {
			connection.close();
		}
	});

	// Navigation warning for open tickets
	beforeNavigate((navigation) => {
		// Only show warning if ticket is not closed
		if (ticket.status !== 'closed' && !isSSEConnectLost) {
			// Show confirmation dialog
			const shouldLeave = confirm(
				'您正在查看一个尚未解决的反馈。离开此页面后，我们可能无法再与您联系。但我们仍会尽量处理您的反馈。\n\n确定要离开吗？'
			);

			// If user chooses to stay, cancel navigation
			if (!shouldLeave) {
				navigation.cancel();
			} else {
				// Close connection to trigger disconnect message
				if (connection) {
					connection.close();
				}
			}
		} else {
			// Close connection to trigger disconnect message
			if (connection) {
				connection.close();
			}
		}
	});

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

	// Prevent closing browser tab/window for open tickets
	const handleBeforeUnload = (event: BeforeUnloadEvent) => {
		// Close connection to trigger disconnect message
		if (connection) {
			connection.close();
		}

		// Only show warning if ticket is not closed
		if (ticket.status !== 'closed' && !isSSEConnectLost) {
			// Add a system message explaining why the warning appeared (only once)
			if (!hasShownUnloadWarning) {
				hasShownUnloadWarning = true;

				const warningMessage = {
					uuid: randomUUID(),
					ticket_uuid: ticket.uuid,
					message: JSON.stringify({
						type: 'navigation_warning',
						data: {
							message:
								'您刚才看到的离开确认是为了防止您错过重要回复。如果您确实要离开，您的反馈仍会被处理。'
						}
					}),
					author_type: 'system' as const,
					author_name: 'System',
					visibility: -1, // Local only - navigation warnings are only visible to the current user
					created_at: Date.now()
				};

				// Add to messages (this will show even if they choose to stay)
				messages.push(warningMessage);

				scrollToBottom();
			}

			// Recommended approach for modern browsers
			event.preventDefault();

			// Required for legacy browser support (Chrome/Edge < 119)
			event.returnValue = true;
		}
	};
</script>

<svelte:head>
	<title>反馈 #{ticket.uuid.slice(0, 8)} - TeeworldsCN</title>
	<meta name="description" content="查看反馈和举报详情" />
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ href: '/ddnet', text: 'DDNet' },
		{ href: '/ddnet/tickets', text: '反馈和举报', title: '反馈和举报' },
		{ text: `${ticket.title} #${ticket.uuid.slice(0, 8)}`, title: '反馈详情' }
	]}
/>

<div class="mx-auto h-[calc(100svh-8rem)] max-w-xl">
	<TicketPanel
		bind:ticket
		bind:messages
		bind:attachments
		uploadUrl="/api/tickets/upload"
		uploadAs="visitor"
		readonlyInput={!data.canSendMessage || readonly}
		onMessageSubmit={handleVisitorMessageSubmit}
		onAttachmentAdded={handleAttachmentAdded}
		onCloseTicket={ticket.status !== 'closed' && !isSSEClosed ? handleCloseTicket : undefined}
		isVisitorView={true}
		{adminCount}
	/>
</div>

<!-- SSE Connection Lost Overlay -->
{#if isSSEConnectLost}
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
				与服务器的连接已断开，这可能是服务器问题。您可能无法接收新的回复和更新。
			</p>
			<div class="text-sm text-slate-400">
				{#if retryAttempts > 0}
					正在重试连接... (已重试 {retryAttempts} 次)
				{:else}
					正在重试连接...
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- SSE Closed Overlay -->
{#if isSSEClosed}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
		<div class="mx-4 max-w-md rounded-lg border border-slate-600 bg-slate-800 p-6 text-slate-200">
			<div class="mb-4 flex items-center space-x-3">
				<div class="flex-shrink-0">
					<Fa icon={faPlugCircleBolt} size="lg" />
				</div>
				<div>
					<h3 class="text-lg font-medium text-slate-300">工单已过期</h3>
				</div>
			</div>
			<p class="mb-4 text-slate-300">由于这个工单已经过期，无法再进行回复。</p>
			<div class="flex justify-end">
				<button
					onclick={() => (isSSEClosed = false)}
					class="rounded bg-slate-600 px-4 py-2 text-sm text-white hover:bg-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400"
				>
					知道了
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(html, body) {
		overscroll-behavior: none;
		overflow: hidden;
	}
</style>
