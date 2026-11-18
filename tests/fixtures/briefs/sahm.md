# Sahm

## What it is
Carpools for one university: offer the empty seats in your car on the way to campus, or find a ride with someone going the same way at the same time, and see who's driving and where they'll pick you up.

## Who it's for
Students and staff of the university, aged 18 to 60, many without a car of their own. They use it on their phones, mostly in the morning before leaving home and in the afternoon before heading back. About half read Arabic first and half English.

## Platform
A Flutter app for Android and iPhone, phone first, in English and Arabic (Arabic right to left).

## Brand
Named after the arrow (سهم): straight there, together. No logo, colours or fonts yet, and no design files: everything starts here.

## Feel
Trustworthy, calm, quick, friendly.

## Apps they like
Careem's clear ride steps, and how quickly WhatsApp shows who's who.

## First screens
A welcome screen that says what Sahm is and who can join, sign-in with a university email, and a home screen with today's rides to and from campus.

## Content

Show exactly this content on these screens: no more items, no fewer, no other actions. How it looks and is laid out is up to you.

### Welcome (/)

- Page title: Sahm (سهم)
- Main line: Share the ride to campus. (شارك الطريق إلى الجامعة.)
- Supporting line: Offer the empty seats in your car, or find a ride with someone going your way at your time. (اعرض المقاعد الفارغة في سيارتك، أو اعثر على من يوصلك في طريقك وفي وقتك.)
- Three short points:
  - Only for the university's students and staff (للطلاب والموظفين في الجامعة فقط)
  - See who's driving and where they'll pick you up (اعرف من يقود وأين سيقلّك)
  - Join with your university email (انضم ببريدك الجامعي)
- Button: Get started (ابدأ الآن)
- Line: Already have an account? (لديك حساب؟) with the link: Sign in (تسجيل الدخول)

### Sign in (/sign-in)

- Title: Sign in (تسجيل الدخول)
- Helper line: Use your university email address. (استخدم بريدك الإلكتروني الجامعي.)
- Field: University email (البريد الجامعي), type: email
- Field: Password (كلمة المرور), type: password
- Button: Sign in (تسجيل الدخول)
- Link: Forgot password? (نسيت كلمة المرور؟)
- Line: New to Sahm? (جديد في سهم؟) with the link: Create an account (أنشئ حسابًا)

### Today's rides (/home)

- Page title: Today's rides (رحلات اليوم)
- Date line: Wednesday 18 November (الأربعاء 18 نوفمبر)
- Screen action: Offer a ride (اعرض رحلة)
- Group: To campus (إلى الجامعة), in this order:
  1. Khalid Al Mansoori (خالد المنصوري)
     - Leaves Al Reem Island (جزيرة الريم) at 7:20 am, arrives 7:50 am
     - Pick-up: Reem Central Park, main entrance (حديقة الريم المركزية، المدخل الرئيسي)
     - Situation: 2 of 3 seats free (مقعدان متاحان من 3)
     - Action: Request a seat (اطلب مقعدًا)
  2. Noura Al Ali (نورة العلي)
     - Leaves Khalifa City (مدينة خليفة) at 7:40 am, arrives 8:05 am
     - Pick-up: Khalifa City Co-op, front car park (جمعية مدينة خليفة، الموقف الأمامي)
     - Situation: Seat reserved (مقعدك محجوز)
     - Action: Cancel my seat (ألغِ حجزي)
  3. Omar Haddad (عمر حداد)
     - Leaves Al Raha Beach (شاطئ الراحة) at 8:00 am, arrives 8:20 am
     - Pick-up: Al Raha Mall, gate 1 (الراحة مول، البوابة 1)
     - Situation: Full, 4 of 4 seats taken (مكتملة، 4 من 4 مقاعد)
     - Action: Join waitlist (انضم لقائمة الانتظار)
- Group: From campus (من الجامعة), in this order:
  4. Mariam Saeed (مريم سعيد)
     - Leaves campus at 3:30 pm for Mohammed Bin Zayed City (مدينة محمد بن زايد)
     - Pick-up: Library car park (موقف المكتبة)
     - Situation: Request sent, waiting for Mariam (أُرسل الطلب، بانتظار موافقة مريم)
     - Action: Withdraw request (اسحب الطلب)
  5. You're driving (أنت السائق)
     - Leaves campus at 4:15 pm for Al Reem Island (جزيرة الريم)
     - Pick-up: Engineering building, gate B (مبنى الهندسة، البوابة B)
     - Situation: 2 of 3 seats taken, by Ahmed and Lina (مقعدان محجوزان من 3: أحمد ولينا)
     - Action: View riders (عرض الركاب)
