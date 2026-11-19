# Ledgerly

## What it is
Invoicing for freelancers: create an invoice, send it, and see at a glance who has paid and who is late.

## Who it's for
Freelance designers, writers and developers who invoice a handful of clients a month and dislike bookkeeping.

## Platform
A React web app, used mostly on laptops.

## Brand
No colours or fonts decided; the name is Ledgerly.

## Feel
Calm, trustworthy, precise, quietly premium.

## Apps they like
Linear's density and calm, and how readable Stripe's dashboards are.

## First screens
A landing page explaining the product, sign-in, and a home dashboard showing money owed, overdue invoices and recent activity.

## Content

Show exactly this content on these screens: no more items, no fewer, no other actions. How it looks and is laid out is up to you.

### Landing (/)

- Page title: Ledgerly
- Main line: Invoices that get paid.
- Supporting line: Create an invoice in a minute, send it, and see at a glance who has paid and who is late.
- Three short points:
  - Send a clean invoice in under a minute
  - See who has paid and who is late
  - Send a polite reminder when an invoice is overdue
- Button: Start free
- Line: Already have an account? with the link: Sign in

### Sign in (/sign-in)

- Title: Sign in to Ledgerly
- Field: Email (type: email)
- Field: Password (type: password)
- Button: Sign in
- Link: Forgot password?
- Line: Don't have an account? with the link: Create an account

### Home (/home)

- Page title: Home
- Screen action: New invoice
- Three figures:
  - Owed to you: $6,200 across 3 invoices
  - Overdue: $3,200 across 2 invoices
  - Received in November: $5,600
- Invoices, in this order:
  1. INV-1042 · Northwind Studio · $2,400 · due 30 Oct 2026
     - Situation: Overdue by 19 days
     - Action: Chase payment
  2. INV-1045 · Harbor & Pine · $800 · due 10 Nov 2026
     - Situation: Overdue by 8 days
     - Action: Chase payment
  3. INV-1048 · Lumen Health · $3,000 · due 2 Dec 2026
     - Situation: Sent, due in 14 days
     - Action: View
  4. INV-1049 · Oakline Coffee · $2,250
     - Situation: Draft, not sent yet
     - Action: Send
  5. INV-1043 · Fieldnote Press · $3,750
     - Situation: Paid on 16 Nov 2026
     - Action: View
  6. INV-1040 · Mara Okafor · $1,850
     - Situation: Paid on 12 Nov 2026
     - Action: View
- Recent activity, newest first (no actions):
  - Today, 9:14 am: Lumen Health viewed INV-1048
  - 16 Nov: Fieldnote Press paid INV-1043 ($3,750)
  - 12 Nov: Mara Okafor paid INV-1040 ($1,850)
  - 11 Nov: You sent a reminder to Northwind Studio for INV-1042
