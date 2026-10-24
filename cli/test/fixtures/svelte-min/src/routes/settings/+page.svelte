<script lang="ts">
	let name = $state('');
</script>

<main class="flex flex-col gap-4 p-4">
	<h1>Settings</h1>
	<label class="flex flex-col gap-2">
		<span>Your name</span>
		<input bind:value={name} class="rounded-md border p-3" />
	</label>
	{#if name}
		<p>Hello, {name}</p>
	{/if}
</main>
