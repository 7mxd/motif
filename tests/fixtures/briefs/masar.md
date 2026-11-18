# Masar

## What it is
A running tracker: log each run's distance, time and pace, follow a simple plan for the week, and see how far you've come since the first one.

## Who it's for
People who took up running in the last year, aged 18 to 50, working towards their first 5 or 10 kilometres. Many run before work or after sunset to miss the heat, and check the app with sweaty hands at the end of a run or on the sofa later. About half read Arabic first and half English.

## Platform
A SwiftUI app for iPhone, phone first, in English and Arabic (Arabic right to left). The Xcode project is already made from Xcode's iOS App template, in this folder: Masar.xcodeproj, with SwiftUI and Swift, no storage, and nothing in it yet but the template's Hello, world! screen.

## Brand
Named after the Arabic word for a path or a track (مسار): steady, clear, always going somewhere. No logo, colours or fonts yet, and no design files: everything starts here.

## Feel
Energetic, clear, encouraging, never preachy.

## Apps they like
Strava's plain run summaries, and how Apple's Fitness rings show the week's progress at a glance.

## First screens
A welcome screen that says what Masar is and who it's for, sign-in with an email address, and a home screen with this week's runs and the next run in the plan.

## Content

Show exactly this content on these screens: no more items, no fewer, no other actions. How it looks and is laid out is up to you.

### Welcome (/)

- Screen title: Masar (مسار)
- Main line: Your first 5K, one run at a time. (أول 5 كيلومترات لك، جريةً بعد جرية.)
- Supporting line: Log every run, follow a simple plan for the week, and see how far you've come. (سجّل كل جرية، واتبع خطة بسيطة للأسبوع، وشاهد كم تقدّمت.)
- Three short points:
  - For new runners working towards 5 or 10 km (للعدّائين الجدد نحو 5 أو 10 كيلومترات)
  - Distance, time and pace for every run (المسافة والوقت والسرعة لكل جرية)
  - A plan that fits before work or after sunset (خطة تناسب ما قبل العمل أو بعد الغروب)
- Button: Get started (ابدأ)
- Line: Already have an account? (لديك حساب؟) with the link: Sign in (تسجيل الدخول)

### Sign in (Sign in)

- Title: Sign in (تسجيل الدخول)
- Helper line: Sign in with your email to see your runs for the week. (سجّل الدخول ببريدك الإلكتروني لترى جريات هذا الأسبوع.)
- Field: Email (البريد الإلكتروني), type: email
- Field: Password (كلمة المرور), type: password
- Button: Sign in (تسجيل الدخول)
- Link: Forgot password? (نسيت كلمة المرور؟)
- Line: New to Masar? (جديد في مسار؟) with the link: Create an account (أنشئ حسابًا)

### Home (Home)

- Screen title: This week (هذا الأسبوع)
- Plan line: Road to 5K, week 6 of 8 (الطريق إلى 5 كم، الأسبوع 6 من 8)
- Week summary: 2 of 5 runs · 7.5 of 20.5 km (جريتان من 5 · 7.5 من 20.5 كم)
- Next run (الجرية القادمة):
  - Thursday 19 November (الخميس 19 نوفمبر) · Easy run 4 km (جرية سهلة 4 كم) · target pace 7:00/km (السرعة المستهدفة 7:00 د/كم) · about 28 min (نحو 28 دقيقة)
  - Action: Start run (ابدأ الجرية)
- The week's plan, in this order:
  1. Monday 16 November (الإثنين 16 نوفمبر) · Easy run (جرية سهلة)
     - 3.5 km in 24:30 · pace 7:00/km (3.5 كم في 24:30 · السرعة 7:00 د/كم)
     - Situation: Done (تمت)
     - Action: View run (عرض الجرية)
  2. Tuesday 17 November (الثلاثاء 17 نوفمبر) · Intervals, 3 km (تمارين متقطعة، 3 كم)
     - Situation: Missed (فاتتك)
     - Action: Move to Friday (انقلها إلى الجمعة)
  3. Wednesday 18 November, today (الأربعاء 18 نوفمبر، اليوم) · Easy run (جرية سهلة)
     - 4 km in 27:20 · pace 6:50/km (4 كم في 27:20 · السرعة 6:50 د/كم)
     - Situation: Done (تمت)
     - Action: View run (عرض الجرية)
  4. Thursday 19 November (الخميس 19 نوفمبر) · Easy run, 4 km (جرية سهلة، 4 كم)
     - Situation: Next (التالية)
     - Action: none here (Start run belongs to the Next run part)
  5. Saturday 21 November (السبت 21 نوفمبر) · Long run, 6 km (جرية طويلة، 6 كم)
     - Situation: Planned (مخطّطة)
     - Action: none
