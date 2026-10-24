// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Lang } from '#lib/strings';

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
