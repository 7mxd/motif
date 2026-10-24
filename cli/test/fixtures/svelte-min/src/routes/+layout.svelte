<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<div class="min-h-screen">
	<nav class="flex gap-2 border-b px-2">
		<a href="/" class="inline-flex min-h-11 items-center px-2">Home</a>
		<a href="/settings" class="inline-flex min-h-11 items-center px-2">Settings</a>
	</nav>
	{@render children()}
</div>
