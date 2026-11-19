# Rihla

## What it is
A trip planner: put a trip's days in order, add the places, bookings and notes for each day, and see what's next while you're away.

## Who it's for
Friends and families planning holidays together, aged 20 to 65, many of them travelling between the Gulf and Europe. They plan on the sofa at night and look things up one-handed in a queue or on a train. About half read Arabic first and half English.

## Platform
An Expo (React Native) app for Android and iPhone, phone first, in English and Arabic (Arabic right to left).

## Brand
Named after the Arabic word for a journey (رحلة): unhurried, with somewhere to be. No logo, colours or fonts yet, and no design files: everything starts here.

## Feel
Warm, relaxed, organised, a little adventurous.

## Apps they like
Wanderlog's day-by-day layout, and how Google Maps keeps tomorrow's plan one tap away.

## First screens
A welcome screen that says what Rihla is and who it's for, sign-in with an email address, and a trips screen with the trips coming up and the ones already taken.

## Content

Show exactly this content on these screens: no more items, no fewer, no other actions. How it looks and is laid out is up to you.

### Welcome (/)

- Page title: Rihla (رحلة)
- Main line: Plan the trip together. (خطّطوا لرحلتكم معًا.)
- Supporting line: Put each day in order with its places, bookings and notes, and see what's next while you're away. (رتّب أيام رحلتك مع أماكنها وحجوزاتها وملاحظاتها، واعرف ما التالي وأنت مسافر.)
- Three short points:
  - Plan with family and friends (خطّطوا مع العائلة والأصدقاء)
  - Every booking in one place (كل الحجوزات في مكان واحد)
  - Today's plan one tap away (خطة اليوم بلمسة واحدة)
- Button: Start planning (ابدأ التخطيط)
- Line: Already have an account? (لديك حساب؟) with the link: Sign in (تسجيل الدخول)

### Sign in (/sign-in)

- Title: Welcome back (أهلًا بعودتك)
- Helper line: Sign in with your email to see your trips. (سجّل الدخول ببريدك الإلكتروني لترى رحلاتك.)
- Field: Email (البريد الإلكتروني), type: email
- Field: Password (كلمة المرور), type: password
- Button: Sign in (تسجيل الدخول)
- Link: Forgot password? (نسيت كلمة المرور؟)
- Line: New to Rihla? (جديد في رحلة؟) with the link: Create an account (أنشئ حسابًا)

### Trips (/trips)

- Page title: Trips (الرحلات)
- Screen action: New trip (رحلة جديدة)
- Group: Coming up (القادمة), in this order:
  1. London (لندن) · 15–20 Nov 2026 · 6 days
     - With Mum and Laila (مع أمي وليلى)
     - Situation: Happening now, day 4 of 6 (جارية الآن، اليوم 4 من 6)
     - Action: Today's plan (خطة اليوم)
  2. Istanbul (إسطنبول) · 24–29 Nov 2026 · 6 days
     - With Sara and Yousef (مع سارة ويوسف)
     - Situation: All booked, starts in 6 days (كل شيء محجوز، تبدأ بعد 6 أيام)
     - Action: Open trip (افتح الرحلة)
  3. Salalah (صلالة) · 10–13 Dec 2026 · 4 days
     - With Ahmed, Huda and the kids (مع أحمد وهدى والأطفال)
     - Situation: Still planning, 2 of 4 days planned (قيد التخطيط، تم تخطيط يومين من 4)
     - Action: Continue planning (أكمل التخطيط)
  4. Vienna and Salzburg (فيينا وسالزبورغ) · 19–27 Dec 2026 · 9 days
     - Invited by Huda (دعوة من هدى)
     - Situation: Invitation, you haven't joined yet (دعوة، لم تنضم بعد)
     - Action: Accept invitation (اقبل الدعوة)
- Group: Past trips (رحلات سابقة), in this order:
  5. Tbilisi (تبليسي) · 3–8 Aug 2026 · 6 days · 14 places (14 مكانًا)
     - Situation: Done (انتهت)
     - Action: View trip (عرض الرحلة)
  6. Muscat (مسقط) · 10–12 Apr 2026 · 3 days · 7 places (7 أماكن)
     - Situation: Done (انتهت)
     - Action: View trip (عرض الرحلة)
