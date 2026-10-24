<script lang="ts">
	import { page } from '$app/state';
	import { locale } from '$lib/i18n/locale.svelte';
	import Icon from './Icon.svelte';

	// A tool's page belongs to Tools.
	const current = $derived.by(() => {
		const path = page.url.pathname;
		if (path.startsWith('/loans')) return 'loans';
		return path === '/' || path.startsWith('/tools/') ? 'tools' : null;
	});
	const tabs = $derived([
		{ id: 'tools', href: '/', label: locale.t.navTools },
		{ id: 'loans', href: '/loans', label: locale.t.navLoans }
	]);
</script>

<header class="border-b border-border bg-surface">
	<div class="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-8 px-4 md:flex-nowrap md:px-8">
		<a href="/" class="brand" aria-label={locale.t.home}>
			<Icon name="wrench" />
			<span class="brand-name">{locale.t.appName}</span>
		</a>
		<nav aria-label={locale.t.mainNav} class="order-last w-full md:order-none md:w-auto md:flex-1">
			<ul class="flex gap-6">
				{#each tabs as tab (tab.id)}
					<li>
						<a href={tab.href} class="tab" class:tab-current={current === tab.id} aria-current={current === tab.id ? 'page' : undefined}>
							{tab.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
		<a href="/sign-in" class="ms-auto inline-flex size-12 items-center justify-center rounded-full md:ms-0"><Icon name="user" /></a>
	</div>
</header>

<style>
	.brand {
		display: inline-flex;
		align-items: center;
		min-block-size: var(--motif-space-16);
		color: var(--motif-color-action-primary);
		text-decoration: none;
	}
	.brand-name {
		margin-left: var(--motif-space-2);
		font-family: var(--motif-font-heading-family);
		font-size: var(--motif-font-heading-size);
		font-weight: var(--motif-font-heading-weight);
		line-height: var(--motif-font-heading-line-height);
		color: var(--motif-color-text-primary);
	}
	.tab {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-block-size: var(--motif-space-12);
		min-inline-size: var(--motif-space-12);
		border-block-end: 2px solid transparent;
		font-family: var(--motif-font-label-family);
		font-size: var(--motif-font-label-size);
		font-weight: var(--motif-font-label-weight);
		color: var(--motif-color-text-secondary);
		text-decoration: none;
		transition: color var(--motif-duration-fast) var(--motif-easing-standard);
	}
	@media (hover: hover) {
		.tab:hover {
			color: var(--motif-color-text-primary);
		}
	}
	.tab-current {
		border-block-end-color: var(--motif-color-action-primary);
		color: var(--motif-color-text-primary);
	}
</style>
