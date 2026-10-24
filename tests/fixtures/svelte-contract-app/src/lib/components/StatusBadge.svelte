<script lang="ts">
	import { locale } from '$lib/i18n/locale.svelte';
	import type { ToolStatus } from '$lib/mock-data';

	let { status }: { status: ToolStatus } = $props();

	// A word beside the colour, always: the colour alone never says the status.
	const label = $derived({ in: locale.t.statusIn, out: locale.t.statusOut, repair: locale.t.statusRepair }[status]);
</script>

<span class="badge badge-{status}">{label}</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		padding-block: var(--motif-space-1);
		padding-inline: var(--motif-space-2);
		border: 1px solid transparent;
		border-radius: var(--motif-radius-sm);
		font-family: var(--motif-font-label-family);
		font-size: var(--motif-font-caption-size);
		font-weight: var(--motif-font-label-weight);
		line-height: var(--motif-font-caption-line-height);
		white-space: nowrap;
	}
	.badge-in {
		background: var(--motif-color-success);
		color: var(--motif-color-on-success);
	}
	.badge-out {
		background: var(--motif-color-warning);
		color: var(--motif-color-on-warning);
	}
	.badge-repair {
		border-color: var(--motif-color-border);
		color: var(--motif-color-text-secondary);
	}
</style>
