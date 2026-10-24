<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { locale } from '$lib/i18n/locale.svelte';

	// A tool that isn't on the list, or a page that isn't there.
	const tool = $derived(page.url.pathname.startsWith('/tools/'));
</script>

<svelte:head>
	<title>{tool ? locale.t.toolMissing : locale.t.pageMissing} · {locale.t.appName}</title>
</svelte:head>

<EmptyState level="h1" title={tool ? locale.t.toolMissing : locale.t.pageMissing} body={tool ? locale.t.toolMissingHint : locale.t.pageMissingHint}>
	<Button href="/">{locale.t.seeTools}</Button>
</EmptyState>
