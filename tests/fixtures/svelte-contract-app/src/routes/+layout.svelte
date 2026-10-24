<script lang="ts">
	import './layout.css';
	import '@fontsource/ibm-plex-sans/400.css';
	import '@fontsource/ibm-plex-sans/600.css';
	import '@fontsource/archivo/700.css';
	import '@fontsource/ibm-plex-sans-arabic/400.css';
	import '@fontsource/ibm-plex-sans-arabic/600.css';
	import '@fontsource/ibm-plex-sans-arabic/700.css';
	import TopBar from '$lib/components/TopBar.svelte';

	let { children } = $props();
</script>

<TopBar />
<main class="mx-auto w-full max-w-5xl px-4 pt-8 pb-16 md:px-8">
	{@render children()}
</main>
