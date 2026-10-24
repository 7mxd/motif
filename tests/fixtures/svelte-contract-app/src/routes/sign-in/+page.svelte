<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { locale } from '$lib/i18n/locale.svelte';

	let email = $state('');
	let tried = $state(false);
	let sentTo = $state<string | null>(null);

	const error = $derived(tried && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? locale.t.emailError : undefined);

	function send(event: SubmitEvent): void {
		event.preventDefault();
		tried = true;
		if (error) return;
		sentTo = email.trim();
	}
</script>

<svelte:head>
	<title>{locale.t.signInTitle} · {locale.t.appName}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-md flex-col gap-6">
	<header class="flex flex-col gap-3">
		<h1 class="font-title text-title">{locale.t.signInTitle}</h1>
		<p class="text-text-secondary">{locale.t.signInIntro}</p>
	</header>
	<form class="flex flex-col gap-5 rounded-lg border border-border bg-surface p-6" novalidate onsubmit={send}>
		<TextField
			bind:value={email}
			name="email"
			type="email"
			label={locale.t.email}
			hint={locale.t.emailHint}
			{error}
			autocomplete="email"
			inputmode="email"
			enterkeyhint="send"
		/>
		<Button type="submit">{locale.t.sendLink}</Button>
		<p class="font-caption text-caption text-text-secondary">{locale.t.emailUse}</p>
	</form>
	{#if sentTo}
		<p role="status" class="rounded-lg border border-border bg-surface-raised p-4">{locale.t.linkSent(sentTo)}</p>
	{/if}
</div>
