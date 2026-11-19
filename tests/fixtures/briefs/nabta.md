# Nabta

## What it is
Plant care for people with a few houseplants: add each plant, and Nabta tells you when it needs water, food or a bigger pot, and keeps a small diary of how it's doing.

## Who it's for
First-time plant owners in apartments, aged 20 to 45, who forget a watering or two and don't know what a yellow leaf means. They use it on their phones, in short moments: a glance in the morning, a tap after watering. About half read Arabic first and half English.

## Platform
A Jetpack Compose app for Android, phone first, in English and Arabic (Arabic right to left).

## Brand
Named after the sprout (نبتة): small, green and growing. No logo, colours or fonts yet, and no design files: everything starts here.

## Feel
Gentle, encouraging, fresh, uncluttered.

## Apps they like
Finch's kind little check-ins, and how Google Keep keeps a list simple.

## First screens
A welcome screen that says what Nabta is and what it helps with, sign-in with an email, and a home screen with today's plants to water and the next few days.

## Content

Show exactly this content on these screens: no more items, no fewer, no other actions. How it looks and is laid out is up to you.

### Welcome (/)

- Page title: Nabta (نبتة)
- Main line: Your plants, looked after. (نباتاتك في رعاية جيدة.)
- Supporting line: Add each plant, and Nabta tells you when it needs water, food or a bigger pot. (أضف كل نبتة، وتخبرك نبتة متى تحتاج إلى الماء أو السماد أو أصيص أكبر.)
- Three short points:
  - Reminders at the right time (تذكير في الوقت المناسب)
  - A small diary for each plant (مذكرات صغيرة لكل نبتة)
  - Simple tips when a leaf turns yellow (نصائح بسيطة عندما تصفرّ ورقة)
- Button: Get started (ابدأ)
- Line: Already have an account? (لديك حساب؟) with the link: Sign in (تسجيل الدخول)

### Sign in (/sign-in)

- Title: Sign in (تسجيل الدخول)
- Helper line: Welcome back. Your plants missed you. (أهلًا بعودتك. نباتاتك اشتاقت إليك.)
- Field: Email (البريد الإلكتروني), type: email
- Field: Password (كلمة المرور), type: password
- Button: Sign in (تسجيل الدخول)
- Link: Forgot password? (نسيت كلمة المرور؟)
- Line: New to Nabta? (جديد في نبتة؟) with the link: Create an account (أنشئ حسابًا)

### Today (/home)

- Page title: Today (اليوم)
- Date line: Wednesday 18 November (الأربعاء 18 نوفمبر)
- Summary line: 3 plants to water today, 1 done (3 نباتات للسقي اليوم، تم سقي واحدة)
- Screen action: Add a plant (أضف نبتة)
- Group: Needs water today (تحتاج إلى سقي اليوم), in this order:
  1. Sabr, snake plant (صبر، نبتة الثعبان) · bedroom (غرفة النوم)
     - Situation: Overdue by 2 days (متأخرة يومين)
     - Action: Watered (تم السقي)
  2. Zahra, peace lily (زهرة، زنبق السلام) · bedroom (غرفة النوم)
     - Situation: Due today (موعدها اليوم)
     - Action: Watered (تم السقي)
  3. Rayhan, basil (ريحان) · kitchen (المطبخ)
     - Situation: Done, watered at 8:05 am (تم، سُقيت الساعة 8:05 صباحًا)
     - Action: Undo (تراجع)
- Group: Next few days (الأيام القادمة), in this order, with no actions:
  4. Thursday 19 November (الخميس 19 نوفمبر): Lulu, pothos (لولو، البوتس) · water (سقي)
  5. Saturday 21 November (السبت 21 نوفمبر): Fiddle-leaf fig (التين الكماني) · feed (تسميد)
  6. Monday 23 November (الإثنين 23 نوفمبر): Monstera (المونستيرا) · move to a bigger pot (انقلها إلى أصيص أكبر)
