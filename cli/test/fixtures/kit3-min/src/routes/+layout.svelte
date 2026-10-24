<script lang="ts">
	import '#lib/styles/motif.css';
	import '../app.css';
	import { STRINGS } from '#lib/strings';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
	const t = $derived(STRINGS[data.lang]);
</script>

<nav>
	<a href="/">{t.home}</a>
	<a href="/settings">{t.settings}</a>
</nav>
{@render children()}
