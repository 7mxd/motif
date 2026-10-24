<script lang="ts">
	import { page } from '$app/state';
	import { STRINGS } from '$lib/strings';

	const t = $derived(STRINGS[page.data.lang]);
</script>

<main class="flex flex-col gap-4 p-4">
	<h1 class="font-title text-title">{t.pantry}</h1>
	<section class="rounded-md bg-surface p-4 shadow-sm">
		<p class="text-text-secondary">{t.items}</p>
	</section>
	<button class="self-start rounded-md bg-action-primary px-4 py-3 font-label text-label text-on-action-primary">{t.add}</button>
</main>
