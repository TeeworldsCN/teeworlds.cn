import type { UserPermissions, User } from '$lib/server/db/users';

// result of sending message
export type SendResult = object;

export interface SendTypeLink {
	/** If button is supported, it will be displayed as a button with label */
	label: string;
	/**  If button is not supported, it will be displayed as a `prefix: url` text line */
	prefix: string;
	/** Link url */
	url: string;
	/** allow the link to be sent regardless of the group settings */
	bypass?: boolean;
}

export type SendReply = {
	text: (msg: string) => Promise<SendResult> | SendResult;
	link: (link: SendTypeLink) => Promise<SendResult> | SendResult;
	textLink: (msg: string, link: SendTypeLink) => Promise<SendResult> | SendResult;
	image: (url: string) => Promise<SendResult> | SendResult;
	imageText: (msg: string, url: string) => Promise<SendResult> | SendResult;
	imageTextLink: (msg: string, url: string, link: SendTypeLink) => Promise<SendResult> | SendResult;
	custom: (body: any) => Promise<SendResult> | SendResult;
};

export type Handler = (data: {
	platform: string;
	uid: string;
	user: User | null;
	group: string;
	permissions: UserPermissions;
	reply: SendReply;
	command: string;
	args: string;
	mode: 'GROUP' | 'DIRECT';
	fetch: typeof global.fetch;
}) => Promise<SendResult> | SendResult;
