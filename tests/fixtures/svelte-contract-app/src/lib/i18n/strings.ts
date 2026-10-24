// The app's words in English and Arabic. The server chooses one from the browser's language (hooks.server.ts), and
// locale.svelte.ts hands the page's to every component.
import type { Words } from '$lib/mock-data';

export type Lang = 'en' | 'ar';

/** Arabic when the browser's first language is, else English. */
export const langOf = (acceptLanguage: string | null): Lang => (acceptLanguage ?? '').trim().toLowerCase().startsWith('ar') ? 'ar' : 'en';

export const en = {
	appName: 'Adawat',
	home: 'Adawat, home',
	mainNav: 'Main',
	navTools: 'Tools',
	navLoans: 'My loans',
	signIn: 'Sign in',
	back: 'Back to the tools',
	toolsTitle: 'Tools to borrow',
	toolsIntro: 'Drills, ladders and everything between, on the shelves of the community hall. Borrow one for a few days, and your deposit comes back with the tool.',
	inCount: (shelf: string, all: string) => `${shelf} of ${all} tools are on the shelf today`,
	howTitle: 'How borrowing works',
	howBorrow: 'Borrow a tool here, up to three at a time.',
	howCollect: 'Collect it at the hall, and pay its deposit at the counter.',
	howReturn: 'Bring it back clean by its due date, and your deposit is yours again.',
	loanLength: (n: number, days: string) => `Up to ${days} ${n === 1 ? 'day' : 'days'}`,
	weight: (kg: string) => `${kg}, case included`,
	shelf: (code: string) => `Shelf ${code}`,
	depositOf: (amount: string) => `Deposit ${amount}`,
	statusIn: 'On the shelf',
	statusOut: 'On loan',
	statusRepair: 'In for repair',
	aboutTool: 'About this tool',
	includesLabel: 'In the box',
	loanLabel: 'Loan',
	weightLabel: 'Weight',
	shelfLabel: 'Where it is',
	careLabel: 'Before you return it',
	toolIntro: 'Every tool is checked by a volunteer when it comes back, so it goes out ready to use.',
	borrowTool: 'Borrow this tool',
	reserveTool: 'Reserve it for when it’s back',
	askVolunteer: 'Ask a volunteer',
	dueBackOn: (day: string) => `Out with a neighbour until ${day}.`,
	inRepair: 'A volunteer is fixing it in the workshop. Ask about it on the next repair weekend.',
	borrowedNote: (name: string, day: string) => `The ${name.toLowerCase()} is yours until ${day}.`,
	borrowedHint: (shelf: string) => `Collect it from shelf ${shelf} at the hall; it’s set aside under your name.`,
	reservedNote: 'It’s reserved for you. We’ll write when it’s back on the shelf.',
	toolMissing: 'We can’t find that tool',
	toolMissingHint: 'It may have been retired after a long life. Every tool we lend today is on the list.',
	seeTools: 'See the tools',
	loansTitle: 'My loans',
	loansIntro: 'The tools you’ve borrowed, and the day each one is due back at the hall.',
	outNow: 'Out now',
	loansCount: (out: string, limit: string) => `${out} of ${limit} tools out`,
	dueBack: (day: string) => `Due back ${day}`,
	loansEmpty: 'Nothing borrowed yet',
	loansEmptyHint: 'Tools you borrow appear here, with the day each one is due back.',
	pageMissing: 'There’s no page here',
	pageMissingHint: 'The link may be old. The tools and your loans are a tap away.',
	signInTitle: 'Sign in',
	signInIntro: 'We’ll email you a link that signs you in. There’s no password to remember.',
	email: 'Email',
	emailHint: 'The address you gave the library when you joined.',
	emailError: 'Enter an email address, like name@example.com.',
	sendLink: 'Send me a link',
	linkSent: (email: string) => `We’ve sent a link to ${email}. It works for 15 minutes.`,
	emailUse: 'We only use your email for your loans and the library’s news.'
};

