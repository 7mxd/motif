# Notifications

Telling people that something happened or needs them: in the app, on the icon, and from outside it.

## Goal

- Tell people what needs their attention without overwhelming them.
- Make each notification actionable: clear who did what, and one tap to the thing itself.
- Give people control over what they're told and how.

## Anatomy

- **Inbox:** notifications grouped by day (Today, Yesterday, Earlier), unread ones marked with a dot or a stronger weight; each says who did what to what, and when ("Sam commented on Q3 report · 2 h"); inline actions where useful (Accept, Reply).
- **Badges:** an unread count on the bell or tab, capped at "99+"; a plain dot when the number doesn't matter.
- **Toasts:** short confirmations of something people just did ("Invite sent"), optionally with Undo.
- **Banners:** for conditions that persist (offline, trial ending, payment failed), at the top of the content until resolved or dismissed.
- **Push notifications:** a primer screen before the system's permission prompt, explaining what they'll get.
- **Preferences:** a link from the inbox to notification preferences, per type and per channel.

## Required states

- **Empty:** "You're all caught up", with a quiet illustration or icon at most.
- **Unread and read:** clearly different; opening a notification marks it read.
- **Loading:** skeleton rows.
- **Error:** a short message and Retry.
- **Mark all as read:** one action, with the badge clearing at once.
- **Target deleted:** opening a notification whose item no longer exists says so, rather than showing an error page.
- **Push permission denied:** the inbox still works; preferences explain how to turn push on in the system settings.

## Common mistakes

- Toasts for errors that need action → inline messages or a banner that stays.
- Badges that never clear → clear on view.
- Asking for push permission on first launch → ask after people see what they'd get.
- Notifying about everything → defaults that matter, and per-type choices.
- No way to mute → per-type and per-channel controls in preferences.
- Toasts covering the primary action → one consistent position, away from main actions.
- Toasts that vanish before they can be read → at least five seconds, paused on hover and focus.
- Vague text ("You have a new notification") → who, what and where.

## Mobile and web

- **Mobile:** push notifications deep-link to the exact item; the inbox lives in a tab or behind a bell in the header; swipe to dismiss or mark read; toasts appear near the bottom, above the tab bar.
- **Web:** a bell in the header with a popover showing the latest few and "See all"; toasts in one corner (bottom, end side), stacked; each toast is announced through a polite live region.
- **Both:** the badge count, the inbox and push stay in sync: reading something in one place clears it everywhere.
