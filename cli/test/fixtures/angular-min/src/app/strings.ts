/** The app's words in English and in Arabic, chosen by the browser's language. The app leaves dir to the page. */
const EN = {
  home: 'Home',
  settings: 'Settings',
  pantry: 'Pantry',
  items: '12 items, 3 running low',
  add: 'Add item',
  name: 'Display name',
  hello: 'Hello,',
};

const AR: typeof EN = {
  home: 'الرئيسية',
  settings: 'الإعدادات',
  pantry: 'المخزن',
  items: '١٢ صنفًا، ٣ أوشكت على النفاد',
  add: 'أضف صنفًا',
  name: 'الاسم الظاهر',
  hello: 'أهلًا،',
};

export const strings = navigator.language.toLowerCase().startsWith('ar') ? AR : EN;
