<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'primary' | 'secondary';

	// A button, or a link that looks like one when it has an href.
	let {
		variant = 'primary',
		type = 'button',
		href,
		disabled = false,
		onclick,
		children
	}: { variant?: Variant; type?: 'button' | 'submit'; href?: string; disabled?: boolean; onclick?: () => void; children: Snippet } = $props();
</script>

{#if href}
	<a {href} class="button button-{variant}">{@render children()}</a>
{:else}
	<button {type} class="button button-{variant}" {disabled} {onclick}>{@render children()}</button>
{/if}

<style>
	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--motif-space-2);
		min-block-size: var(--motif-space-12);
		padding-inline: var(--motif-space-5);
		border: 1px solid transparent;
		border-radius: var(--motif-radius-md);
		font-family: var(--motif-font-label-family);
		font-size: var(--motif-font-label-size);
		font-weight: var(--motif-font-label-weight);
		line-height: var(--motif-font-label-line-height);
		text-align: center;
		text-decoration: none;
		cursor: pointer;
		transition:
			background-color var(--motif-duration-fast) var(--motif-easing-standard),
			transform var(--motif-duration-fast) var(--motif-easing-standard);
	}
	.button-primary {
		background: var(--motif-color-action-primary);
		color: var(--motif-color-on-action-primary);
	}
	.button-secondary {
		background: var(--motif-color-action-secondary);
		color: var(--motif-color-on-action-secondary);
		border-color: var(--motif-color-border);
	}
	@media (hover: hover) {
		.button:hover {
			filter: brightness(0.95);
		}
	}
	.button:active {
		transform: scale(0.97);
	}
	.button:focus-visible {
		outline: 2px solid var(--motif-color-focus);
		outline-offset: 2px;
	}
	.button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
