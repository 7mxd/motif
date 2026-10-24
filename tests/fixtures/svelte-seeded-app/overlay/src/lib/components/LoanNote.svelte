<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { duration } from '$lib/design/motion';
	import Icon from './Icon.svelte';

	// The confirmation under a tool's actions. It rises into place; with reduced motion it only fades.
	let { show, title, body }: { show: boolean; title: string; body?: string } = $props();
</script>

<div aria-live="polite">
	{#if show}
		<div
			class="flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-md"
			in:fly={{
				y: prefersReducedMotion.current ? 0 : 12,
				duration: duration.base,
				easing: cubicOut
			}}
		>
			<span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-success text-on-success">
				<Icon name="check" />
			</span>
			<div class="flex flex-col gap-1">
				<p class="font-label text-label">{title}</p>
				{#if body}
					<p class="text-text-secondary">{body}</p>
				{/if}
			</div>
		</div>
	{/if}
</div>
