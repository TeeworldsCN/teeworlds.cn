<script lang="ts">
	import { goto } from '$app/navigation';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import type { TicketImageUrl } from '$lib/components/ChatTimeline.svelte';
	import TicketPanel from '$lib/components/TicketPanel.svelte';
	import { primaryAddress } from '$lib/ddnet/helpers.js';
	import type { ButtonData, TicketMessage } from '$lib/server/db/tickets.js';
	import { onMount, tick } from 'svelte';
	import tippy from 'tippy.js';

	const { data } = $props();

	const ticket = {
		title: '反馈与举报'
	};

	let messageId = $state(0);
	let acceptingMessage = $state(false);

	let messages: TicketMessage[] = $state([]);
	let images: TicketImageUrl[] = $state([]);
	let currentName: string | null = $state(null);

	const playerName = $derived(currentName || data.playerName);

	const hideMessage = (messageId: string | number) => {
		const selectionMessage = messages.find((m) => m.uuid == messageId);
		if (selectionMessage) {
			if (selectionMessage.author_type != 'system') {
				selectionMessage.author_type = 'system';
			}
			selectionMessage.message = '豆豆撤回了一条消息';
		}
	};

	const scrollToBottom = async () => {
		await tick();
		const messagesContainer = document.getElementById('ticket-messages-container');
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	};

	const sendMessage = (message: string) => {
		const msgId = (messageId++).toString();
		messages.push({
			uuid: msgId,
			ticket_uuid: 'FAKE',
			message: message,
			author_type: 'bot' as const,
			author_name: '豆豆',
			visibility: 0, // Visible to all
			created_at: Date.now()
		});
		scrollToBottom();
		return msgId;
	};

	const sendImage = (url: string) => {
		const msgId = (messageId++).toString();
		images.push({
			uuid: msgId,
			ticket_uuid: 'FAKE',
			url,
			uploaded_at: Date.now()
		});
		scrollToBottom();
		return msgId;
	};

	const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	let buttonHandler: ((id: string) => void) | null = null;

	const buttonPrompt = (title: string, buttons: ButtonData[]) =>
		new Promise<string>((resolve) => {
			const msgId = (messageId++).toString();
			buttonHandler = (id) => {
				resolve(id);
				hideMessage(msgId);
				buttonHandler = null;
			};
			messages.push({
				uuid: msgId,
				ticket_uuid: 'FAKE',
				message: JSON.stringify({
					type: 'button_group',
					data: {
						message: title,
						buttons
					}
				}),
				author_type: 'system' as const,
				author_name: 'System',
				visibility: 0, // Visible to all
				created_at: Date.now()
			});
			scrollToBottom();
		});

	let inputHandler: ((message: string) => void) | null = null;

	const inputPrompt = () =>
		new Promise<string>((resolve) => {
			acceptingMessage = true;
			inputHandler = (message) => {
				resolve(message);
				acceptingMessage = false;
				inputHandler = null;
			};
		});

	const buttonOrInputPrompt = (title: string, buttons: ButtonData[]) =>
		new Promise<{ type: 'button' | 'input'; value: string }>((resolve) => {
			const msgId = (messageId++).toString();
			acceptingMessage = true;
			buttonHandler = (id) => {
				resolve({ type: 'button', value: id });
				hideMessage(msgId);
				buttonHandler = null;
				inputHandler = null;
				acceptingMessage = false;
			};
			inputHandler = (message) => {
				resolve({ type: 'input', value: message });
				hideMessage(msgId);
				buttonHandler = null;
				inputHandler = null;
				acceptingMessage = false;
			};
			messages.push({
				uuid: msgId,
				ticket_uuid: 'FAKE',
				message: JSON.stringify({
					type: 'button_group',
					data: {
						message: title,
						buttons
					}
				}),
				author_type: 'system' as const,
				author_name: 'System',
				visibility: 0, // Visible to all
				created_at: Date.now()
			});
			scrollToBottom();
		});

	$effect(() => {
		if (acceptingMessage) {
			(async () => {
				await tick();
				// focus input
				const input = document.querySelector('input');
				if (input) {
					input.focus();
				}
			})();
		}
	});

	const verifyCode = async (code: string): Promise<{ success: boolean; error?: string }> => {
		try {
			const response = await fetch('/api/verify', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ code })
			});

			const result = await response.json();

			if (result.success && result.token) {
				// Redirect to the token route to set the cookie
				goto(`/ddnet/tickets?token=${result.token}`, { replaceState: true, invalidateAll: true });
				return { success: true };
			} else {
				return { success: false, error: result.error || '验证失败' };
			}
		} catch (error) {
			return { success: false, error: '网络错误，请稍后重试' };
		}
	};

	const verifyFlow = async () => {
		await wait(125);
		sendMessage(
			'这好像是你第一次提交反馈，首先豆豆需要知道你是谁。需要使用QQ或微信认证。请问哪个更方便呢？'
		);
		await wait(125);
		const selected = await buttonPrompt('豆豆邀请你选择认证方式', [
			{
				text: 'QQ',
				id: 'qq',
				variant: 'primary'
			},
			{
				text: '微信',
				id: 'wechat',
				variant: 'primary'
			},
			{
				text: '都没有',
				id: 'none',
				variant: 'secondary'
			}
		]);
		await wait(500);
		if (selected === 'qq') {
			await wait(125);
			sendMessage('请使用手机QQ扫描二维码添加“DDNet豆豆”，并私聊豆豆“验证”获取验证码');
			await wait(125);
			sendImage('/qrcodes/ddbot-qq.png');
		} else if (selected === 'wechat') {
			await wait(125);
			sendMessage('请用微信二维码关注“Teeworlds豆豆”，并向公众号内发送“验证”获取验证码');
			await wait(125);
			sendImage('/qrcodes/ddbot-wx.png');
		} else {
			await wait(125);
			sendMessage(
				'很抱歉，这样的话我们无法处理你的举报。如果你是外网用户且可以登录 Discord。你也可以加入游戏官方 Discord 进行举报和反馈。'
			);
			await buttonPrompt('', [
				{
					text: '跳转到 DDNet 官方 Discord',
					id: 'discord',
					variant: 'primary'
				}
			]);
			await wait(500);
			sendMessage('好的，豆豆正在为你跳转...');
			await wait(1500);
			goto(`/link/?ref=${encodeURIComponent('https://ddnet.org/discord')}`);
			return;
		}

		await wait(125);
		sendMessage('请输入你收到的8位验证码：');

		let attempts = 0;
		const maxAttempts = 3;

		while (attempts < maxAttempts) {
			const code = await inputPrompt();
			attempts++;
			const result = await verifyCode(code);
			await wait(250);
			if (result.success) {
				if (playerName) {
					sendMessage(`验证成功！你好，${playerName}，我接下来会帮你创建反馈和通知管理`);
				} else {
					sendMessage('验证成功！我接下来会帮你创建反馈和通知管理');
				}

				await wait(250);
				if (!(await existingTicketFlow())) {
					selectionFlow(false);
				}
				return;
			} else {
				sendMessage(`验证失败，${result.error}` || '验证失败');
			}
		}

		sendMessage('失败次数过多');
		await wait(125);
		await buttonPrompt('', [
			{
				text: '重新开始',
				id: 'restart',
				variant: 'primary'
			}
		]);
		location.reload();
	};

	const findPlayer = async (name: string) => {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);
		try {
			const response = await fetch(`/api/server?name=${encodeURIComponent(name)}`, {
				signal: controller.signal
			});
			if (response.status === 400) {
				return 'indecisive';
			}
			if (!response.ok) {
				return null;
			}
			const data = await response.json();
			return data;
		} catch {
			return null;
		} finally {
			clearTimeout(timeoutId);
		}
	};

	const bindName = async (name: string) => {
		await fetch(`/api/bind?name=${encodeURIComponent(name)}`, {
			method: 'POST',
			credentials: 'same-origin'
		});
	};

	const checkPoints = async (name: string) => {
		const response = await fetch(`/api/points?name=${encodeURIComponent(name)}`, {
			method: 'GET'
		});
		if (response.ok) {
			return (await response.json()).points;
		} else {
			return response.status === 404 ? -1 : -2; // -1 not found, -2 error
		}
	};

	const checkMerge = async (from: string, to: string) => {
		const response = await fetch(
			`/api/rename?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
			{
				method: 'GET'
			}
		);
		if (response.ok) {
			return await response.json();
		} else {
			// if error, assume can merge
			return true;
		}
	};

	const rememberNameFlow = async () => {
		if (playerName !== data.playerName) {
			await wait(125);
			const button = await buttonPrompt(`需要豆豆帮你绑定 ${playerName} 这个游戏名吗？`, [
				{
					text: '绑定',
					id: 'remember',
					variant: 'primary'
				},
				{
					text: '不用了',
					id: 'forget',
					variant: 'secondary'
				}
			]);
			if (button === 'remember') {
				await bindName(playerName);
			}
		}
	};

	const createReportFlow = async (server: string) => {
		await wait(500);
		await rememberNameFlow();

		await wait(125);
		if (!server) {
			3;
			sendMessage('好的，请记得在呼叫管理后手动提供服务器信息给管理！\n\n豆豆马上为你呼叫管理...');
			await wait(2000);
		} else {
			sendMessage('好的，豆豆正在为你呼叫管理...');
		}

		try {
			// Create the ticket with the first message
			const response = await fetch('/api/tickets', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					action: 'create',
					type: 'report',
					args: {
						name: playerName,
						server: server
					}
				})
			});

			if (response.ok) {
				const result = await response.json();
				if (result.success && result.ticket) {
					await wait(250);
					sendMessage('管理呼叫完毕！豆豆正在为你跳转人工...');
					await wait(1000);
					goto(`/ddnet/tickets/${result.ticket.uuid}`);
				} else {
					throw new Error('malformed response');
				}
			} else {
				throw new Error('ticket creation failed');
			}
		} catch (error) {
			console.error('Error creating ticket:', error);
			sendMessage('抱歉，呼叫时出现了问题。请稍后重试。');
			await wait(125);
			await buttonPrompt('', [
				{
					text: '重新开始',
					id: 'restart',
					variant: 'primary'
				}
			]);
			location.reload();
		}
	};

	const reportFlow = async () => {
		await wait(125);
		if (playerName) {
			sendMessage(`好的。豆豆正在确认你所在的服务器。`);
			const playerServers = await findPlayer(playerName);
			// prompt buttons of servers
			if (Array.isArray(playerServers) && playerServers.length > 0) {
				const buttons: ButtonData[] = playerServers.map((server: any) => ({
					text: server.name,
					id: primaryAddress(server.addresses),
					variant: 'primary'
				}));
				buttons.push({
					text: playerServers.length > 1 ? '我也不确定' : '我不在服务器里',
					id: 'none',
					variant: 'secondary'
				});
				const msg = sendMessage(
					`请确认你自己所在的服务器，方便管理即时登录调解\n\n回复你的其他游戏名，豆豆会重新查找服务器`
				);
				const result = await buttonOrInputPrompt(`请点击确认 ${playerName} 所在服务器`, buttons);
				hideMessage(msg);
				if (result.type === 'button') {
					createReportFlow(result.value == 'none' ? '' : result.value);
				} else {
					currentName = result.value;
					reportFlow();
				}
			} else {
				const msg = sendMessage(
					playerServers === 'indecisive'
						? `豆豆现在无法确认 ${playerName} 所在的服务器\n\n回复你的其他游戏名，豆豆会重新查找服务器`
						: `${playerName} 现在好像不在服务器里\n管理只能调解当前正在发生的问题\n\n回复你的其他游戏名，豆豆会重新查找服务器`
				);
				const result = await buttonOrInputPrompt('你仍然可以直接发起举报', [
					{
						text: '直接发起举报',
						description: '豆豆可以直接帮你召唤管理，之后需要你手动提供服务器信息。',
						id: 'offline',
						variant: 'primary'
					}
				]);
				hideMessage(msg);
				if (result.type === 'button') {
					createReportFlow('');
				} else {
					currentName = result.value;
					reportFlow();
				}
			}
		} else {
			sendMessage('为了让管理更好的协助你，请提供你的游戏名');
			currentName = await inputPrompt();
			reportFlow();
			return;
		}
	};

	const appealFlow = async () => {
		await wait(125);
		if (playerName) {
			sendMessage(`好的，请问被封禁的游戏名是 ${playerName} 吗？不是的话请回复我需要申诉的玩家名`);
			await wait(125);
			const result = await buttonOrInputPrompt('', [
				{
					text: `确认是 ${playerName}`,
					id: 'yes',
					variant: 'primary'
				}
			]);
			if (result.type === 'input') {
				currentName = result.value;
			}
		}

		await rememberNameFlow();
		await wait(125);

		sendMessage('好的，豆豆正在为你创建申诉请求...');

		try {
			// Create the ticket with the first message
			const response = await fetch('/api/tickets', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					action: 'create',
					type: 'appeal',
					args: {
						name: playerName
					}
				})
			});

			if (response.ok) {
				const result = await response.json();
				if (result.success && result.ticket) {
					await wait(250);
					sendMessage('工单创建成功！豆豆正在为你跳转到工单页面...');
					await wait(1000);
					goto(`/ddnet/tickets/${result.ticket.uuid}`);
				} else {
					throw new Error('创建工单失败');
				}
			} else {
				throw new Error('创建工单失败');
			}
		} catch (error) {
			await wait(250);
			sendMessage('抱歉，创建工单时出现了问题。请稍后重试。');
			console.error('Error creating ticket:', error);
			await wait(125);
			await buttonPrompt('', [
				{
					text: '重新开始',
					id: 'restart',
					variant: 'primary'
				}
			]);
			location.reload();
		}
	};

	const nameChangeFlow = async () => {
		await wait(125);
		sendMessage(
			`好的，请问是要申请修改 ${playerName} 这个名字吗？不是的话请直接回复我需要改名的玩家名`
		);
		await wait(125);
		const fromNameInput = await buttonOrInputPrompt('', [
			{
				text: `申请转移 ${playerName} 的分数`,
				id: 'yes',
				variant: 'primary'
			}
		]);

		if (fromNameInput.type === 'input') {
			currentName = fromNameInput.value;
		}

		const fromName = playerName;

		const points = await checkPoints(playerName);

		if (points === -1) {
			sendMessage(`很抱歉，系统显示 ${playerName} 名下没有任何记录，无法进行改名申请。`);
			await wait(125);
			await buttonPrompt('', [
				{
					text: '重新开始',
					id: 'restart',
					variant: 'primary'
				}
			]);
			location.reload();
			return;
		} else if (points >= 0 && points < 3000) {
			sendMessage(
				`很抱歉，${playerName} 的分数不足 3000，不满足改名转分条件。\n当前分数：${points}pts`
			);
			await wait(125);
			await buttonPrompt('', [
				{
					text: '重新开始',
					id: 'restart',
					variant: 'primary'
				}
			]);
			location.reload();
			return;
		}

		await wait(500);

		if (points > 0) {
			sendMessage(`收到，那请问 ${playerName} 的 ${points}pts 希望转到哪个名字下呢？`);
		} else {
			sendMessage(`收到，那请问 ${playerName} 希望改成的新名字是什么呢？`);
		}

		await wait(125);
		const toName = await inputPrompt();

		const canMerge = await checkMerge(fromName, toName);
		if (!canMerge) {
			sendMessage(`很抱歉，由于 ${fromName} 和 ${toName} 存在团队记录，因此无法进行改名申请。`);
			await wait(125);
			await buttonPrompt('', [
				{
					text: '重新开始',
					id: 'restart',
					variant: 'primary'
				}
			]);
			location.reload();
			return;
		}

		const toNamePoints = await checkPoints(toName);
		if (toNamePoints > 0) {
			sendMessage(
				`了解！${toName} 名下有 ${toNamePoints}pts。\n\n注意改名流程会将所有游玩记录合并，两个名字均拥有的游玩记录不会重复记分。改名成功后分数可能小于 ${points + toNamePoints}pts。`
			);
			await wait(125);
			const result = await buttonPrompt('', [
				{
					text: `确认提交改名申请`,
					id: 'submit',
					variant: 'primary'
				},
				{
					text: `放弃`,
					id: 'restart',
					variant: 'danger'
				}
			]);
			if (result === 'restart') {
				location.reload();
				return;
			}
		}

		currentName = toName;
		await rememberNameFlow();

		await wait(125);
		sendMessage('好的，豆豆正在为你创建改名申请工单...');

		try {
			// Create the ticket with the first message
			const response = await fetch('/api/tickets', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					action: 'create',
					type: 'namechange',
					args: {
						fromName: fromName,
						toName: toName
					}
				})
			});

			if (response.ok) {
				const result = await response.json();
				if (result.success && result.ticket) {
					await wait(250);
					sendMessage('工单创建成功！豆豆正在为你跳转到工单页面...');
					await wait(1000);
					goto(`/ddnet/tickets/${result.ticket.uuid}`);
				} else {
					throw new Error('创建工单失败');
				}
			} else {
				throw new Error('创建工单失败');
			}
		} catch (error) {
			await wait(250);
			sendMessage('抱歉，创建工单时出现了问题。请稍后重试。');
			console.error('Error creating ticket:', error);
			await wait(125);
			await buttonPrompt('', [
				{
					text: '重新开始',
					id: 'restart',
					variant: 'primary'
				}
			]);
			location.reload();
		}
	};

	const feedbackFlow = async () => {
		if (!playerName) {
			await wait(125);
			sendMessage('在提交问题反馈前，请告诉豆豆你的游戏名');
			currentName = await inputPrompt();
			await rememberNameFlow();
		}

		await wait(125);
		sendMessage('好的，豆豆正在为你创建反馈工单...');

		try {
			// Create the ticket with the first message
			const response = await fetch('/api/tickets', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					action: 'create',
					type: 'feedback',
					args: {
						name: playerName
					}
				})
			});

			if (response.ok) {
				const result = await response.json();
				if (result.success && result.ticket) {
					await wait(250);
					sendMessage('工单创建成功！豆豆正在为你跳转到工单页面...');
					await wait(1000);
					goto(`/ddnet/tickets/${result.ticket.uuid}`);
				} else {
					throw new Error('创建工单失败');
				}
			} else {
				throw new Error('创建工单失败');
			}
		} catch (error) {
			await wait(250);
			sendMessage('抱歉，创建工单时出现了问题。请稍后重试。');
			console.error('Error creating ticket:', error);
			await wait(125);
			await buttonPrompt('', [
				{
					text: '重新开始',
					id: 'restart',
					variant: 'primary'
				}
			]);
			location.reload();
		}
	};

	const selectionFlow = async (greeting: boolean) => {
		if (greeting) {
			await wait(125);
			sendMessage(
				data.playerName
					? `你好 ${data.playerName}，我是豆豆。我会帮你创建反馈和通知管理`
					: `你好，我是豆豆。我会帮你创建反馈和通知管理`
			);
		}

		await wait(125);
		sendMessage(
			data.adminConnectionCount
				? `当前有 ${data.adminConnectionCount} 位管理员在线`
				: '当前没有管理员在线\n您的反馈在管理上线后会尽快处理'
		);
		await wait(125);
		const buttons: ButtonData[] = [
			{
				text: '举报玩家',
				description: '举报游戏内玩家的违规行为，管理将会加入到游戏服务器中进行调解',
				variant: 'danger',
				id: 'report'
			},
			{
				text: '封禁申诉',
				description: '如果你认为你被游戏管理误封禁了，可以通过这个渠道进行申诉',
				variant: 'primary',
				id: 'appeal'
			},
			{
				text: '改名申请',
				description:
					'改名申请要求原名下至少有3000分，且能够提供证明游玩记录的证据（例如近一年的游玩demo记录）',
				variant: 'primary',
				id: 'namechange'
			},
			{
				text: '其他问题',
				description:
					'如果你有其他的问题或建议，可以在这里提交。（例如：举报管理滥权，网站报错反馈等）',
				variant: 'secondary',
				id: 'feedback'
			}
		];
		const button = await buttonPrompt('豆豆邀请你选择', buttons);
		await wait(500);
		if (button === 'report') {
			reportFlow();
		} else if (button === 'appeal') {
			appealFlow();
		} else if (button === 'namechange') {
			nameChangeFlow();
		} else if (button === 'feedback') {
			feedbackFlow();
		}
	};

	const handleButtonClick = (id: string) => {
		if (buttonHandler) {
			buttonHandler(id);
			return;
		}

		if (id === 'report') {
			hideMessage('selection');
		}
	};

	const handleMessageSubmit = async (message: string) => {
		messages.push({
			uuid: (messageId++).toString(),
			ticket_uuid: 'FAKE',
			message: message,
			author_type: 'visitor' as const,
			author_name: data.playerName || '访客',
			visibility: 0, // Visible to all
			created_at: Date.now()
		});

		if (inputHandler) {
			inputHandler(message);
		}

		scrollToBottom();
	};

	const logout = async () => {
		await goto('/ddnet/tickets?logout=true', { replaceState: true, invalidateAll: true });
		location.reload();
	};

	const formatDate = (timestamp: number): string => {
		return new Date(timestamp).toLocaleString('zh-CN');
	};

	const formatStatus = (status: string): string => {
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

	const existingTicketFlow = async () => {
		if (!data.existingTickets.length) return false;

		const greeting = playerName ? `你好 ${playerName}，` : `你好，`;

		if (!data.canCreateTicket) {
			await wait(125);
			sendMessage(
				greeting +
					'豆豆查询到你目前还有未解决的工单。\n\n请先关闭或等待之前的工单处理结束后再创建新的工单。'
			);
		} else if (data.existingTickets.some((t) => t.status !== 'closed')) {
			await wait(125);
			sendMessage(
				greeting +
					'豆豆查询到你目前还有未解决的工单。\n\n你可以继续处理现有工单，或者创建新的工单。'
			);
		} else {
			await wait(125);
			sendMessage(
				greeting + '这些是你最近提交过的工单\n\n你可以点击查看处理结果，或者创建新的工单。'
			);
		}

		const buttons: ButtonData[] = [];
		for (const ticket of data.existingTickets) {
			buttons.push({
				text: ticket.title,
				description: ` ${formatStatus(ticket.status)} - ${formatDate(ticket.created_at)}`,
				id: ticket.uuid,
				variant:
					ticket.status === 'closed'
						? 'secondary'
						: ticket.status === 'in_progress'
							? 'success'
							: 'warning'
			});
		}

		if (data.canCreateTicket) {
			buttons.push({
				text: '创建新的工单',
				variant: 'primary',
				id: 'new'
			});
		}

		const uuid = await buttonPrompt('工单记录', buttons);
		if (uuid === 'new') {
			selectionFlow(false);
			return true;
		}

		await wait(500);
		sendMessage('好的，豆豆正在为你跳转到工单页面...');
		await wait(1000);
		goto(`/ddnet/tickets/${uuid}`, { invalidateAll: true });

		return true;
	};

	onMount(async () => {
		if (!data.hasToken) {
			verifyFlow();
		} else {
			if (!(await existingTicketFlow())) {
				selectionFlow(true);
			}
		}
	});
</script>

<svelte:head>
	<title>反馈和举报 - TeeworldsCN</title>
	<meta name="description" content="提交反馈和举报" />
</svelte:head>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'Teeworlds 中文社区' },
		{ href: '/ddnet', text: 'DDNet 工具箱', title: 'DDNet 工具箱' },
		{ text: '反馈和举报', title: '反馈和举报' }
	]}
/>

<div class="mx-auto h-[calc(100svh-8rem)] max-w-xl rounded-lg bg-slate-900">
	<TicketPanel
		{ticket}
		{messages}
		{images}
		uploadUrl="/api/tickets/upload"
		onButtonClick={handleButtonClick}
		onMessageSubmit={handleMessageSubmit}
		readonlyInput={!acceptingMessage}
		isVisitorView
	>
		<div class="absolute right-2 mt-1">
			{#if data.hasToken}
				<button
					class="rounded bg-red-800 px-2 py-1 text-sm text-white hover:bg-red-700"
					use:tippy={{ content: '点此登出，登出后需要重新认证' }}
					onclick={logout}
				>
					登出
				</button>
			{/if}
		</div>

		<div class="absolute left-6 mt-1">
			<span class="opacity-0">反馈与举报</span>
			<button
				class="rounded bg-blue-800 px-2 py-1 text-sm text-white hover:bg-blue-700"
				use:tippy={{ content: '点此从头开始提交流程' }}
				onclick={() => {
					location.reload();
				}}
			>
				从头开始
			</button>
		</div>
	</TicketPanel>
</div>
