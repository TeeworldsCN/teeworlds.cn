import type { UserPermissions } from '$lib/server/db/users';
import type { Handler } from '../protocol/types';

export interface Command {
	fallback: boolean;
	cmd: string;
	args: string;
}

export class CommandRouter {
	private commands: Map<string, { handler: Handler; permissions?: UserPermissions }> = new Map();
	private fallbackHandler: Handler | null = null;

	/**
	 * register a command
	 * @param command the command name
	 * @param handler the handler function
	 * @param permissions the permissions required to run the command, allows to run if user have any of the permissions
	 */
	public add(command: string, handler: Handler, permissions?: UserPermissions) {
		this.commands.set(command, { handler, permissions });
		return this;
	}

	public fallback(handler?: Handler) {
		this.fallbackHandler = handler || null;
		return this;
	}

	public parse(msg: string, permissions: UserPermissions): Command {
		msg = msg.trim();
		if (msg.startsWith('/ ')) {
			msg = msg.slice(2);
		} else if (msg.startsWith('/')) {
			msg = msg.slice(1);
		}

		let command = msg;
		let args = '';

		const firstSpace = msg.indexOf(' ');
		if (firstSpace >= 0) {
			command = msg.slice(0, firstSpace);
			args = msg.slice(firstSpace + 1).trim();
		}

		// check permissions
		const handler = this.commands.get(command);
		if (!handler) {
			return { fallback: true, cmd: command, args: args };
		}

		const requiredPermissions = handler.permissions;

		const hasPermission =
			permissions.includes('SUPER') ||
			!requiredPermissions ||
			permissions.some((permission) => requiredPermissions.includes(permission));

		if (!hasPermission) {
			return { fallback: true, cmd: command, args: args };
		}
		return { fallback: false, cmd: command, args: args };
	}

	public async run(command: Command, data: Parameters<Handler>[0]) {
		if (command.fallback) {
			if (this.fallbackHandler) {
				return this.fallbackHandler(data);
			}
			return { ignored: true, message: 'Unknown command' };
		}

		const handler = this.commands.get(command.cmd);
		if (!handler) {
			return { ignored: true, message: 'Unknown command' };
		}
		return handler.handler(data);
	}
}
