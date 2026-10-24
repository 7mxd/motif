<script lang="ts">
	import ToolCard from '$lib/components/ToolCard.svelte';
	import { locale } from '$lib/i18n/locale.svelte';
	import { tools } from '$lib/mock-data';

	const onShelf = tools.filter((t) => t.status === 'in').length;
	const steps = $derived([locale.t.howBorrow, locale.t.howCollect, locale.t.howReturn]);
</script>

<svelte:head>
	<title>{locale.t.toolsTitle} · {locale.t.appName}</title>
</svelte:head>

<div class="flex flex-col gap-8">
	<header class="flex max-w-2xl flex-col gap-3">
		<h1 class="font-title text-title">{locale.t.toolsTitle}</h1>
		<p class="text-text-secondary">{locale.t.toolsIntro}</p>
		<p class="font-label text-label">{locale.t.inCount(locale.f.number(onShelf), locale.f.number(tools.length))}</p>
	</header>
	<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each tools as tool (tool.id)}
			<li><ToolCard {tool} /></li>
		{/each}
	</ul>
	<section class="flex flex-col gap-4 rounded-[10px] border border-border bg-surface p-6" aria-labelledby="how">
		<h2 id="how" class="font-heading text-heading">{locale.t.howTitle}</h2>
		<ol class="grid gap-4 md:grid-cols-3">
			{#each steps as step, i (step)}
				<li class="flex items-start gap-3">
					<span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-action-secondary font-label text-label text-on-action-secondary">{locale.f.number(i + 1)}</span>
					<p class="text-text-secondary">{step}</p>
				</li>
			{/each}
		</ol>
	</section>
</div>
