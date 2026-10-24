<script lang="ts">
	import { locale } from '$lib/i18n/locale.svelte';
	import type { Tool } from '$lib/mock-data';
	import Icon from './Icon.svelte';
	import StatusBadge from './StatusBadge.svelte';

	let { tool }: { tool: Tool } = $props();
</script>

<a href="/tools/{tool.id}" class="card flex h-full flex-col gap-1 rounded-lg border border-border bg-surface p-1">
	<div class="flex items-start justify-between gap-1">
		<div class="flex min-w-0 flex-col">
			<p class="font-caption text-caption text-text-secondary">{locale.f.words(tool.kind)}</p>
			<h2 class="truncate font-heading text-heading">{locale.f.words(tool.name)}</h2>
		</div>
		<StatusBadge status={tool.status} />
	</div>
	<p class="flex items-center gap-1 truncate text-text-secondary"><Icon name="pin" />{locale.t.shelf(tool.shelf)}</p>
	<p class="mt-auto font-label text-label">{locale.t.depositOf(locale.f.dinars(tool.deposit))}</p>
</a>

<style>
	.card {
		color: var(--motif-color-text-primary);
		text-decoration: none;
		transition: border-color var(--motif-duration-fast) var(--motif-easing-standard);
	}
	@media (hover: hover) {
		.card:hover {
			border-color: var(--motif-color-action-primary);
		}
	}
	.card:focus-visible {
		outline: 2px solid var(--motif-color-focus);
		outline-offset: 2px;
	}
</style>
