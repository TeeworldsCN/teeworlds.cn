<script lang="ts">
	import {
		QQRichTextType,
		QQRichTextAlignment,
		type QQRichTextElem,
		type QQRichTextParagraph
	} from '$lib/types/qq';
	import Fa from 'svelte-fa';
	import {
		faBold,
		faItalic,
		faUnderline,
		faAlignLeft,
		faAlignCenter,
		faAlignRight,
		faImage,
		faVideo,
		faLink,
		faPlus,
		faTrash,
		faArrowUp,
		faArrowDown,
		faGripVertical,
		faT
	} from '@fortawesome/free-solid-svg-icons';

	const { value, onchange, maxLength = 5000 } = $props();

	const totalLength = $derived(() => {
		return value.paragraphs.reduce((total: number, paragraph: any) => {
			return (
				total +
				paragraph.elems.reduce((elemTotal: number, elem: any) => {
					if (elem.type === QQRichTextType.Text) {
						return elemTotal + elem.text.text.length;
					} else if (elem.type === QQRichTextType.Url) {
						return elemTotal + elem.url.desc.length;
					}
					return elemTotal;
				}, 0)
			);
		}, 0);
	});

	function addParagraph() {
		const newParagraph: QQRichTextParagraph = {
			elems: [
				{
					type: QQRichTextType.Text,
					text: { text: '' }
				}
			],
			props: { alignment: QQRichTextAlignment.Left }
		};

		const newValue = {
			...value,
			paragraphs: [...value.paragraphs, newParagraph]
		};
		onchange(newValue);
	}

	function removeParagraph(index: number) {
		if (value.paragraphs.length <= 1) return;

		const newValue = {
			...value,
			paragraphs: value.paragraphs.filter((_: any, i: number) => i !== index)
		};
		onchange(newValue);
	}

	function updateParagraphAlignment(paragraphIndex: number, alignment: QQRichTextAlignment) {
		const newValue = {
			...value,
			paragraphs: value.paragraphs.map((paragraph: any, i: number) =>
				i === paragraphIndex
					? { ...paragraph, props: { ...paragraph.props, alignment } }
					: paragraph
			)
		};
		onchange(newValue);
	}

	function updateElement(paragraphIndex: number, elementIndex: number, newElement: QQRichTextElem) {
		const newValue = {
			...value,
			paragraphs: value.paragraphs.map((paragraph: any, pIndex: number) =>
				pIndex === paragraphIndex
					? {
							...paragraph,
							elems: paragraph.elems.map((elem: any, eIndex: number) =>
								eIndex === elementIndex ? newElement : elem
							)
						}
					: paragraph
			)
		};
		onchange(newValue);
	}

	function updateTextElement(
		paragraphIndex: number,
		elementIndex: number,
		text: string,
		props?: any
	) {
		const element = value.paragraphs[paragraphIndex]?.elems[elementIndex];
		if (!element || element.type !== QQRichTextType.Text) return;

		const newElement: QQRichTextElem = {
			...element,
			text: { text, props: props || element.text.props }
		};
		updateElement(paragraphIndex, elementIndex, newElement);
	}

	function toggleTextFormat(
		paragraphIndex: number,
		elementIndex: number,
		format: 'font_bold' | 'italic' | 'underline'
	) {
		const element = value.paragraphs[paragraphIndex]?.elems[elementIndex];
		if (!element || element.type !== QQRichTextType.Text) return;

		const currentProps = element.text.props || {};
		const newProps = {
			...currentProps,
			[format]: !currentProps[format]
		};

		updateTextElement(paragraphIndex, elementIndex, element.text.text, newProps);
	}

	function addTextElement(paragraphIndex: number, insertIndex?: number) {
		const textElement: QQRichTextElem = {
			type: QQRichTextType.Text,
			text: { text: '' }
		};
		addElement(paragraphIndex, textElement, insertIndex);
	}

	function addImageElement(paragraphIndex: number, insertIndex?: number) {
		const imageElement: QQRichTextElem = {
			type: QQRichTextType.Image,
			image: {
				third_url: '',
				width_percent: 100
			}
		};
		addElement(paragraphIndex, imageElement, insertIndex);
	}

	function addVideoElement(paragraphIndex: number, insertIndex?: number) {
		const videoElement: QQRichTextElem = {
			type: QQRichTextType.Video,
			video: { third_url: '' }
		};
		addElement(paragraphIndex, videoElement, insertIndex);
	}

	function addUrlElement(paragraphIndex: number, insertIndex?: number) {
		const urlElement: QQRichTextElem = {
			type: QQRichTextType.Url,
			url: { url: '', desc: '' }
		};
		addElement(paragraphIndex, urlElement, insertIndex);
	}

	function addElement(paragraphIndex: number, element: QQRichTextElem, insertIndex?: number) {
		const newValue = {
			...value,
			paragraphs: value.paragraphs.map((paragraph: any, i: number) => {
				if (i !== paragraphIndex) return paragraph;

				const newElems = [...paragraph.elems];
				const index = insertIndex !== undefined ? insertIndex : newElems.length;
				newElems.splice(index, 0, element);

				return { ...paragraph, elems: newElems };
			})
		};
		onchange(newValue);
	}

	function removeElement(paragraphIndex: number, elementIndex: number) {
		const paragraph = value.paragraphs[paragraphIndex];
		if (paragraph.elems.length <= 1) return;

		const newValue = {
			...value,
			paragraphs: value.paragraphs.map((p: any, pIndex: number) =>
				pIndex === paragraphIndex
					? { ...p, elems: p.elems.filter((_: any, eIndex: number) => eIndex !== elementIndex) }
					: p
			)
		};
		onchange(newValue);
	}

	function moveElement(paragraphIndex: number, elementIndex: number, direction: 'up' | 'down') {
		const paragraph = value.paragraphs[paragraphIndex];
		const newIndex = direction === 'up' ? elementIndex - 1 : elementIndex + 1;

		if (newIndex < 0 || newIndex >= paragraph.elems.length) return;

		const newValue = {
			...value,
			paragraphs: value.paragraphs.map((p: any, pIndex: number) => {
				if (pIndex !== paragraphIndex) return p;

				const newElems = [...p.elems];
				const [movedElement] = newElems.splice(elementIndex, 1);
				newElems.splice(newIndex, 0, movedElement);

				return { ...p, elems: newElems };
			})
		};
		onchange(newValue);
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-medium text-slate-200">富文本编辑器</h3>
		<div class="text-xs text-slate-400">
			{totalLength()}/{maxLength} 字符
		</div>
	</div>

	{#each value.paragraphs as paragraph, paragraphIndex}
		<div class="rounded-lg border border-slate-600 bg-slate-700 p-4">
			<!-- Paragraph Controls -->
			<div class="mb-3 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<span class="text-sm text-slate-300">段落 {paragraphIndex + 1}</span>

					<!-- Alignment Controls -->
					<div class="flex rounded border border-slate-500">
						<button
							onclick={() => updateParagraphAlignment(paragraphIndex, QQRichTextAlignment.Left)}
							class="p-1 text-slate-300 hover:bg-slate-600 {paragraph.props?.alignment ===
								QQRichTextAlignment.Left || !paragraph.props?.alignment
								? 'bg-slate-600'
								: ''}"
							title="左对齐"
						>
							<Fa icon={faAlignLeft} size="sm" />
						</button>
						<button
							onclick={() => updateParagraphAlignment(paragraphIndex, QQRichTextAlignment.Center)}
							class="p-1 text-slate-300 hover:bg-slate-600 {paragraph.props?.alignment ===
							QQRichTextAlignment.Center
								? 'bg-slate-600'
								: ''}"
							title="居中对齐"
						>
							<Fa icon={faAlignCenter} size="sm" />
						</button>
						<button
							onclick={() => updateParagraphAlignment(paragraphIndex, QQRichTextAlignment.Right)}
							class="p-1 text-slate-300 hover:bg-slate-600 {paragraph.props?.alignment ===
							QQRichTextAlignment.Right
								? 'bg-slate-600'
								: ''}"
							title="右对齐"
						>
							<Fa icon={faAlignRight} size="sm" />
						</button>
					</div>
				</div>

				<div class="flex items-center gap-2">
					<!-- Add Element Controls -->
					<div class="flex rounded border border-slate-500">
						<button
							onclick={() => addTextElement(paragraphIndex)}
							class="flex h-8 w-8 items-center justify-center rounded-l text-slate-300 hover:bg-slate-600"
							title="添加文本"
						>
							<Fa icon={faT} size="sm" />
						</button>
						<button
							onclick={() => addImageElement(paragraphIndex)}
							class="flex h-8 w-8 items-center justify-center text-slate-300 hover:bg-slate-600"
							title="添加图片"
						>
							<Fa icon={faImage} size="sm" />
						</button>
						<button
							onclick={() => addVideoElement(paragraphIndex)}
							class="flex h-8 w-8 items-center justify-center text-slate-300 hover:bg-slate-600"
							title="添加视频"
						>
							<Fa icon={faVideo} size="sm" />
						</button>
						<button
							onclick={() => addUrlElement(paragraphIndex)}
							class="flex h-8 w-8 items-center justify-center rounded-r text-slate-300 hover:bg-slate-600"
							title="添加链接"
						>
							<Fa icon={faLink} size="sm" />
						</button>
					</div>

					{#if value.paragraphs.length > 1}
						<button
							onclick={() => removeParagraph(paragraphIndex)}
							class="rounded p-1 text-red-400 hover:bg-red-900/50"
							title="删除段落"
						>
							<Fa icon={faTrash} size="sm" />
						</button>
					{/if}
				</div>
			</div>

			<!-- Elements -->
			<div class="space-y-2">
				{#each paragraph.elems as element, elementIndex}
					<div
						class="group flex items-start gap-2 rounded border border-slate-600 bg-slate-800 p-3"
					>
						<!-- Drag Handle -->
						<div class="flex flex-col items-center gap-1 pt-1">
							<button
								onclick={() => moveElement(paragraphIndex, elementIndex, 'up')}
								disabled={elementIndex === 0}
								class="p-1 text-slate-400 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
								title="上移"
							>
								<Fa icon={faArrowUp} size="xs" />
							</button>
							<div class="text-slate-500">
								<Fa icon={faGripVertical} size="xs" />
							</div>
							<button
								onclick={() => moveElement(paragraphIndex, elementIndex, 'down')}
								disabled={elementIndex === paragraph.elems.length - 1}
								class="p-1 text-slate-400 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
								title="下移"
							>
								<Fa icon={faArrowDown} size="xs" />
							</button>
						</div>

						<!-- Element Content -->
						<div class="flex-1">
							{#if element.type === QQRichTextType.Text}
								<div class="space-y-2">
									<div class="flex items-center gap-1">
										<span class="text-xs text-slate-400">文本</span>
										<div class="flex gap-1">
											<button
												onclick={() => toggleTextFormat(paragraphIndex, elementIndex, 'font_bold')}
												class="rounded p-1 text-slate-300 hover:bg-slate-600 {element.text.props
													?.font_bold
													? 'bg-slate-600'
													: ''}"
												title="粗体"
											>
												<Fa icon={faBold} size="xs" />
											</button>
											<button
												onclick={() => toggleTextFormat(paragraphIndex, elementIndex, 'italic')}
												class="rounded p-1 text-slate-300 hover:bg-slate-600 {element.text.props
													?.italic
													? 'bg-slate-600'
													: ''}"
												title="斜体"
											>
												<Fa icon={faItalic} size="xs" />
											</button>
											<button
												onclick={() => toggleTextFormat(paragraphIndex, elementIndex, 'underline')}
												class="rounded p-1 text-slate-300 hover:bg-slate-600 {element.text.props
													?.underline
													? 'bg-slate-600'
													: ''}"
												title="下划线"
											>
												<Fa icon={faUnderline} size="xs" />
											</button>
										</div>
									</div>
									<textarea
										value={element.text.text}
										oninput={(e) =>
											updateTextElement(paragraphIndex, elementIndex, e.currentTarget.value)}
										placeholder="输入文本..."
										class="w-full resize-none rounded border border-slate-500 bg-slate-700 px-3 py-2 text-slate-200 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
										style="font-weight: {element.text.props?.font_bold
											? 'bold'
											: 'normal'}; font-style: {element.text.props?.italic
											? 'italic'
											: 'normal'}; text-decoration: {element.text.props?.underline
											? 'underline'
											: 'none'};"
										rows="2"
									></textarea>
								</div>
							{:else if element.type === QQRichTextType.Image}
								<div class="space-y-2">
									<div class="flex items-center gap-2">
										<Fa icon={faImage} class="text-slate-400" />
										<span class="text-xs text-slate-400">图片</span>
									</div>
									<div class="space-y-2">
										<input
											type="url"
											value={element.image.third_url}
											oninput={(e) =>
												updateElement(paragraphIndex, elementIndex, {
													...element,
													image: { ...element.image, third_url: e.currentTarget.value }
												})}
											placeholder="图片URL..."
											class="w-full rounded border border-slate-500 bg-slate-700 px-3 py-2 text-slate-200 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
										/>
										<div class="flex items-center gap-2">
											<span class="text-xs text-slate-400">宽度:</span>
											<input
												type="number"
												min="1"
												max="100"
												value={element.image.width_percent}
												oninput={(e) =>
													updateElement(paragraphIndex, elementIndex, {
														...element,
														image: {
															...element.image,
															width_percent: parseInt(e.currentTarget.value) || 100
														}
													})}
												class="w-20 rounded border border-slate-500 bg-slate-700 px-2 py-1 text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
											/>
											<span class="text-xs text-slate-400">%</span>
										</div>
									</div>
								</div>
							{:else if element.type === QQRichTextType.Video}
								<div class="space-y-2">
									<div class="flex items-center gap-2">
										<Fa icon={faVideo} class="text-slate-400" />
										<span class="text-xs text-slate-400">视频</span>
									</div>
									<input
										type="url"
										value={element.video.third_url}
										oninput={(e) =>
											updateElement(paragraphIndex, elementIndex, {
												...element,
												video: { third_url: e.currentTarget.value }
											})}
										placeholder="视频URL..."
										class="w-full rounded border border-slate-500 bg-slate-700 px-3 py-2 text-slate-200 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
									/>
								</div>
							{:else if element.type === QQRichTextType.Url}
								<div class="space-y-2">
									<div class="flex items-center gap-2">
										<Fa icon={faLink} class="text-slate-400" />
										<span class="text-xs text-slate-400">链接</span>
									</div>
									<div class="space-y-2">
										<input
											type="url"
											value={element.url.url}
											oninput={(e) =>
												updateElement(paragraphIndex, elementIndex, {
													...element,
													url: { ...element.url, url: e.currentTarget.value }
												})}
											placeholder="链接URL..."
											class="w-full rounded border border-slate-500 bg-slate-700 px-3 py-2 text-slate-200 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
										/>
										<input
											type="text"
											value={element.url.desc}
											oninput={(e) =>
												updateElement(paragraphIndex, elementIndex, {
													...element,
													url: { ...element.url, desc: e.currentTarget.value }
												})}
											placeholder="链接描述..."
											class="w-full rounded border border-slate-500 bg-slate-700 px-3 py-2 text-slate-200 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
										/>
									</div>
								</div>
							{/if}
						</div>

						<!-- Element Actions -->
						<div class="flex flex-col gap-1">
							{#if paragraph.elems.length > 1}
								<button
									onclick={() => removeElement(paragraphIndex, elementIndex)}
									class="rounded p-1 text-red-400 hover:bg-red-900/50"
									title="删除元素"
								>
									<Fa icon={faTrash} size="xs" />
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/each}

	<button
		onclick={addParagraph}
		class="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-600 p-4 text-slate-400 hover:border-slate-500 hover:text-slate-300"
	>
		<Fa icon={faPlus} />
		<span>添加段落</span>
	</button>
</div>
