<script lang="ts">
	import Icon, { type IconName } from './Icon.svelte';

	// An icon-only control: always named, always 48 px square. An href makes it a link.
	let { icon, label, href, class: className = '' }: { icon: IconName; label: string; href?: string; class?: string } = $props();
</script>

{#if href}
	<a {href} class="icon-button {className}" aria-label={label}><Icon name={icon} /></a>
{:else}
	<button type="button" class="icon-button {className}" aria-label={label}><Icon name={icon} /></button>
{/if}

<style>
	.icon-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		inline-size: var(--motif-space-12);
		block-size: var(--motif-space-12);
		flex-shrink: 0;
		border: 0;
		border-radius: var(--motif-radius-full);
		background: transparent;
		color: var(--motif-color-text-primary);
		cursor: pointer;
		transition: background-color var(--motif-duration-fast) var(--motif-easing-standard);
	}
	@media (hover: hover) {
		.icon-button:hover {
			background: var(--motif-color-action-secondary);
		}
	}
	.icon-button:active {
		background: var(--motif-color-action-secondary);
	}
	.icon-button:focus-visible {
		outline: 2px solid var(--motif-color-focus);
		outline-offset: 2px;
	}
</style>
