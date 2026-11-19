# Nuzha

## What it is
A city's parks and trails guide: browse the parks and the walking and cycling trails nearby, see how long and how hard each trail is, and save the ones to try. Rangers post a trail with its length, surface and any closures.

## Who it's for
Residents and visitors aged 16 to 70, from families with prams to weekend hikers. They check it on their phones at the trailhead and on their laptops when planning an outing. About half read Arabic first and half English.

## Platform
A SvelteKit web app (Svelte 5), phone first and also used on laptops, in English and Arabic (Arabic right to left).

## Brand
Named after the Arabic word for a pleasant outing (نزهة): calm, green and open-air, without being precious. No logo, colours or fonts yet, and no design files: everything starts here.

## Feel
Calm, fresh, trustworthy, a little adventurous.

## Apps they like
AllTrails' trail pages for how much they say at a glance, and Google Maps' place pages for how plain they are.

## First screens
A welcome page that says what Nuzha is and how to start, sign-in with an email address, and a trails page listing the trails nearby with their length and difficulty.

## Content

Show exactly this content on these screens: no more items, no fewer, no other actions. How it looks and is laid out is up to you.

### Welcome (/)

- Page title: Nuzha (نزهة)
- Main line: Find your next outing. (اعثر على نزهتك القادمة.)
- Supporting line: Browse the parks and trails near you, see how long and how hard each trail is, and save the ones to try. (تصفّح الحدائق والمسارات القريبة، واعرف طول كل مسار وصعوبته، واحفظ ما تودّ تجربته.)
- Three short points:
  - Walking and cycling trails (مسارات للمشي وركوب الدراجات)
  - Length, surface and difficulty at a glance (الطول ونوع الأرضية والصعوبة بنظرة واحدة)
  - Closures posted by the park rangers (إغلاقات ينشرها حرّاس الحدائق)
- Button: Explore trails (استكشف المسارات)
- Line: Already have an account? (لديك حساب؟) with the link: Sign in (تسجيل الدخول)
- Language link: العربية (on the Arabic page: English)

### Sign in (/sign-in)

- Title: Sign in (تسجيل الدخول)
- Helper line: Sign in with your email to see your saved trails. (سجّل الدخول ببريدك الإلكتروني لترى مساراتك المحفوظة.)
- Field: Email (البريد الإلكتروني), type: email
- Field: Password (كلمة المرور), type: password
- Button: Sign in (تسجيل الدخول)
- Link: Forgot password? (نسيت كلمة المرور؟)
- Line: New to Nuzha? (جديد في نزهة؟) with the link: Create an account (أنشئ حسابًا)
- Language link: العربية (on the Arabic page: English)

### Trails near you (/trails)

- Page title: Trails near you (مسارات قريبة منك)
- Place line: Al Ain (العين)
- Language link: العربية (on the Arabic page: English)
- The trails, nearest first:
  1. Al Ain Oasis Loop (حلقة واحة العين)
     - Walking (مشي) · 3.2 km loop (حلقة 3.2 كم) · Easy (سهل) · shaded paved path (ممر مرصوف مظلّل) · 1.1 km away (على بعد 1.1 كم)
     - Situation: Open (مفتوح)
     - Action: Save (احفظ)
  2. Al Jahili Park Walk (ممشى حديقة الجاهلي)
     - Walking (مشي) · 1.8 km loop (حلقة 1.8 كم) · Easy, pram friendly (سهل، مناسب لعربات الأطفال) · paved (مرصوف) · 2.4 km away (على بعد 2.4 كم)
     - Situation: Saved by you (محفوظ لديك)
     - Action: Remove from saved (أزل من المحفوظات)
  3. Hafeet Foothills Bike Loop (حلقة سفوح حفيت للدراجات)
     - Cycling (دراجات) · 12 km loop (حلقة 12 كم) · Moderate (متوسط) · gravel (حصى) · 16 km away (على بعد 16 كم)
     - Situation: Closed until Saturday 21 November, flood damage being repaired (مغلق حتى السبت 21 نوفمبر لإصلاح أضرار السيول)
     - Action: Remind me when it reopens (ذكّرني عند إعادة الفتح)
  4. Jebel Hafeet Ridge Trail (مسار قمة جبل حفيت)
     - Walking (مشي) · 6.5 km out and back (6.5 كم ذهابًا وإيابًا) · Hard (صعب) · rocky (صخري) · 18 km away (على بعد 18 كم)
     - Situation: Open (مفتوح)
     - Action: Save (احفظ)
  5. Green Mubazzarah Cycle Path (مسار الدراجات في المبزّرة الخضراء)
     - Cycling (دراجات) · 7 km one way (7 كم باتجاه واحد) · Easy (سهل) · paved (مرصوف) · 19 km away (على بعد 19 كم)
     - Situation: East section closed for resurfacing until Wednesday 25 November (القسم الشرقي مغلق للصيانة حتى الأربعاء 25 نوفمبر)
     - Action: Save (احفظ)
