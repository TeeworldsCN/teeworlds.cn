export interface RealtimeEvent {
	type: string;
	data: any;
	timestamp?: number;
}

export type EventHandler = (event: RealtimeEvent) => void;

export class RealtimeClient {
	private eventSource: EventSource | null = null;
	private handlers = new Map<string, Set<EventHandler>>();
	private url: string;
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectDelay = 1000;

	constructor(url: string) {
		this.url = url;
	}

	connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.eventSource) {
				this.disconnect();
			}

			this.eventSource = new EventSource(this.url);

			this.eventSource.onopen = () => {
				console.log('Realtime connection established');
				this.reconnectAttempts = 0;
				resolve();
			};

			this.eventSource.onmessage = (event) => {
				try {
					const data: RealtimeEvent = JSON.parse(event.data);
					this.handleEvent(data);
				} catch (error) {
					console.error('Error parsing realtime event:', error);
				}
			};

			this.eventSource.onerror = (error) => {
				console.error('Realtime connection error:', error);

				if (this.reconnectAttempts < this.maxReconnectAttempts) {
					this.reconnectAttempts++;
					console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

					setTimeout(() => {
						this.connect();
					}, this.reconnectDelay * this.reconnectAttempts);
				} else {
					console.error('Max reconnection attempts reached');
					reject(new Error('Failed to establish realtime connection'));
				}
			};
		});
	}

	disconnect(): void {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}
	}

	on(eventType: string, handler: EventHandler): void {
		if (!this.handlers.has(eventType)) {
			this.handlers.set(eventType, new Set());
		}
		this.handlers.get(eventType)!.add(handler);
	}

	off(eventType: string, handler: EventHandler): void {
		const handlers = this.handlers.get(eventType);
		if (handlers) {
			handlers.delete(handler);
			if (handlers.size === 0) {
				this.handlers.delete(eventType);
			}
		}
	}

	private handleEvent(event: RealtimeEvent): void {
		const handlers = this.handlers.get(event.type);
		if (handlers) {
			handlers.forEach(handler => {
				try {
					handler(event);
				} catch (error) {
					console.error('Error in event handler:', error);
				}
			});
		}

		// Also call handlers for 'all' events
		const allHandlers = this.handlers.get('*');
		if (allHandlers) {
			allHandlers.forEach(handler => {
				try {
					handler(event);
				} catch (error) {
					console.error('Error in wildcard event handler:', error);
				}
			});
		}
	}

	isConnected(): boolean {
		return this.eventSource?.readyState === EventSource.OPEN;
	}
}

// Utility function to create a ticket realtime client
export function createTicketRealtimeClient(ticketUuid?: string): RealtimeClient {
	const params = new URLSearchParams();

	if (ticketUuid) {
		params.set('mode', 'ticket');
		params.set('ticket', ticketUuid);
	} else {
		params.set('mode', 'admin');
	}

	const url = `/api/sse/tickets?${params.toString()}`;
	return new RealtimeClient(url);
}

// Browser notification helper
export async function requestNotificationPermission(): Promise<NotificationPermission> {
	if (!('Notification' in window)) {
		return 'denied';
	}

	if (Notification.permission === 'granted') {
		return 'granted';
	}

	if (Notification.permission === 'denied') {
		return 'denied';
	}

	try {
		const permission = await Notification.requestPermission();
		return permission;
	} catch (error) {
		console.error('Error requesting notification permission:', error);
		return 'denied';
	}
}

export function showNotification(title: string, options?: NotificationOptions): Notification | null {
	if (!('Notification' in window) || Notification.permission !== 'granted') {
		return null;
	}

	try {
		return new Notification(title, {
			icon: '/favicon.ico',
			badge: '/favicon.ico',
			...options
		});
	} catch (error) {
		console.error('Error showing notification:', error);
		return null;
	}
}

export function getNotificationPermission(): NotificationPermission {
	if (!('Notification' in window)) {
		return 'denied';
	}
	return Notification.permission;
}
