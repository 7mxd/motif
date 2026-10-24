// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Lang } from '$lib/i18n/strings';

declare global {
	namespace App {
		interface Locals {
			lang: Lang;
		}
		interface PageData {
			lang: Lang;
		}
	}
}

export {};
