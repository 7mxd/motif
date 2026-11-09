# Home and dashboard

The screen people land on after signing in, which they see more often than any other.

## Goal

- Answer "what's going on, and what should I do next?" within a few seconds.
- Lead with the one thing that matters most for this app: a balance, today's bookings, progress towards a goal.
- Get people to their next action in one tap.

## Anatomy

- **Context line:** a short greeting or the current period ("Tuesday, 14 October"), in `text-secondary`. Optional; skip it if it adds nothing.
- **Summary:** the key figure, large (`display` or `title`), with its label and period ("This month"), and beside it a breakdown of it (by age, by status, by person) so the screen shows the user's picture, not one number.
- **Next action:** one clear action tied to the summary ("Review 3 invoices", "Continue lesson 4"), using `action-primary`.
- **Recent activity:** the last few items, each a row that opens its detail, and a "See all".
- **Shortcuts:** a handful of frequent actions, only if people really repeat them.
- **Main navigation:** a tab bar on phones, a sidebar on wide screens.
- **Notifications entry:** a bell or inbox with an unread count, in the header.

**What strong apps show:** by kind of app:

- **Money and business tools:** the key figure on one deep `brand` card with a small trend line, a breakdown of it (invoices by age, spending by category), progress towards a goal as a ring or bar, and what needs action in status colour with its count ("Overdue · 4").
- **Clubs and communities:** the next event as a card with when, where and who is going, then this week's others, then how many joined lately.
- **Personal trackers:** today's focus (what's due, with its drawing), a streak or progress figure, and what comes next.
- **Catalogues:** recently viewed or saved items as cards with their facts, and one way in to browse more.

## Required states

- **First use:** the summary and activity are empty; instead of zeros, a welcome line and one action that creates the first item.
- **Loading:** skeletons that match the final layout, section by section.
- **Partial data:** sections fill in as their data arrives; nothing waits for the slowest one.
- **One section failing:** that section shows a short message and Retry in place; the rest of the page works normally.
- **Stale or offline:** show the last data with "Updated 10 minutes ago" or "Offline", never a blank page.
- **Very full:** each section shows its first few items and a "See all" link, rather than growing forever.

## Common mistakes

- A row of four equal stat cards → one summary that matters, then the next action.
- Vanity numbers (total sign-ups ever, page views) → numbers that drive a decision today.
- Charts without a period or comparison → label the period and what it is compared with.
- Everything competing above the fold → a clear order: summary, next action, then the rest.
- No empty state (a dashboard of zeros) → a first-use state with a single action.
- A greeting that takes a third of the screen → one line, or none.
- Shortcuts for every feature → only the two to four things people do most.
- Refreshing the whole page to update one number → update sections in place.

## Mobile and web

- **Mobile:** one column in priority order (summary, next action, activity); pull to refresh; a bottom tab bar with three to five destinations; the next action within thumb reach.
- **Web:** a grid with one clear primary region and quieter secondary panels; sidebar navigation; more density than on mobile; extra detail on hover and on keyboard focus (never only on hover); a sensible maximum width so panels don't stretch across a huge monitor.
- **Both:** the summary and next action stay first on every size; on narrow screens secondary panels stack below, never above.
