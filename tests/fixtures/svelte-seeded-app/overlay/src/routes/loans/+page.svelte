<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { locale } from '$lib/i18n/locale.svelte';
	import { loanLimit } from '$lib/mock-data';
	import { loansByDue } from '$lib/state/loans.svelte';

	const out = $derived(loansByDue());
</script>

<svelte:head>
	<title>{locale.t.loansTitle} · {locale.t.appName}</title>
</svelte:head>

<div class="flex flex-col gap-8">
	<header class="flex max-w-2xl flex-col gap-3">
		<h1 class="font-title text-title">{locale.t.loansTitle}</h1>
		<p class="text-text-secondary">{locale.t.loansIntro}</p>
	</header>

	<section class="flex max-w-2xl flex-col gap-4" aria-labelledby="out">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h2 id="out" class="font-heading text-heading">{locale.t.outNow}</h2>
			<p class="font-label text-label">{locale.t.loansCount(locale.f.number(out.length), locale.f.number(loanLimit))}</p>
		</div>
		<ul class="flex flex-col rounded-lg border border-border bg-surface">
			{#each out as { loan, tool } (tool.id)}
				<li class="flex items-center justify-between gap-4 border-b border-border px-5 py-4 last:border-b-0">
					<div class="flex flex-col">
						<span>{locale.f.words(tool.name)}</span>
						<span class="font-caption text-caption text-text-secondary">{locale.t.dueBack(locale.f.day(loan.dueBack))}</span>
					</div>
					<span class="flex items-center gap-2 font-label text-label text-text-secondary"><Icon name="pin" />{locale.t.shelf(tool.shelf)}</span>
				</li>
			{/each}
		</ul>
	</section>
</div>
