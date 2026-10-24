<script lang="ts">
	// One line of text, with its label above and its hint or error below, in words.
	let {
		value = $bindable(),
		label,
		name,
		hint,
		error,
		type = 'text',
		autocomplete,
		inputmode,
		enterkeyhint
	}: {
		value: string;
		label: string;
		name: string;
		hint?: string;
		error?: string;
		type?: 'text' | 'email';
		autocomplete?: 'email' | 'off';
		inputmode?: 'text' | 'email' | 'decimal';
		enterkeyhint?: 'done' | 'next' | 'send';
	} = $props();

	const id = $props.id();
</script>

<div class="flex flex-col gap-2">
	<label for={id} class="font-label text-label">{label}</label>
	<input
		{id}
		bind:value
		class="field"
		{type}
		{name}
		{autocomplete}
		{inputmode}
		{enterkeyhint}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby="{id}-note"
	/>
	{#if error}
		<p id="{id}-note" class="font-caption text-caption text-danger">{error}</p>
	{:else}
		<p id="{id}-note" class="font-caption text-caption text-text-secondary">{hint}</p>
	{/if}
</div>

<style>
	.field {
		min-block-size: var(--motif-space-12);
		padding-inline: var(--motif-space-3);
		border: 1px solid var(--motif-color-border);
		border-radius: var(--motif-radius-md);
		background: var(--motif-color-surface);
		color: var(--motif-color-text-primary);
		font: inherit;
	}
	.field:focus-visible {
		outline: 2px solid var(--motif-color-focus);
		outline-offset: 1px;
		border-color: var(--motif-color-focus);
	}
	.field[aria-invalid='true'] {
		border-color: var(--motif-color-danger);
	}
</style>
