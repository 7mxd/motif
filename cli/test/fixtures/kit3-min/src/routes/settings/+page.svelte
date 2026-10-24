<script lang="ts">
	import { page } from '$app/state';
	import { STRINGS } from '#lib/strings';

	const t = $derived(STRINGS[page.data.lang]);
	let name = $state('');
</script>

<main>
	<h1>{t.settings}</h1>
	<label>
		<span>{t.name}</span>
		<input bind:value={name} />
	</label>
	{#if name}
		<p>{t.hello} {name}</p>
	{/if}
</main>
