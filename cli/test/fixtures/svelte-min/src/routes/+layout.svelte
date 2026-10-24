<script lang="ts">
	import '../app.css';
	import { STRINGS } from '$lib/strings';

	let { children, data } = $props();
	const t = $derived(STRINGS[data.lang]);
</script>

<div class="min-h-screen bg-background font-body text-body text-text-primary">
	<nav class="flex gap-2 border-b border-border px-2 text-label">
		<a href="/" class="inline-flex min-h-11 items-center px-2 text-action-primary">{t.home}</a>
		<a href="/settings" class="inline-flex min-h-11 items-center px-2 text-action-primary">{t.settings}</a>
	</nav>
	{@render children()}
</div>
