<script lang="ts">
	import { Spring } from 'svelte/motion';
	import { spring } from '$lib/design/motion';

	// Planted for motif shot --audit: a caption too faint to read, a 32 px icon button with no name, and a Spring that
	// keeps turning under reduced motion (it moves in script, which motif.css's reduced-motion rule doesn't stop).
	const turn = new Spring(0, spring.smooth);
	$effect(() => {
		const timer = setInterval(() => (turn.target += 90), 300);
		return () => clearInterval(timer);
	});
</script>

<main class="flex flex-col gap-4 p-4">
	<h1 class="font-title text-title">Audit</h1>
	<p class="text-caption" style="color: #c4c4c4; background: #f2f2f2">Last restocked three days ago</p>
	<!-- svelte-ignore a11y_consider_explicit_label -->
	<button class="flex size-8 items-center justify-center rounded-md bg-action-primary text-on-action-primary">
		<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M7 1h2v6h6v2H9v6H7V9H1V7h6z" /></svg>
	</button>
	<div class="size-8 rounded-sm bg-action-primary" style:rotate="{turn.current}deg"></div>
</main>