export const ar: typeof en = {
	appName: 'أدوات',
	home: 'أدوات، الصفحة الرئيسية',
	mainNav: 'الرئيسية',
	navTools: 'الأدوات',
	navLoans: 'استعاراتي',
	signIn: 'تسجيل الدخول',
	back: 'العودة إلى الأدوات',
	toolsTitle: 'أدوات للاستعارة',
	toolsIntro: 'مثاقب وسلالم وكل ما بينهما، على رفوف قاعة الحي. استعر أداة لبضعة أيام، ويعود إليك التأمين مع الأداة.',
	inCount: (shelf: string, all: string) => `${shelf} من ${all} أدوات على الرف اليوم`,
	howTitle: 'كيف تستعير',
	howBorrow: 'استعر الأداة من هنا، حتى ثلاث أدوات في المرة.',
	howCollect: 'استلمها من القاعة، وادفع تأمينها عند المكتب.',
	howReturn: 'أعدها نظيفة قبل موعدها، ويعود إليك التأمين.',
	loanLength: (n: number, days: string) => `حتى ${days} ${n > 10 ? 'يومًا' : 'أيام'}`,
	weight: (kg: string) => `${kg} مع العلبة`,
	shelf: (code: string) => `الرف ${code}`,
	depositOf: (amount: string) => `التأمين ${amount}`,
	statusIn: 'على الرف',
	statusOut: 'مُعارة',
	statusRepair: 'في الصيانة',
	aboutTool: 'عن هذه الأداة',
	includesLabel: 'في العلبة',
	loanLabel: 'مدة الاستعارة',
	weightLabel: 'الوزن',
	shelfLabel: 'مكانها',
	careLabel: 'قبل أن تعيدها',
	toolIntro: 'يفحص متطوع كل أداة حين تعود، فتخرج جاهزة للعمل.',
	borrowTool: 'استعر هذه الأداة',
	reserveTool: 'احجزها حين تعود',
	askVolunteer: 'اسأل متطوعًا',
	dueBackOn: (day: string) => `مع أحد الجيران حتى ${day}.`,
	inRepair: 'يصلحها متطوع في الورشة. اسأل عنها في عطلة الإصلاح القادمة.',
	borrowedNote: (name: string, day: string) => `«${name}» معك حتى ${day}.`,
	borrowedHint: (shelf: string) => `استلمها من الرف ${shelf} في القاعة؛ إنها محجوزة باسمك.`,
	reservedNote: 'حجزناها لك. سنكتب إليك حين تعود إلى الرف.',
	toolMissing: 'لم نجد هذه الأداة',
	toolMissingHint: 'ربما تقاعدت بعد عمر طويل. كل أداة نعيرها اليوم في القائمة.',
	seeTools: 'اعرض الأدوات',
	loansTitle: 'استعاراتي',
	loansIntro: 'الأدوات التي استعرتها، وموعد إعادة كل منها إلى القاعة.',
	outNow: 'معك الآن',
	loansCount: (out: string, limit: string) => `${out} من ${limit} أدوات معك`,
	dueBack: (day: string) => `تُعاد في ${day}`,
	loansEmpty: 'لم تستعر شيئًا بعد',
	loansEmptyHint: 'تظهر هنا الأدوات التي تستعيرها، مع موعد إعادة كل منها.',
	pageMissing: 'لا توجد صفحة هنا',
	pageMissingHint: 'ربما الرابط قديم. الأدوات واستعاراتك على بعد نقرة.',
	signInTitle: 'تسجيل الدخول',
	signInIntro: 'سنرسل إلى بريدك رابطًا يُدخلك. لا كلمة مرور لتتذكرها.',
	email: 'البريد الإلكتروني',
	emailHint: 'العنوان الذي أعطيته لمكتبة الأدوات حين انضممت.',
	emailError: 'أدخل عنوان بريد، مثل name@example.com.',
	sendLink: 'أرسل لي رابطًا',
	linkSent: (email: string) => `أرسلنا رابطًا إلى ${email}. يعمل لمدة ١٥ دقيقة.`,
	emailUse: 'نستخدم بريدك لاستعاراتك وأخبار مكتبة الأدوات فقط.'
};

/** How the page's language writes numbers, money, weights and days: Arabic-Indic digits in Arabic, as the words above. */
export function formats(lang: Lang) {
	const intl = lang === 'ar' ? 'ar-u-nu-arab' : 'en-GB';
	const number = (n: number, options?: Intl.NumberFormatOptions): string => new Intl.NumberFormat(intl, options).format(n);
	return {
		number,
		/** A weight in kilograms, to one decimal place. */
		kilograms: (kg: number): string => number(kg, { style: 'unit', unit: 'kilogram', maximumFractionDigits: 1 }),
		/** A deposit, in Kuwaiti dinars. */
		dinars: (amount: number): string => number(amount, { style: 'currency', currency: 'KWD', maximumFractionDigits: 0, minimumFractionDigits: 0 }),
		/** A day, such as "Saturday 31 October". */
		day: (date: Date): string => new Intl.DateTimeFormat(intl, { weekday: 'long', day: 'numeric', month: 'long' }).format(date),
		/** A text from the data, in the page's language. */
		words: (w: Words): string => w[lang]
	};
}
