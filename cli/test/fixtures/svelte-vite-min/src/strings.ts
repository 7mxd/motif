/** The app's words in English and in Arabic, chosen by the browser's language. The app leaves dir to the page. */
const EN = {
  pantry: 'Pantry',
  items: '12 items, 3 running low',
  name: 'Display name',
  hello: 'Hello,',
}

const AR: typeof EN = {
  pantry: 'المخزن',
  items: '١٢ صنفًا، ٣ أوشكت على النفاد',
  name: 'الاسم الظاهر',
  hello: 'أهلًا،',
}

export const strings = navigator.language.toLowerCase().startsWith('ar') ? AR : EN
