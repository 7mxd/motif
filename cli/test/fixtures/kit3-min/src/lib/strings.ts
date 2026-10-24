/** The app's words in English and in Arabic, chosen on the server from the browser's Accept-Language. */
const EN = {
	home: 'Home',
	settings: 'Settings',
	pantry: 'Pantry',
	items: '12 items, 3 running low',
	add: 'Add item',
	name: 'Display name',
	hello: 'Hello,'
};

const AR: typeof EN = {
	home: 'الرئيسية',
	settings: 'الإعدادات',
	pantry: 'المخزن',
	items: '١٢ صنفًا، ٣ أوشكت على النفاد',
	add: 'أضف صنفًا',
	name: 'الاسم الظاهر',
	hello: 'أهلًا،'
};

export type Lang = 'en' | 'ar';

export const STRINGS: Record<Lang, typeof EN> = { en: EN, ar: AR };

export function langOf(acceptLanguage: string | null): Lang {
	return acceptLanguage?.trim().toLowerCase().startsWith('ar') ? 'ar' : 'en';
}
