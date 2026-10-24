<script lang="ts" module>
	export type IconName = 'back' | 'wrench' | 'user' | 'clock' | 'scale' | 'pin' | 'box' | 'check';
</script>

<script lang="ts">
	let { name }: { name: IconName } = $props();

	// Line icons on a 24-unit grid, drawn in the text colour.
	const PATHS: Record<IconName, string[]> = {
		back: ['M19 12H5', 'M11 6l-6 6 6 6'],
		wrench: ['M14.7 6.3a4 4 0 0 0 5 5L21 13l-2 2-1.3-1.3a4 4 0 0 1-5-5Z', 'M13.6 10.4 4.5 19.5a1.5 1.5 0 0 0 2.1 2.1l9.1-9.1', 'M14.7 6.3 17 4l3 3-2.3 2.3'],
		user: ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'M4 21c.9-3.6 4.2-6 8-6s7.1 2.4 8 6'],
		clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 7v5l3 2'],
		scale: ['M6 7h12l2 13H4Z', 'M9.5 7a2.5 2.5 0 0 1 5 0', 'M12 11v3'],
		pin: ['M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z', 'M12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z'],
		box: ['M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16Z', 'M3.5 8 12 12.5 20.5 8', 'M12 12.5v8'],
		check: ['M5 12.5l4.5 4.5L19 7']
	};

	// Icons that point a direction turn round in right-to-left languages.
	const mirrored = $derived(name === 'back');
</script>

<svg
	class={['size-5 shrink-0', mirrored && 'rtl:-scale-x-100']}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.75"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#each PATHS[name] as d (d)}
		<path {d} />
	{/each}
</svg>
