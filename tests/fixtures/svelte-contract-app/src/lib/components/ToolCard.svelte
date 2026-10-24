<script lang="ts">
	import { locale } from '$lib/i18n/locale.svelte';
	import type { Tool } from '$lib/mock-data';
	import Icon from './Icon.svelte';
	import StatusBadge from './StatusBadge.svelte';

	let { tool }: { tool: Tool } = $props();
</script>

<a href="/tools/{tool.id}" class="card flex h-full flex-col gap-4 rounded-lg border border-border bg-surface p-5">
	<div class="flex items-start justify-between gap-3">
		<div class="flex flex-col gap-1">
			<p class="font-caption text-caption text-text-secondary">{locale.f.words(tool.kind)}</p>
			<h2 class="font-heading text-heading">{locale.f.words(tool.name)}</h2>
		</div>
		<StatusBadge status={tool.status} />
	</div>
	<ul class="flex flex-col gap-2 text-text-secondary">
		<li class="flex items-center gap-2"><Icon name="clock" />{locale.t.loanLength(tool.loanDays, locale.f.number(tool.loanDays))}</li>
		<li class="flex items-center gap-2"><Icon name="scale" />{locale.t.weight(locale.f.kilograms(tool.weight))}</li>
		<li class="flex items-center gap-2"><Icon name="pin" />{locale.t.shelf(tool.shelf)}</li>
	</ul>
	<p class="mt-auto border-t border-border pt-4 font-label text-label">{locale.t.depositOf(locale.f.dinars(tool.deposit))}</p>
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
