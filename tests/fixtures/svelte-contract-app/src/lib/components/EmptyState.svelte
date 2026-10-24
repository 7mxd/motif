<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon, { type IconName } from './Icon.svelte';

	// Nothing here yet, or nothing found: a title, one line and one action.
	let {
		title,
		body,
		icon = 'box',
		level = 'h2',
		children
	}: { title: string; body: string; icon?: IconName; level?: 'h1' | 'h2'; children?: Snippet } = $props();
</script>

<div class="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border px-6 py-10 text-center">
	<span class="flex size-12 items-center justify-center rounded-full bg-action-secondary text-on-action-secondary">
		<Icon name={icon} />
	</span>
	<div class="flex max-w-sm flex-col gap-2">
		<svelte:element this={level} class="font-heading text-heading">{title}</svelte:element>
		<p class="text-text-secondary">{body}</p>
	</div>
	{@render children?.()}
</div>
