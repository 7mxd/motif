# Sanad

## What it is
A neighbourhood repair-request desk: report something that needs fixing (a broken streetlight, a leaking tap in the community hall, a loose paving stone), follow what happens to it, and see what neighbours have already reported. Volunteer fixers pick up a request, say when they'll come, and mark it done.

## Who it's for
Residents of one neighbourhood aged 18 to 75, from students in shared flats to retired neighbours who know every street. They report on their phones when they spot the problem and check progress on their laptops in the evening. About half read Arabic first and half English.

## Platform
An Angular web app (standalone components), phone first and also used on laptops, in English and Arabic (Arabic right to left).

## Brand
Named after the Arabic word for support (سند): dependable and neighbourly, practical rather than official. No logo, colours or fonts yet, and no design files: everything starts here.

## Feel
Dependable, clear, neighbourly, quietly cheerful.

## Apps they like
FixMyStreet for how quickly a report is made, and GitHub's issue pages for how plainly a request's status and history read.

## First screens
A welcome page that says what Sanad is and how to report something, sign-in with an email address, and a requests page listing the open repair requests with their status and who has picked them up.

## Content

Show exactly this content on these screens: no more items, no fewer, no other actions. How it looks and is laid out is up to you.

### Welcome (/)

- Page title: Sanad (سند)
- Main line: Spot it, report it, see it fixed. (لاحِظ، أبلِغ، وتابِع الإصلاح.)
- Supporting line: Report something in the neighbourhood that needs fixing, and follow it until a neighbour volunteer fixes it. (أبلغ عن أي شيء في الحي يحتاج إلى إصلاح، وتابعه حتى يصلحه أحد الجيران المتطوعين.)
- Three short points:
  - Report a problem in under a minute (أبلغ عن مشكلة في أقل من دقيقة)
  - See what neighbours have already reported (اطّلع على ما أبلغ عنه جيرانك)
  - Know who's coming to fix it, and when (اعرف من سيأتي للإصلاح ومتى)
- Button: Report a problem (أبلغ عن مشكلة)
- Line: Already have an account? (لديك حساب؟) with the link: Sign in (تسجيل الدخول)
- Language link: العربية (on the Arabic page: English)

### Sign in (/sign-in)

- Title: Sign in (تسجيل الدخول)
- Helper line: Sign in with your email to report and follow requests. (سجّل الدخول ببريدك الإلكتروني لتبلغ عن الطلبات وتتابعها.)
- Field: Email (البريد الإلكتروني), type: email
- Field: Password (كلمة المرور), type: password
- Button: Sign in (تسجيل الدخول)
- Link: Forgot password? (نسيت كلمة المرور؟)
- Line: New to Sanad? (جديد في سند؟) with the link: Create an account (أنشئ حسابًا)
- Language link: العربية (on the Arabic page: English)

### Open requests (/requests)

- Page title: Open requests (الطلبات المفتوحة)
- Neighbourhood line: Al Khalidiya (الخالدية)
- Summary line: 5 open requests (5 طلبات مفتوحة)
- Screen action: Report a problem (أبلغ عن مشكلة)
- Language link: العربية (on the Arabic page: English)
- The requests, newest first:
  1. Missing slat on a park bench, Khalidiya Park (لوح مفقود في مقعد بحديقة الخالدية)
     - Reported by Omar Nasser (أبلغ عنه عمر ناصر) · 17 Nov
     - Situation: New, no one has picked it up yet (جديد، لم يتولّه أحد بعد)
     - Action: Pick up (سأتولّاه)
  2. Broken streetlight on 15th Street, by the mosque (عمود إنارة معطّل في الشارع 15 قرب المسجد)
     - Reported by Hamad Al Kaabi (أبلغ عنه حمد الكعبي) · 16 Nov
     - Situation: New, no one has picked it up yet (جديد، لم يتولّه أحد بعد)
     - Action: Pick up (سأتولّاه)
  3. Leaking tap in the community hall kitchen (تسريب في صنبور مطبخ قاعة الحي)
     - Reported by Aisha Rahman (أبلغت عنه عائشة رحمن) · 14 Nov
     - Situation: Picked up by Yusuf Haddad, coming Thursday 19 November at 5:00 pm (تولّاه يوسف حداد، سيأتي الخميس 19 نوفمبر الساعة 5:00 مساءً)
     - Action: View request (عرض الطلب)
  4. Loose paving stone outside Building C (بلاطة رصيف مخلخلة أمام المبنى C)
     - Reported by Mona Saleh (أبلغت عنه منى صالح) · 10 Nov
     - Situation: Picked up by Salem Obaid, waiting for a replacement stone (تولّاه سالم عبيد، بانتظار بلاطة بديلة)
     - Action: View request (عرض الطلب)
  5. Broken swing chain in the children's playground (سلسلة أرجوحة مكسورة في ملعب الأطفال)
     - Reported by you (أبلغت عنه أنت) · 9 Nov
     - Situation: Fixed by Khalid Mahmoud, waiting for you to confirm (أصلحه خالد محمود، بانتظار تأكيدك)
     - Action: Confirm it's fixed (أكّد الإصلاح)
