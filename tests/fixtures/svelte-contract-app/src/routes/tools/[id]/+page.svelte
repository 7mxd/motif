<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import LoanNote from '$lib/components/LoanNote.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { locale } from '$lib/i18n/locale.svelte';
	import { VOLUNTEERS } from '$lib/mock-data';
	import { borrow, loanOf, loans, reserve } from '$lib/state/loans.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const tool = $derived(data.tool);
	const loan = $derived(loanOf(tool.id));
	const reserved = $derived(loans.reserved.includes(tool.id));
	const name = $derived(locale.f.words(tool.name));
</script>

<svelte:head>
	<title>{name} · {locale.t.appName}</title>
</svelte:head>

<article class="flex flex-col gap-8">
	<header class="flex flex-col gap-4">
		<IconButton icon="back" label={locale.t.back} href="/" class="-ms-3" />
		<div class="flex flex-col gap-2">
			<p class="font-label text-label text-text-secondary">{locale.f.words(tool.kind)}</p>
			<div class="flex flex-wrap items-center gap-3">
				<h1 class="font-title text-title">{name}</h1>
				<StatusBadge status={loan ? 'out' : tool.status} />
			</div>
			<p class="description text-text-secondary">{locale.t.toolIntro}</p>
		</div>
	</header>

	<div class="grid gap-8 md:grid-cols-5">
		<section class="details flex flex-col gap-4 rounded-lg border border-border bg-surface md:col-span-3" aria-labelledby="about">
			<h2 id="about" class="font-heading text-heading">{locale.t.aboutTool}</h2>
			<dl class="flex flex-col">
				<div class="row">
					<dt class="flex items-center gap-2 text-text-secondary"><Icon name="box" />{locale.t.includesLabel}</dt>
					<dd>{locale.f.words(tool.includes)}</dd>
				</div>
				<div class="row">
					<dt class="flex items-center gap-2 text-text-secondary"><Icon name="clock" />{locale.t.loanLabel}</dt>
					<dd>{locale.t.loanLength(tool.loanDays, locale.f.number(tool.loanDays))}</dd>
				</div>
				<div class="row">
					<dt class="flex items-center gap-2 text-text-secondary"><Icon name="scale" />{locale.t.weightLabel}</dt>
					<dd>{locale.t.weight(locale.f.kilograms(tool.weight))}</dd>
				</div>
				<div class="row">
					<dt class="flex items-center gap-2 text-text-secondary"><Icon name="pin" />{locale.t.shelfLabel}</dt>
					<dd>{locale.t.shelf(tool.shelf)}</dd>
				</div>
				<div class="row">
					<dt class="flex items-center gap-2 text-text-secondary"><Icon name="wrench" />{locale.t.careLabel}</dt>
					<dd>{locale.f.words(tool.care)}</dd>
				</div>
			</dl>
		</section>

		<aside class="flex flex-col gap-4 md:col-span-2">
			<p class="font-heading text-heading">{locale.t.depositOf(locale.f.dinars(tool.deposit))}</p>
			{#if tool.status === 'in'}
				<Button disabled={Boolean(loan)} onclick={() => borrow(tool)}>{locale.t.borrowTool}</Button>
				<Button variant="secondary" href={VOLUNTEERS}>{locale.t.askVolunteer}</Button>
				<LoanNote
					show={Boolean(loan)}
					title={loan ? locale.t.borrowedNote(name, locale.f.day(loan.dueBack)) : ''}
					body={locale.t.borrowedHint(tool.shelf)}
				/>
			{:else if tool.status === 'out'}
				<p class="text-text-secondary">{locale.t.dueBackOn(locale.f.day(tool.dueBack!))}</p>
				<Button disabled={reserved} onclick={() => reserve(tool)}>{locale.t.reserveTool}</Button>
				<Button variant="secondary" href={VOLUNTEERS}>{locale.t.askVolunteer}</Button>
				<LoanNote show={reserved} title={locale.t.reservedNote} />
			{:else}
				<p class="text-text-secondary">{locale.t.inRepair}</p>
				<Button variant="secondary" href={VOLUNTEERS}>{locale.t.askVolunteer}</Button>
			{/if}
		</aside>
	</div>
</article>

<style>
	.details {
		padding: var(--motif-space-6);
	}
	.description {
		max-inline-size: 40rem;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--motif-space-1) var(--motif-space-4);
		padding-block: var(--motif-space-3);
		border-block-end: 1px solid var(--motif-color-border);
	}
	.row:last-child {
		border-block-end: 0;
	}
</style>
