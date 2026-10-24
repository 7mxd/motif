import type { Handle } from '@sveltejs/kit';
import { langOf } from '$lib/i18n/strings';
import { libraryWeekend } from '$lib/mock-data';

/**
 * The page's language, direction and look, written on <html> as the server draws it, so nothing flashes: the language
 * from the browser's Accept-Language (right to left in Arabic), the workshop look on a repair weekend (DESIGN.md,
 * Variants). Each value is one the app chose, never the visitor's text.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const lang = langOf(event.request.headers.get('accept-language'));
	event.locals.lang = lang;
	const dir = lang === 'ar' ? 'rtl' : 'ltr';
	const variant = libraryWeekend === 'repair' ? 'workshop' : '';
	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace('%lang%', () => lang)
				.replace('%dir%', () => dir)
				.replace('%variant%', () => variant)
	});
};
