import type { Handle } from '@sveltejs/kit';
import { langOf } from '$lib/strings';

/** The page's language from the browser's Accept-Language, set on <html> as the server renders it (right to left in Arabic). */
export const handle: Handle = async ({ event, resolve }) => {
	const lang = langOf(event.request.headers.get('accept-language'));
	event.locals.lang = lang;
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%app.lang%', lang).replace('%app.dir%', lang === 'ar' ? 'rtl' : 'ltr')
	});
};
