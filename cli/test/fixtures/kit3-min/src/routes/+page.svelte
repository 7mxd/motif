<script lang="ts">
	import { page } from '$app/state';
	import { prefersReducedMotion, Spring } from 'svelte/motion';
	import { spring } from '#lib/design/motion';
	import { STRINGS } from '#lib/strings';

	const t = $derived(STRINGS[page.data.lang]);

	// A Spring that keeps turning, still when the viewer asks for reduced motion.
	const turn = new Spring(0, spring.smooth);
	$effect(() => {
		if (prefersReducedMotion.current) return;
		const timer = setInterval(() => (turn.target += 90), 300);
		return () => clearInterval(timer);
	});
</script>

<main>
	<h1>{t.pantry}</h1>
	<p>{t.items}</p>
	<div class="spinner" style:rotate="{turn.current}deg"></div>
</main>
