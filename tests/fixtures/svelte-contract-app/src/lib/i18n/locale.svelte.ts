// The page's language, as the server chose it (hooks.server.ts, then +layout.server.ts), with its words and formats.
// Read it in a component's markup or a $derived, so it follows the page.
import { page } from '$app/state';
import { ar, en, formats, type Lang } from './strings';

const FORMATS = { en: formats('en'), ar: formats('ar') };

export const locale = {
	get lang(): Lang {
		return page.data.lang ?? 'en';
	},
	get t(): typeof en {
		return this.lang === 'ar' ? ar : en;
	},
	get f(): ReturnType<typeof formats> {
		return FORMATS[this.lang];
	}
};
