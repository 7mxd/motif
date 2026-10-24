<script lang="ts">
	import { page } from '$app/state';
	import { STRINGS } from '$lib/strings';

	const t = $derived(STRINGS[page.data.lang]);
	let name = $state('');
</script>

<main class="flex flex-col gap-4 p-4">
	<h1 class="font-title text-title">{t.settings}</h1>
	<label class="flex flex-col gap-2">
		<span class="font-label text-label">{t.name}</span>
		<input bind:value={name} class="rounded-md border border-border bg-surface p-3 text-text-primary" />
	</label>
	{#if name}
		<p class="text-text-secondary">{t.hello} {name}</p>
	{/if}
</main>
