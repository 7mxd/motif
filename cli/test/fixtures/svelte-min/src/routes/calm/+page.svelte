<script lang="ts">
	import { prefersReducedMotion, Spring } from 'svelte/motion';
	import { spring } from '$lib/design/motion';

	// The same Spring, still when the viewer asks for reduced motion.
	const turn = new Spring(0, spring.smooth);
	$effect(() => {
		if (prefersReducedMotion.current) return;
		const timer = setInterval(() => (turn.target += 90), 300);
		return () => clearInterval(timer);
	});
</script>

<main class="flex flex-col gap-4 p-4">
	<h1 class="font-title text-title">Calm</h1>
	<div class="size-8 rounded-sm bg-action-primary" style:rotate="{turn.current}deg"></div>
</main>
