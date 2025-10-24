<script lang="ts">
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { writable } from 'svelte/store';
	import markdownIt from 'markdown-it';

	// Define messages store
	const messages = writable<{ from: string; text: string }[]>([]);
	let inputValue = $state('');
	const COMMANDS = ['custom', 'error', 'last', 'user', 'getuser'];

	let groupMode = $state(false);

	async function sendCommand(command: string, args: string) {
		const url = new URL('/bots/web/', window.location.href);
		url.searchParams.set('mode', command);
		const token = new URL(window.location.href).hash.slice(1);
		const result = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			},
			body: JSON.stringify(args)
		});

		if (!result.ok) {
			return { error: true, code: result.status, message: await result.text() };
		} else {
			return await result.json();
		}
	}

	async function send() {
		if (!inputValue) return;

		const inputText = inputValue;
		inputValue = '';
		messages.update((messages) => messages.concat([{ from: 'user', text: inputText }]));

		if (inputText.startsWith('/')) {
			const command = inputText.slice(1).trim().split(' ')[0];
			let args = inputText.slice(command.length + 1).trim();
			try {
				args = JSON.parse(args);
			} catch (_) {}

			if (COMMANDS.includes(command)) {
				const result = await sendCommand(command, args);
				messages.update((messages) =>
					messages.concat([{ from: 'bot', text: `\`\`\`\n${JSON.stringify(result)}\n\`\`\`` }])
				);
				return;
			}
		}

		const target = groupMode ? '/bots/web?mode=group' : '/bots/web';
		const token = new URL(window.location.href).hash.slice(1);
		const msg = await fetch(target, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			},
			body: JSON.stringify({
				message: inputText
			})
		});

		if (msg.status == 200) {
			const data = await msg.json();
			if (data.content) {
				messages.update((messages) =>
					messages.concat([
						{ from: 'bot', text: data.content.replace(/ /g, '&nbsp;').replace(/\n/g, '\n\n') }
					])
				);
			} else {
				messages.update((messages) =>
					messages.concat([{ from: 'bot', text: `\`\`\`\n${JSON.stringify(data)}\n\`\`\`` }])
				);
			}
		}
	}
</script>

<Breadcrumbs
	breadcrumbs={[
		{ href: '/', text: '首页', title: 'TeeworldsCN' },
		{ text: '豆豆', title: 'DDNet 豆豆' }
	]}
/>
<div class="right-4 h-full max-h-[calc(100svh-9rem)] w-full md:max-h-[calc(100svh-12rem)]">
	<div class="h-full w-full rounded-lg bg-slate-700 shadow-md">
		<div class="flex items-center justify-between rounded-t-lg border-b bg-teal-700 px-4 py-2">
			<p class="text-lg font-semibold">DDNet 豆豆</p>
			<button
				class="-my-4 rounded bg-blue-500 px-4 py-1 text-white hover:bg-blue-600"
				onclick={() => {
					groupMode = !groupMode;
				}}
				>{#if groupMode}群聊模式{:else}私聊模式{/if}</button
			>
		</div>
		<div
			class="h-full max-h-[calc(100svh-16rem)] space-y-3 overflow-y-auto p-4 md:max-h-[calc(100svh-19rem)]"
		>
			{#each $messages as message}
				<div class="flex items-end" class:justify-end={message.from !== 'bot'}>
					<div
						class="text-md mx-2 flex max-w-sm flex-col leading-tight"
						class:order-2={message.from === 'bot'}
						class:items-start={message.from === 'bot'}
						class:order-1={message.from !== 'bot'}
						class:items-end={message.from !== 'bot'}
					>
						<div>
							<span
								class="prose inline-block rounded-xl px-4 py-3 prose-p:my-0 prose-p:py-0 prose-a:py-0 prose-code:m-0 prose-ul:my-0 prose-ul:py-0 prose-li:py-0"
								class:rounded-bl-none={message.from === 'bot'}
								class:bg-slate-300={message.from === 'bot'}
								class:text-gray-800={message.from === 'bot'}
								class:rounded-br-none={message.from !== 'bot'}
								class:bg-teal-800={message.from !== 'bot'}
								class:text-white={message.from !== 'bot'}
							>
								{#if message.from === 'bot'}
									{@html markdownIt().render(message.text)}
								{:else}
									{message.text}
								{/if}
							</span>
						</div>
					</div>
					<img
						src={message.from === 'bot'
							? '/favicon.png'
							: 'https://avatars.githubusercontent.com/u/705559?s=64&v=4'}
						alt=""
						class="h-10 w-10 rounded-full bg-slate-400"
						class:order-1={message.from === 'bot'}
						class:order-2={message.from !== 'bot'}
					/>
				</div>
			{/each}
		</div>
		<div class="flex border-t border-slate-600 p-4">
			<input
				id="user-input"
				type="text"
				placeholder="说点什么吧..."
				class="w-full rounded-l-md border border-slate-500 bg-slate-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-600"
				bind:value={inputValue}
				onkeydown={(ev) => {
					if (ev.key == 'Enter') {
						send();
					}
				}}
			/>
			<button
				id="send-button"
				class="text-nowrap rounded-r-md bg-teal-600 px-4 py-2 text-white transition duration-300 hover:bg-teal-500"
				disabled={!inputValue}
				onclick={send}>发送</button
			>
		</div>
	</div>
</div>
